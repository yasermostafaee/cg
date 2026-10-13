import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { AmcpTransport, CommandQueue } from '@cg/caspar-client';
import type { ConnectionConfig, FixedLayerBank, PlayoutLayerState } from '@cg/shared-ipc';
import { createBridge, type BridgeHandle } from '../src/index.js';
import { HEALTH_MS, track } from './support/harness.js';
import { openClient } from './support/auth-harness.js';
import { recvLines as readWireLines } from './support/wire-trace.js';

/**
 * 🔴 `FOLLOWUPS-01` B (the owner, 2026-09-28) — **NO CONSOLE OR IPC PATH CAN ASK FOR A `CLEAR`
 * BELOW LAYER 50.** Rule 3 (C5): nothing of ours touches layers 1–49, the Playout's span.
 *
 * `ROUTE-PLATES-01` put the refusal at the send seam, so a `CLEAR 1-30` never left the process —
 * but both clear doors still ACCEPTED the request, walked their gates and answered `amcp-error`,
 * and the Station layers tab still offered a CLEAR on a reserved row below 50 that could only
 * fail. Now the request itself is not a valid one: `playoutLayers.clear` and `layers.clear` take
 * a layer from 50 up, so the socket answers the shape error before any handler runs. No new
 * reason word (`ROUTE-PLATES-01` §5.5): the console never offers it.
 *
 * ⭐ The positive control is the same door on the same bridge: a reserved `html` layer at 60 —
 * our own span — still clears, and its `CLEAR` lands on the wire. So "nothing reached 1-30" is not
 * a dead socket or a blind tap.
 */

const BANK: FixedLayerBank = { channel: 1, low: { start: 50, count: 9 }, start: 70, count: 4 };
/** The Playout's graphics layer below 50, and a reserved layer inside CG's span for the control. */
const LOW = 30;
const IN_BAND = 60;
const RESERVED = {
  ranges: [
    { from: LOW, to: LOW },
    { from: IN_BAND, to: IN_BAND },
  ],
};

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

async function waitFor(cond: () => boolean, what: string, timeoutMs = HEALTH_MS): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

async function recvLines(mock: MockHandle, tracePath: string): Promise<string[]> {
  await mock.traceFlush();
  return readWireLines(tracePath);
}

it('🔴 a CLEAR below 50 is not a valid request on either door — refused at the socket, nothing sent; the same door clears 60', async () => {
  const oscPort = await freeUdpPort();
  const tracePath = track(
    path.join(os.tmpdir(), `cg-lowclear-${String(process.pid)}-${String(Date.now())}.ndjson`),
    (p) => {
      if (fs.existsSync(p)) fs.rmSync(p);
    },
  );
  const mock = track(
    await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40, tracePath }),
    (m) => m.stop(),
  );
  const connection: ConnectionConfig = {
    servers: { A: { host: '127.0.0.1', amcpPort: mock.amcpPort, oscPort } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  };
  const handle: BridgeHandle = track(
    await createBridge({
      port: 0,
      connection,
      fixedLayers: BANK,
      reservedLayers: RESERVED,
      runtimeTuning: { sweepMs: 150, occupancyStaleMs: 800 },
    }),
    (h) => h.close(),
  );
  await handle.runtime.whenServerHealthy(HEALTH_MS);

  // The Playout puts its own graphics up, on its span and on the reserved layer in ours.
  const foreign = track(new AmcpTransport(), (t) => t.destroy());
  await foreign.connect(mock.host, mock.amcpPort);
  const queue = new CommandQueue(foreign);
  await queue.enqueue(`PLAY 1-${String(LOW)} "playout-bug" HTML`);
  await queue.enqueue(`PLAY 1-${String(IN_BAND)} "playout-lower-third" HTML`);
  const html = (layer: number): boolean =>
    handle.runtime
      .playoutLayersState()
      .some(
        (l: PlayoutLayerState) =>
          l.layer === layer && l.observed.kind === 'producer' && l.observed.producer === 'html',
      );
  await waitFor(() => html(LOW) && html(IN_BAND), 'both reserved layers to be heard as html');

  const client = await openClient(handle);
  const before = (await recvLines(mock, tracePath)).length;

  // Both doors refuse the coordinate as a request — before any gate or handler runs.
  const playout = await client.ask('p1', 'playoutLayers.clear', { channel: 1, layer: LOW });
  expect(playout.error).toBe('invalid request for playoutLayers.clear');
  const orphan = await client.ask('o1', 'layers.clear', { channel: 1, layer: LOW });
  expect(orphan.error).toBe('invalid request for layers.clear');

  // ⭐ Positive control — the same door, the same bridge, our own span: it clears, on the wire.
  const control = await client.ask('p2', 'playoutLayers.clear', { channel: 1, layer: IN_BAND });
  expect(control.error).toBeUndefined();
  expect(control.payload).toEqual({ ok: true });
  const sent = (await recvLines(mock, tracePath)).slice(before);
  expect(sent).toContain(`CLEAR 1-${String(IN_BAND)}`);

  // …and nothing of ours addressed layer 30: the Playout's graphic is still there.
  expect(sent.filter((l) => new RegExp(`^\\S.*\\s1-${String(LOW)}(\\s|$)`).test(l))).toEqual([]);
  expect(mock.layerState({ channel: 1, layer: LOW })?.producer).toBe('html');
}, 30_000);
