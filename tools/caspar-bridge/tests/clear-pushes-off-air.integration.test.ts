import * as dgram from 'node:dgram';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { CasparRuntime } from '../src/caspar-runtime.js';
import type { ConnectionConfig, TemplateInfo } from '@cg/shared-ipc';
import type { StackItemState, StackItemStatus } from '@cg/shared-schema';
import { HEALTH_MS, TEST_LAYER_POLICY } from './support/harness.js';

/**
 * 🔴 `B-331` — **CLEAR TAKES THE ROW OFF AIR IN THE PUSH, not one command later.**
 *
 * The owner, 2026-10-12: Clear on a playing row took the graphic off air, but the row's PLAY
 * stayed green until the NEXT command — a second Clear on that row, or Clear/Stop on any other.
 * Stop never did this.
 *
 * The console learns item state ONLY from `stackChanged` (`#markDirty`'s coalesced push). So
 * every assertion here reads what was PUSHED, never `stackSnapshot()`: the snapshot re-derives
 * at read time, after the OSC truth has decayed, and would read `idle` over a console still
 * showing ON AIR — the very gap this file exists to close.
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

/** What the console last RECEIVED for each item — the `stackChanged` pushes, nothing derived. */
function recordPushes(r: CasparRuntime): Map<string, StackItemStatus> {
  const pushed = new Map<string, StackItemStatus>();
  r.stackChanged.subscribe((items: readonly StackItemState[]) => {
    for (const item of items) pushed.set(item.itemId, item.status);
  });
  return pushed;
}

/**
 * Longer than the reconciler's 1 s truth window and the 20 ms push coalescing together, and
 * NOTHING is sent in it: a row still pushed ON AIR at the end of this is one waiting for the
 * next command to be re-read — the defect.
 */
const QUIET_MS = 1500;

async function boot(): Promise<{ r: CasparRuntime; m: MockHandle }> {
  const oscPort = await freeUdpPort();
  // The core's own order: `202 CLEAR OK` first, then one more frame of the page, then silence.
  const m = await createMock({
    amcpPort: 0,
    oscPort,
    oscHost: '127.0.0.1',
    oscHz: 40,
    clearRepliesBeforeErase: true,
  });
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
  return { r, m };
}

async function playToAir(
  r: CasparRuntime,
  m: MockHandle,
  pushed: Map<string, StackItemStatus>,
  itemId: string,
): Promise<{ channel: number; layer: number }> {
  expect((await r.load(itemId, 'lower-third', {})).accepted).toBe(true);
  const slot = r.stackSnapshot().find((i) => i.itemId === itemId)?.slot;
  if (slot === undefined) throw new Error(`${itemId} has no slot`);
  await expect(m.waitForCgAddResolution(slot)).resolves.toBe('resolved');
  expect((await r.take(itemId)).accepted).toBe(true);
  await waitFor(() => pushed.get(itemId) === 'on-air', 8000, `${itemId} pushed ON AIR`);
  return { channel: slot.channel, layer: slot.layer };
}

it('🔴 B-331: a Clear on a playing row PUSHES it off air, with no further command', async () => {
  const { r, m } = await boot();
  const pushed = recordPushes(r);
  const slot = await playToAir(r, m, pushed, 'a');

  expect((await r.out('a')).accepted).toBe(true);
  await delay(QUIET_MS);

  // The wire: the layer really is empty (the positive control for "the Clear landed").
  expect(m.layerState(slot)?.producer).not.toBe('html');
  // The console: what it was last told agrees with the wire.
  expect(pushed.get('a')).toBe('idle');
  // …and with what the bridge itself now derives — no gap between the push and a pull.
  expect(r.stackSnapshot().find((i) => i.itemId === 'a')?.status).toBe(pushed.get('a'));
}, 40_000);

it('🔴 B-331: a second Clear on the already-cleared row is harmless — accepted, still idle, no error', async () => {
  const { r, m } = await boot();
  const pushed = recordPushes(r);
  const slot = await playToAir(r, m, pushed, 'a');

  expect((await r.out('a')).accepted).toBe(true);
  await delay(QUIET_MS);
  const second = await r.out('a');
  await delay(QUIET_MS);

  expect(second.accepted).toBe(true);
  expect(m.layerState(slot)?.producer).not.toBe('html');
  expect(pushed.get('a')).toBe('idle');
  const row = r.stackSnapshot().find((i) => i.itemId === 'a');
  expect(row?.status).toBe('idle');
  expect(row?.errorCode).toBeUndefined();
  expect(row?.pending).toBe(false);
}, 40_000);

it('🔴 B-331: a Clear on row A leaves row B on air, and B is still pushed ON AIR', async () => {
  const { r, m } = await boot();
  const pushed = recordPushes(r);
  const slotA = await playToAir(r, m, pushed, 'a');
  const slotB = await playToAir(r, m, pushed, 'b');
  expect(slotA.layer).not.toBe(slotB.layer);

  expect((await r.out('a')).accepted).toBe(true);
  await delay(QUIET_MS);

  expect(pushed.get('a')).toBe('idle');
  expect(pushed.get('b')).toBe('on-air');
  expect(m.layerState(slotB)?.producer).toBe('html');
  expect(m.layerState(slotB)?.onAir).toBe(true);

  // …and the owner's other sequence: Clear the second row too. Each is pushed off on its own.
  expect((await r.out('b')).accepted).toBe(true);
  await delay(QUIET_MS);
  expect(pushed.get('b')).toBe('idle');
  expect(pushed.get('a')).toBe('idle');
}, 40_000);

it('🔴 B-331: a row taken again after its Clear goes back on air — the late frame is ignored, a real take is not', async () => {
  const { r, m } = await boot();
  const pushed = recordPushes(r);
  const slot = await playToAir(r, m, pushed, 'a');

  expect((await r.out('a')).accepted).toBe(true);
  await delay(QUIET_MS);
  expect(pushed.get('a')).toBe('idle');

  expect((await r.take('a')).accepted).toBe(true);
  /*
    PLAY green again (`playing` or `on-air`), never held off air by the guard. ⚠ It rests at the
    take's ack `playing`, not OSC's `on-air`, with OR without this fix (measured by ablation): the
    late frame leaves the OSC change tracker at `html`, so the re-ADD's page is suppressed as a
    repeat. That is the transport's half, recorded on `B-331` as open — not this guard's doing.
  */
  await waitFor(
    () => pushed.get('a') === 'playing' || pushed.get('a') === 'on-air',
    8000,
    'the re-taken row pushed back on air',
  );
  expect(m.layerState(slot)?.producer).toBe('html');
  expect(m.layerState(slot)?.onAir).toBe(true);
}, 40_000);

it('CONTROL (Stop unchanged): a Stop on a playing row is pushed READY at once and its producer stays', async () => {
  const { r, m } = await boot();
  const pushed = recordPushes(r);
  const slot = await playToAir(r, m, pushed, 'a');

  expect((await r.stopItem('a')).accepted).toBe(true);
  await delay(QUIET_MS);

  expect(pushed.get('a')).toBe('loaded');
  expect(m.layerState(slot)?.producer).toBe('html');
}, 40_000);
