import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { CasparRuntime } from '../src/caspar-runtime.js';
import type { ConnectionConfig, TemplateInfo } from '@cg/shared-ipc';
import { HEALTH_MS, track } from './support/harness.js';

/**
 * B-100 — the bridge's link predicate must mean "no declared server is
 * REACHABLE", not "no declared session is `healthy`".
 *
 * A server that has gone OSC-silent for >3 s while its AMCP socket still works is
 * `degraded`: its COMMAND axis (AMCP) is up, only its CONFIRMATION axis (OSC) is
 * silent. The old `#linkDown()` tested `state !== 'healthy'`, so it called such a
 * server UNREACHABLE — and `load()` then issued its adopt-`CLEAR` (which REACHES
 * the wire, AMCP being up) but SKIPPED the pre-roll `CG ADD` behind the same
 * predicate. CLEAR-then-nothing leaves the layer BLACK on air, and every on-air
 * verb is refused though a working CasparCG is right there.
 *
 * The seam that makes `degraded` deterministic in a test: `sessionTuning` shrinks
 * `oscDegradedAfterMs` so a session demotes to `degraded` almost immediately on
 * OSC silence, and inflates `oscDownAfterMs` so it never force-disconnects out of
 * `degraded` for the test's lifetime (that force-disconnect is B-101's territory
 * and is out of scope here). OSC silence is produced the same way B-094's test
 * does it — the session binds a `deafPort` the mock never emits to, so the AMCP
 * axis stays perfectly healthy while OSC is never heard.
 */

const TEMPLATE: TemplateInfo = {
  templateId: 'lower-third',
  templateType: 'lower-third',
  fields: [],
};
const HTML = '<!doctype html><html><head><meta charset="utf-8"></head><body>سلام</body></html>';
const SLOT = { channel: 1, layer: 10 };

/** Demote to `degraded` within a tick of OSC silence; never force-disconnect out of it. */
const DEGRADED_TUNING = {
  oscDegradedAfterMs: 80,
  oscDownAfterMs: 10 * 60_000,
  watcherIntervalMs: 25,
} as const;

let traceSeq = 0;

afterEach(() => {
  traceSeq = 0;
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
    strategy: 'single',
    autoFailoverEnabled: false,
  };
}

function newTracePath(): string {
  const p = path.join(
    os.tmpdir(),
    `cg-b100-${String(process.pid)}-${String(Date.now())}-${String(traceSeq++)}.ndjson`,
  );
  return track(p, (file) => {
    if (fs.existsSync(file)) fs.rmSync(file);
  });
}

/** Track a mock so it is torn down LIFO from `afterEach`, whatever an assert does. */
async function newMock(opts: Parameters<typeof createMock>[0]): Promise<MockHandle> {
  return track(await createMock(opts), (m) => m.stop());
}

/** Track a runtime the same way; sessionTuning is opt-in per test. */
function newRuntime(
  config: ConnectionConfig,
  sessionTuning?: typeof DEGRADED_TUNING,
): CasparRuntime {
  const rt = new CasparRuntime(config, {}, sessionTuning ? { sessionTuning } : {});
  return track(rt, (r) => r.stop());
}

/** The mock's NDJSON wire trace: recv'd AMCP lines, in arrival order. */
async function recvLines(m: MockHandle, file: string): Promise<string[]> {
  await m.traceFlush(); // write barrier: everything queued so far is on disk
  return fs
    .readFileSync(file, 'utf-8')
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as { dir: string; line: string })
    .filter((e) => e.dir === 'recv')
    .map((e) => e.line);
}

/**
 * Load `itemId` and report what reached the wire during that load: whether an
 * adopt-`CLEAR 1-10` landed and whether a `CG 1-10 ADD` followed it. The single
 * durable invariant is `clearReached ⇒ addReached` (never CLEAR-then-nothing).
 */
async function clearAddOnLoad(
  m: MockHandle,
  file: string,
  r: CasparRuntime,
  itemId: string,
): Promise<{ accepted: boolean; clearReached: boolean; addReached: boolean }> {
  const before = (await recvLines(m, file)).length;
  const { accepted } = await r.load(itemId, 'lower-third', {});
  const seg = (await recvLines(m, file)).slice(before);
  const clearIdx = seg.findIndex((l) => l.startsWith('CLEAR 1-10'));
  const addIdx = seg.findIndex((l) => l.startsWith('CG 1-10 ADD'));
  return {
    accepted,
    clearReached: clearIdx >= 0,
    // "ADD followed the CLEAR" — an ADD before an adopt-CLEAR would not repair it.
    addReached: addIdx >= 0 && (clearIdx < 0 || addIdx > clearIdx),
  };
}

/**
 * Session 1: import → load → take → the bridge DIES with a producer ON AIR,
 * leaving `html` orphaned on the mock's `SLOT` (its layer state is per server
 * instance, exactly like real CasparCG). The adopt-CLEAR of a LATER load is then
 * destructive on a real resident producer — the black-layer harm made concrete.
 */
async function plantOrphan(m: MockHandle, oscPort: number): Promise<void> {
  const r = newRuntime(singleServer(m.amcpPort, oscPort));
  r.start();
  await r.startServing();
  r.templateImport(TEMPLATE, HTML);
  await r.whenServerHealthy(HEALTH_MS);
  expect((await r.load('orphan', 'lower-third', { headline: 'قدیمی' })).accepted).toBe(true);
  await expect(m.waitForCgAddResolution(SLOT)).resolves.toBe('resolved');
  expect((await r.take('orphan')).accepted).toBe(true);
  expect(m.layerState(SLOT)?.onAir).toBe(true);
  await r.stop(); // nothing clears the layer — the producer is orphaned ON AIR
}

/**
 * Boot a single-server runtime whose OSC is never heard (binds `deafPort`) and
 * hold it in `degraded` with the AMCP axis fully up. Returns the runtime once its
 * primary is degraded.
 */
async function bootDegraded(m: MockHandle): Promise<CasparRuntime> {
  const deafPort = await freeUdpPort();
  const r = newRuntime(singleServer(m.amcpPort, deafPort), DEGRADED_TUNING);
  r.start();
  await r.startServing();
  r.templateImport(TEMPLATE, HTML);
  await r.whenServerHealthy(HEALTH_MS);
  await expect.poll(() => r.health().primary.state, { timeout: HEALTH_MS }).toBe('degraded');
  // AMCP command axis is believed UP even though we hear no OSC — the exact
  // conjunction B-100 is about, and B-094's "answering AMCP, silent OSC" shape.
  expect(r.health().primary.amcpAxisOk).toBe(false); // amcpAxisOk tracks `healthy` only
  return r;
}

describe('B-100 — a degraded (OSC-silent, AMCP-up) server is REACHABLE', () => {
  // §4.1 — the black layer.
  it('load onto a degraded server clears the orphan AND re-adds it — the layer is never left black', async () => {
    const oscPort = await freeUdpPort();
    const tracePath = newTracePath();
    const mock = await newMock({
      amcpPort: 0,
      oscPort,
      oscHost: '127.0.0.1',
      oscHz: 40,
      tracePath,
    });

    await plantOrphan(mock, oscPort);
    // The orphan really is resident on the target layer before we load onto it.
    expect(mock.layerState(SLOT)?.producer).toBe('html');
    expect(mock.layerState(SLOT)?.onAir).toBe(true);

    const r = await bootDegraded(mock);
    const before = (await recvLines(mock, tracePath)).length;

    expect((await r.load('fresh', 'lower-third', { headline: 'جدید' })).accepted).toBe(true);

    // A fresh CG ADD reached the wire: the adopt-CLEAR was PAIRED with a re-roll.
    const seg = (await recvLines(mock, tracePath)).slice(before);
    const clearIdx = seg.findIndex((l) => l.startsWith('CLEAR 1-10'));
    const addIdx = seg.findIndex((l) => l.startsWith('CG 1-10 ADD'));
    expect(clearIdx).toBeGreaterThanOrEqual(0); // adoption still clears the orphan…
    expect(addIdx).toBeGreaterThan(clearIdx); // …but the ADD now follows it

    // The pairing invariant, asserted on the end state: a live producer is on the
    // layer, NOT the empty/black the CLEAR-then-nothing window left. Pre-fix this
    // reads 'empty' (CLEAR landed, ADD skipped behind the wrong predicate).
    expect(mock.layerState(SLOT)?.producer).toBe('html');
    expect(mock.layerState(SLOT)?.producer).not.toBe('empty');
    await expect(mock.waitForCgAddResolution(SLOT)).resolves.toBe('resolved');
  }, 30_000);

  // §4.2 — the durable guard: CLEAR-reached-the-wire ⇒ ADD-was-attempted, on every
  // reachability state.
  it('pairing invariant holds across healthy, degraded, and fully-disconnected loads', async () => {
    // healthy — a live mock the session hears; CLEAR and ADD both land, in order.
    {
      const oscPort = await freeUdpPort();
      const tracePath = newTracePath();
      const mock = await newMock({
        amcpPort: 0,
        oscPort,
        oscHost: '127.0.0.1',
        oscHz: 40,
        tracePath,
      });
      const r = newRuntime(singleServer(mock.amcpPort, oscPort));
      r.start();
      await r.startServing();
      r.templateImport(TEMPLATE, HTML);
      await r.whenServerHealthy(HEALTH_MS);

      const res = await clearAddOnLoad(mock, tracePath, r, 'h1');
      expect(res.accepted).toBe(true);
      expect(res.clearReached && !res.addReached).toBe(false); // never CLEAR-then-nothing
      expect(mock.layerState(SLOT)?.producer).not.toBe('empty');
    }

    // degraded — AMCP up, OSC silent. THE case the old predicate broke.
    {
      const oscPort = await freeUdpPort();
      const tracePath = newTracePath();
      const mock = await newMock({
        amcpPort: 0,
        oscPort,
        oscHost: '127.0.0.1',
        oscHz: 40,
        tracePath,
      });
      const r = await bootDegraded(mock);

      const res = await clearAddOnLoad(mock, tracePath, r, 'd1');
      expect(res.accepted).toBe(true);
      expect(res.clearReached && !res.addReached).toBe(false); // pre-fix: violated here
      expect(mock.layerState(SLOT)?.producer).not.toBe('empty');
    }

    // fully disconnected — no server reachable at all. The invariant's premise is
    // false (nothing reaches any wire), so it holds vacuously; the observable is
    // B-082: the load still rests at `loaded`, nothing sent. AMCP port 1 never answers.
    {
      const r = newRuntime(singleServer(1, await freeUdpPort()));
      r.start();
      await r.startServing();
      r.templateImport(TEMPLATE, HTML);

      expect((await r.load('x1', 'lower-third', {})).accepted).toBe(true);
      expect(r.stackSnapshot().find((i) => i.itemId === 'x1')?.status).toBe('loaded');
    }
  }, 45_000);

  // §4.3 — the on-air policy change: on-air verbs are ACCEPTED on a degraded server.
  it('take on a degraded-but-reachable server is ACCEPTED and the CG PLAY reaches the wire', async () => {
    const oscPort = await freeUdpPort();
    const tracePath = newTracePath();
    const mock = await newMock({
      amcpPort: 0,
      oscPort,
      oscHost: '127.0.0.1',
      oscHz: 40,
      tracePath,
    });
    const r = await bootDegraded(mock);

    // A load in degraded pre-rolls a producer (post-fix); the take then plays it.
    expect((await r.load('play', 'lower-third', { headline: 'روی آنتن' })).accepted).toBe(true);
    await expect(mock.waitForCgAddResolution(SLOT)).resolves.toBe('resolved');

    // Pre-fix: `{ accepted: false, errorCode: 'disconnected' }` — the whole point.
    expect(await r.take('play')).toEqual({ accepted: true });

    const seg = await recvLines(mock, tracePath);
    expect(seg.some((l) => l.startsWith('CG 1-10 PLAY'))).toBe(true);
    expect(mock.layerState(SLOT)?.onAir).toBe(true);
  }, 30_000);

  // §2.1 — the FIFTH call site. C-012's graceful stop changed behaviour with B-100
  // and had no coverage in either direction.
  it('stopItem on a degraded-but-reachable server is ACCEPTED and the CG STOP reaches the wire', async () => {
    const oscPort = await freeUdpPort();
    const tracePath = newTracePath();
    const mock = await newMock({
      amcpPort: 0,
      oscPort,
      oscHost: '127.0.0.1',
      oscHz: 40,
      tracePath,
    });
    const r = await bootDegraded(mock);

    expect((await r.load('grace', 'lower-third', { headline: 'خروج' })).accepted).toBe(true);
    await expect(mock.waitForCgAddResolution(SLOT)).resolves.toBe('resolved');
    expect((await r.take('grace')).accepted).toBe(true);
    expect(mock.layerState(SLOT)?.onAir).toBe(true);

    // Being unable to take a graphic OFF air through a working command link was the
    // more dangerous half of the old behaviour — worse than a refused take, because
    // the graphic STAYS on air. Pre-B-100 this returned `disconnected`.
    expect(await r.stopItem('grace')).toEqual({ accepted: true });

    const seg = await recvLines(mock, tracePath);
    expect(seg.some((l) => l.startsWith('CG 1-10 STOP'))).toBe(true);
    // C-012 — a graceful stop leaves the producer RESIDENT (contrast out's CLEAR).
    expect(mock.layerState(SLOT)?.producer).toBe('html');
    expect(mock.layerState(SLOT)?.onAir).toBe(false);
  }, 30_000);

  // §2.2 — FROZEN (R-006, the fifth call site): offline safety is re-scoped to "no
  // server reachable", NOT removed. Mirrors disconnected-refusal's take/update/out.
  it('FROZEN: stopItem is still REFUSED with no server reachable, and queues nothing', async () => {
    const oscPort = await freeUdpPort();
    const tracePath = newTracePath();
    // AMCP port 1 never answers — no session is ever reachable.
    const r = newRuntime(singleServer(1, oscPort));
    r.start();
    await r.startServing();
    r.templateImport(TEMPLATE, HTML);
    await r.load('off', 'lower-third', {});

    expect(await r.stopItem('off')).toEqual({ accepted: false, errorCode: 'disconnected' });

    // The refusal happens BEFORE any intent is applied: nothing optimistic, nothing stuck.
    const item = r.stackSnapshot().find((i) => i.itemId === 'off');
    expect(item?.status).toBe('loaded');
    expect(item?.pending).toBe(false);

    // …and it is a REFUSAL, not a deferral. Bring a real server up and reconfigure onto
    // it — the closest thing to "the server came back": no CG STOP is ever replayed.
    const mock = await newMock({
      amcpPort: 0,
      oscPort,
      oscHost: '127.0.0.1',
      oscHz: 40,
      tracePath,
    });
    await r.setConfig(singleServer(mock.amcpPort, oscPort));
    await r.whenServerHealthy(HEALTH_MS);
    const seg = await recvLines(mock, tracePath);
    expect(seg.some((l) => l.startsWith('CG 1-10 STOP'))).toBe(false);
  }, 30_000);

  // The durable guard, completed: §4.2's pairing invariant is a LOAD-path property
  // (CLEAR⇒ADD), so it has no verb axis. The verb axis is here — all FIVE predicate
  // call sites exercised on one degraded server, in the same order as B-100's owed
  // hardware protocol. Before this, only `take` was covered.
  it('every predicate call site is ACCEPTED on a degraded server: load → take → update → stopItem → out', async () => {
    const oscPort = await freeUdpPort();
    const tracePath = newTracePath();
    const mock = await newMock({
      amcpPort: 0,
      oscPort,
      oscHost: '127.0.0.1',
      oscHz: 40,
      tracePath,
    });
    const r = await bootDegraded(mock);

    // 1/5 load — the pre-roll ADD reaches the wire (paired with its adopt-CLEAR).
    expect((await r.load('all', 'lower-third', { headline: 'یک' })).accepted).toBe(true);
    await expect(mock.waitForCgAddResolution(SLOT)).resolves.toBe('resolved');
    // 2/5 take
    expect(await r.take('all')).toEqual({ accepted: true });
    expect(mock.layerState(SLOT)?.onAir).toBe(true);
    // 3/5 update — the on-air graphic can still be corrected while OSC is silent.
    expect(await r.update('all', { headline: 'دو' }, 'merge')).toEqual({ accepted: true });
    // 4/5 stopItem — graceful outro, producer stays resident.
    expect(await r.stopItem('all')).toEqual({ accepted: true });
    expect(mock.layerState(SLOT)?.producer).toBe('html');
    // 5/5 out — the hard clear still destroys the producer.
    expect(await r.out('all')).toEqual({ accepted: true });
    expect(mock.layerState(SLOT)?.producer).toBe('empty');

    // Every verb genuinely reached the wire — accepted acks are not enough.
    const seg = await recvLines(mock, tracePath);
    expect(seg.some((l) => l.startsWith('CG 1-10 ADD'))).toBe(true);
    expect(seg.some((l) => l.startsWith('CG 1-10 PLAY'))).toBe(true);
    expect(seg.some((l) => l.startsWith('CG 1-10 UPDATE'))).toBe(true);
    expect(seg.some((l) => l.startsWith('CG 1-10 STOP'))).toBe(true);
    expect(seg.some((l) => l.startsWith('CLEAR 1-10'))).toBe(true);
  }, 30_000);

  // §4.6 — FROZEN (B-056): the predicate is still "no server reachable", not "the
  // primary is down". A dead primary with a HEALTHY backup still accepts sends.
  // Passes both pre- and post-fix; the guard is that B-100 does not regress it.
  it('mirror pair: primary AMCP dead, backup healthy — sends still go through (B-056)', async () => {
    const oscA = await freeUdpPort();
    const oscB = await freeUdpPort();
    const mockB = await newMock({ amcpPort: 0, oscPort: oscB, oscHost: '127.0.0.1', oscHz: 40 });
    // A points at a dead AMCP port; B is a live mock. autoFailover OFF, so the
    // primary stays A (its link down) while B is healthy — B-056's exact shape.
    const config: ConnectionConfig = {
      servers: {
        A: { host: '127.0.0.1', amcpPort: 1, oscPort: oscA },
        B: { host: '127.0.0.1', amcpPort: mockB.amcpPort, oscPort: oscB },
      },
      strategy: 'mirror-sync',
      autoFailoverEnabled: false,
    };
    const r = newRuntime(config);
    r.start();
    await r.startServing();
    r.templateImport(TEMPLATE, HTML);
    // Only B can go healthy (A's port never answers). Wait for B specifically.
    await expect.poll(() => r.health().backup?.state, { timeout: HEALTH_MS }).toBe('healthy');
    expect(r.currentPrimary).toBe('A'); // no failover — primary is still the dead A

    // The command reaches a real, rendering server (B) — refusing would deny air
    // that genuinely exists. A load then a take both land backup-only.
    expect((await r.load('mirror', 'lower-third', { headline: 'پشتیبان' })).accepted).toBe(true);
    await expect(mockB.waitForCgAddResolution(SLOT)).resolves.toBe('resolved');
    expect((await r.take('mirror')).accepted).toBe(true);
    expect(mockB.layerState(SLOT)?.onAir).toBe(true);
  }, 30_000);
});
