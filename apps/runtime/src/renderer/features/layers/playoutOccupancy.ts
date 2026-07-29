import type { PlayoutLayerState } from '@cg/shared-ipc';
import { colors } from '../../theme.js';

/**
 * R-028 part B — the PLAYOUT tab's gate, as pure functions.
 *
 * Kept React-free and in its own module because this IS the safety boundary:
 * whether a clear control appears at all is decided here, it must be
 * exhaustively unit-testable without a DOM, and it must be readable in one
 * screen by whoever audits it later.
 *
 * THE RULE, in one sentence: a clear is offered ONLY for a layer whose observed
 * producer kind is exactly `html`, on a live link. Everything else — a video or
 * any other kind, an unverifiable occupancy, a dead link, an empty layer — gets
 * no control, and a sentence saying why.
 *
 * The renderer's gate is the SECOND of two. The bridge refuses the same cases
 * independently (`playoutLayers.clear`), so hiding the control is the courtesy
 * and the bridge is the guarantee. Neither is sufficient alone: a UI-only gate
 * could be bypassed, and a bridge-only gate would leave the operator clicking a
 * button that always fails.
 */

export interface PlayoutOccupancyView {
  /** What is on the layer, in the operator's words. */
  occupant: string;
  /** Why it is (or is not) actionable. */
  detail: string;
  /** May a CLEAR control be offered for this layer? */
  clearable: boolean;
  /** Colour for the occupant line — an accent, never the only signal. */
  tone: string;
}

/**
 * How one declared playout layer reads, and whether it may be cleared.
 *
 * `linkDown` masks everything: with the SPA↔bridge link down the state is a
 * frozen snapshot the wire can no longer back (B-087), so it reads unknown and
 * offers nothing — the same mask the layer rows apply.
 */
export function playoutOccupancy(
  layer: PlayoutLayerState,
  linkDown: boolean,
): PlayoutOccupancyView {
  if (linkDown) {
    return {
      occupant: 'Unknown',
      detail: 'Not connected to the bridge — what is on this layer cannot be checked.',
      clearable: false,
      tone: colors.textMuted,
    };
  }
  if (layer.observed.kind === 'unknown') {
    return {
      occupant: 'Unknown',
      detail:
        'No signal from CasparCG for this layer — occupancy cannot be verified, so it is not treated as empty and cannot be cleared.',
      clearable: false,
      tone: colors.textMuted,
    };
  }
  if (layer.observed.kind === 'empty') {
    return {
      occupant: 'Empty',
      detail: 'Nothing on this layer.',
      clearable: false,
      tone: colors.textMuted,
    };
  }
  const producer = layer.observed.producer;
  if (producer !== 'html') {
    return {
      occupant: `${producer} — not a graphic`,
      detail:
        `This is not an html template (a video, feed or other producer). It cannot be cleared ` +
        `from here: clearing a live video or channel feed is exactly what reserving these ` +
        `layers protects against, even if the playout system put it here by mistake.`,
      clearable: false,
      tone: colors.offline,
    };
  }
  return {
    occupant: 'Graphic on air (html)',
    detail:
      'A playout graphic. Clearing takes it off air immediately — it belongs to the playout system, not to this console.',
    clearable: true,
    tone: colors.onAir,
  };
}

/**
 * The subset a bulk clear may touch: html occupants only, on a live link.
 *
 * Derived from the SAME `playoutOccupancy` the rows render from, so "clear all"
 * can never include a layer whose own row shows no clear control — the bulk
 * action is exactly the union of the individual ones.
 */
export function clearablePlayoutLayers(
  layers: readonly PlayoutLayerState[],
  linkDown: boolean,
): PlayoutLayerState[] {
  return layers.filter((l) => playoutOccupancy(l, linkDown).clearable);
}

/**
 * Is anything at all present on the declared playout layers? Drives the tab's
 * warning dot, so the operator learns there is something to look at without
 * opening it.
 *
 * `unknown` deliberately does NOT raise the dot: the dot means "something is
 * here", and unknown is not that claim — it is the absence of a claim. The tab
 * itself states unknown honestly per layer.
 */
export function hasPlayoutOccupant(layers: readonly PlayoutLayerState[]): boolean {
  return layers.some((l) => l.observed.kind === 'producer');
}

/** Operator wording for a bridge-side refusal of a playout clear. */
export function playoutClearRefusal(reason: string | undefined, observedProducer?: string): string {
  if (reason === 'not-html') {
    const kind =
      observedProducer !== undefined ? `a ${observedProducer} producer` : 'not a graphic';
    return `Refused — that layer carries ${kind}, not an html template. Only playout graphics can be cleared from here.`;
  }
  if (reason === 'unknown-occupancy') {
    return 'Refused — what is on that layer cannot be verified right now, so it was left alone.';
  }
  if (reason === 'already-empty') {
    // The opposite statement from `unknown-occupancy`, and it must read that
    // way: the bridge LOOKED and found nothing, rather than being unable to see.
    return 'That layer is already empty — nothing was sent.';
  }
  if (reason === 'not-reserved') {
    return 'Refused — that layer is not a declared playout layer.';
  }
  if (reason === 'amcp-error') {
    return 'The clear reached CasparCG but failed. The layer may still be on air.';
  }
  return 'Not accepted.';
}
