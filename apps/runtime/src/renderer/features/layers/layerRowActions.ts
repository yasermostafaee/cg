import {
  ArrowRightFromLine,
  CircleArrowOutDownRight,
  Download,
  MonitorPlay,
  Play,
  Radio,
  Volume2,
  RefreshCw,
  Trash2,
  XSquare,
} from 'lucide-react';
import type { FixedSlotState } from '@cg/shared-ipc';
import { isOnAirStatus } from '@cg/shared-schema';
import type { StackItemState } from '@cg/shared-schema';
import type { RowAction } from '../../ui/rowAction.js';
import type { AsyncResult } from '../../ui/asyncButtonController.js';
import {
  BRIDGE_DOWN_REASON,
  casparRefusalReason,
  type CasparReach,
} from '../../ui/reachWording.js';
import { isOnAir } from '../stack/onAir.js';
import type { RowBinding } from './rowState.js';

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
 * verbs at all, not disabled ones. See `StationLayersPanel` — that is a safety
 * decision, not a layout one.)
 *
 * The list is pure and React-free so the verb split is unit-testable without a
 * DOM, and so buttons and the context menu can be COMPARED in a test rather
 * than trusted to agree.
 */

/**
 * What a bound row says when its template is not held by this browser.
 *
 * Exported so the ROW can show it as well as the button: a bound row pointing at
 * a template that is not here is a fact the operator needs to see while
 * scanning, not something they discover by hovering the one control that is
 * still enabled. The two surfaces read the same string by construction.
 *
 * §6 — it no longer says "library". That word named a PANEL, and the panel is
 * gone, so it sent the operator looking for a surface that does not exist. The
 * fact is the same and is stated directly.
 */
export const MISSING_TEMPLATE_REASON =
  'This browser does not have this row’s template, so it cannot be put back on the layer. Re-import it, or REMOVE the row.';

/**
 * WHY EVERY VERB IS HELD WHILE THE ROW'S CONTENTS HAVE NOT ARRIVED.
 *
 * It NAMES NO FAULT, and in particular it never names CasparCG — nothing has said
 * anything about the playout server in this window, and the row is not waiting on
 * it. What has not arrived is the STACK SNAPSHOT, one hop nearer. Naming the wrong
 * machine here is the same defect `CASPAR_CONNECTING_REASON` was written to fix,
 * and it would send an operator to a rack over a snapshot that lands in a second.
 *
 * Same shape as that sentence deliberately — "held", "returns as soon as it
 * answers" — because it is the same PROMISE: a bounded wait that ends on the data,
 * never on a timer, and never on the operator doing anything.
 */
/**
 * R-021 stage 4 — why the AIR verbs are held on a `restore-blocked` row.
 *
 * Exported for the same reason `MISSING_TEMPLATE_REASON` is: the fact belongs on
 * the ROW as well as on the control, and the two surfaces must read the same
 * string by construction rather than by two people writing the same sentence.
 *
 * It names the way OUT, because every held verb here has one and it is short.
 */
export const RESTORE_BLOCKED_REASON =
  'This row’s layer is held by a producer that is not ours, so the item is not on it. Sending this would command somebody else’s graphic. CLEAR the layer first, then PLAY.';

export const AWAITING_ROW_REASON =
  'Connecting… this row’s contents have not arrived from the bridge yet, so its actions are held. They return as soon as it answers.';

/**
 * 🔴 `R-017` — WHY REMOVE IS HELD WHILE THE ROW IS ON AIR.
 *
 * REMOVE clears the layer AND drops the item, and neither half can be undone: the row's
 * fields, its position override and its per-look composition go with it. It was the only
 * verb on the row with no state condition whatsoever — and the only irreversible one.
 *
 * ⚠ **A confirm was already there and was never the gap.** `LayerRow` has attached an
 * on-air-aware dialog to this verb, on both surfaces, since before R-017 was re-verified.
 * A confirmation asks; a refusal declines. R-017 is the refusal.
 *
 * It names the way OUT, like {@link RESTORE_BLOCKED_REASON}, because the remedy is two
 * short presses and an operator told only "no" concludes the console is broken. STOP is
 * named first: it is the graceful half and leaves the template loaded, so the row can be
 * taken again without a re-pick.
 *
 * ⭐ **Exported so the row's tooltip and the toast that answers the bridge's refusal are
 * ONE string from ONE place** — `tasks.md` 1.10's requirement, and the reason it is a
 * requirement is that two sentences which match today drift apart on the day one of them
 * is edited.
 */
export const REMOVE_ON_AIR_REASON =
  'This row is on air, and REMOVE cannot be undone — it clears the layer and drops the item, with its fields and overrides. Take it off air first: STOP runs the template’s outro and keeps it loaded, CLEAR cuts it immediately.';

export interface LayerRowActionDeps {
  /**
   * WHAT THIS ROW CARRIES — the union, and the ONLY input to what this row offers.
   *
   * It was `item: StackItemState | null`, and that nullable is the whole bug this
   * argument exists to close: `null` meant BOTH "no template bound" (ours, known —
   * `LOAD` is honest) and "the stack has not arrived" (not a fact about the row at
   * all), so for the whole bootstrap window a BOUND row offered an empty row's
   * verbs. `LOAD` is a list action and therefore ENABLED in that window, which
   * invites the operator to rebind a row that already has a binding — the one he
   * cannot see yet. Offering an action on a state we have not been told is exactly
   * the class the `EMPTY` label fix closed, on a control instead of a word.
   *
   * Taking the union rather than a nullable plus a flag is what makes the mistake
   * unrepresentable: there is no `item` to compare against `null`, so no verb's
   * availability CAN be derived from one.
   */
  binding: RowBinding;
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
   * first; a verb that emits AMCP needs both.
   *
   * THREE-VALUED, and only the WORDING branches on the third. `connecting` (the
   * bridge has not answered yet) refuses exactly as `unreachable` does — unknown
   * fails closed — but it may not be described as a playout server that is down,
   * because nothing has said so. See `useCasparReach` / `reachWording`.
   */
  casparReach: CasparReach;
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
  /**
   * R-021 stage 4 — the bridge's restore for this row PARKED: a producer that is
   * not ours holds the layer, so our item is NOT on it (`binding.restoreBlocked`).
   *
   * It holds every verb that would COMMAND that layer, and only those. CLEAR and
   * REMOVE stay available deliberately — CLEAR is the documented way out of the
   * state (d1's "Clear, then take"), and holding the escape hatch on a row whose
   * whole problem is a producer in the way would be fail-STUCK rather than
   * fail-safe. This is a courtesy gate: the bridge sends nothing on its own while
   * blocked, and a blocked row's PLAY would be an ordinary take that the bridge
   * has no reason to refuse — which is precisely why the console must not offer it.
   */
  restoreBlocked: boolean;
  /** Enter or leave rehearse — one toggle in a fixed slot, like LOAD/REMOVE. */
  toggleRehearse: (itemId: string) => Promise<AsyncResult>;
  /**
   * §6 — the row's ONE load: open the template picker, then bind what it returns
   * to THIS row.
   *
   * It was "pick a `.vcg`, import it, bind it" — the file chooser, with the
   * already-imported path exiled to a context-menu entry named after a panel that
   * no longer exists. Both paths now live behind this one verb, and the choice
   * between them happens in a dialog the operator can read rather than in a
   * right-click menu they have to know about.
   */
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
  /**
   * Does this browser hold the row's bound template?
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
  /**
   * R-048 (6.9 / 6.9e) — does this row carry a template with LIVE PLATES?
   *
   * The verb is OFFERED only where it means something. A row whose template has
   * no plates has nothing to repoint, and a permanently-disabled entry in every
   * row menu is thirty pieces of furniture that teach the operator to stop
   * reading the menu.
   */
  hasLivePlates: boolean;
  /**
   * R-048 (6.9e) — open the per-plate source picker for THIS row.
   *
   * MENU-PLACED, not a button: seven verbs across thirty rows is already 210
   * controls, and this one is reached in an emergency the operator is looking
   * straight at rather than scanned for. Two actions total (open, choose), which
   * is what 6.9e asks for.
   */
  swapSource: () => Promise<AsyncResult>;
  /**
   * C-015 phase 6 (6.5f) — open this row's per-plate AUDIO panel.
   *
   * Beside {@link swapSource} by owner decision: under pressure, on air, "which
   * source" and "how loud" are one decision made in one place, and 6.9c already
   * settled that the audio intent belongs to the PLATE rather than to the producer
   * instance — so it belongs where the plate's other per-run property is.
   *
   * Gated on `hasLivePlates` for the same reason SOURCE is, and on the SAME
   * reachability, because raising a plate emits a `MIXER … VOLUME` on a live layer.
   */
  plateAudio: () => Promise<AsyncResult>;
  onError: (message: string) => void;
}

/**
 * The verbs for one row, in operator order.
 *
 * `unbound` is the EMPTY row: only LOAD can do anything, and every other verb is
 * present-but-disabled. With the link down everything is disabled including LOAD —
 * an exact-slot load commands CasparCG.
 *
 * `awaiting` offers NOTHING, and that is the third case the old nullable could not
 * express. See {@link AWAITING_ROW_REASON} and the `awaiting` note below.
 */
export function layerRowActions(deps: LayerRowActionDeps): RowAction[] {
  const { binding, linkDown, onError } = deps;
  /**
   * ── THE THREE-WAY FACT, UNPACKED ONCE ─────────────────────────────────────
   *
   * `item` is derived here and is used ONLY for the itemId a handler must send and
   * for the status a gate must read — never to decide whether a verb is offered.
   * Every availability question below asks `binding.kind`, because `item === null`
   * cannot tell `unbound` from `awaiting` and those two must offer opposite things.
   *
   * `empty` is therefore `kind === 'unbound'` and NOT `!hasBinding`. That
   * distinction is the fix: with `!hasBinding`, `awaiting` would fall into the
   * EMPTY branch and light LOAD up again — the bug, restored by a negation.
   *
   * `empty` GOES ON MEANING "NO BINDING" AND NEVER "THE LAYER IS FREE". That split
   * is load-bearing and predates this change: CLEAR destroys the producer and KEEPS
   * the item, so a row can be bound over an empty layer. Reading `empty` as layer
   * occupancy is what once left the toggle stuck on REMOVE after a CLEAR, with no
   * way to put the template back short of removing it and picking it again.
   */
  const item = binding.kind === 'bound' ? binding.item : null;
  const hasBinding = binding.kind === 'bound';
  const empty = binding.kind === 'unbound';
  /**
   * WE HAVE NOT BEEN TOLD WHAT IS ON THIS ROW.
   *
   * Not a state of the row — a state of our KNOWLEDGE of it, and it ends on the
   * DATA (`ready` latches on the first snapshot, a push, or a resolved pull), never
   * on a timer. A timer would either uncover a row before its binding is known or
   * hold a settled one back, and both are worse than the wait.
   */
  const awaiting = binding.kind === 'awaiting';
  /**
   * THE GATE EVERY AMCP-EMITTING VERB CARRIES: both hops must be up.
   *
   * The bridge's refusals already exist — `update()` answers `disconnected`,
   * `take()` the same — so nothing here makes the system safer. What it fixes is
   * the CONTROL: today these verbs are enabled, send nothing, and report an error
   * afterwards, which costs the operator the seconds in which he believes the
   * command is on its way. The refusal was always right; the button was not.
   */
  const needsCaspar = linkDown || deps.casparReach !== 'reachable';
  /**
   * …and it names the RIGHT HOP, and the right STATE of that hop. Telling the
   * operator "bridge disconnected" while the bridge is fine sends him to the wrong
   * machine; telling him CasparCG cannot be reached before anything has said so
   * invents a fault. `linkDown` wins when both are down: it is the nearer failure,
   * and with it down CasparCG's state is not even knowable. One shared resolution
   * (`casparRefusalReason`), never a local copy of the sentence.
   */
  const needsCasparReason = casparRefusalReason(linkDown, deps.casparReach) ?? BRIDGE_DOWN_REASON;
  /**
   * ── WHY A VERB IS REFUSED, IN PRECEDENCE ORDER: THE NEARER UNKNOWN WINS ────
   *
   * Three things can hold a verb, and when more than one is true the operator must
   * be told the one he can ACT on:
   *
   *   1. `linkDown` — the bridge is down. It wins over everything, unchanged: with
   *      no bridge the stack cannot arrive either, so "connecting…, it returns as
   *      soon as it answers" would be a promise nothing is keeping. This is also
   *      why a cold start with a dead bridge reads BRIDGE DISCONNECTED and not the
   *      waiting sentence — the wait is not bounded in that case.
   *   2. `awaiting` — the bridge is up and has not yet said what this row holds.
   *      Nearer than CasparCG and strictly more informative: we cannot even name
   *      what the verb would act on, so whether the command could be DELIVERED is a
   *      question we have not reached yet.
   *   3. the CasparCG hop, worded by the shared `casparRefusalReason`.
   *
   * Ordering 2 above 3 is also what keeps the boot window from naming a machine
   * nothing has accused: a row whose stack has not landed must never explain itself
   * with "CasparCG cannot be reached".
   */
  const rowRefusalReason: string | undefined = linkDown
    ? BRIDGE_DOWN_REASON
    : awaiting
      ? AWAITING_ROW_REASON
      : undefined;
  /** The reason for an AMCP-emitting verb, with the two nearer unknowns first. */
  const casparVerbReason = rowRefusalReason ?? needsCasparReason;
  /**
   * Is a producer resident on the layer?
   *
   * `unknown` is deliberately NOT occupied and NOT empty: it is the third
   * answer, and every consumer below decides for itself which way to fail. The
   * one thing none of them may do is treat silence as a fact (B-101).
   */
  /**
   * R-021 stage 4 — this row's layer is not ours to command right now.
   *
   * Read off the BINDING and never re-derived from `observed`: "a non-html
   * producer under a binding" also describes a BLIND tap's honest ignorance, and
   * only the bridge knows which of the two actually happened.
   */
  const blocked = deps.restoreBlocked;
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
   *
   * ── AND WHAT `awaiting` SHOWS IN THIS SLOT ─────────────────────────────────
   *
   * The LOAD face, DISABLED. Not REMOVE: REMOVE is not merely unwise here, it is
   * unperformable — `remove(itemId)` has no itemId to send, and its confirm gate
   * names the template and says whether the item is ON AIR, neither of which we
   * know. Showing it would be the console asserting a binding it has not been told
   * about, which is the very claim this window exists to withhold.
   *
   * So the slot keeps its default face and offers nothing through it. The SHAPE
   * rule forces a control to be here — every row declares the same verbs in the
   * same order, always — and a disabled control invites nothing, which is exactly
   * the distinction R-021 stage 2b actually draws. The word LOAD is not a claim
   * that the row is empty; the state cell says LOADING beside it, and the tooltip
   * says why it is held.
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
    /*
      `awaiting` IS OR-ED IN HERE, CENTRALLY, for the same reason `linkDown` is:
      every verb built through this helper inherits it, so a verb cannot be added
      later that forgets the window. The two exceptions are spelled out where they
      are made — CLEAR is a literal below (it must escape `linkDown`, and it does
      NOT escape this one), and nothing escapes `awaiting`.
    */
    disabled: disabled || linkDown || awaiting,
    ...(title !== undefined
      ? { title }
      : rowRefusalReason !== undefined
        ? { title: rowRefusalReason }
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
    //   NOT YET KNOWN (`awaiting`)            | LOAD, DISABLED — offers nothing
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
            //
            // `act` ALSO ORs `awaiting` in, and that is the point of this task.
            // LOAD is a LIST action, so it survived every reachability gate above
            // and stayed lit through the whole bootstrap window — on rows that were
            // already bound. Pressing it there rebinds a row over a binding the
            // panel has not yet been told about: the operator overwrites the one
            // thing he cannot see. Passing `false` here means "this verb adds no
            // gate of its own", never "this verb is always available".
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
            /*
              🔴 `R-017` — THE STATE CONDITION THIS VERB NEVER HAD, and it goes HERE, in the
              ONE `RowAction` this toggle's REMOVE half is declared as. `buttonActions` and
              `toMenuItems` are two projections of the same array, so the button and the
              context-menu item inherit the gate structurally — there is no second place to
              remember, which is the whole reason the shape rule exists.

              `isOnAirStatus` is IMPORTED, never re-derived: the bridge's own refusal is the
              same function object, so the two cannot answer one row two ways. That identity
              is what `removeOnAir.agreement.test.ts` asserts, and it is why this reads the
              item's own `status` rather than the row's DISPLAY badge — `LayerRow` masks an
              unbacked air claim to `unverified` for the operator's benefit, and a gate
              computed from the mask would diverge from the bridge on exactly the states the
              mask exists for.
            */
            item !== null && isOnAirStatus(item) && !blocked,
            () => (item === null ? noop() : deps.remove(item.itemId)),
            Trash2,
            undefined,
            templateMissing
              ? MISSING_TEMPLATE_REASON
              : item !== null && isOnAirStatus(item) && !blocked
                ? REMOVE_ON_AIR_REASON
                : undefined,
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
    /*
      §6 — `LOAD FROM LIBRARY` IS GONE FROM THIS LIST, and what it reached is not.

      The Library stopped being a surface when R-028 folded it into the stack, so a
      control naming it pointed at nothing the operator could see. The previous note
      here was right that deleting the ENTRY would delete the CAPABILITY — the
      picker, and R-005's remove-a-template inside it — which is why the picker
      MOVED instead: `LOAD` opens it, and importing a `.vcg` is one option in it
      rather than the whole of it (see `useTemplatePicker`).

      That also retires the reason this had to be menu-placed. There is no longer a
      second, similarly-named control to choose between under time pressure: there
      is ONE `LOAD`, and the choice between "one I already have" and "a new file"
      happens after it, in a dialog, where it can be read.
    */
    {
      ...act(
        'play',
        'PLAY',
        // R-022 — a rehearsing row cannot be taken to air. THE INTERLOCK, and the
        // reason rehearse is a mode rather than a pane. This disabled state is the
        // courtesy; the bridge's own refusal (`errorCode: 'rehearsing'`) is the
        // guarantee, and it is what holds when a second browser's snapshot is stale.
        // `blocked` is the load-bearing one here: a take on a blocked row issues
        // `CG ADD` + PLAY onto a layer carrying somebody else's producer, which
        // replaces it — the destructive act d1 says may only ever happen through
        // the operator's own explicit CLEAR.
        empty || playing || deps.rehearsing || blocked || needsCaspar,
        () => (item === null ? noop() : deps.play(item.itemId)),
        Play,
      ),
      ...(blocked
        ? { title: RESTORE_BLOCKED_REASON }
        : needsCaspar || awaiting
          ? { title: casparVerbReason }
          : {}),
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
        // Blocked holds ENTRY only: rehearse MUTES the layer, and muting a layer
        // that is carrying another system's live feed is the same trespass PLAY
        // would be. Leaving is never held — it is the only way back to a playable
        // row, and it commands nothing.
        empty || (!deps.rehearsing && (onAir || blocked)),
        () => (item === null ? noop() : deps.toggleRehearse(item.itemId)),
        MonitorPlay,
      ),
      active: deps.rehearsing,
    },
  ];

  actions.push(
    /*
      R-048 (6.9 / 6.9e) — SOURCE: repoint one plate of this row, on air.

      Present only on a row whose template DECLARES plates, and gated on the same
      reachability every AMCP verb is: the swap emits a `PLAY` on a live layer.
      Deliberately NOT gated on `onAir` — patching around a dead feed on an on-air
      graphic is the entire use of it, and a row that is merely loaded may be
      repointed before the take, which is the same act done early.
    */
    ...(deps.hasLivePlates
      ? [
          act(
            'swap-source',
            'SOURCE',
            empty || blocked || needsCaspar,
            () => deps.swapSource(),
            Radio,
            'menu',
            blocked ? RESTORE_BLOCKED_REASON : undefined,
          ),
        ]
      : []),
    /*
      C-015 (6.5f) — AUDIO: raise or mute this row's plates.

      Beside SOURCE, and offered under the same condition. Every live plate starts
      SILENT — the audio rule creates every producer muted — so without this verb
      the raise half of that rule has no surface at all and a guest can never be
      heard. NOT gated on `onAir`: arming a plate's audio BEFORE the take is the
      point, since the alternative is chasing it once the graphic is already up.
    */
    ...(deps.hasLivePlates
      ? [
          act(
            'plate-audio',
            'AUDIO',
            empty || blocked || needsCaspar,
            () => deps.plateAudio(),
            Volume2,
            'menu',
            blocked ? RESTORE_BLOCKED_REASON : undefined,
          ),
        ]
      : []),
    // NEXT — ALWAYS present (the shape never changes), enabled only when the
    // template actually has a step to advance to and the item is on air.
    {
      ...act(
        'next',
        'NEXT',
        empty || !onAir || !deps.hasNext || blocked || needsCaspar,
        () => (item === null ? noop() : deps.next(item.itemId)),
        ArrowRightFromLine,
      ),
      ...(blocked
        ? { title: RESTORE_BLOCKED_REASON }
        : needsCaspar || awaiting
          ? { title: casparVerbReason }
          : {}),
      tone: 'next',
    },
    // UPDATE pushes staged field edits to a LIVE producer. Its primary surface
    // is the Inspector's Apply; on the row it is a menu-placed convenience, so
    // thirty rows do not carry thirty near-duplicate buttons.
    act(
      'update',
      'UPDATE',
      empty || !onAir || !deps.dirty || blocked || needsCaspar,
      () => (item === null ? noop() : deps.update(item.itemId)),
      RefreshCw,
      'menu',
      // UPDATE reaches air: on a row with a resident producer it sends
      // `CG UPDATE` (measured). So it carries the same reason as the rest.
      blocked ? RESTORE_BLOCKED_REASON : needsCaspar ? casparVerbReason : undefined,
    ),
    {
      ...act(
        'stop',
        'STOP',
        // R-021 4.3 — the graceful STOP is offered only where a producer of OURS
        // is resident. A blocked row's observation is emphatically not `html`, so
        // `CG STOP` there would be addressed to another system's producer, and
        // what 2.3.2 does with it is not something to find out on air.
        empty || !onAir || blocked || needsCaspar,
        () => (item === null ? noop() : deps.stop(item.itemId)),
        CircleArrowOutDownRight,
      ),
      ...(blocked
        ? { title: RESTORE_BLOCKED_REASON }
        : needsCaspar || awaiting
          ? { title: casparVerbReason }
          : {}),
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
      /*
        Gated on REACHABILITY, and — the one addition — on `awaiting`. Never on the
        row's STATUS. See above.

        ── WHY THE ESCAPE HATCH IS HELD IN THIS ONE WINDOW ────────────────────

        This is a real narrowing of a deliberately-unguarded verb, so it is argued
        rather than asserted. The doctrine above says refusing CLEAR because the
        STATE MODEL is confused is fail-STUCK, not fail-safe: the status is exactly
        what may be wrong when the operator reaches for it. That still stands, and
        `awaiting` is not that case.

        `awaiting` is not a doubtful status — it is not knowing WHICH COMMAND this
        button is. CLEAR is two different acts behind one word: `stack.out(itemId)`
        on a bound row, which keeps the B-039 producer bookkeeping the item state
        machine depends on, and the bank-scoped `clearLayer()` on an unbound one.
        Enabled here, it would have to guess between them with no itemId to send —
        and guessing `clearLayer` on a row that turns out to be bound clears the
        layer OUT FROM UNDER the item, leaving the stack believing a producer is
        resident that no longer is. That is not an escape hatch, it is a second bug
        reachable by a button.

        The wait is also bounded by the DATA and is short: it ends on the first
        snapshot, a push, or a resolved pull. A graphic genuinely stuck on air is
        stuck for minutes; this window is one bridge round trip, and CLEAR ALL in
        the panel header is not held by it. What is NOT acceptable — and is what the
        precedence order prevents — is this window being confused with a dead
        bridge: `linkDown` reads BRIDGE DISCONNECTED, because that wait is not
        bounded and the operator has somewhere to go.
      */
      disabled: needsCaspar || awaiting,
      ...(needsCaspar || awaiting ? { title: casparVerbReason } : {}),
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
