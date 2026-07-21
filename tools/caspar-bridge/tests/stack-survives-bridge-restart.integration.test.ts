import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { CasparRuntime } from '../src/caspar-runtime.js';
import type {
  ConnectionConfig,
  RetainedStackItem,
  StackItemStatus,
  TemplateInfo,
} from '@cg/shared-ipc';
import { HEALTH_MS } from './support/harness.js';

/**
 * B-092 — the stack survives a restart of the BRIDGE process (end-to-end, real
 * bridge + mock CasparCG).
 *
 * The stack lives only in the bridge's in-memory Reconciler, so killing the
 * bridge used to erase every row. The browser now retains the stack INTENT and
 * re-delivers it on reconnect — but the restore must be OCCUPANCY-AWARE,
 * because the ordinary load path CLEARs a layer before its first `CG ADD`
 * there. On a bridge-ONLY restart that CLEAR would land on the LIVE layer and
 * flash the graphic off air.
 *
 * The invariant these tests exist to protect:
 *
 *   **A layer observed OCCUPIED at restore time is NEVER cleared.**
 *
 * Asserted through the mock's NDJSON wire trace — the actual AMCP bytes — not
 * through bridge bookkeeping, so a regression cannot hide behind a passing
 * abstraction.
 */

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;
let runtime2: CasparRuntime | null = null;
let tracePath: string | null = null;

afterEach(async () => {
  await runtime?.stop();
  runtime = null;
  await runtime2?.stop();
  runtime2 = null;
  await mock?.stop();
  mock = null;
  if (tracePath !== null && fs.existsSync(tracePath)) fs.rmSync(tracePath);
  tracePath = null;
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
const SLOT = { channel: 1, layer: 10 }; // 'lower-third' policy slot

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function waitFor(cond: () => boolean, timeoutMs: number, what: string): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await delay(25);
  }
}

function status(r: CasparRuntime, itemId: string): StackItemStatus | undefined {
  return r.stackSnapshot().find((i) => i.itemId === itemId)?.status;
}

/** The mock's NDJSON wire trace: recv'd AMCP lines, in arrival order. */
async function recvLines(m: MockHandle, file: string): Promise<string[]> {
  await m.traceFlush();
  return fs
    .readFileSync(file, 'utf-8')
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as { dir: string; line: string })
    .filter((e) => e.dir === 'recv')
    .map((e) => e.line);
}

/**
 * The browser's side of the contract, in one line: reduce the published stack
 * to retained INTENT, exactly as `StackRetentionStore` does.
 */
function retain(r: CasparRuntime): RetainedStackItem[] {
  return r.stackSnapshot().map((i) => ({
    itemId: i.itemId,
    templateId: i.templateId,
    fields: i.fields,
    played: i.status === 'playing' || i.status === 'on-air' || i.status === 'unverified',
    ...(i.slot !== undefined && { slot: i.slot }),
    ...(i.position !== undefined && { position: i.position }),
  }));
}

/**
 * Session 1 — the bridge the operator was using: import → load → take, then the
 * process DIES with the graphic on air (nothing clears the layer, exactly like
 * a killed bridge).
 */
async function onAirThenBridgeDies(m: MockHandle, oscPort: number): Promise<RetainedStackItem[]> {
  const r = new CasparRuntime(singleServer(m.amcpPort, oscPort));
  runtime = r;
  r.start();
  await r.startServing();
  r.templateImport(TEMPLATE, HTML);
  await r.whenServerHealthy(HEALTH_MS);
  expect((await r.load('item1', 'lower-third', { headline: 'سلام' })).accepted).toBe(true);
  await expect(m.waitForCgAddResolution(SLOT)).resolves.toBe('resolved');
  expect((await r.take('item1')).accepted).toBe(true);
  await waitFor(() => status(r, 'item1') === 'on-air', 5000, 'item reaches ON AIR');
  const retained = retain(r);
  await r.stop(); // the bridge dies — nothing clears the layer
  runtime = null;
  return retained;
}

it('a BRIDGE-ONLY restart: the restored item keeps ON AIR and its live layer is NEVER cleared', async () => {
  tracePath = path.join(
    os.tmpdir(),
    `cg-b088-bridge-only-${String(process.pid)}-${String(Date.now())}.ndjson`,
  );
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40, tracePath });

  const retained = await onAirThenBridgeDies(mock, oscPort);
  expect(retained).toHaveLength(1);
  expect(retained[0]?.played).toBe(true);
  expect(retained[0]?.slot).toMatchObject(SLOT);

  // CasparCG never died: the graphic is STILL ON AIR, orphaned by the dead bridge.
  expect(mock.layerState(SLOT)?.producer).toBe('html');
  expect(mock.layerState(SLOT)?.onAir).toBe(true);
  const session1Count = (await recvLines(mock, tracePath)).length;

  // ── the bridge comes back; the browser re-delivers its library, then its stack ──
  const r2 = new CasparRuntime(singleServer(mock.amcpPort, oscPort));
  runtime2 = r2;
  await r2.startServing();
  r2.templateImport(TEMPLATE, HTML);
  // Restored BEFORE the CasparCG session is even started — the real ordering on
  // a bridge restart (the SPA reconnects long before the AMCP handshake
  // completes). The occupancy tap is empty here, so the decision MUST be
  // deferred to the healthy transition; if it were taken now, "silent" would be
  // read as "empty" and the live layer would be re-ADDed over.
  expect(await r2.restore(retained)).toEqual({ restored: 1, skipped: 0 });

  // The core bug: the row is BACK, immediately, before CasparCG is reachable.
  expect(r2.stackSnapshot().map((i) => i.itemId)).toEqual(['item1']);

  r2.start();
  await r2.whenServerHealthy(HEALTH_MS);

  // Resumed OSC re-derives the truth: the producer is there and the item was
  // taken, so it reads ON AIR again — with no operator action.
  await waitFor(() => status(r2, 'item1') === 'on-air', 8000, 'restored item reads ON AIR');

  // ── THE BROADCAST-SAFETY INVARIANT ──
  // The live layer was never cleared: no CLEAR (and no CG REMOVE) for 1-10
  // anywhere in the restarted bridge's session. The graphic never flashed off.
  const session2Lines = (await recvLines(mock, tracePath)).slice(session1Count);
  expect(session2Lines.some((l) => l.startsWith('CLEAR 1-10'))).toBe(false);
  expect(session2Lines.some((l) => l.startsWith('CG 1-10 REMOVE'))).toBe(false);
  // Nor was it re-ADDed: adopting an occupied layer sends NOTHING at all.
  expect(session2Lines.some((l) => l.startsWith('CG 1-10 ADD'))).toBe(false);
  // No channel-wide clear, ever.
  expect(session2Lines.some((l) => /^CLEAR 1\s*$/.test(l))).toBe(false);

  // And the producer the operator is watching is the ORIGINAL one, still on air.
  expect(mock.layerState(SLOT)?.onAir).toBe(true);
}, 40_000);

it('a BRIDGE + CASPARCG restart: the restored item returns as LOADED on the empty layer', async () => {
  tracePath = path.join(
    os.tmpdir(),
    `cg-b088-both-restart-${String(process.pid)}-${String(Date.now())}.ndjson`,
  );
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40, tracePath });

  const retained = await onAirThenBridgeDies(mock, oscPort);
  const amcpPort = mock.amcpPort;

  // ── CasparCG restarts too: the layers come back EMPTY ──
  const dying = mock;
  mock = null; // never double-stop in afterEach
  await dying.stop();
  mock = await createMock({ amcpPort, oscPort, oscHost: '127.0.0.1', oscHz: 40, tracePath });
  expect(mock.layerState(SLOT)).toBeUndefined(); // genuinely empty
  const beforeRestore = (await recvLines(mock, tracePath)).length;

  const r2 = new CasparRuntime(singleServer(amcpPort, oscPort));
  runtime2 = r2;
  await r2.startServing();
  r2.templateImport(TEMPLATE, HTML);
  expect(await r2.restore(retained)).toEqual({ restored: 1, skipped: 0 });
  r2.start();
  await r2.whenServerHealthy(HEALTH_MS);

  // The layer is silent → the producer is gone → the item is re-ADDed and rests
  // at LOADED. It must NOT resurrect an ON AIR claim nothing backs.
  // The re-ADD is issued off the healthy transition, so wait for the wire, not
  // just the badge: `loaded` is reachable from the intent alone, and asserting
  // the layer before the ADD lands would pass for the wrong reason.
  await expect(mock.waitForCgAddResolution(SLOT, 10_000)).resolves.toBe('resolved');
  await waitFor(() => status(r2, 'item1') === 'loaded', 8000, 'restored item rests at LOADED');
  expect(status(r2, 'item1')).toBe('loaded');
  expect(mock.layerState(SLOT)?.producer).toBe('html'); // re-added…
  expect(mock.layerState(SLOT)?.onAir).toBe(false); // …but NOT playing

  // The re-ADD carried the retained fields — the operator's data survived too.
  expect(mock.lastCgAdd(SLOT)?.data).toContain('سلام');

  // Even here, where a CLEAR would have been harmless, the restore issues none:
  // no restore branch clears, so a mis-read of "silent" can never destroy a producer.
  const lines = (await recvLines(mock, tracePath)).slice(beforeRestore);
  expect(lines.some((l) => l.startsWith('CG 1-10 ADD'))).toBe(true);
  expect(lines.some((l) => l.startsWith('CLEAR 1-10'))).toBe(false);
}, 40_000);

it('INVARIANT: a layer the occupancy tap reports OCCUPIED has its adopt-CLEAR suppressed (late restore, warm tap)', async () => {
  tracePath = path.join(
    os.tmpdir(),
    `cg-b088-invariant-${String(process.pid)}-${String(Date.now())}.ndjson`,
  );
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40, tracePath });

  const retained = await onAirThenBridgeDies(mock, oscPort);

  // The OTHER arrival order: the bridge has been up and healthy for a while and
  // the SPA connects late (a page reload). The `to === 'healthy'` transition
  // fired long ago and will not fire again — the decision has to be taken
  // INLINE, off the already-warm tap. Without that branch the item would sit
  // restored-but-undecided forever.
  const r2 = new CasparRuntime(singleServer(mock.amcpPort, oscPort));
  runtime2 = r2;
  r2.start();
  await r2.startServing();
  r2.templateImport(TEMPLATE, HTML);
  // Reaching healthy means the session completed its RESYNCING drain with OSC
  // flowing at 40 Hz throughout, so the tap is warm by construction — this is
  // the same guarantee B-086's reconnect reconcile relies on.
  await r2.whenServerHealthy(HEALTH_MS);
  const beforeRestore = (await recvLines(mock, tracePath)).length;

  expect(await r2.restore(retained)).toEqual({ restored: 1, skipped: 0 });

  // Occupied at restore time → adopted WITHOUT a CLEAR, and the item reads ON AIR.
  await waitFor(() => status(r2, 'item1') === 'on-air', 8000, 'restored item reads ON AIR');
  const after = (await recvLines(mock, tracePath)).slice(beforeRestore);
  expect(after.some((l) => l.startsWith('CLEAR 1-10'))).toBe(false);
  expect(mock.layerState(SLOT)?.onAir).toBe(true);
}, 40_000);

it('FROZEN: the ORDINARY load path still adopt-CLEARs, and a live bridge is never clobbered', async () => {
  tracePath = path.join(
    os.tmpdir(),
    `cg-b088-frozen-${String(process.pid)}-${String(Date.now())}.ndjson`,
  );
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40, tracePath });

  const retained = await onAirThenBridgeDies(mock, oscPort);

  const r2 = new CasparRuntime(singleServer(mock.amcpPort, oscPort));
  runtime2 = r2;
  await r2.startServing();
  r2.templateImport(TEMPLATE, HTML);
  expect(await r2.restore(retained)).toEqual({ restored: 1, skipped: 0 });
  r2.start();
  await r2.whenServerHealthy(HEALTH_MS);
  const afterRestore = (await recvLines(mock, tracePath)).length;

  // A NORMAL load, after the restore, keeps the reconnect-reconciliation
  // contract verbatim: its layer is adopted with a CLEAR before its first ADD.
  // Only the RESTORE path adopts without clearing.
  expect((await r2.load('item2', 'lower-third', { headline: 'دوم' })).accepted).toBe(true);
  const lines = (await recvLines(mock, tracePath)).slice(afterRestore);
  const clear = lines.findIndex((l) => l.startsWith('CLEAR 1-11'));
  const add = lines.findIndex((l) => l.startsWith('CG 1-11 ADD'));
  expect(clear).toBeGreaterThanOrEqual(0);
  expect(add).toBeGreaterThan(clear);
  // …and it did NOT touch the restored item's live layer.
  expect(lines.some((l) => l.startsWith('CLEAR 1-10'))).toBe(false);

  // A second restore of the SAME intent (a page reload against this now-live
  // bridge) is a no-op: local intent never clobbers a bridge's own state.
  expect(await r2.restore(retained)).toEqual({ restored: 0, skipped: 1 });
  expect(r2.stackSnapshot()).toHaveLength(2);
}, 40_000);

it('FROZEN: restoring while NO server is reachable sends nothing, and the on-air verbs stay REFUSED (R-006)', async () => {
  const oscPort = await freeUdpPort();
  // No mock at all — nothing is listening.
  const r = new CasparRuntime(singleServer(1, oscPort));
  runtime = r;
  await r.startServing();
  r.templateImport(TEMPLATE, HTML);

  const retained: RetainedStackItem[] = [
    {
      itemId: 'item1',
      templateId: 'lower-third',
      fields: { headline: 'سلام' },
      played: true,
      slot: { ...SLOT, server: 'primary' },
    },
  ];
  expect(await r.restore(retained)).toEqual({ restored: 1, skipped: 0 });

  // The row is back — that is the point, and it costs no AMCP traffic (there is
  // nothing to send to, and nothing is queued for later: R-006 forbids that).
  expect(r.stackSnapshot().map((i) => i.itemId)).toEqual(['item1']);
  // The claim is not a red ON AIR: with the link down B-086's demotion applies
  // to a restored record exactly as to one that never died.
  expect(status(r, 'item1')).toBe('unverified');

  // R-006 unchanged: the on-air verbs are still refused with the link down.
  expect(await r.take('item1')).toEqual({ accepted: false, errorCode: 'disconnected' });
  expect(await r.out('item1')).toEqual({ accepted: false, errorCode: 'disconnected' });
  expect(await r.update('item1', { headline: 'x' }, 'merge')).toEqual({
    accepted: false,
    errorCode: 'disconnected',
  });
}, 25_000);

it('FROZEN: a restore never LIFTS B-086 — a mirror pair with the primary down keeps "WAS ON AIR"', async () => {
  // The narrow case a review caught: `#noServerReachable()` (command reachability) is
  // FALSE whenever ANY server is reachable, but B-086 demotes on the CURRENT
  // PRIMARY, because only the primary's OSC can verify an on-air claim. A
  // restore that cleared the flag from the reachability predicate would
  // un-demote "WAS ON AIR" rows back to a confident red ON AIR that nothing
  // verifies — the exact broadcast-safety lie B-086 exists to kill.
  const oscPortA = await freeUdpPort();
  const oscPortB = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort: oscPortA, oscHost: '127.0.0.1', oscHz: 40 });
  const backup = await createMock({
    amcpPort: 0,
    oscPort: oscPortB,
    oscHost: '127.0.0.1',
    oscHz: 40,
  });
  try {
    const r = new CasparRuntime({
      servers: {
        A: { host: '127.0.0.1', amcpPort: mock.amcpPort, oscPort: oscPortA },
        B: { host: '127.0.0.1', amcpPort: backup.amcpPort, oscPort: oscPortB },
      },
      strategy: 'mirror-sync',
      // Human-in-the-loop: no auto-failover, so A stays the primary while down.
      autoFailoverEnabled: false,
    });
    runtime = r;
    r.start();
    await r.startServing();
    r.templateImport(TEMPLATE, HTML);
    await r.whenServerHealthy(HEALTH_MS);
    expect((await r.load('item1', 'lower-third', { headline: 'سلام' })).accepted).toBe(true);
    await expect(mock.waitForCgAddResolution(SLOT)).resolves.toBe('resolved');
    expect((await r.take('item1')).accepted).toBe(true);
    await waitFor(() => status(r, 'item1') === 'on-air', 8000, 'item reaches ON AIR');

    // The PRIMARY dies; the BACKUP stays up, so commands can still reach a server.
    const dying = mock;
    mock = null;
    await dying.stop();
    await waitFor(() => status(r, 'item1') === 'unverified', 8000, 'B-086 demotes to WAS ON AIR');

    // A page reload now re-delivers retained intent. The demotion must SURVIVE it.
    expect(await r.restore(retain(r))).toEqual({ restored: 0, skipped: 1 });
    expect(status(r, 'item1')).toBe('unverified');

    // …including for an item the restore genuinely seeds.
    expect(
      await r.restore([{ itemId: 'item2', templateId: 'lower-third', fields: {}, played: true }]),
    ).toEqual({ restored: 1, skipped: 0 });
    expect(status(r, 'item2')).toBe('unverified');
  } finally {
    await backup.stop();
  }
}, 40_000);
