import * as dgram from 'node:dgram';
import * as net from 'node:net';
import { afterEach, expect, it } from 'vitest';
import { createMock, type AmcpRequest, type HandlerContext, type MockHandle } from '@cg/amcp-mock';
import { CasparRuntime } from '../src/caspar-runtime.js';
import type { ConnectionConfig, TemplateInfo } from '@cg/shared-ipc';
import { HEALTH_MS } from './support/harness.js';

/**
 * BROADCAST SAFETY — Clear-All is per-LAYER, never per-channel.
 *
 * The failure this guards against would be catastrophic and silent: a channel-level
 * `CLEAR <channel>` (e.g. `CLEAR 1`) wipes the ENTIRE channel — including the program /
 * background signal that this app does not manage, did not put there, and must never touch.
 * The operator would press "Clear all" to take two lower-thirds off air and take the whole
 * broadcast to black.
 *
 * Clear-All must clear ONLY the layers this app allocated, and only each item's OWN layer:
 * `CLEAR 1-10`, `CLEAR 1-20`. The program feed on the base layer must survive untouched, on
 * air, unchanged.
 *
 * These assertions are made on the WIRE — every AMCP line the bridge actually sends — not on
 * the bridge's intentions.
 */

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;
const sockets: net.Socket[] = [];

afterEach(async () => {
  // Released from afterEach, not the last line of the test body: an assertion that throws
  // must not strand a bound socket for the rest of the fork.
  for (const socket of sockets.splice(0)) socket.destroy();
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

function connectionFor(amcpPort: number, oscPort: number, oscPortB: number): ConnectionConfig {
  return {
    servers: {
      A: { host: '127.0.0.1', amcpPort, oscPort },
      B: { host: '127.0.0.1', amcpPort, oscPort: oscPortB },
    },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  };
}

/**
 * Send one raw AMCP line as SOME OTHER client would — the playout automation that owns the
 * program feed. This is deliberately NOT the bridge: the point is that a producer we never
 * created, on a layer we never allocated, survives our Clear-All.
 */
function sendRaw(port: number, line: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1', () => {
      socket.write(`${line}\r\n`);
    });
    sockets.push(socket);
    socket.once('data', () => resolve());
    socket.once('error', reject);
  });
}

const LOWER_THIRD: TemplateInfo = {
  templateId: 'lower-third',
  templateType: 'lower-third',
  fields: [],
};
const TICKER: TemplateInfo = { templateId: 'ticker', templateType: 'ticker', fields: [] };
const HTML = '<!doctype html><html><head><meta charset="utf-8"></head><body>سلام</body></html>';

/** The program feed: channel 1, layer 1 — OUTSIDE every LayerManager policy range. */
const PROGRAM = { channel: 1, layer: 1 } as const;

it('Clear-All CLEARs only our own layers — the program feed survives on air', async () => {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40 });
  const amcpPort = mock.amcpPort;

  // Record EVERY `CLEAR` the bridge puts on the wire, from the very first command, while
  // still emulating the real per-layer clear so the rest of the state assertions hold.
  const clears: string[] = [];
  mock.setHandler('CLEAR', (req: AmcpRequest, ctx: HandlerContext) => {
    const target = req.args[0] ?? '';
    clears.push(target);
    const parsed = /^(\d+)-(\d+)$/.exec(target);
    if (parsed !== null) {
      ctx.setLayer(
        { channel: Number(parsed[1]), layer: Number(parsed[2]) },
        {
          producer: 'empty',
          filePath: '',
          paused: false,
          onAir: false,
          pageResolution: 'resolved',
        },
      );
    }
    // A bare `CLEAR <channel>` would land here. It is recorded and deliberately NOT emulated
    // — the assertions below fail on its mere presence, which is the point of this test.
    return { kind: 'ok', code: 202, verb: 'CLEAR' };
  });

  // ── the program feed, put on air by someone else, on a layer we do not manage ──
  await sendRaw(amcpPort, `PLAY 1-1 "program-feed.mov"`);
  expect(mock.layerState(PROGRAM)?.onAir).toBe(true);
  expect(mock.layerState(PROGRAM)?.filePath).toBe('program-feed.mov');

  runtime = new CasparRuntime(connectionFor(amcpPort, oscPort, await freeUdpPort()));
  runtime.start();
  await runtime.startServing();
  runtime.templateImport(LOWER_THIRD, HTML);
  runtime.templateImport(TICKER, HTML);
  await runtime.whenServerHealthy(HEALTH_MS);

  const lowerSlot = { channel: 1, layer: 10 }; // 'lower-third' policy range
  const tickerSlot = { channel: 1, layer: 20 }; // 'ticker' policy range

  await runtime.load('item-lower', 'lower-third', { headline: 'سلام' });
  await expect(mock.waitForCgAddResolution(lowerSlot)).resolves.toBe('resolved');
  await runtime.take('item-lower');

  await runtime.load('item-ticker', 'ticker', {});
  await expect(mock.waitForCgAddResolution(tickerSlot)).resolves.toBe('resolved');
  await runtime.take('item-ticker');

  expect(mock.layerState(lowerSlot)?.onAir).toBe(true);
  expect(mock.layerState(tickerSlot)?.onAir).toBe(true);

  // ── Clear-All ──
  expect(await runtime.clearAll()).toEqual({ ok: true, cleared: 2, attempted: 2, refused: [] });

  // 1. THE WIRE: every CLEAR ever sent is per-LAYER. Not one is a channel-wide `CLEAR 1`.
  expect(clears.length).toBeGreaterThan(0);
  for (const target of clears) {
    expect(target).toMatch(/^\d+-\d+$/); // `<channel>-<layer>` — never a bare channel
  }
  expect(clears).not.toContain('1');

  // 2. Only OUR layers were ever cleared — the program layer is never a target, at any point
  //    in the session (the adopt-CLEAR on first ADD is included in this recording).
  expect([...new Set(clears)].sort()).toEqual(['1-10', '1-20']);
  expect(clears).not.toContain('1-1');

  // 3. THE SIGNAL: the program feed is untouched. Still on air, same producer, same file.
  //    (R-015 made the mock report media truthfully — the feed IS an ffmpeg producer,
  //    which is exactly why nothing may ever clear it.)
  expect(mock.layerState(PROGRAM)?.onAir).toBe(true);
  expect(mock.layerState(PROGRAM)?.producer).toBe('ffmpeg');
  expect(mock.layerState(PROGRAM)?.filePath).toBe('program-feed.mov');

  // 4. …and our own graphics ARE off air.
  expect(mock.layerState(lowerSlot)?.producer).toBe('empty');
  expect(mock.layerState(tickerSlot)?.producer).toBe('empty');
});

it('an item holding no layer is never CLEARed — there is nothing of ours to clear', async () => {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40 });

  const clears: string[] = [];
  mock.setHandler('CLEAR', (req: AmcpRequest) => {
    clears.push(req.args[0] ?? '');
    return { kind: 'ok', code: 202, verb: 'CLEAR' };
  });

  await sendRaw(mock.amcpPort, `PLAY 1-1 "program-feed.mov"`);

  runtime = new CasparRuntime(connectionFor(mock.amcpPort, oscPort, await freeUdpPort()));
  runtime.start();
  await runtime.startServing();
  await runtime.whenServerHealthy(HEALTH_MS);

  // Nothing loaded ⇒ no item holds a slot ⇒ Clear-All has nothing of ours to clear. It must
  // NOT reach for the channel as a shortcut.
  //
  // B-122 — and it must not call that a success either. The ownership filter is the ONE
  // filter this verb keeps (a slotless item holds no layer of ours), and it is the reason
  // the honest answer here is `ok: false` rather than a completed clear of nothing.
  expect(await runtime.clearAll()).toEqual({ ok: false, cleared: 0, attempted: 0, refused: [] });

  expect(clears).toEqual([]);
  // The program feed is exactly where it was.
  expect(mock.layerState(PROGRAM)?.onAir).toBe(true);
  expect(mock.layerState(PROGRAM)?.filePath).toBe('program-feed.mov');
});
