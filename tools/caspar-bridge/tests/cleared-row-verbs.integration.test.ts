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
const BANK = { channel: 1, low: { start: 1, count: 9 }, start: 70, count: 4 };
const FIXED_SLOTS = [
  { channel: 1, layer: 70 },
  { channel: 1, layer: 71 },
  { channel: 1, layer: 72 },
  { channel: 1, layer: 73 },
];
const SLOT = { channel: 1, layer: 72 };

/**
 * The producer on the slot, treating a layer the mock has never recorded as
 * EMPTY — which it is.
 *
 * LOAD no longer touches a layer, so an UNTOUCHED layer is now the ordinary
 * state after a load rather than an impossible one, and `layerState()` returns
 * undefined for one nothing has ever addressed. Collapsing that to `'empty'`
 * here keeps every assertion below reading as a statement about the LAYER
 * instead of about the mock's bookkeeping.
 */
function producerOn(): string {
  return mock?.layerState(SLOT)?.producer ?? 'empty';
}

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

/**
 * Get a producer onto the row and then CLEAR it — the state every test below
 * starts from.
 *
 * IT GOES THROUGH PLAY, and it has to now: LOAD is LIST-ONLY and puts nothing on
 * a layer, so `take()`'s implicit `CG ADD` is the only way a producer gets there.
 * This helper used to be load-then-clear and asserted a producer straight after
 * the load — which is precisely the behaviour that was deleted, so the whole file
 * went red until it was re-expressed. That is the right kind of red: the tests
 * were pinning the old path, not merely mentioning it.
 */
async function loadThenClear(r: CasparRuntime): Promise<void> {
  expect(await r.loadFixed(SLOT, 'item-clock', 'tpl-clock', {})).toEqual({ accepted: true });
  // The LIST half only — nothing on the layer yet.
  expect(producerOn()).toBe('empty');
  // PLAY is what reaches the layer (B-039 / R-028 decision 5).
  expect(await r.take('item-clock')).toEqual({ accepted: true });
  expect(producerOn()).toBe('html');
  expect(await r.out('item-clock')).toEqual({ accepted: true });
  // THE STATE UNDER TEST: producer gone, item still bound.
  expect(producerOn()).toBe('empty');
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
  expect(producerOn()).toBe('html');
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
  expect(producerOn()).toBe('empty');
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
  expect(producerOn()).toBe('empty');

  // The committed value survives to air through PLAY's implicit ADD.
  expect(await r.take('item-clock')).toEqual({ accepted: true });
  expect(producerOn()).toBe('html');
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
  expect(producerOn()).toBe('empty');
  expect(mock?.layerState(SLOT)?.onAir).toBe(false);
});

it('CLEAR again on an already-cleared row is safe and stays empty', async () => {
  const r = await boot();
  await loadThenClear(r);

  // DECIDED: CLEAR is the escape hatch and is never gated on state — pressing it
  // twice must be harmless rather than an error the operator has to think about.
  expect(await r.out('item-clock')).toEqual({ accepted: true });
  expect(producerOn()).toBe('empty');
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
/*
 * DELETED HERE, DELIBERATELY: two tests that pinned the previous task-s rule.
 *
 *   - -the SAME item re-loads onto its own CLEARED row- asserted that LOAD
 *     re-ADDs the bound template. LOAD emits no AMCP now, so there is nothing
 *     to re-ADD; PLAY does that work, and its own test above asserts it.
 *   - -the SAME item is REFUSED while its producer is resident- asserted a
 *     slot-bound refusal on occupancy. LOAD cannot reach a layer, so occupancy
 *     is not its business any more.
 *
 * Both were correct for a LOAD that touched the layer. Their subject is gone,
 * not their assertion loosened — the boundary they guarded is now carried by
 * the ZERO-AMCP tests below, which are stronger because they hold in every
 * state rather than in the states somebody remembered to enumerate.
 */
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
 * ── LOAD IS LIST-ONLY: IT EMITS ZERO AMCP ───────────────────────────────────
 *
 * "The list is ours. The layer is CasparCG's." The operator's LOAD picks a
 * template, imports it into the bridge's store and binds it to a row. It touches
 * NO layer — no adopt-CLEAR, no pre-roll `CG ADD`, nothing on the wire.
 *
 * THESE ASSERTIONS CARRY A DELETED GUARD'S WEIGHT, which is why they are on the
 * wire rather than on a return value. `loadFixed` used to refuse a load onto a
 * rehearsing row, because a bare `CG ADD` is audible on 2.5.0 and would have put
 * an unmuted producer under a row the UI says cannot reach air. That guard is
 * GONE — not loosened: the path it protected no longer exists, and a path that
 * cannot exist beats a check that has to be remembered. What replaces it is the
 * rehearsing case below, asserting that nothing reaches the layer.
 */
it('LOAD emits ZERO AMCP — the layer is untouched and stays empty', async () => {
  const r = await boot();

  expect(await r.loadFixed(SLOT, 'item-clock', 'tpl-clock', {})).toEqual({ accepted: true });

  // THE ASSERTION: no producer, and no `CG ADD` ever went out for this layer.
  expect(producerOn()).toBe('empty');
  expect(mock?.lastCgAdd(SLOT)).toBeUndefined();

  // …and the LIST half really happened: the row is bound and the item exists.
  expect(r.fixedLayersState().find((s) => s.layer === SLOT.layer)?.binding).toMatchObject({
    itemId: 'item-clock',
  });
  expect(r.stackSnapshot().find((i) => i.itemId === 'item-clock')).toBeDefined();
});

/**
 * THE CASE THE DELETED GUARD EXISTED FOR. A load onto a row that is on PVW used
 * to be refused; it is now simply harmless, and this asserts the harmlessness
 * directly rather than trusting the refusal to still be there.
 */
it('LOAD onto a row that is ON PVW reaches no layer — the guard is unnecessary, not skipped', async () => {
  const r = await boot();
  expect(await r.loadFixed(SLOT, 'item-clock', 'tpl-clock', {})).toEqual({ accepted: true });
  expect(await r.enterRehearse('item-clock')).toEqual({ ok: true });

  // Accepted — there is nothing to refuse — and still nothing on the layer.
  expect((await r.loadFixed(SLOT, 'item-clock', 'tpl-clock', {})).accepted).toBe(true);
  expect(producerOn()).toBe('empty');
  expect(mock?.lastCgAdd(SLOT)).toBeUndefined();
  // The row is still on PVW: a load did not disturb the mode.
  expect(r.rehearseState().some((x) => x.itemId === 'item-clock')).toBe(true);
});

/**
 * THE OWNER'S ACTUAL NEED: build the whole rundown with CasparCG unreachable.
 *
 * Not a manual check. The bridge is ours and local; CasparCG is remote and may be
 * down while the bridge is fine — and a list action must not need it.
 */
it('a rundown can be built with CasparCG UNREACHABLE — import and bind both succeed', async () => {
  const oscPort = await freeUdpPort();
  // No mock at all: nothing is listening on the AMCP port.
  runtime = new CasparRuntime(
    singleServer(65_501, oscPort),
    {},
    { sweepMs: SWEEP_MS, occupancyStaleMs: STALE_MS, fixedSlots: FIXED_SLOTS, fixedBank: BANK },
  );
  runtime.start();
  await runtime.startServing();
  runtime.templateImport({ templateId: 'tpl-clock', templateType: 'clock', fields: [] }, HTML);

  // Bind three rows with no server anywhere. Each is a LIST action.
  for (const [i, layer] of [70, 71, 72].entries()) {
    expect(
      await runtime.loadFixed({ channel: 1, layer }, `item-${String(i)}`, 'tpl-clock', {}),
    ).toEqual({ accepted: true });
  }
  expect(runtime.stackSnapshot()).toHaveLength(3);
  expect(runtime.fixedLayersState().filter((s) => s.binding !== null)).toHaveLength(3);
});
