import {
  Circle,
  CircleAlert,
  CircleDashed,
  CircleDot,
  CirclePlay,
  CircleQuestionMark,
  LoaderCircle,
  RefreshCw,
  CircleArrowOutDownRight,
  TriangleAlert,
  Unplug,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { FixedSlotObservation } from '@cg/shared-ipc';
import type { StackItemStatus } from '@cg/shared-schema';
import { airStateVisual, badgeTone, colors, type BadgeTone } from '../../theme.js';
import { unverifiedTitle } from '../../ui/airStateWording.js';

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
    case 'loaded':
      return CirclePlay;
    case 'unconfirmed':
      return CircleQuestionMark;
    case 'unverified':
      return CircleQuestionMark;
    case 'error':
      return TriangleAlert;
    case 'disconnected':
      return Unplug;
    case 'idle':
      return Circle;
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
}

export function rowState({
  status,
  pending,
  observed,
  linkDown,
  simulated,
  oscBlind,
}: RowStateInput): RowStateVisual {
  // ── No item of ours on this row: the WIRE is the only witness. ─────────────
  if (status === null) {
    if (linkDown) {
      return {
        icon: Unplug,
        color: colors.offline,
        label: 'NOT CONNECTED',
        tone: 'idle',
        title:
          'The bridge connection is down, so this layer cannot be read at all. ' +
          'Occupancy is unknown — not empty.',
      };
    }
    switch (observed.kind) {
      case 'producer':
        // Something IS on this layer and it is not ours — a producer that
        // outlived a bridge restart, or one another system put there. Loading
        // here would issue an adopt-CLEAR and destroy it, so this reads as
        // attention, never as free space.
        return {
          icon: CircleAlert,
          color: colors.pending,
          label: 'OCCUPIED',
          tone: 'attention',
          title:
            `A ${observed.producer} producer is on this layer and this station does not own it. ` +
            'Loading here would clear it first — check the output before you do.',
        };
      case 'unknown':
        return {
          icon: CircleQuestionMark,
          color: colors.pending,
          label: 'UNKNOWN',
          tone: 'attention',
          title:
            'No signal from CasparCG for this layer, so its occupancy is UNKNOWN — which is ' +
            'not the same as empty. Something may be on air here. Loading is refused until ' +
            'the wire says the layer is free.',
        };
      case 'empty':
        return {
          icon: CircleDashed,
          color: colors.textMuted,
          label: 'EMPTY',
          tone: 'idle',
          title: 'CasparCG reports this layer free. Ready to load.',
        };
    }
  }

  // ── A bound item: its reconciled status is the state. ─────────────────────
  const visual = airStateVisual(status, pending);
  const tone = badgeTone(status, pending);
  const claimsAir = tone === 'onair';
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
    ...(status === 'unverified' ? { title: unverifiedTitle(oscBlind, linkDown) } : {}),
    ...(tone === 'transient' ? { transient: true } : {}),
  };
}
