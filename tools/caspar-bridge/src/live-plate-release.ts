import type { SourceProducer } from '@cg/shared-ipc';

/**
 * `multibox-layout-switch` `design.md` §12.4 / `tasks.md` 6.5 — **what happens to a live
 * plate that the target LOOK has no rect for.**
 *
 * §12.4 decided **B, held**: the producer stays seated on its band layer, muted and idle,
 * so switching back is instant — a re-`PLAY` costs a fresh producer, and on the plant that
 * is the difference between a cut and a visible re-acquire. The plate stops being VISIBLE
 * because the page stops punching its hole; that is a different mutation on a different
 * machine, and this module is deliberately about the seat alone.
 *
 * ── WHY THE FALLBACK EXISTS, AND WHY IT IS NAMED RATHER THAN IMPLICIT ────────────
 *
 * §12.4's own wording carries the escape: _"a source kind that cannot be held falls back to
 * teardown as a NAMED, observable behaviour"_. Holding assumes the producer is still
 * showing the same thing when you come back, and exactly one producer form in
 * `SourceProducerSchema` breaks that assumption — `media`, described there as _"the one
 * producer that needs no signal"_. A clip has a TIMELINE: held for the length of a debate
 * segment it runs to its end and the layer goes black, so a switch back would restore a
 * FINISHED clip rather than the picture the operator left. There is no pause verb in the
 * seat/fit vocabulary, so the honest answer is to tear it down and re-seat it on return.
 *
 * 🔴 **The decision is a NAMED PREDICATE with the disposition in its return value, not a
 * `kind === 'media'` test written inline at the release site.** Golden rule 6: a predicate's
 * name is part of its contract, and the second local copy is how the name comes to lie. It
 * is also what makes the fallback OBSERVABLE — the reason travels with the disposition, so
 * the runtime can announce "torn down because a clip cannot be held idle" instead of a
 * teardown nobody can distinguish from a bug.
 */

/** What the reconcile does with a plate the target look has no rect for. */
export type LivePlateDisposition = 'held' | 'torn-down';

export interface LivePlateRelease {
  /** The stack item whose plate this is. */
  readonly itemId: string;
  /** The SCENE's handle for the hole (`guest-1`). */
  readonly plateId: string;
  readonly disposition: LivePlateDisposition;
  /** Operator-facing sentence — why this plate was held, or why it could not be. */
  readonly reason: string;
}

/**
 * Can a producer of this form be HELD — left seated, muted and idle — across a look that
 * does not show it?
 *
 * Continuous live inputs (`route`, `decklink`, `ndi`) can: they carry no timeline, so the
 * picture on return is whatever the feed is showing then, which is exactly what it would
 * have been had the plate never left. A `media` clip cannot, for the reason above.
 *
 * ⚠ Written as an EXHAUSTIVE switch rather than `kind !== 'media'` on purpose: a producer
 * form added later gets a compile error here — the one place the question is asked — rather
 * than silently inheriting "holdable" from a negation nobody revisits.
 */
export function canHoldLivePlate(producer: SourceProducer): boolean {
  switch (producer.kind) {
    case 'route':
    case 'decklink':
    case 'ndi':
      return true;
    case 'media':
      return false;
  }
}

/**
 * The disposition for ONE plate the desired set does not contain, with the sentence that
 * explains it.
 *
 * `stillDeclared` is the second axis and it is not the same question as holdability: a
 * plate the template no longer DECLARES (re-imported with fewer sources) is not a plate any
 * more, so there is nothing to hold it for and no look that can bring it back. Holding it
 * would strand a producer on a band layer that nothing will ever reclaim — the ledger would
 * name it forever and the R-009 sweep would not, because it is ours.
 */
export function releaseLivePlate(input: {
  itemId: string;
  plateId: string;
  /** Absent when the template no longer declares this plate at all. */
  producer: SourceProducer | undefined;
  stillDeclared: boolean;
  /**
   * The desired set DID place a rect for this plate; the hole then clipped to nothing,
   * because the row's position override carried it off the frame. A different FACT from
   * plain absence, with the same disposition — held — and its own sentence, because an
   * operator told "this look does not show it" would go looking in the wrong place.
   */
  offFrame?: boolean | undefined;
}): LivePlateRelease {
  const { itemId, plateId } = input;
  if (!input.stillDeclared || input.producer === undefined) {
    return {
      itemId,
      plateId,
      disposition: 'torn-down',
      reason:
        `plate "${plateId}" is no longer declared by this template, so there is no look ` +
        `that can bring it back — its producer was cleared rather than held`,
    };
  }
  if (!canHoldLivePlate(input.producer)) {
    return {
      itemId,
      plateId,
      disposition: 'torn-down',
      reason:
        `plate "${plateId}" is a media clip, which cannot be held idle — a clip held across ` +
        `a look runs to its end and comes back black, so it was cleared and will be ` +
        `re-seated when a look shows it again`,
    };
  }
  if (input.offFrame === true) {
    return {
      itemId,
      plateId,
      disposition: 'held',
      reason:
        `plate "${plateId}" is shown by the active look but its hole is entirely outside the ` +
        `frame — the row's position carried it off — so its producer stays seated, muted and ` +
        `idle rather than being cleared`,
    };
  }
  return {
    itemId,
    plateId,
    disposition: 'held',
    reason:
      `plate "${plateId}" has no rect in the active look — its producer stays seated, muted ` +
      `and idle, so switching back is a cut rather than a re-acquire`,
  };
}
