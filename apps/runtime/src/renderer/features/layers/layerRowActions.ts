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

/**
 * What a bound row says when its template is not in this browser's library.
 *
 * Exported so the ROW can show it as well as the button: a bound row pointing at
 * a template that is not here is a fact the operator needs to see while
 * scanning, not something they discover by hovering the one control that is
 * still enabled. The two surfaces read the same string by construction.
 */
export const MISSING_TEMPLATE_REASON =
  'This row’s template is not in this browser’s library, so it cannot be put back on the layer. Re-import it, or REMOVE the row.';

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
  /**
   * THE SECOND HOP — can the bridge reach CasparCG?
   *
   * Separate from `linkDown` because they are different questions with different
   * answers: the bridge is ours and local and usually up, while the playout
   * machine may be off for hours. A verb that only touches OUR LIST needs the
   * first; a verb that emits AMCP needs both. Unknown counts as unreachable —
   * see `useCasparReachable`.
   */
  casparReachable: boolean;
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
  /**
   * Put this row's ALREADY-BOUND template back on its layer, with no picking.
   *
   * The post-CLEAR path. Distinct from `load` because the operator is doing a
   * different thing — restoring what the row already holds, not choosing what it
   * should hold — and because the file picker in `load` is exactly the step that
   * made the reported defect tedious rather than merely wrong.
   */
  reload: () => Promise<AsyncResult>;
  /** Load a template already in the library onto this row (the picker path). */
  loadFromLibrary: () => Promise<AsyncResult>;
  /**
   * Is the row's bound template present in this browser's library?
   *
   * `false` means it cannot be re-loaded, so the toggle must offer the way OUT
   * rather than a load that would be refused — and the row has to say why.
   * Meaningless on an unbound row; callers pass `true` there.
   */
  templateAvailable: boolean;
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
  /**
   * THE GATE EVERY AMCP-EMITTING VERB CARRIES: both hops must be up.
   *
   * The bridge's refusals already exist — `update()` answers `disconnected`,
   * `take()` the same — so nothing here makes the system safer. What it fixes is
   * the CONTROL: today these verbs are enabled, send nothing, and report an error
   * afterwards, which costs the operator the seconds in which he believes the
   * command is on its way. The refusal was always right; the button was not.
   */
  const needsCaspar = linkDown || !deps.casparReachable;
  /**
   * …and it names the RIGHT HOP. Telling the operator "bridge disconnected" while
   * the bridge is fine sends him to the wrong machine, so the two states get two
   * sentences. `linkDown` wins when both are down: it is the nearer failure, and
   * with it down CasparCG's state is not even knowable.
   */
  const needsCasparReason =
    offlineReason ??
    'CasparCG cannot be reached — this command would not arrive. It returns as soon as the playout server is back.';
  /**
   * ── TWO FACTS THAT USED TO BE ONE FLAG ──────────────────────────────────────
   *
   * `empty` meant `item === null` and was read by controls that needed two
   * different questions answered:
   *
   *   - HAS THIS ROW A TEMPLATE BOUND?  (`hasBinding`)
   *   - IS THERE A PRODUCER ON THE LAYER? (`layerOccupied`)
   *
   * They agree until CLEAR, which destroys the producer and KEEPS the item — so
   * the row stayed "not empty", the LOAD/REMOVE toggle went on showing REMOVE,
   * and the operator could not put the template back without removing it and
   * picking it again. That is the reported defect, and it is a conflation rather
   * than a missing branch, so it is fixed by splitting the fact and naming which
   * one each consumer means.
   *
   * `empty` survives ONLY as "no binding" for the verbs whose question really is
   * that, and is renamed to say so.
   */
  const hasBinding = item !== null;
  const empty = !hasBinding;
  /**
   * Is a producer resident on the layer?
   *
   * `unknown` is deliberately NOT occupied and NOT empty: it is the third
   * answer, and every consumer below decides for itself which way to fail. The
   * one thing none of them may do is treat silence as a fact (B-101).
   */
  const onAir = item !== null && isOnAir(item);
  // PLAY's own gate is narrower than `isOnAir`: an item already playing has
  // nothing to take. Kept as the stack row had it so the two never disagree
  // about what "already on air" means for THIS verb.
  const playing = item?.status === 'on-air' || item?.status === 'playing';

  /**
   * The bound template is not in THIS browser's library.
   *
   * Read as "cannot confirm the template is available", which is the fail-closed
   * reading and the right one: the identity can also be absent transiently (the
   * bridge cannot resolve it after ITS restart until the item is reloaded), and
   * offering a re-ADD that the load path will refuse is worse than offering the
   * way out. Either way the row must SAY so — see `MISSING_TEMPLATE_REASON`.
   */
  const templateMissing = hasBinding && deps.templateAvailable === false;

  /**
   * ── THE TOGGLE IS DECIDED BY ONE THING: IS A TEMPLATE BOUND? ───────────────
   *
   *   no binding  → LOAD
   *   binding     → REMOVE
   *
   * LAYER OCCUPANCY DOES NOT ENTER THIS CONTROL. It used to — a bound row on an
   * empty layer showed LOAD so the operator could re-ADD after a CLEAR — and that
   * is now wrong twice over. `CLEAR` empties the layer and the binding survives,
   * so the row must go on saying REMOVE; and nothing needs re-loading anyway,
   * because PLAY re-ADDs on its way to air (R-028 decision 5).
   *
   * ONE EXPRESSION, BOTH CONSUMERS. The label used to come from here while the
   * confirm dialog was chosen in `LayerRow` from its own `item !== null` test —
   * two independent answers to one question, which is why the row could read LOAD
   * and open the REMOVE modal. `LayerRow` now keys the confirm off this action's
   * own `tone`, set by the same branch that sets the label, so the two cannot
   * disagree. The label was only the symptom; the second resolution was the bug.
   */
  const showLoad = !hasBinding;

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
    /**
     * Override the tooltip. `offlineReason` is the default because "the bridge
     * is down" is why almost every verb is refused — but a verb with a more
     * specific reason must be able to say it, and a tooltip that explained the
     * wrong refusal would be worse than none.
     */
    title?: string,
  ): RowAction => ({
    key,
    label,
    variant: 'verb',
    disabled: disabled || linkDown,
    ...(title !== undefined
      ? { title }
      : offlineReason !== undefined
        ? { title: offlineReason }
        : {}),
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
    //
    // ── WHICH HALF SHOWS, NOW THAT BINDING AND OCCUPANCY ARE SEPARATE ────────
    //
    //   binding | layer                       | shows
    //   --------|-----------------------------|---------------------------------
    //   no      | empty                       | LOAD  — pick + import + load
    //   yes     | occupied                    | REMOVE
    //   yes     | empty (post-CLEAR)          | LOAD  — re-ADD the bound template
    showLoad
      ? {
          ...act(
            'load-remove',
            'LOAD',
            // NOT GATED ON LAYER OCCUPANCY, and deleting that gate is the fix for
            // the owner's report that LOAD renders dim while the playout server
            // is offline.
            //
            // It required an observably EMPTY layer, because the load path issued
            // an adopt-CLEAR that could destroy an unclaimed graphic. LOAD emits
            // ZERO AMCP now, so it can destroy nothing and has nothing to be
            // careful about — while with CasparCG unreachable the occupancy reads
            // `unknown`, which is exactly when the operator is building his
            // rundown and needs this control most.
            //
            // Nor on rehearse: LOAD cannot reach a layer, so it cannot put an
            // unmuted producer under a row that is on PVW.
            //
            // `act` still ORs `linkDown` in, and THAT one is right: LOAD needs the
            // BRIDGE to import the template into the store it serves from. The
            // bridge is ours and local; CasparCG is neither. Two different states,
            // two different reasons, and only one of them belongs to this button.
            false,
            () => deps.load(),
            Download,
          ),
          tone: 'load',
        }
      : {
          ...act(
            'load-remove',
            'REMOVE',
            false,
            () => (item === null ? noop() : deps.remove(item.itemId)),
            Trash2,
            undefined,
            templateMissing ? MISSING_TEMPLATE_REASON : undefined,
          ),
          // The two halves of ONE slot, and the reason `tone` is its own field:
          // they share a key, so only an explicit declaration can give them
          // different hover colours.
          tone: 'remove',
          // Last in the CONTEXT MENU (owner request). The button keeps its fixed
          // first slot — the header word above it cannot move — but in a
          // top-to-bottom list the destructive verb should not be the thing
          // sitting under the cursor when the menu opens.
          menuLast: true,
        },
    // The already-imported path. Menu-placed: the owner's primary Load is the
    // one-action import, and a second Load BUTTON beside it on every row would
    // make the operator choose between two similarly-named controls under time
    // pressure. Same gate, same row, one right-click away.
    //
    // NOT REMOVED, pending the owner's call. The request was to take it out of
    // the context menu; this is the only place it can live. `loadFromLibrary`
    // binds a SPECIFIC row (`Load onto ${rowName}` → `loadTemplateOntoFixedSlot`
    // with that row's coord), so there is no row-less surface — a panel-header
    // entry would have nothing to bind to. Deleting the item therefore deletes
    // the capability, and takes the template PICKER with it, and R-005's
    // remove-from-library lives inside that picker.
    act('load-library', 'LOAD FROM LIBRARY', !empty, () => deps.loadFromLibrary(), Library, 'menu'),
    {
      ...act(
        'play',
        'PLAY',
        // R-022 — a rehearsing row cannot be taken to air. THE INTERLOCK, and the
        // reason rehearse is a mode rather than a pane. This disabled state is the
        // courtesy; the bridge's own refusal (`errorCode: 'rehearsing'`) is the
        // guarantee, and it is what holds when a second browser's snapshot is stale.
        empty || playing || deps.rehearsing || needsCaspar,
        () => (item === null ? noop() : deps.play(item.itemId)),
        Play,
      ),
      ...(needsCaspar ? { title: needsCasparReason } : {}),
      tone: 'play',
      // ENGAGED = the state this verb produces is already true, which for PLAY is
      // ON AIR. It is disabled in exactly that case, so the fill lands on a
      // control the operator cannot press — which is the point: a green PLAY says
      // "this row is the one on air", the same claim the row's state mark makes.
      //
      // `playing` and not the wider `isOnAir`: that set includes `unconfirmed`,
      // where the air result is UNKNOWN, and painting the air colour on a guess is
      // exactly what B-087 forbids. It is also PLAY's own disabled gate, so the
      // fill and the disabling cannot disagree about why.
      active: playing,
    },
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
     *
     * ENGAGED, IT IS THE ONE ROW VERB THAT WEARS A COLOUR (`active`), filled in the
     * same violet the row's REHEARSING mark uses. The verbs are otherwise neutral
     * on purpose — thirty rows of coloured affordances drowned the state signal —
     * and this does not reopen that: neutral bans colour advertising what a control
     * COULD do, whereas a lit toggle says a mode IS ON, which is the state cell's
     * own statement in the state cell's own hue. Reading `deps.rehearsing`, the
     * same flag that flips the label, so the fill and the word cannot disagree.
     */
    {
      ...act(
        'rehearse',
        // ON PVW / OFF PVW (owner's wording). It replaces REHEARSE / END
        // REHEARSE, and it says the same thing in the operator's own terms: what
        // the verb DOES is put this row's graphic on the PVW monitor. The KEY
        // stays `rehearse` — the bridge channel, the row state and this whole
        // feature are R-022's rehearse, and renaming the identity to match a
        // label would be renaming the thing to match its caption.
        deps.rehearsing ? 'OFF PVW' : 'ON PVW',
        empty || (!deps.rehearsing && onAir),
        () => (item === null ? noop() : deps.toggleRehearse(item.itemId)),
        MonitorPlay,
      ),
      active: deps.rehearsing,
    },
  ];

  actions.push(
    // NEXT — ALWAYS present (the shape never changes), enabled only when the
    // template actually has a step to advance to and the item is on air.
    {
      ...act(
        'next',
        'NEXT',
        empty || !onAir || !deps.hasNext || needsCaspar,
        () => (item === null ? noop() : deps.next(item.itemId)),
        ArrowRightFromLine,
      ),
      ...(needsCaspar ? { title: needsCasparReason } : {}),
      tone: 'next',
    },
    // UPDATE pushes staged field edits to a LIVE producer. Its primary surface
    // is the Inspector's Apply; on the row it is a menu-placed convenience, so
    // thirty rows do not carry thirty near-duplicate buttons.
    act(
      'update',
      'UPDATE',
      empty || !onAir || !deps.dirty || needsCaspar,
      () => (item === null ? noop() : deps.update(item.itemId)),
      RefreshCw,
      'menu',
      // UPDATE reaches air: on a row with a resident producer it sends
      // `CG UPDATE` (measured). So it carries the same reason as the rest.
      needsCaspar ? needsCasparReason : undefined,
    ),
    {
      ...act(
        'stop',
        'STOP',
        empty || !onAir || needsCaspar,
        () => (item === null ? noop() : deps.stop(item.itemId)),
        CircleArrowOutDownRight,
      ),
      ...(needsCaspar ? { title: needsCasparReason } : {}),
      tone: 'stop',
    },
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
     * So CLEAR is offered whatever the row's STATUS claims — on air, idle,
     * unconfirmed, unverified, errored. That half is unchanged and is the whole
     * point of the escape hatch: the status is exactly what may be wrong when the
     * operator reaches for it.
     *
     * IT IS NOW GATED ON REACHABILITY, ON BOTH HOPS, and that is a deliberate
     * reversal of "even when the bridge link reads down". The two are not one
     * rule. Never gating on LAYER STATE stands. Reachability is different: with
     * either hop down the command does not leave, so the enabled button was not a
     * remedy — only the appearance of one, and it costs the operator the seconds
     * in which he believes the graphic is coming off.
     *
     * The earlier reasoning was that a WRONG `linkDown` would strand a graphic. It
     * still would; what changed is that the command genuinely does not go. It
     * returns the instant either hop does, which keeps this a gate rather than a
     * removal of the hatch.
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
      // Gated on REACHABILITY only — never on the row's status. See above.
      disabled: needsCaspar,
      ...(needsCaspar ? { title: needsCasparReason } : {}),
      run: () => (item === null ? deps.clearLayer() : deps.clear(item.itemId)),
      onError,
      icon: XSquare,
      tone: 'clear',
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
