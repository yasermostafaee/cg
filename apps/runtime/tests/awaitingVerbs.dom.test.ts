// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  layerRowActions,
  AWAITING_ROW_REASON,
} from '../src/renderer/features/layers/layerRowActions.js';
import { AWAITING, bindingFor, itemWith, rowDeps } from './support/layerRow.js';

/**
 * §1 — A BOUND ROW OFFERS NOTHING UNTIL IT KNOWS WHAT IT CARRIES.
 *
 * ── THE HAZARD, WHICH IS NOT A REGRESSION ───────────────────────────────────
 *
 * The state cell stopped lying first: a bound row whose stack has not arrived
 * reads LOADING, not EMPTY. Everything ELSE on the row went on deriving from
 * `item === null`, which is the same value for "no template bound" and "we have
 * not been told" — so the VERBS still rendered an empty row's.
 *
 * `LOAD` is a LIST action. It emits zero AMCP, so it survived every reachability
 * gate and stayed ENABLED through the whole bootstrap window — on rows that were
 * already bound. Pressing it there opens the picker and rebinds the row over a
 * binding the panel has not yet been shown. The binding the operator overwrites is
 * the one he cannot see yet, and this window opens on every startup and every
 * reconnect.
 *
 * Same class as the `EMPTY` label: offering something on a state we have not been
 * told. On a control instead of a word, which is worse — a wrong word misinforms,
 * a wrong control acts.
 *
 * ── WHY THE STRUCTURAL ASSERTION IS THE LOAD-BEARING ONE ────────────────────
 *
 * `awaiting` and `unbound` BOTH have no item. If any verb's availability were
 * still computed from a nullable, the two would be INDISTINGUISHABLE — every
 * assertion below would hold for the wrong reason. So the first spec pins the
 * difference itself: same absent item, opposite offers. That is what "the union is
 * the only input" means operationally, and it cannot be satisfied by a nullable.
 */

/** A row that does not yet know what it holds. */
const awaitingDeps = (over = {}) => rowDeps({ binding: AWAITING, ...over });
/** The same row, once its item has landed. */
const boundDeps = (over = {}) => rowDeps({ binding: bindingFor(itemWith('loaded')), ...over });
/** A row we KNOW is empty — the case that must not change. */
const unboundDeps = (over = {}) => rowDeps({ binding: bindingFor(null), ...over });

const byKey = (deps: Parameters<typeof layerRowActions>[0]): Map<string, boolean> =>
  new Map(layerRowActions(deps).map((a) => [a.key, a.disabled === true]));

describe('§1 — the verbs derive from the RowBinding union, not from `item === null`', () => {
  /**
   * THE STRUCTURAL PROOF. Both rows have no item; only the union tells them apart.
   * A single verb reading the nullable would collapse these two columns together.
   */
  it('awaiting and unbound have the SAME absent item and OPPOSITE offers', () => {
    const awaiting = byKey(awaitingDeps());
    const unbound = byKey(unboundDeps());

    // The shape never changes — same verbs, same order, in every state.
    expect([...awaiting.keys()]).toEqual([...unbound.keys()]);

    // …and they disagree, which a nullable could not express.
    expect(awaiting).not.toEqual(unbound);

    // Concretely: an unbound row offers LOAD; an awaiting one offers nothing.
    expect(unbound.get('load-remove'), 'a KNOWN-empty row still offers LOAD').toBe(false);
    expect(
      awaiting.get('load-remove'),
      'LOAD on a row whose binding has not arrived is the reported hazard',
    ).toBe(true);
  });

  it('a row in awaiting offers NO actionable verb', () => {
    const actions = layerRowActions(awaitingDeps());
    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) {
      expect(action.disabled, `${action.key} was actionable while the row was unknown`).toBe(true);
    }
  });

  /**
   * CLEAR IS INCLUDED, and it is the one that had to be argued rather than assumed.
   *
   * CLEAR is deliberately not fail-closed on the row's STATUS — refusing the escape
   * hatch because the state model is confused strands a graphic on air. `awaiting`
   * is not that case: it is not knowing WHICH COMMAND the button is. Bound, CLEAR
   * is `stack.out(itemId)` and keeps the producer bookkeeping; unbound it is the
   * bank-scoped layer clear. With no itemId to send it would have to guess, and
   * guessing wrong clears the layer out from under a live item.
   */
  it('CLEAR is held too — with no itemId it would have to guess which command it is', () => {
    expect(byKey(awaitingDeps()).get('clear')).toBe(true);
    // …and it comes straight back, on the DATA. The hatch is delayed, not removed.
    expect(byKey(boundDeps()).get('clear')).toBe(false);
  });

  /**
   * THE REASON, NOT MERELY THE REFUSAL — and never a reason that names CasparCG.
   *
   * Nothing has said anything about the playout server in this window and the row
   * is not waiting on it; what has not arrived is the stack snapshot, one hop
   * nearer. Asserted across all three reachability states BECAUSE that is where a
   * naive implementation leaks: with CasparCG genuinely unreachable, the AMCP
   * verbs' own tooltip would otherwise win and blame a machine nobody has accused.
   */
  it('every held verb says WHY, and none of them names CasparCG', () => {
    for (const casparReach of ['reachable', 'unreachable', 'connecting'] as const) {
      const actions = layerRowActions(awaitingDeps({ casparReach }));
      for (const action of actions) {
        expect(action.title, `${action.key} (${casparReach}) must say why it is held`).toBeTypeOf(
          'string',
        );
        expect(
          action.title ?? '',
          `${action.key} blamed CasparCG while reach was ${casparReach}`,
        ).not.toMatch(/CasparCG/i);
        expect(action.title).toBe(AWAITING_ROW_REASON);
      }
    }
  });

  /**
   * THE ONE PLACE THE WAITING SENTENCE MUST NOT WIN.
   *
   * With the bridge down the stack is not "on its way" — it is not coming until the
   * bridge does. "It returns as soon as it answers" would be a promise nothing is
   * keeping, and it would send the operator away from the machine he needs to look
   * at. The nearer failure wins, exactly as it does between the bridge and CasparCG.
   */
  it('a DEAD BRIDGE outranks the waiting sentence — that wait is not bounded', () => {
    const actions = layerRowActions(awaitingDeps({ linkDown: true }));
    for (const action of actions) {
      expect(action.disabled).toBe(true);
      expect(action.title ?? '').toMatch(/Bridge disconnected/i);
      // Still never CasparCG: with the bridge down its state is not even knowable.
      expect(action.title ?? '').not.toMatch(/CasparCG/i);
    }
  });

  /**
   * `awaiting` IS NOT `unbound`, AND IT IS NOT `bound` EITHER.
   *
   * Resolving it by showing REMOVE would be the console asserting a binding it has
   * not been told about — and REMOVE is not merely unwise here, it is
   * unperformable: there is no itemId to send, and its confirm gate names the
   * template and says whether the item is ON AIR, neither of which we know.
   */
  it('does not resolve the window by showing REMOVE', () => {
    const toggle = layerRowActions(awaitingDeps()).find((a) => a.key === 'load-remove');
    expect(toggle?.label).not.toBe('REMOVE');
    expect(toggle?.disabled).toBe(true);
  });

  /**
   * ── THE ADVERSARIAL DIRECTION, WHICH IS THE WORSE BUG HERE ────────────────
   *
   * A verb that stays disabled after the row is BOUND is the mirror of this fix,
   * and on a startup it reads as a dead panel: every row present, every control
   * grey, nothing to press. It would also be just as invisible in code as the
   * defect being fixed. So the bound row is asserted verb by verb against what it
   * offered BEFORE this task, not merely "something is enabled".
   */
  it('the window ENDS on the data — a bound row offers exactly what it did before', () => {
    const bound = byKey(boundDeps({ hasNext: true, dirty: true }));

    // A loaded, bound row: everything that could act, can act.
    expect(bound.get('load-remove'), 'REMOVE must return').toBe(false);
    expect(bound.get('play'), 'PLAY must return').toBe(false);
    expect(bound.get('rehearse'), 'ON PVW must return').toBe(false);
    expect(bound.get('clear'), 'CLEAR must return').toBe(false);

    // `loaded` is not on air, so these stay disabled for their OWN reasons — the
    // pre-existing gates, unchanged by this task.
    expect(bound.get('stop')).toBe(true);
    expect(bound.get('next')).toBe(true);
    expect(bound.get('update')).toBe(true);

    // An ON-AIR row lights the rest, which proves nothing latched.
    const onAir = byKey(
      boundDeps({ binding: bindingFor(itemWith('on-air')), hasNext: true, dirty: true }),
    );
    expect(onAir.get('stop')).toBe(false);
    expect(onAir.get('next')).toBe(false);
    expect(onAir.get('update')).toBe(false);
  });

  /** No verb keeps the waiting sentence once the row knows what it holds. */
  it('drops the waiting reason entirely once bound', () => {
    for (const action of layerRowActions(boundDeps({ hasNext: true, dirty: true }))) {
      expect(action.title ?? '', `${action.key} kept the waiting reason`).not.toBe(
        AWAITING_ROW_REASON,
      );
    }
  });

  /**
   * THE HALF THIS MUST NOT SWALLOW. An unbound row with a READY snapshot is a fact
   * we HAVE been told, and it goes on behaving exactly as it did: LOAD enabled,
   * querying nothing.
   */
  it('an unbound row with a ready snapshot is untouched', () => {
    const unbound = byKey(unboundDeps());
    expect(unbound.get('load-remove')).toBe(false);
    const load = layerRowActions(unboundDeps()).find((a) => a.key === 'load-remove');
    expect(load?.label).toBe('LOAD');
    expect(load?.title ?? '').not.toBe(AWAITING_ROW_REASON);
    // CLEAR on an unbound row is the bank-scoped layer clear and stays available.
    expect(unbound.get('clear')).toBe(false);
  });
});
