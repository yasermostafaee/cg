import * as dgram from 'node:dgram';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type { ConnectionConfig } from '@cg/shared-ipc';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { HEALTH_MS } from './support/harness.js';

/**
 * WHAT THE LAYER-ACTING VERBS DO ON A **CLEARED** ROW — the state where the item
 * is still bound but its CasparCG producer is gone.
 *
 * That state is ordinary and reachable in one click (CLEAR), and it is the one
 * the row's verbs were never systematically checked against. `out()` destroys
 * the producer and deletes `#loaded`, but the ITEM survives: the row stays
 * bound, so anything gated on the BINDING thinks nothing changed while anything
 * that needs a resident PRODUCER is now wrong.
 *
 * R-028 decision 5 is the rule these assertions serve: a row whose template is
 * bound but not loaded onto the layer MUST go to CasparCG at PLAY time — it
 * takes time and it can fail — whereas a loaded row plays immediately. So the
 * answer for a cleared row is not "refuse", it is "do the work first". These
 * tests assert the WORK, on the wire, because a button that is merely enabled
 * proves nothing.
 */

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;

const SWEEP_MS = 150;
const STALE_MS = 800;
const HTML = '<!doctype html><html><body>served</body></html>';
const BANK = { channel: 1, start: 70, count: 4 };
const FIXED_SLOTS = [
  { channel: 1, layer: 70 },
  { channel: 1, layer: 71 },
  { channel: 1, layer: 72 },
  { channel: 1, layer: 73 },
];
const SLOT = { channel: 1, layer: 72 };

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
      sock.close(() => {
        resolve(port);
      });
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

async function boot(): Promise<CasparRuntime> {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30 });
  runtime = new CasparRuntime(
    singleServer(mock.amcpPort, oscPort),
    {},
    { sweepMs: SWEEP_MS, occupancyStaleMs: STALE_MS, fixedSlots: FIXED_SLOTS, fixedBank: BANK },
  );
  runtime.start();
  await runtime.startServing();
  runtime.templateImport({ templateId: 'tpl-clock', templateType: 'clock', fields: [] }, HTML);
  await runtime.whenServerHealthy(HEALTH_MS);
  return runtime;
}

/** Load onto the row and CLEAR it — the state every test below starts from. */
async function loadThenClear(r: CasparRuntime): Promise<void> {
  expect(await r.loadFixed(SLOT, 'item-clock', 'tpl-clock', {})).toEqual({ accepted: true });
  expect(mock?.layerState(SLOT)?.producer).toBe('html');
  expect(await r.out('item-clock')).toEqual({ accepted: true });
  // THE STATE UNDER TEST: producer gone, item still bound.
  expect(mock?.layerState(SLOT)?.producer).toBe('empty');
  expect(r.stackSnapshot().find((i) => i.itemId === 'item-clock')).toBeDefined();
  expect(r.fixedLayersState().find((s) => s.layer === SLOT.layer)?.binding).not.toBeNull();
}

/**
 * ── THE MEASUREMENT ─────────────────────────────────────────────────────────
 *
 * PLAY on a cleared row must REACH AIR, by issuing the implicit `CG ADD` first.
 *
 * ASSERTED ON THE `ADD`, NOT ON THE ABSENCE OF AN ERROR, and that distinction is
 * the whole point of writing this test. On a cleared row nothing appears on the
 * layer either way when the path is broken, so "PLAY returned accepted" and
 * "PLAY threw nothing" are both green against a silently dead button. The only
 * assertion that separates a working implicit ADD from a missing one is that the
 * `CG ADD` went on the wire and the producer ended up ON AIR.
 */
it('PLAY on a CLEARED row re-ADDs and reaches air (R-028 decision 5)', async () => {
  const r = await boot();
  await loadThenClear(r);

  // Nothing is on the layer to play — this is the state the design says PLAY
  // must work from anyway.
  expect(mock?.layerState(SLOT)?.onAir).toBe(false);

  const result = await r.take('item-clock');
  expect(result).toEqual({ accepted: true });

  // THE ASSERTION: a producer was re-created and it is genuinely playing. The
  // mock's `onAir` is set by `CG PLAY` ONLY when a producer is loaded, so PLAY
  // on an empty layer would leave it false — which is exactly the silent
  // failure this is written to catch.
  expect(mock?.layerState(SLOT)?.producer).toBe('html');
  expect(mock?.layerState(SLOT)?.onAir).toBe(true);
  expect(mock?.lastCgAdd(SLOT)).toBeDefined();
});

/**
 * ── THE SWEEP: the other layer-acting verbs on the same cleared row ──────────
 *
 * Each has a DECIDED behaviour, stated in its own assertion. "Only PLAY was
 * affected" is a claim, so every one of them is exercised here rather than
 * reasoned about.
 */
it('STOP on a cleared row is a no-op that does not resurrect a producer', async () => {
  const r = await boot();
  await loadThenClear(r);

  // DECIDED: STOP means "take it off air gracefully". On a cleared row there is
  // nothing on air, so the honest answer is to do nothing to the LAYER — the
  // opposite of PLAY's, and deliberately so: PLAY's job is to get something
  // there, STOP's is to remove it, and an implicit ADD inside STOP would put a
  // graphic ON the layer in order to take it off.
  expect(await r.stopItem('item-clock')).toMatchObject({ accepted: expect.any(Boolean) });
  expect(mock?.layerState(SLOT)?.producer).toBe('empty');
  expect(mock?.layerState(SLOT)?.onAir).toBe(false);
});

it('UPDATE on a cleared row COMMITS the fields and sends nothing (B-070)', async () => {
  const r = await boot();
  await loadThenClear(r);

  // DECIDED, and already the shipped B-070 rule: `CG UPDATE` needs a live
  // PRODUCER, so with none the edit is committed to the authoritative field set
  // and NOTHING goes on the wire. The next take's re-ADD carries it — which is
  // what makes this correct rather than lossy, and the second half asserts it.
  expect(await r.update('item-clock', { headline: 'after clear' }, 'merge')).toEqual({
    accepted: true,
  });
  expect(mock?.layerState(SLOT)?.producer).toBe('empty');

  // The committed value survives to air through PLAY's implicit ADD.
  expect(await r.take('item-clock')).toEqual({ accepted: true });
  expect(mock?.layerState(SLOT)?.producer).toBe('html');
  expect(mock?.lastCgAdd(SLOT)?.data).toContain('after clear');
});

it('NEXT on a cleared row does not resurrect a producer', async () => {
  const r = await boot();
  await loadThenClear(r);

  // DECIDED: NEXT advances a template that is RUNNING. There is nothing to
  // advance on a cleared row, and an implicit ADD here would put a graphic on
  // air as a side effect of a step command — the compound-verb hazard the row's
  // whole design refuses.
  expect(await r.nextItem('item-clock')).toMatchObject({ accepted: expect.any(Boolean) });
  expect(mock?.layerState(SLOT)?.producer).toBe('empty');
  expect(mock?.layerState(SLOT)?.onAir).toBe(false);
});

it('CLEAR again on an already-cleared row is safe and stays empty', async () => {
  const r = await boot();
  await loadThenClear(r);

  // DECIDED: CLEAR is the escape hatch and is never gated on state — pressing it
  // twice must be harmless rather than an error the operator has to think about.
  expect(await r.out('item-clock')).toEqual({ accepted: true });
  expect(mock?.layerState(SLOT)?.producer).toBe('empty');
});

/**
 * ── `slot-bound` REFUSES ON OCCUPANCY, NOT ON THE BINDING ────────────────────
 *
 * The second half of the reported defect, and the one the operator could not
 * see. `loadFixed` used to refuse whenever the slot carried ANY binding, which a
 * CLEARed row still does — so even a UI that offered LOAD would have been turned
 * away by the layer.
 *
 * The two facts are now separate, and BOTH halves are asserted, because the
 * protection this must not lose is that rebinding a row to a DIFFERENT item
 * stays two explicit steps.
 */
it('the SAME item re-loads onto its own CLEARED row — the re-ADD the toggle now offers', async () => {
  const r = await boot();
  await loadThenClear(r);

  // This is the call the row's LOAD half makes after a CLEAR: same item, same
  // template, same slot, no picking. Before the split it answered `slot-bound`.
  expect(await r.loadFixed(SLOT, 'item-clock', 'tpl-clock', {})).toEqual({ accepted: true });
  expect(mock?.layerState(SLOT)?.producer).toBe('html');
  expect(r.fixedLayersState().find((s) => s.layer === SLOT.layer)?.binding).toMatchObject({
    itemId: 'item-clock',
  });
});

it('the SAME item is REFUSED while its own producer is still resident — CLEAR first', async () => {
  const r = await boot();
  expect(await r.loadFixed(SLOT, 'item-clock', 'tpl-clock', {})).toEqual({ accepted: true });

  // Occupancy, not the binding, is what refuses here: a reload over a live
  // producer is a replace, and the operator reaches that through CLEAR.
  expect(await r.loadFixed(SLOT, 'item-clock', 'tpl-clock', {})).toEqual({
    accepted: false,
    errorCode: 'slot-bound',
  });
});

it('a DIFFERENT item is refused even on a CLEARED row — rebinding stays two steps', async () => {
  const r = await boot();
  await loadThenClear(r);

  // The layer is empty, so an occupancy-only rule would have let this through.
  // It must not: silently moving a row's binding is the compound step that
  // Remove-then-load exists to prevent, and an empty layer does not make it
  // acceptable. This is the assertion that stops the fix loosening the guard.
  expect(await r.loadFixed(SLOT, 'item-other', 'tpl-clock', {})).toEqual({
    accepted: false,
    errorCode: 'slot-bound',
  });
  expect(r.fixedLayersState().find((s) => s.layer === SLOT.layer)?.binding).toMatchObject({
    itemId: 'item-clock',
  });
});

/**
 * ── THE LOAD INTERLOCK, BRIDGE-SIDE ─────────────────────────────────────────
 *
 * Found by attacking this change's own diff rather than by a report. The task
 * required LOAD to be refused while the row is on PVW, and the first cut put
 * that guard in the RENDERER only — which is the exact shape R-022's `take()`
 * comment already rejects: "a greyed-out PLAY is a request, not a guarantee".
 *
 * A second browser with a stale rehearse snapshot, a client that reconnected
 * mid-rehearse, or any direct channel call reaches `loadFixed` with the button's
 * opinion nowhere in sight — and with LOAD now working on a cleared row, that is
 * one click away rather than hypothetical.
 */
it('LOAD is refused bridge-side while the row is on PVW, and nothing reaches the layer', async () => {
  const r = await boot();
  await loadThenClear(r);
  expect(await r.enterRehearse('item-clock')).toEqual({ ok: true });

  // The re-ADD that the toggle offers on a cleared row — but the row is on PVW.
  const result = await r.loadFixed(SLOT, 'item-clock', 'tpl-clock', {});
  expect(result).toEqual({ accepted: false, errorCode: 'rehearsing' });

  // NOTHING was put on the layer. This is the assertion that matters: the
  // refusal is worth nothing if a producer landed on the way to reporting it.
  expect(mock?.layerState(SLOT)?.producer).toBe('empty');
  expect(r.rehearseState().some((x) => x.itemId === 'item-clock')).toBe(true);

  // …and taking the row off PVW makes the same call succeed. The interlock is a
  // gate, not a dead end — which is what makes refusing (rather than silently
  // exiting rehearse) the honest choice.
  expect(await r.exitRehearse('item-clock')).toEqual({ ok: true });
  expect(await r.loadFixed(SLOT, 'item-clock', 'tpl-clock', {})).toEqual({ accepted: true });
  expect(mock?.layerState(SLOT)?.producer).toBe('html');
});

/**
 * The guard keys on the item BOUND TO THE SLOT, not on the incoming id — a load
 * arriving with a fresh item id is precisely what a check on the incoming id
 * would wave through, and it is the same layer under the same rehearsing row.
 */
it('a load with a DIFFERENT item id cannot slip under a rehearsing row either', async () => {
  const r = await boot();
  await loadThenClear(r);
  expect(await r.enterRehearse('item-clock')).toEqual({ ok: true });

  const result = await r.loadFixed(SLOT, 'item-intruder', 'tpl-clock', {});
  expect(result.accepted).toBe(false);
  expect(result.errorCode).toBe('rehearsing');
  expect(mock?.layerState(SLOT)?.producer).toBe('empty');
});
