import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type { ConnectionConfig, TemplateInfo } from '@cg/shared-ipc';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { HEALTH_MS } from './support/harness.js';

/**
 * 🔴 **`B-225` — DETECT AND SAY, and put nothing back without a press.**
 *
 * The owner's decision (2026-09-05), choosing between doing nothing, saying so with a
 * one-press restore, and restoring automatically: **say so, with a one-press restore.** The
 * reason is on record and is the acceptance criterion this file measures first —
 * *an unattended machine must not put a graphic on air.*
 *
 * So the assertions come in two halves, and the second is the load-bearing one:
 *
 *   1. the reconnect that empties air RAISES a notice naming what it took, and a reconnect
 *      that empties nothing raises none;
 *   2. **between the restart and the press, nothing whatsoever reaches the wire** — no
 *      `CG ADD`, no `PLAY`. The notice is a sentence, not an action.
 *
 * ── AND THE DISCRIMINATION THAT KEEPS `B-109` CLOSED ────────────────────────
 *
 * A row enters the notice only when BOTH hold: it was ON AIR immediately before the reconnect,
 * and that reconnect reset it because its layer had gone silent.
 *
 * 🔴 **THE FIRST CONDITION WAS ASSUMED REDUNDANT AND IS NOT — this test is why the code has
 * it.** The tempting reading is that `reconcileOnReconnect` already only touches `played`
 * records, so its output IS the on-air set. It is not: `played` means *a `PLAY` was sent and
 * not retracted*, and **`out` does not retract it** (`stop` sets `played = false`, the `out`
 * intent deliberately does not — `idle` is its unevidenced target, not an observation). So a
 * row the operator CLEARED is still `played: true` and lands inside the reset set. §2 stages
 * exactly that and pins that only the server's victim is offered; without the status filter it
 * FAILS, offering to put a deliberately-cleared graphic back on air — `B-109` exactly.
 */

let mock: MockHandle | null = null;
let oscPort = 0;
let runtime: CasparRuntime | null = null;
let tracePath: string | null = null;

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

function singleServer(amcpPort: number, port: number): ConnectionConfig {
  return {
    servers: { A: { host: '127.0.0.1', amcpPort, oscPort: port } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  };
}

const TEMPLATE: TemplateInfo = {
  templateId: 'lower-third',
  templateType: 'lower-third',
  fields: [],
};
const OTHER: TemplateInfo = { templateId: 'strap', templateType: 'strap', fields: [] };
const HTML = '<!doctype html><html><head><meta charset="utf-8"></head><body>سلام</body></html>';

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function waitFor(cond: () => boolean, timeoutMs: number, what: string): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await delay(25);
  }
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

async function since(before: number): Promise<string[]> {
  return (await recvLines()).slice(before);
}

async function boot(): Promise<CasparRuntime> {
  oscPort = await freeUdpPort();
  tracePath = path.join(
    os.tmpdir(),
    `cg-emptied-air-${String(process.pid)}-${String(Date.now())}-${String(Math.round(performance.now() * 1000))}.ndjson`,
  );
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30, tracePath });
  const r = new CasparRuntime(singleServer(mock.amcpPort, oscPort));
  runtime = r;
  r.start();
  await r.startServing();
  r.templateImport(TEMPLATE, HTML);
  r.templateImport(OTHER, HTML);
  await r.whenServerHealthy(HEALTH_MS);
  return r;
}

/** A fresh CasparCG on the same ports — genuinely empty layers (`server-restart-retake`). */
async function restartCasparCG(r: CasparRuntime): Promise<void> {
  if (mock === null || tracePath === null) throw new Error('no mock');
  const amcpPort = mock.amcpPort;
  const dying = mock;
  mock = null;
  await dying.stop();
  await waitFor(() => r.health().primary.state !== 'healthy', 5000, 'the drop to be observed');
  mock = await createMock({ amcpPort, oscPort, oscHost: '127.0.0.1', oscHz: 30, tracePath });
  await waitFor(() => r.health().primary.state === 'healthy', 15_000, 'the session to reconnect');
}

const statusOf = (r: CasparRuntime, itemId: string): string | undefined =>
  r.stackSnapshot().find((i) => i.itemId === itemId)?.status;

const noticeIds = (r: CasparRuntime): string[] =>
  (r.emptiedAir()?.rows ?? []).map((row) => row.itemId).sort();

async function onAir(r: CasparRuntime, itemId: string, templateId = 'lower-third'): Promise<void> {
  expect((await r.load(itemId, templateId, {})).accepted).toBe(true);
  expect((await r.take(itemId)).accepted).toBe(true);
  expect(statusOf(r, itemId)).toBe('on-air');
}

// ───────────────────────────── §1 — THE NOTICE IS RAISED ─────────────────────────────

describe('B-225 §1 — the reconnect that empties air says so, and does nothing about it', () => {
  it('🔴 raises a notice naming the row, and sends NOTHING until the operator presses', async () => {
    const r = await boot();
    await onAir(r, 'item-1');
    expect(r.emptiedAir(), 'nothing to report on a healthy console').toBeNull();

    const beforeRestart = (await recvLines()).length;
    await restartCasparCG(r);
    await waitFor(() => r.emptiedAir() !== null, 10_000, 'the notice to be raised');

    const notice = r.emptiedAir();
    expect(noticeIds(r)).toEqual(['item-1']);
    expect(notice?.rows[0]?.templateId).toBe('lower-third');
    expect(notice?.rows[0]?.slot, 'the layer, so the row can be found in the list').toEqual({
      channel: 1,
      layer: 10,
    });
    // A restart kills the AMCP socket; a recovered OSC flap does not. This narrows the
    // claim — it does not turn it into "the server restarted".
    expect(notice?.newConnection).toBe(true);
    expect(statusOf(r, 'item-1'), 'the row reconciled to idle, as specified').toBe('idle');

    /*
      🔴 THE OWNER'S ACCEPTANCE CRITERION, MEASURED AT THE WIRE. Between the restart and any
      press, the bridge put NOTHING on the layer. Option (3) — restore automatically — was
      refused, and this is what refusing it looks like from the plant's side.
    */
    const sinceRestart = await since(beforeRestart);
    expect(sinceRestart.filter((l) => l.startsWith('CG 1-10 ADD'))).toEqual([]);
    expect(sinceRestart.filter((l) => l.startsWith('CG 1-10 PLAY'))).toEqual([]);
  }, 40_000);

  it('a blinked socket empties nothing, so there is nothing to say', async () => {
    /*
      The absence half, and it needs its own positive control: the previous test proves the
      instrument fires, so a silent run here is a real negative rather than a dead detector.
      The same server keeps its producers across a TCP reset, so no row is reset and no
      notice is raised.
    */
    const r = await boot();
    await onAir(r, 'item-1');
    if (mock === null) throw new Error('no mock');

    mock.closeAllAmcpConnections();
    await waitFor(() => r.health().primary.state !== 'healthy', 5000, 'the blip to be observed');
    await waitFor(() => r.health().primary.state === 'healthy', 15_000, 'the session to reconnect');
    await delay(400);

    expect(r.emptiedAir(), 'a blip is not an emptying').toBeNull();
    expect(statusOf(r, 'item-1'), 'and the row is still on air').toBe('on-air');
  }, 40_000);
});

// ─────────────────── §2 — WHAT THE OPERATOR EMPTIED IS NEVER OFFERED ───────────────────

describe('B-225 §2 — the notice offers only rows the SERVER took away', () => {
  it('🔴 a deliberately-cleared row is not in the notice; the row that was on air is', async () => {
    /*
      🔴 THE `B-109` QUESTION. `item-2` is taken and then OUT by the operator — a deliberate
      emptying, the exact case whose retention is `cleared` = "KNOWN EMPTY … NOT restorable".
      `item-1` is on air when the server dies. One restart, two rows, and only one of them may
      ever be offered back.

      ⚠ `item-2` IS inside `reconcileOnReconnect`'s reset set, because `out` leaves
      `played: true` — see the file header. What keeps it out of the notice is the on-air
      status sampled immediately before the reconcile. Assert the setup, not just the result:
      a run where the out silently failed would pass this test for the wrong reason.
    */
    const r = await boot();
    await onAir(r, 'item-1');
    await onAir(r, 'item-2', 'strap');
    expect((await r.out('item-2')).accepted).toBe(true);
    await waitFor(() => statusOf(r, 'item-2') === 'idle', 5000, 'item-2 to settle off air');

    await restartCasparCG(r);
    await waitFor(() => r.emptiedAir() !== null, 10_000, 'the notice to be raised');

    expect(noticeIds(r), 'only the row the server took').toEqual(['item-1']);

    // …and the press cannot be aimed past the notice, from any caller.
    const before = (await recvLines()).length;
    const verdict = await r.restoreEmptiedAir(['item-2']);
    expect(verdict).toEqual({
      restored: 0,
      results: [{ itemId: 'item-2', ok: false, reason: 'unknown-item' }],
    });
    expect(
      (await since(before)).some((l) => l.includes('CG 1-11')),
      'a refused restore reaches no layer',
    ).toBe(false);
  }, 40_000);
});

// ───────────────────────────── §3 — THE ONE PRESS ─────────────────────────────

describe('B-225 §3 — the one press, its refusals and its inverses', () => {
  it('🔴 puts the row back on air and clears the notice', async () => {
    const r = await boot();
    await onAir(r, 'item-1');
    await restartCasparCG(r);
    await waitFor(() => r.emptiedAir() !== null, 10_000, 'the notice to be raised');

    const before = (await recvLines()).length;
    expect(await r.restoreEmptiedAir(['item-1'])).toEqual({
      restored: 1,
      results: [{ itemId: 'item-1', ok: true }],
    });

    // Through the ORDINARY take: the restarted server needs the pre-roll `CG ADD` before the
    // `PLAY` (`B-054`), which the take supplies and a private re-seat path would have had to
    // reinvent.
    const sent = await since(before);
    const add = sent.findIndex((l) => l.startsWith('CG 1-10 ADD'));
    const play = sent.findIndex((l) => l.startsWith('CG 1-10 PLAY'));
    expect(add).toBeGreaterThanOrEqual(0);
    expect(play).toBeGreaterThan(add);
    expect(statusOf(r, 'item-1')).toBe('on-air');
    expect(r.emptiedAir(), 'nothing left to report').toBeNull();
  }, 40_000);

  it('🔴 a partly-refused press restores what it can and leaves the rest listed WITH the reason', async () => {
    /*
      `RESTART-NOTICE-01` §B.4 — a press that cannot put every row back must neither claim it
      did nor abandon the ones it could. `item-2` is put on PVW after the restart, so `take`
      refuses it through the `R-022` interlock — a REAL refusal, reached through the ordinary
      take rather than simulated, which is the point of restoring through that verb at all.
    */
    const r = await boot();
    await onAir(r, 'item-1');
    await onAir(r, 'item-2', 'strap');
    await restartCasparCG(r);
    await waitFor(() => r.emptiedAir() !== null, 10_000, 'the notice to be raised');
    expect(noticeIds(r)).toEqual(['item-1', 'item-2']);

    expect((await r.enterRehearse('item-2')).ok, 'an idle row may go to PVW').toBe(true);

    const verdict = await r.restoreEmptiedAir(['item-1', 'item-2']);
    expect(verdict.restored).toBe(1);
    expect(verdict.results).toEqual([
      { itemId: 'item-1', ok: true },
      { itemId: 'item-2', ok: false, reason: 'rehearsing' },
    ]);

    // The restored row LEFT the notice; the refused one stays, carrying its reason.
    const notice = r.emptiedAir();
    expect(notice?.rows.map((row) => row.itemId)).toEqual(['item-2']);
    expect(notice?.rows[0]?.refusal).toBe('rehearsing');
    expect(statusOf(r, 'item-1')).toBe('on-air');
  }, 40_000);

  it("§B.4's third inverse — a listed row's template CANNOT go while the row is on the stack", async () => {
    /*
      🔴 THE HONEST ANSWER TO "what if the template is no longer in the registry": while the
      row exists it cannot happen, and the invariant that says so is `templateRemove`'s own
      `in-use` refusal — enforced upstream, not by anything this feature added.

      `restoreEmptiedAir` still carries an `unknown-template` guard as defence in depth (the
      failure it prevents is the bad one: a `take` whose `CG ADD` fetches a template the serve
      endpoint no longer has renders a BLACK layer that reports healthy). It is unreachable
      through the public verbs today, and this test is what pins the reason — so a later
      change that relaxes `templateRemove` fails HERE, next to the explanation, rather than
      silently arming a path nothing covers.
    */
    const r = await boot();
    await onAir(r, 'item-2', 'strap');
    await restartCasparCG(r);
    await waitFor(() => r.emptiedAir() !== null, 10_000, 'the notice to be raised');
    expect(noticeIds(r)).toEqual(['item-2']);

    const refused = r.templateRemove('strap');
    expect(refused.ok, 'the row holds its template on the stack').toBe(false);
    expect(refused.reason).toBe('in-use');
    expect(refused.references?.map((ref) => ref.itemId)).toEqual(['item-2']);

    // Remove the ROW and the template goes — and the row leaves the notice with it.
    expect((await r.remove('item-2')).accepted).toBe(true);
    expect(
      r.emptiedAir(),
      'a removed row can never be put back, so it stops being offered',
    ).toBeNull();
    expect(r.templateRemove('strap').ok).toBe(true);
  }, 40_000);

  it('dismissal ends the notice and leaves air exactly as it was', async () => {
    const r = await boot();
    await onAir(r, 'item-1');
    await restartCasparCG(r);
    await waitFor(() => r.emptiedAir() !== null, 10_000, 'the notice to be raised');

    const before = (await recvLines()).length;
    expect(r.dismissEmptiedAir()).toEqual({ ok: true });
    expect(r.emptiedAir()).toBeNull();
    expect(r.dismissEmptiedAir(), 'dismissing nothing is not a success').toEqual({ ok: false });
    expect((await since(before)).length, 'a dismissal is not an action').toBe(0);

    // The row is still there, idle, and the ordinary door still works.
    expect(statusOf(r, 'item-1')).toBe('idle');
    expect((await r.restoreEmptiedAir(['item-1'])).results).toEqual([
      { itemId: 'item-1', ok: false, reason: 'unknown-item' },
    ]);
    expect((await r.take('item-1')).accepted).toBe(true);
    expect(statusOf(r, 'item-1')).toBe('on-air');
  }, 40_000);

  it("an operator's OWN take retires the row from the notice — one narrowing point, every door", async () => {
    /*
      The mutator-list rule (`releaseLiveLayers`'s lesson): the notice must not go on naming a
      row that is back on air, whichever door put it there. Retiring lives in `take`, so the
      one press and the operator's own take are the same event.
    */
    const r = await boot();
    await onAir(r, 'item-1');
    await onAir(r, 'item-2', 'strap');
    await restartCasparCG(r);
    await waitFor(() => r.emptiedAir() !== null, 10_000, 'the notice to be raised');
    expect(noticeIds(r)).toEqual(['item-1', 'item-2']);

    expect((await r.take('item-1')).accepted).toBe(true);
    expect(noticeIds(r), 'the row the operator took is gone from the notice').toEqual(['item-2']);

    // …and so is a row that is REMOVED: it can never be put back, so it stops being offered.
    expect((await r.remove('item-2')).accepted).toBe(true);
    expect(r.emptiedAir(), 'the last row left, so the notice is gone').toBeNull();
  }, 40_000);
});
