import * as dgram from 'node:dgram';
import { afterEach, expect, it } from 'vitest';
import { createMock, defaultHandlers, type AmcpHandler, type MockHandle } from '@cg/amcp-mock';
import { AmcpTransport, CommandQueue } from '@cg/caspar-client';
import { isOnAirStatus } from '@cg/shared-schema';
import { CasparRuntime } from '../src/caspar-runtime.js';
import type { ConnectionConfig, TemplateInfo } from '@cg/shared-ipc';
import { HEALTH_MS, TEST_LAYER_POLICY } from './support/harness.js';

/**
 * 🔴 `B-332` — **A TAKE IN FLIGHT IS NOT A LAYER HELD ON AIR.**
 *
 * `B-292`'s silence question asks about every layer "held on air", and a take counts the moment its
 * intent lands. A take onto a layer that has been silent for a while — a stopped page the Playout's
 * `CLEAR <channel>` wiped (`B-328`) — was questioned BEFORE its own `CG ADD` placed the page: `INFO`
 * did not list the layer yet, so the row was reset as "cleared outside CG Control" and its resident
 * page forgotten mid-take. Two outcomes were measured: the take's `403` no longer re-routed to the ADD,
 * so it sent `CG PLAY` onto the EMPTY layer while the row read `playing` (this file, held); or the page
 * went on air under a row reset to idle (`dongle-recover` S1 under load).
 *
 * Found as `dongle-recover.integration.test.ts` S1 failing under load (4/24 copies with this session's
 * change ablated). Here the take's first reply is HELD long past the 250 ms question cadence, so the
 * window is certain rather than a matter of load.
 */

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;

afterEach(async () => {
  await runtime?.stop();
  runtime = null;
  await mock?.stop();
  mock = null;
});

function freeUdpPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');
    sock.once('error', reject);
    sock.bind(0, '127.0.0.1', () => {
      const port = sock.address().port;
      sock.close(() => resolve(port));
    });
  });
}

function singleServer(amcpPort: number, oscPort: number): ConnectionConfig {
  return {
    servers: { A: { host: '127.0.0.1', amcpPort, oscPort } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  };
}

const TEMPLATE: TemplateInfo = {
  templateId: 'lower-third',
  templateType: 'lower-third',
  fields: [],
};
const HTML = '<!doctype html><html><head><meta charset="utf-8"></head><body>سلام</body></html>';
const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function waitFor(cond: () => boolean, timeoutMs: number, what: string): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await delay(25);
  }
}

/** Another AMCP client — the Playout — sends one line. */
async function playoutSends(m: MockHandle, line: string): Promise<void> {
  const transport = new AmcpTransport();
  await transport.connect(m.host, m.amcpPort);
  const queue = new CommandQueue(transport);
  try {
    await queue.enqueue(line);
  } finally {
    queue.dispose();
    transport.destroy();
  }
}

/** Long past the question's 250 ms cadence; well inside a take's 5 s bound. */
const HOLD_MS = 700;

it('🔴 B-332: a take onto a long-silent layer is not reset to idle by the silence question while it is in flight', async () => {
  const oscPort = await freeUdpPort();
  const m = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40 });
  mock = m;
  const r = new CasparRuntime(
    singleServer(m.amcpPort, oscPort),
    {},
    { layerPolicy: TEST_LAYER_POLICY },
  );
  runtime = r;
  r.start();
  await r.startServing();
  r.templateImport(TEMPLATE, HTML);
  await r.whenServerHealthy(HEALTH_MS);

  // A stopped row: its page is resident.
  expect((await r.load('a', 'lower-third', {})).accepted).toBe(true);
  const slot = r.stackSnapshot().find((i) => i.itemId === 'a')?.slot;
  if (slot === undefined) throw new Error('no slot');
  await expect(m.waitForCgAddResolution(slot)).resolves.toBe('resolved');
  expect((await r.take('a')).accepted).toBe(true);
  await waitFor(() => r.stackSnapshot()[0]?.status === 'on-air', 8000, 'on air');
  expect((await r.stopItem('a')).accepted).toBe(true);
  await waitFor(() => r.stackSnapshot()[0]?.status === 'loaded', 8000, 'stopped');

  // The Playout wipes the page, and the layer stays silent past the question's threshold.
  await playoutSends(m, `CLEAR ${String(slot.channel)}-${String(slot.layer)}`);
  await delay(1_500);
  expect(m.layerState(slot)?.producer).not.toBe('html');

  // The take's first CG reply is held, so the question fires while the take is in flight.
  const cg = defaultHandlers().get('CG') as AmcpHandler;
  let held = false;
  m.setHandler('CG', async (req, ctx, conn) => {
    if (!held) {
      held = true;
      await delay(HOLD_MS);
    }
    return cg(req, ctx, conn);
  });
  const before = m.receivedCommands().length;
  expect((await r.take('a')).accepted).toBe(true);
  expect(held, 'the take was held').toBe(true);
  // The ADD route (`B-328`): the take's `CG UPDATE` is answered 403 and the page is added back.
  const takeLines = m
    .receivedCommands()
    .slice(before)
    .map((c) => c.line)
    .filter((l) => l.startsWith(`CG ${String(slot.channel)}-${String(slot.layer)} `));
  expect(
    takeLines.some((l) => l.includes(' ADD ')),
    'the take re-ADDed the page',
  ).toBe(true);
  await waitFor(() => m.layerState(slot)?.onAir === true, 5000, 'the page on air');
  await delay(600);

  // The page is on air, and so is the row — not reset to idle, and not named cleared outside.
  expect(m.layerState(slot)?.producer).toBe('html');
  const row = r.stackSnapshot().find((i) => i.itemId === 'a');
  expect(row !== undefined && isOnAirStatus(row), `row reads ${String(row?.status)}`).toBe(true);
  expect(r.clearedOutside().map((e) => e.layer)).not.toContain(slot.layer);
}, 40_000);
