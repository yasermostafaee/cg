import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type { ConnectionConfig, RetainedStackItem, TemplateInfo } from '@cg/shared-ipc';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { awaitChannelModeRead, HEALTH_MS } from './support/harness.js';

/**
 * C-015 phase 6 (6.5 / 6.5a / 6.5b / 6.5c / 6.5d) — **EVERY `CG ADD` IS PRECEDED BY
 * ITS MUTE, AT ALL FOUR CALL SITES.**
 *
 * THE RULE (design.md §7, widened by the owner in §12.4 from a Live Source rule to
 * THE rule): every producer the bridge creates is created MUTED; audio is raised
 * only by an explicit recorded intent naming the layer.
 *
 * 🔴 **ASSERTED ON THE WIRE, AND THE ORDER IS THE ASSERTION.** A bare `CG ADD` puts
 * the template's audio on the channel on 2.5.0 — measured at 0.24 s (R-029) — so
 * ADD-then-mute is the same leak, merely shorter. R-042 states the failure mode
 * exactly: _"an implementation that gets the order wrong looks correct in every test
 * that does not listen"_. Comparing indices in the AMCP trace is this suite's
 * substitute for listening; asserting the ABSENCE of an error would prove nothing.
 *
 * ── WHY ONE TEST FOR FOUR SITES (6.5d) ──────────────────────────────────────
 *
 * `#sendAdd` is the single emit chokepoint, so the rule has ONE implementation.
 * That is a reason to test the sites TOGETHER, not a reason to test only one: a
 * chokepoint that later acquires a caller which bypasses it is exactly how this
 * class returns, and a per-site table in a comment is a comment. Each site below
 * is driven through its real entry point.
 *
 * ⚠ **THE FILED PER-SITE TABLE IS STALE, AND THIS FILE IS WHERE THAT IS RECORDED.**
 * B-121 and design.md §7 both list site 1 as _"`#loadOnto` (via `loadFixed`) —
 * rehearse-guarded"_. It is not: the guard was REMOVED when LOAD became LIST-ONLY,
 * and `caspar-runtime.ts` says so in as many words — a path that cannot emit beats
 * a guard that has to be remembered. What the tables miss is that `#loadOnto` has a
 * SECOND caller, the dynamic `load()`, which is not list-only and never had a guard
 * at all. That is the site exercised here.
 */

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;
let tracePath: string | null = null;

const SLOT = { channel: 1, layer: 10 };
const TEMPLATE: TemplateInfo = {
  templateId: 'lower-third',
  templateType: 'lower-third',
  fields: [],
};
const HTML = '<!doctype html><html><body>served</body></html>';

afterEach(async () => {
  await runtime?.stop();
  runtime = null;
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

async function recvLines(): Promise<string[]> {
  if (mock === null || tracePath === null) throw new Error('no trace');
  await mock.traceFlush();
  return fs
    .readFileSync(tracePath, 'utf-8')
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as { dir: string; line: string })
    .filter((e) => e.dir === 'recv')
    .map((e) => e.line);
}

async function boot(): Promise<CasparRuntime> {
  const oscPort = await freeUdpPort();
  tracePath = path.join(
    os.tmpdir(),
    `cg-addmute-${String(process.pid)}-${String(Date.now())}-${String(Math.round(performance.now() * 1000))}.ndjson`,
  );
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30, tracePath });
  const r = new CasparRuntime(singleServer(mock.amcpPort, oscPort), {}, { sweepMs: 150 });
  runtime = r;
  r.start();
  await r.startServing();
  r.templateImport(TEMPLATE, HTML);
  await r.whenServerHealthy(HEALTH_MS);
  // SITE 2's "the wire stays untouched" baseline is valid only once R-030's
  // timer-driven one-shot `INFO` has drained (flake family 3, support/harness.ts).
  await awaitChannelModeRead(r);
  return r;
}

/**
 * The trace indices of the mute and the ADD on `layer`, checked for existence.
 *
 * Uses the LAST occurrence of each, so a test that drives two ADDs through one
 * layer compares the pair that belongs together rather than an early mute against
 * a late ADD.
 */
async function mutePair(layer: number): Promise<{ mute: number; add: number }> {
  const lines = await recvLines();
  const mute = lines.findLastIndex((l) => l === `MIXER 1-${String(layer)} VOLUME 0`);
  const add = lines.findLastIndex((l) => l.startsWith(`CG 1-${String(layer)} ADD `));
  expect(mute, `a MIXER VOLUME 0 must reach the wire for layer ${String(layer)}`).toBeGreaterThan(
    -1,
  );
  expect(add, `a CG ADD must reach the wire for layer ${String(layer)}`).toBeGreaterThan(-1);
  return { mute, add };
}

async function waitFor(cond: () => boolean | Promise<boolean>, timeoutMs = 8000): Promise<void> {
  const start = Date.now();
  // The predicate may be async: a sync-only signature silently passes on the
  // first tick, because a returned Promise is truthy.
  while (!(await cond())) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 25));
  }
}

it('SITE 1 — the dynamic load()’s ADD is preceded by its mute on the wire', async () => {
  const r = await boot();

  expect((await r.load('item1', 'lower-third', {})).accepted).toBe(true);

  const { mute, add } = await mutePair(SLOT.layer);
  expect(mute).toBeLessThan(add);
  // …and the layer really is silent afterwards, not merely commanded to be.
  expect(mock?.layerState(SLOT)?.volume).toBe(0);
});

it('SITE 1b — loadFixed emits NOTHING at all, so it needs no mute and no guard', async () => {
  // The stronger form, and the reason the filed per-site table is stale: LOAD is
  // LIST-ONLY. A path that cannot emit beats a guard that has to be remembered.
  const r = await boot();
  expect(
    r.setFixedLayers({ channel: 1, start: 70, count: 4, templateType: 'lower-third' }).ok,
  ).toBe(true);
  const before = (await recvLines()).length;

  expect((await r.loadFixed({ channel: 1, layer: 70 }, 'item1', 'lower-third', {})).accepted).toBe(
    true,
  );

  expect((await recvLines()).slice(before)).toEqual([]);
});

it('🔴 SITE 2 — B-121: the reconnect reconciliation’s re-ADD is muted FIRST', async () => {
  // The one path nobody triggers on purpose: it runs by itself after a reconnect,
  // which is what made it the uncovered site. Driven through `restore()`, the real
  // entry point, rather than by calling the private decider.
  const r = await boot();
  const retained: RetainedStackItem[] = [
    { itemId: 'item1', templateId: 'lower-third', fields: {}, state: 'loaded' },
  ];

  void r.restore(retained);
  // The restore decides adopt-vs-re-ADD only once occupancy is knowable; the layer
  // is empty here, so it re-ADDs.
  await waitFor(async () => (await recvLines()).some((l) => l.startsWith('CG 1-')));

  const { mute, add } = await mutePair(SLOT.layer);
  expect(mute).toBeLessThan(add);
});

it('SITE 3 — setPosition’s re-ADD is muted first, and is still NOT rehearse-guarded', async () => {
  // "Unchanged" in the filed table is about the GUARD, not about the mute: the
  // mute is implemented once at the chokepoint and therefore covers this site too.
  // What must not change is that a position edit still works on a row that is not
  // on air, including a rehearsing one.
  const r = await boot();
  await r.load('item1', 'lower-third', {});
  expect(await r.enterRehearse('item1')).toEqual({ ok: true });
  const before = (await recvLines()).length;

  const verdict = await r.setPosition('item1', { anchor: 'top-left', offset: { x: 4, y: 8 } });

  expect(verdict).toEqual({ ok: true });
  const lines = (await recvLines()).slice(before);
  const mute = lines.findLastIndex((l) => l === `MIXER 1-${String(SLOT.layer)} VOLUME 0`);
  const add = lines.findLastIndex((l) => l.startsWith(`CG 1-${String(SLOT.layer)} ADD `));
  expect(add, 'the re-ADD is what carries the new ?pos= query').toBeGreaterThan(-1);
  expect(mute).toBeGreaterThan(-1);
  expect(mute).toBeLessThan(add);
});

it('SITE 4 — take()’s B-039 pre-roll ADD is muted first, and the take still unmutes on the way to air', async () => {
  const r = await boot();
  await r.load('item1', 'lower-third', {});
  // Destroy the producer so the take must re-ADD (B-039's pre-roll).
  await r.out('item1');
  const before = (await recvLines()).length;

  expect((await r.take('item1')).accepted).toBe(true);

  const lines = (await recvLines()).slice(before);
  const mute = lines.findIndex((l) => l === `MIXER 1-${String(SLOT.layer)} VOLUME 0`);
  const add = lines.findIndex((l) => l.startsWith(`CG 1-${String(SLOT.layer)} ADD `));
  const unmute = lines.findIndex((l) => l === `MIXER 1-${String(SLOT.layer)} VOLUME 1`);
  const play = lines.findIndex((l) => l.startsWith(`CG 1-${String(SLOT.layer)} PLAY`));
  expect(mute).toBeGreaterThan(-1);
  expect(mute).toBeLessThan(add);
  // 🔴 THE UNMUTE HALF IS NOT REBUILT — it is `take()`'s existing unconditional
  // re-assert, and it must still land after the pre-roll and before the PLAY. A
  // mute-before-ADD that stranded the mute would put a graphic ON AIR SILENT,
  // which R-022 calls the worse failure of the two.
  expect(unmute).toBeGreaterThan(add);
  expect(play).toBeGreaterThan(unmute);
  expect(mock?.layerState(SLOT)?.volume).toBe(1);
});

it('🔴 a mute that FAILS does not proceed to the ADD — the load is refused instead', async () => {
  // R-042's own acceptance. The mute is not a courtesy step around the load, it is
  // the condition under which loading is safe: failing closed costs a load, failing
  // open costs a station audio on air that no UI shows.
  const r = await boot();
  // The mock has no 'fail the next command' hook, so the MIXER verb is replaced
  // outright — a refusal that is unambiguous and cannot race.
  mock?.setHandler('MIXER', () => ({ kind: 'err', code: 502, verb: 'MIXER' }));
  const before = (await recvLines()).length;

  const verdict = await r.load('item1', 'lower-third', {});

  expect(verdict.accepted).toBe(false);
  expect(verdict.errorCode).toBe('add-mute-failed');
  const lines = (await recvLines()).slice(before);
  expect(lines.some((l) => l.startsWith('CG 1-'))).toBe(false);
});
