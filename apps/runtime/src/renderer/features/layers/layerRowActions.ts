import {
  ArrowRightFromLine,
  CircleArrowOutDownRight,
  Download,
  MonitorPlay,
  Play,
  RefreshCw,
  Trash2,
  XSquare,
  Library,
} from 'lucide-react';
import type { FixedSlotState } from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import type { RowAction } from '../../ui/rowAction.js';
import type { AsyncResult } from '../../ui/asyncButtonController.js';
import { isOnAir } from '../stack/onAir.js';

/**
 * R-028 (5.1/5.2/5.4) — the ONE verb list for a layer row.
 *
 * LOAD · PLAY · NEXT · UPDATE · STOP · CLEAR · REMOVE, with THIS project's
 * C-012 semantics, which are the opposite of the reference product's on two of
 * them and must never be "corrected" to match it:
 *
 *   STOP   = graceful exit. The template runs its own outro and the producer
 *            stays resident. (Cinegy calls this EXIT.)
 *   CLEAR  = hard kill, no outro, the producer is destroyed.
 *            (Cinegy calls THIS one STOP — adopting their vocabulary would make
 *            an operator who knows STOP as "take it out gracefully" hard-cut on
 *            air.)
 *   REMOVE = take the item off the row entirely.
 *
 * DISABLED, NOT ABSENT (the owner's point 8). Every verb is present on every
 * row from the start, rendered disabled until it applies. This is a deliberate
 * departure from R-021 stage 2b's "offer no control where the affordance does
 * not exist" — and the two do not actually conflict: that rule forbids an
 * ENABLED control that can only reject, which a disabled button is not. A fixed
 * row of controls that light up as state changes is legible under time
 * pressure; controls that appear and disappear move the target under the
 * operator's hand.
 *
 * THE SHAPE NEVER CHANGES. Every row declares the SAME verbs in the SAME order,
 * always — availability is expressed by enabled/disabled and never by a control
 * appearing or disappearing. The owner caught the first draft doing exactly the
 * thing this forbids: NEXT was rendered on an empty row and then VANISHED when a
 * single-step template landed, so the buttons beside it shifted under the
 * operator's finger. A control surface that moves is a control surface that gets
 * mis-clicked, and at 2 a.m. that is a wrong graphic on air.
 *
 * So NEXT is always present too, and simply disabled unless the loaded template
 * has a next step (`TemplateInfo.hasNext`, derived at import) AND the item is on
 * air. That still satisfies what R-021 stage 2b actually forbids — an ENABLED
 * control that can only reject — because a disabled control invites nothing.
 *
 * (The playout rows are the one place this rule does NOT apply: they carry no
 * verbs at all, not disabled ones. See `PlayoutPanel` — that is a safety
 * decision, not a layout one.)
 *
 * The list is pure and React-free so the verb split is unit-testable without a
 * DOM, and so buttons and the context menu can be COMPARED in a test rather
 * than trusted to agree.
 */

export interface LayerRowActionDeps {
  /** The stack item bound to this row, if any (the row's whole verb state). */
  item: StackItemState | null;
  /**
   * What the WIRE observes on this row's layer, independent of whether we have
   * an item bound to it. Load reads this, not just `item`: an unbound row can
   * still be carrying somebody's live graphic (a producer that survived a
   * bridge restart, or one the playout side put there), and loading onto it
   * issues an adopt-CLEAR that destroys whatever is there.
   */
  observed: FixedSlotState['observed'];
  /** Does the loaded template have a next step? (`TemplateInfo.hasNext`.) */
  hasNext: boolean;
  /** True when the SPA→bridge link is down: every verb is refused (R-006). */
  linkDown: boolean;
  /** Has the operator staged unapplied field edits for this item? */
  dirty: boolean;
  /**
   * R-022 — is this row in REHEARSE? Bridge-owned, so every browser agrees.
   *
   * It gates PLAY here as a COURTESY, never as the guarantee: the bridge refuses
   * `stack.take` for a rehearsing item, which is what actually makes the interlock
   * hold against a stale client. A disabled button that were the only barrier
   * would make rehearse "a preview pane we hope nobody plays from".
   */
  rehearsing: boolean;
  /** Enter or leave rehearse — one toggle in a fixed slot, like LOAD/REMOVE. */
  toggleRehearse: (itemId: string) => Promise<AsyncResult>;
  /** The one-action chain: pick a `.vcg`, import it, bind it to THIS row. */
  load: () => Promise<AsyncResult>;
  /** Load a template already in the library onto this row (the picker path). */
  loadFromLibrary: () => Promise<AsyncResult>;
  play: (itemId: string) => Promise<AsyncResult>;
  next: (itemId: string) => Promise<AsyncResult>;
  update: (itemId: string) => Promise<AsyncResult>;
  stop: (itemId: string) => Promise<AsyncResult>;
  clear: (itemId: string) => Promise<AsyncResult>;
  /**
   * The BANK-SCOPED clear for a row with NO item — addressed to the LAYER, permitted
   * by structure (in the declared bank, not reserved) rather than by observation. This
   * is what finally makes CLEAR always available: `stack.out` is item-scoped and has
   * nothing to address on an unbound row, so without this the button could only be a
   * no-op that reports success.
   */
  clearLayer: () => Promise<AsyncResult>;
  remove: (itemId: string) => Promise<AsyncResult>;
  onError: (message: string) => void;
}

/**
 * The verbs for one row, in operator order.
 *
 * `item === null` is the EMPTY row: only LOAD can do anything, and every other
 * verb is present-but-disabled. With the link down everything is disabled
 * including LOAD — an exact-slot load commands CasparCG.
 */
export function layerRowActions(deps: LayerRowActionDeps): RowAction[] {
  const { item, linkDown, onError } = deps;
  const offlineReason = linkDown
    ? 'Bridge disconnected — commands are refused until it reconnects.'
    : undefined;
  const empty = item === null;
  const onAir = item !== null && isOnAir(item);
  // PLAY's own gate is narrower than `isOnAir`: an item already playing has
  // nothing to take. Kept as the stack row had it so the two never disagree
  // about what "already on air" means for THIS verb.
  const playing = item?.status === 'on-air' || item?.status === 'playing';

  /**
   * May an UNBOUND row accept a load?
   *
   * Only when the wire says the layer is EMPTY. An unbound row is not
   * necessarily an unoccupied one: a producer can survive a bridge restart
   * (task 3.3's honest-unknown case is exactly this), and the load chain issues
   * an adopt-CLEAR before its `CG ADD` — so a single un-gated click on a row
   * that merely LOOKS free would destroy a live graphic nobody has claimed.
   *
   * `unknown` is refused with the same fail-closed reasoning as part A's
   * untick: silence is evidence of nothing, and this gate's failure mode is
   * something leaving air.
   */
  const loadSafe = deps.observed.kind === 'empty';

  /**
   * Every row verb is declared NEUTRAL.
   *
   * The buttons render `variant="verb"` regardless, but the MENU paints from this
   * declaration (`VARIANT_ACCENT`), so leaving the old per-verb hues here would
   * have left the right-click menu as the one surface still colouring
   * affordances — and after on-air moved to green, a green PLAY menu item would
   * have been an affordance wearing the one colour reserved for "this is on the
   * output". Declaring it once keeps button and menu in agreement by construction,
   * which is the whole reason this list exists.
   */
  const act = (
    key: string,
    label: string,
    disabled: boolean,
    run: () => Promise<AsyncResult>,
    icon: RowAction['icon'],
    surface?: 'menu',
  ): RowAction => ({
    key,
    label,
    variant: 'verb',
    disabled: disabled || linkDown,
    ...(offlineReason !== undefined ? { title: offlineReason } : {}),
    run,
    onError,
    ...(icon !== undefined ? { icon } : {}),
    ...(surface !== undefined ? { surface } : {}),
  });

  const actions: RowAction[] = [
    // LOAD / REMOVE — ONE control that flips with the row's state: LOAD on an
    // empty row, REMOVE on an occupied one. Visually a toggle, because that is
    // what the operator is doing (filling or emptying this row) and it keeps
    // the button count down across thirty rows.
    //
    // The toggle is a VISUAL pattern, not a semantic one, and the difference
    // matters: a toggle affordance implies cheap and reversible, and REMOVE is
    // neither. So the REMOVE half keeps its own confirm gate (attached in
    // `LayerRow`, which knows the row's name and whether the item is ON AIR),
    // and only the LOAD half is a single click. Re-binding an occupied row is
    // still two explicit steps — REMOVE, then LOAD — never one compound verb
    // that hides a destructive step behind a constructive label.
    // ONE key, so the list's shape is literally identical in both states and a
    // test can assert that: only the label, variant and handler flip.
    empty
      ? act('load-remove', 'LOAD', !loadSafe, () => deps.load(), Download)
      : act(
          'load-remove',
          'REMOVE',
          false,
          () => (item === null ? noop() : deps.remove(item.itemId)),
          Trash2,
        ),
    // The already-imported path. Menu-placed: the owner's primary Load is the
    // one-action import, and a second Load BUTTON beside it on every row would
    // make the operator choose between two similarly-named controls under time
    // pressure. Same gate, same row, one right-click away.
    act('load-library', 'LOAD FROM LIBRARY', !empty, () => deps.loadFromLibrary(), Library, 'menu'),
    act(
      'play',
      'PLAY',
      // R-022 — a rehearsing row cannot be taken to air. THE INTERLOCK, and the
      // reason rehearse is a mode rather than a pane. This disabled state is the
      // courtesy; the bridge's own refusal (`errorCode: 'rehearsing'`) is the
      // guarantee, and it is what holds when a second browser's snapshot is stale.
      empty || playing || deps.rehearsing,
      () => (item === null ? noop() : deps.play(item.itemId)),
      Play,
    ),
    /**
     * R-022 — REHEARSE, a TOGGLE in a fixed slot, exactly like LOAD/REMOVE.
     *
     * One key and one position, so the verb set on a row never changes SHAPE —
     * only its label and enabled state flip. That is the same rule the rest of
     * this list follows and the same reason: a control surface that moves under
     * the operator's finger gets mis-clicked, and at 2 a.m. that is a wrong
     * graphic on air.
     *
     * Enabled only for a row with an item that is NOT on air, which mirrors the
     * bridge's guard rather than restating it loosely: the bridge refuses `on-air`
     * (rehearse mutes the layer, and muting a live graphic is not on offer).
     *
     * It does NOT gate on the layer carrying a resident producer, and that is now
     * the whole of the agreement rather than a gap in it: the bridge's precondition
     * is the BINDING. This gate was already the correct one — before the decouple
     * it left the button enabled on a CLEARed row that the bridge then refused
     * `not-loaded`, which is the mismatch the operator actually hit.
     *
     * While rehearsing, the toggle stays enabled — leaving is always available,
     * and it is the ONLY way back to a playable row.
     */
    act(
      'rehearse',
      deps.rehearsing ? 'END REHEARSE' : 'REHEARSE',
      empty || (!deps.rehearsing && onAir),
      () => (item === null ? noop() : deps.toggleRehearse(item.itemId)),
      MonitorPlay,
    ),
  ];

  actions.push(
    // NEXT — ALWAYS present (the shape never changes), enabled only when the
    // template actually has a step to advance to and the item is on air.
    act(
      'next',
      'NEXT',
      empty || !onAir || !deps.hasNext,
      () => (item === null ? noop() : deps.next(item.itemId)),
      ArrowRightFromLine,
    ),
    // UPDATE pushes staged field edits to a LIVE producer. Its primary surface
    // is the Inspector's Apply; on the row it is a menu-placed convenience, so
    // thirty rows do not carry thirty near-duplicate buttons.
    act(
      'update',
      'UPDATE',
      empty || !onAir || !deps.dirty,
      () => (item === null ? noop() : deps.update(item.itemId)),
      RefreshCw,
      'menu',
    ),
    act(
      'stop',
      'STOP',
      empty || !onAir,
      () => (item === null ? noop() : deps.stop(item.itemId)),
      CircleArrowOutDownRight,
    ),
    /**
     * CLEAR — THE ESCAPE HATCH, and the one verb that is not fail-closed.
     *
     * This is a DELIBERATE departure from the doctrine the rest of this surface
     * follows, and it must not be "fixed" back. The asymmetry is the whole point:
     *
     *   - Refusing LOAD when occupancy is unknown is genuinely safe. Nothing
     *     happens, and the layer keeps whatever is on it.
     *   - Refusing CLEAR when the state model is confused is NOT safe. It strands
     *     a graphic on air with no way to take it off — the worst outcome this
     *     console has. "Fail closed" on a remedy is not fail-safe, it is
     *     fail-stuck.
     *
     * So CLEAR is offered whenever there is an ITEM on the row, whatever its
     * status claims — on air, idle, unconfirmed, unverified, errored — and even
     * when the bridge link reads down. That last one is not an oversight: a WRONG
     * `linkDown` is exactly the class of bug this exists for, and the costs are
     * not comparable. Enabling it when the bridge really is dead costs one failed
     * request and a toast; disabling it when the flag is wrong costs a graphic
     * nobody can remove. It carries `offlineReason` as its tooltip so the operator
     * knows what to expect before pressing.
     *
     * IT IS NOW ENABLED ON AN UNBOUND ROW TOO, and that completes the decision
     * rather than changing it. It used to be disabled there for a good reason: with
     * no item there is nothing for `stack.out` to address, so an enabled button would
     * have been a no-op that REPORTED SUCCESS — the one outcome worse than a disabled
     * one, because it looks like it worked. The fix was never a flag; it was the
     * missing capability, and it now exists:
     *
     *   - bound row   → `stack.out` (unchanged, and it keeps the B-039 producer
     *     bookkeeping the item state machine depends on);
     *   - unbound row → the BANK-SCOPED layer clear, addressed to the LAYER and
     *     permitted by STRUCTURE (in the declared bank AND not reserved) rather than
     *     by observation — so it still works when occupancy reads `unknown`, which is
     *     precisely the case the operator needs it for.
     *
     * WHAT THIS DOES NOT WIDEN. Both halves are fenced to layers the operator's own
     * bank declares. `stack.out` is ITEM-scoped, and a bank item can never be bound to
     * a reserved playout layer (the validator refuses an overlapping bank at config
     * time, at boot and at every change). The new half re-checks the reservation
     * itself, FIRST, so a reserved layer is refused even if the two sets ever
     * overlapped. `layers.clear`'s reserved-range refusal, the orphan sweep's skip and
     * the playout tab's html-only rule are ALL untouched — this adds a capability, it
     * does not loosen an existing one.
     */
    // Built as a literal rather than through `act`, because `act` ORs `linkDown`
    // into every verb and CLEAR is the one verb that must not inherit it. Spelling
    // the object out keeps the exception visible where it is made, instead of
    // adding an opt-out flag to a shared helper that every other verb would then
    // have to be read against.
    {
      key: 'clear',
      label: 'CLEAR',
      variant: 'verb',
      // NO gate at all now — the escape hatch is always available, on every row,
      // whatever the status claims and whatever the link says. See above.
      disabled: false,
      ...(offlineReason !== undefined ? { title: offlineReason } : {}),
      run: () => (item === null ? deps.clearLayer() : deps.clear(item.itemId)),
      onError,
      icon: XSquare,
    },
  );

  return actions;
}

/**
 * The run handler for a verb on an empty row. Unreachable in practice — those
 * verbs are disabled, and both `runRowAction` and `AsyncButton` refuse a
 * disabled action — but it keeps every entry's `run` total rather than making
 * the type optional, which would push the null check onto every caller.
 */
function noop(): Promise<AsyncResult> {
  return Promise.resolve({ accepted: false, cancelled: true });
}

/** Does this slot's binding name an item that is still on the stack? */
export function itemForSlot(
  slot: FixedSlotState,
  items: readonly StackItemState[],
): StackItemState | null {
  if (slot.binding === null) return null;
  return items.find((i) => i.itemId === slot.binding?.itemId) ?? null;
}
