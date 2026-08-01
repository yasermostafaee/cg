import {
  CircleDashed,
  CircleDot,
  CirclePlay,
  CircleQuestionMark,
  LoaderCircle,
  MonitorPlay,
  RefreshCw,
  CircleArrowOutDownRight,
  TriangleAlert,
  Unplug,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { FixedSlotObservation } from '@cg/shared-ipc';
import type { StackItemState, StackItemStatus } from '@cg/shared-schema';
import { airStateVisual, badgeTone, colors, readyDetail, type BadgeTone } from '../../theme.js';
import { unverifiedTitle } from '../../ui/airStateWording.js';
import { occupancyLabel } from '../fixedLayers/occupancyLabel.js';

/**
 * THE row's state, as one glanceable triple: ICON + COLOUR + WORD.
 *
 * Why this exists as its own module. The row's verbs went NEUTRAL — a control
 * room's one urgent question, "what is on air", cannot be answered at a glance
 * if every row is already shouting in red and amber from its buttons. So the
 * colour moved out of the affordances and into the state, and the state needs a
 * mark loud enough to carry it alone.
 *
 * COLOUR IS NEVER THE ONLY CHANNEL, in either direction:
 *
 *  - every state pairs a distinct SHAPE with its hue, so a monochrome display or
 *    any form of colour blindness still separates them, and
 *  - every state keeps its WORD. The labels come verbatim from `airStateVisual`
 *    so the Playwright hooks ('ON AIR', 'UPDATING', 'UNCONFIRMED', …) stay
 *    stable, and so an operator never has to decode a glyph to know whether a
 *    graphic is on air.
 *
 * R-022 added REHEARSING to this set, under both halves of the rule above: it has
 * its own SHAPE (a monitor — the only non-circle among the bound-item marks) and
 * its own HUE (violet), and it may never borrow the on-air green, because
 * rehearse is precisely the state in which a graphic CANNOT reach air.
 *
 * `unknown` MUST NOT READ AS `empty` (the B-094 honesty class). They are opposite
 * claims: `empty` says the wire told us the layer is free, `unknown` says the
 * wire told us nothing. Rendering silence as emptiness is how an operator comes
 * to load onto a layer that is carrying somebody's live graphic. So they differ
 * in BOTH channels — a dashed hollow ring in muted grey versus a question mark in
 * caution amber — and never share a shape or a hue.
 *
 * Pure and React-free so every case is unit-testable without a DOM.
 */

export interface RowStateVisual {
  /** The mark. Large, coloured, and paired with the word below/beside it. */
  icon: LucideIcon;
  /** The hue. Reinforcement for the shape, never the signal on its own. */
  color: string;
  /** The word an operator reads, and a test locates. */
  label: string;
  /** The role class, so the state cell can share `controls.css`'s tones. */
  tone: BadgeTone;
  /** Longer explanation for the tooltip — WHY, and what to do about it. */
  title?: string;
  /** True while this state is mid-transition (drives the spin animation). */
  transient?: boolean;
  /**
   * §4 — THIS LABEL IS NOT CURRENTLY BACKED BY THE WIRE.
   *
   * Set for a BOUND row while neither hop can confirm what is on its layer. It is
   * a claim about our CONFIDENCE, never about the state — which is exactly why it
   * is its own field rather than another `tone`: the role stays what it is
   * (`ready` stays `ready`), and only its confidence is withdrawn.
   *
   * Exported as a stable attribute so a test can assert "greyed" without matching
   * a hex value — the same reason `tone` exists rather than a colour assertion
   * (see `LayerRow`'s `data-row-state` note).
   */
  unverifiable?: boolean;
}

/** The mark for a bound item's status. Shape first; the hue reinforces it. */
function iconForStatus(status: StackItemStatus, pending: boolean): LucideIcon {
  switch (status) {
    case 'on-air':
      return CircleDot;
    case 'playing':
      // A take in flight is a TRANSITION, not yet air — a spinner, not the dot.
      return pending ? LoaderCircle : CircleDot;
    case 'updating':
      return RefreshCw;
    case 'exiting':
      return CircleArrowOutDownRight;
    // `loaded` and `idle` are ONE presented state — READY — so they must share the
    // icon as well as the word and the colour. Showing two marks for a difference
    // the operator cannot perceive is the false precision this merge removed; the
    // real difference lives in `readyDetail`, in the tooltip.
    case 'loaded':
    case 'idle':
      return CirclePlay;
    case 'unconfirmed':
      return CircleQuestionMark;
    case 'unverified':
      return CircleQuestionMark;
    case 'error':
      return TriangleAlert;
    case 'disconnected':
      return Unplug;
  }
}

/**
 * WHAT THIS ROW CARRIES — and the reason it is a union rather than a nullable.
 *
 * `rowState` used to take `status: StackItemStatus | null`, and `null` was doing
 * the work of TWO facts that are not the same fact:
 *
 *   - "this row has no template bound"     — ours, known, and EMPTY is honest.
 *   - "we have not received the stack yet" — not a fact about the row at all.
 *
 * The caller collapsed them (`itemById.get(id) ?? null`) before `rowState` ever
 * saw them, so every bound row read EMPTY for the whole bootstrap window and then
 * filled in at once. `useStack()` hands back `[]` until the first snapshot lands,
 * which is documented in `useStack.ts` and is exactly right for rendering a LIST —
 * and wrong for deciding what a row IS.
 *
 * A nullable cannot express the difference, so this is a union: the AWAITING case
 * has to be constructed deliberately, and `unbound` cannot be reached from a
 * missing lookup. Same move as `StackPruneInput`, where `{ ready: false }` carries
 * no ids at all — the guard is the TYPE, not a condition a future caller can
 * forget to pass.
 *
 * Build it with {@link resolveRowBinding} and nowhere else; a second derivation is
 * how the distinction comes back apart.
 *
 * ── THE BOUND CASE CARRIES THE WHOLE ITEM, NOT JUST ITS STATUS ──────────────
 *
 * It carried `status` while only the STATE CELL read the union, and everything
 * else on the row — the verbs above all — went on deriving from a separate
 * `item: StackItemState | null` prop. That left the exact conflation this union
 * exists to abolish alive one layer over: `item === null` is STILL the same value
 * for "unbound" and "awaiting", so a bound row rendered an empty row's verbs for
 * the whole bootstrap window and offered `LOAD` on a row it could not yet see the
 * binding of.
 *
 * Carrying the item makes the second source impossible rather than merely wrong:
 * there is no `item` beside the binding to ask, so a verb's availability CANNOT be
 * computed from a nullable any more. Consumers that want the item take it out of
 * the `bound` arm, which is the only place it exists.
 */
export type RowBinding =
  /** `slot.binding === null` — we have never put anything on this layer. */
  | { kind: 'unbound' }
  /** Bound, but the stack snapshot has not arrived. NOT a claim about the row. */
  | { kind: 'awaiting' }
  | { kind: 'bound'; item: StackItemState };

/**
 * THE one place a slot's binding plus the stack snapshot become a row's state.
 *
 * `stackReady` is a required argument rather than an optional flag precisely
 * because the defect was a caller that never considered it. There is no default:
 * a caller must say whether the snapshot has landed, and saying "yes" while
 * holding an empty list is the only way back to the old behaviour — which is now
 * a visible lie in the call site rather than an invisible `??`.
 */
export function resolveRowBinding(
  slotBinding: { itemId: string } | null,
  item: StackItemState | undefined,
  stackReady: boolean,
): RowBinding {
  if (slotBinding === null) return { kind: 'unbound' };
  if (item !== undefined) return { kind: 'bound', item };
  // Bound, and no item for it. Two causes, and only one of them is knowable:
  // the snapshot has not landed (wait), or it has and the binding names an item
  // the stack does not have (a real inconsistency, which `LayerRow` already
  // renders as an empty row — see its "departed item" test). Once the stack is
  // READY, a missing item is an answer; before that it is silence.
  return stackReady ? { kind: 'unbound' } : { kind: 'awaiting' };
}

export interface RowStateInput {
  /** What this row carries — see {@link RowBinding}. Never a bare nullable. */
  binding: RowBinding;
  pending: boolean;
  /** What the WIRE observes on this layer — the only source for an unbound row. */
  observed: FixedSlotObservation;
  /** The SPA↔bridge link is down: every observation is a claim it cannot back. */
  linkDown: boolean;
  /**
   * §4 — THE SECOND HOP IS KNOWN DOWN, so neither is the wire's account of this
   * layer.
   *
   * KNOWN down, never merely unheard-from: the boot window (`connecting`) must NOT
   * arrive here, or every reload would flash the grey and the past tense on a row
   * that is perfectly on air. The gate on the VERBS fails closed on unknown
   * because refusing costs a second; a LABEL that fails closed on unknown lies
   * twice a day, and a label nobody believes is worse than none.
   */
  casparUnreachable: boolean;
  /** Test mode: an air claim may be simulated, and must never wear the real red. */
  simulated: boolean;
  /** B-093 — this `unverified` came from a blind occupancy tap, not a dead link. */
  oscBlind: boolean;
  /**
   * R-022 — this row is in REHEARSE: the graphic renders locally in PVW and PLAY
   * to air is interlocked off. Bridge-owned, so it is the same for every browser.
   */
  rehearsing: boolean;
}

/**
 * Compose a state's tooltip so it ALWAYS ends with what the wire says about the
 * layer.
 *
 * This is not decoration — it closes a hole this redesign opened. The wire's
 * observation is its own column ("Description"), and that column is the FIRST to
 * drop as the panel narrows (the review fixed that drop order). For an UNBOUND row
 * the state mark still carries the observation, because there is nothing else it
 * could be showing. For a BOUND row it does not: the mark shows the ITEM's status,
 * so once the column dropped, "what does CasparCG actually report about layer 70?"
 * became unavailable anywhere on a 1280px screen — and that question is the whole
 * point of the B-094 honesty rules (`unknown` is not `empty`; a producer names its
 * kind). Folding it into the tooltip keeps the drop order the review asked for AND
 * keeps the fact one hover or one keyboard focus away at every density.
 *
 * The canonical `occupancyLabel` wording is reused verbatim — never re-worded here
 * — so the column and the tooltip cannot come to say different things about the
 * same layer.
 */
function withWire(explanation: string | undefined, wire: string): string {
  return explanation === undefined
    ? `CasparCG reports: ${wire}.`
    : `${explanation} CasparCG reports: ${wire}.`;
}

export function rowState({
  binding,
  pending,
  observed,
  linkDown,
  casparUnreachable,
  simulated,
  oscBlind,
  rehearsing,
}: RowStateInput): RowStateVisual {
  const wire = occupancyLabel(observed, linkDown);
  /**
   * §4 — NOTHING ABOUT A BOUND ROW'S LAYER IS CONFIRMABLE RIGHT NOW.
   *
   * Both hops produce it, because it is one fact: the wire cannot back what this
   * row says. It drives the GREY and nothing else — no label is renamed by it (the
   * one rename, ON AIR → WAS ON AIR, comes from the item's own `unverified`
   * status, and is deliberately NOT generalised).
   */
  const unverifiable = linkDown || casparUnreachable;

  // ── NO TEMPLATE BOUND TO THIS ROW: it is EMPTY. Always. ─────────────────
  //
  // We have never put anything on that layer, so there is nothing to ask
  // CasparCG about — and a question mark carrying no information is not caution,
  // it is noise. The owner saw four of eight rows reading UNKNOWN, all four
  // empty, while the ONE row that genuinely warranted attention carried its own
  // WAS ON AIR label and was lost among them. An `unknown` that is always on is
  // how a real `unknown` stops being read.
  //
  // THERE IS NO CONDITION UNDER WHICH AN UNBOUND ROW SAYS ANYTHING ELSE — not
  // while disconnected, not during startup, not while a snapshot settles. There
  // is deliberately NO readiness qualifier: readiness would matter if we were
  // reading a snapshot for these rows, and we do not read one at all.
  //
  // B-094 IS NOT WEAKENED. Its rule is that `unknown` must never read as `empty`
  // for a layer we have reason to ask about — it forbids FORGETTING something we
  // knew, not saying "nothing here" when we genuinely have nothing. The word goes
  // on doing its work below for a row that IS bound and cannot be confirmed,
  // which is the only place it was ever earning its keep.
  if (binding.kind === 'unbound') {
    return {
      icon: CircleDashed,
      // The dedicated empty-row grey, not `textMuted`: a free row recedes so the
      // rows carrying something own the attention.
      color: colors.emptyRow,
      label: 'EMPTY',
      tone: 'idle',
      title:
        'Nothing is loaded on this row. LOAD binds a template to it; PLAY puts that ' +
        'template on the CasparCG layer.',
    };
  }

  /**
   * ── BOUND, BUT THE STACK SNAPSHOT HAS NOT ARRIVED ───────────────────────
   *
   * The row exists and carries something; we do not yet know WHAT. This is the
   * third state the nullable could not express, and it is the operator's reported
   * bug: every bound row read EMPTY for the bootstrap window and then filled in
   * at once, so the rundown looked wiped on every startup and every reconnect.
   *
   * IT MUST NOT READ AS EMPTY, and it differs from EMPTY in all three channels
   * this module insists on — a different SHAPE (a spinner, not a dashed ring), a
   * different WORD, and a brighter ink where EMPTY deliberately recedes. It also
   * MOVES, which nothing at rest on this table does. A faint placeholder here
   * would undo the whole fix while looking tidier.
   *
   * `transient` is the honest tone: this is a transition, and it ends when the
   * DATA arrives — `ready` latches on the first snapshot, a push, or a resolved
   * pull. Never on a timer. A timer would either uncover a row too early or hold a
   * real one back, and both are worse than the wait.
   */
  if (binding.kind === 'awaiting') {
    return {
      icon: LoaderCircle,
      color: colors.textMuted,
      label: 'LOADING',
      tone: 'idle',
      transient: true,
      title:
        'This row has a template bound, but the stack has not arrived from the bridge yet. ' +
        'It fills in as soon as the bridge answers — this is not an empty row.',
    };
  }

  // ── A bound item: its reconciled status is the state. ─────────────────────
  const status = binding.item.status;
  const visual = airStateVisual(status, pending);
  const tone = badgeTone(status, pending);
  const claimsAir = tone === 'onair';

  /**
   * R-022 — REHEARSING, a state beside on air / ready / empty / error / unknown.
   *
   * DELIBERATELY AFTER `claimsAir` IS COMPUTED, AND SUBORDINATE TO IT. If a row
   * somehow claims air while we believe it is rehearsing, the AIR claim wins the
   * display — the operator's one urgent question is "what is on air", and a
   * rehearse badge over a live graphic would answer it wrongly. The bridge
   * withdraws the rehearse claim within one sweep in that case (it treats going
   * live by any route as evidence that our claim was wrong), so this branch is
   * the honest reading for the interval in between, not a permanent override.
   *
   * `transient` is also excluded: a take in flight is a transition toward air.
   */
  if (rehearsing && !claimsAir && tone !== 'transient') {
    return {
      // A MONITOR, unique among this module's circles — shape carries the state
      // before colour does, and "playing on a monitor, not on air" is exactly what
      // rehearse is.
      icon: MonitorPlay,
      color: colors.rehearsing,
      // ON PVW — the same words as the verb that turns it on, so the button and
      // the state it produces read as one thing.
      label: 'ON PVW',
      // `idle` and not `attention`: rehearse is a deliberate, safe operator choice,
      // not something to go and look at. Amber here would cry wolf.
      tone: 'idle',
      /*
        SHORT ON PURPOSE. This was six lines covering the interlock, the mute, the
        pixel-fidelity caveat and the Live Source placeholder — a paragraph on a
        hover, which an operator under time pressure does not read, and which
        pushed the wire's own report (the part `withWire` appends, and the reason
        this tooltip exists at all) off the bottom.

        The two facts that belong on a ROW are what is true of the LAYER: it is on
        preview, and it cannot reach air. The fidelity caveats are about the
        PICTURE, so they live where the picture is — the PVW panel's own caveats
        strip, which R-022's acceptance already requires and which is one click
        away. Saying them twice made the row's version the one nobody finished.
      */
      title: withWire(
        'On PVW: rendering in PREVIEW inside this browser. PLAY to air is refused while it is, ' +
          'and the layer is held ready and muted.',
        wire,
      ),
    };
  }
  // B-093 — the blind-tap `unverified` is an open QUESTION, not a past tense: the
  // link is up and the graphic is probably still burning on PGM.
  const baseLabel = status === 'unverified' && oscBlind ? 'ON AIR?' : visual.label;
  // R-006 — in TEST MODE an air claim is badged SIM in the attention tone. The
  // mock may simulate; it may not wear the red that means a real server
  // confirmed a graphic is on air.
  const label = simulated && claimsAir ? `SIM ${baseLabel}` : baseLabel;

  /**
   * READY STAYS READY, AND IS ONLY GREYED — the owner's decision, and the reason
   * for it is a fact about the product rather than a preference about words.
   *
   * «was ready مناسب نیست و همون ready بمونه بهتره، چون برای تمپلیتی که در حالت
   * قطعی اضافه می‌کنیم بی‌معنیه، فقط رنگش خاکستری بشه.»
   *
   * A row can be BOUND while CasparCG is unreachable — building the rundown with
   * the playout machine off is the normal case, not an edge one — and such a row
   * was never ready in the PAST. It is ready NOW: the binding is ours, it is a
   * fact about our list, and it survives the link. What we cannot currently back
   * is the acting on it, so the word stands and only the confidence goes.
   *
   * That is why this is a COLOUR change and not a `tone` change: the role is still
   * `ready`, and `data-row-state` goes on saying so.
   */
  const greyed = unverifiable && tone === 'ready';

  return {
    icon: iconForStatus(status, pending),
    color: greyed ? colors.textMuted : simulated && claimsAir ? colors.pending : visual.color,
    label,
    tone: simulated && claimsAir ? 'attention' : tone,
    ...(unverifiable ? { unverifiable: true } : {}),
    // ALWAYS a title on a bound row too, and this is the case that needed it: the
    // mark shows the ITEM's status, so without this the wire's own account of the
    // layer had nowhere to live once the Description column dropped.
    //
    // `readyDetail` is the second thing folded in here: `idle` and `loaded` both
    // render as READY now, and the difference between them — whether PLAY has to
    // build the producer first, which takes time and can fail — is what stops a
    // slow take reading as a bug.
    title: withWire(
      status === 'unverified' ? unverifiedTitle(oscBlind, linkDown) : readyDetail(status),
      wire,
    ),
    ...(tone === 'transient' ? { transient: true } : {}),
  };
}
