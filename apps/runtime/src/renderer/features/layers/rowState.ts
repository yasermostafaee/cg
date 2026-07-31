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
import type { StackItemStatus } from '@cg/shared-schema';
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

export interface RowStateInput {
  /** The bound item, or null when the row carries nothing of ours. */
  status: StackItemStatus | null;
  pending: boolean;
  /** What the WIRE observes on this layer — the only source for an unbound row. */
  observed: FixedSlotObservation;
  /** The SPA↔bridge link is down: every observation is a claim it cannot back. */
  linkDown: boolean;
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
  status,
  pending,
  observed,
  linkDown,
  simulated,
  oscBlind,
  rehearsing,
}: RowStateInput): RowStateVisual {
  const wire = occupancyLabel(observed, linkDown);

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
  if (status === null) {
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

  // ── A bound item: its reconciled status is the state. ─────────────────────
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

  return {
    icon: iconForStatus(status, pending),
    color: simulated && claimsAir ? colors.pending : visual.color,
    label,
    tone: simulated && claimsAir ? 'attention' : tone,
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
