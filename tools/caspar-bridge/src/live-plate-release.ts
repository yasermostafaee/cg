import type { SourceProducer } from '@cg/shared-ipc';
import type { NormalizedRect } from './live-layers.js';

/**
 * `multibox-layout-switch` `design.md` §12.4 / `tasks.md` 6.5 — **what happens to a live
 * plate that the target LOOK has no rect for.**
 *
 * §12.4 decided **B, held**: the producer stays seated on its band layer, muted and idle,
 * so switching back is instant — a re-`PLAY` costs a fresh producer, and on the plant that
 * is the difference between a cut and a visible re-acquire.
 *
 * 🔴 **CORRECTED BY `B-154`.** This header used to finish _"the plate stops being VISIBLE
 * because the page stops punching its hole; that is a different mutation on a different
 * machine, and this module is deliberately about the seat alone."_ The first clause is true
 * about the plate's OWN cell and false about the frame — the page's holes are transparent to
 * the WHOLE band, so a held producer still rendering shows through any hole the active look
 * punches over it. Seat and punch remain separate mutations; what changed is that the SEAT
 * has a visibility of its own and the hold must say so on the wire. See {@link parkedFit}.
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

/**
 * 🔴 **`B-154` — THE GEOMETRY A HELD SEAT IS GIVEN, so that "not shown" means RENDERS
 * NOTHING and not merely "the page stopped punching its hole".**
 *
 * ── THE DEFECT THIS EXISTS TO CLOSE ─────────────────────────────────────────
 *
 * §12.4's hold used to mute the plate and stop there, resting on the sentence at the top of
 * this file: _"the plate stops being VISIBLE because the page stops punching its hole"_.
 * That sentence is true about the plate's OWN cell and false about the frame. CasparCG
 * composites the whole band bottom-up and the page's hole is transparent to **all of it**,
 * not to one layer — so a held producer still rendering into its old cell shows through
 * **any** hole the ACTIVE look punches over that cell. Six-box → solo is the case in the
 * shipped fixture: one full-frame hole over five held plates, and the operator saw the five
 * feeds they had just left, tiled inside the solo box.
 *
 * Seat and punch are separate mutations (that decision stands). What was missing is that
 * the SEAT has a visibility of its own, and holding it has to say so on the wire.
 *
 * ── WHY THE FILL MOVES AND THE CLIP DOES NOT ────────────────────────────────
 *
 * The pair could be made to render nothing from either end, and the choice is decided by
 * what a HALF-APPLIED pair does. `mixerFit` emits `FILL` then `CLIP` on one connection, and
 * either can be refused:
 *
 * - **Move the FILL off the raster, leave the CLIP at the full frame** (this). The fill box
 *   is outside the visible raster, so it renders nothing on FILL alone — and a refused
 *   `CLIP` after an acked `FILL` therefore still renders nothing, because an off-raster box
 *   cannot intersect any mask window inside the raster. **The partial send is safe by
 *   construction.**
 * - **Leave the FILL, move the CLIP away.** A refused `CLIP` leaves the layer exactly as it
 *   was — still rendering its old cell, i.e. the defect. And no in-raster rectangle is
 *   disjoint from a FULL-FRAME fill at all, so that spelling cannot even be total: a plate
 *   held after a solo look has nowhere to put the mask.
 *
 * ⚠ **What is measured and what is inferred.** That a fill box moved out from under its clip
 * window renders nothing at all IS measured (design.md §3's last row, on 2.5.0 and
 * re-confirmed on the plant's 2.3.2, quoted on `CommandBuilder.mixerFit`). That `MIXER FILL`
 * accepts an origin outside `0..1` — an ordinary transform, and the basis of every
 * animate-in — is NOT separately measured on the plant. It is filed for the hardware
 * session rather than assumed silently.
 */
export const PARKED_FILL_ORIGIN = 2;

/** The full raster: the identity mask, and what a parked seat's `CLIP` is set to. */
const FULL_FRAME_CLIP: NormalizedRect = { x: 0, y: 0, width: 1, height: 1 };

/**
 * The fit for a seat the active look does not punch — see {@link PARKED_FILL_ORIGIN}.
 *
 * The box KEEPS ITS SIZE and only its origin moves, so the parked record still says how
 * big the plate was and a reader can tell a parked seat from a corrupted one.
 */
export function parkedFit(size: { width: number; height: number }): {
  fill: NormalizedRect;
  clip: NormalizedRect;
} {
  return {
    fill: {
      x: PARKED_FILL_ORIGIN,
      y: PARKED_FILL_ORIGIN,
      width: size.width,
      height: size.height,
    },
    clip: FULL_FRAME_CLIP,
  };
}

/**
 * Is this fit the parked one — i.e. is the seat already rendering nothing?
 *
 * 🔴 **A GEOMETRY TEST, DELIBERATELY, AND NOT `record.held`.** `held` latches the MUTE and
 * under-claims when a `MIXER VOLUME` is refused, so a plate can be `held: false` with its
 * fill already parked; keying the re-send off it would re-emit the park on every reconcile
 * for such a plate. The two facts are separately observable and are therefore separately
 * latched.
 *
 * It cannot false-positive on a real fit: a hole placed two full rasters out is entirely
 * outside the frame, so `liveSourceFitFor` answers `clip: null` and `#planLiveSeating` seats
 * no producer for it at all. An off-frame plate never reaches a fill.
 */
export function isParkedFit(fill: NormalizedRect): boolean {
  return fill.x === PARKED_FILL_ORIGIN && fill.y === PARKED_FILL_ORIGIN;
}

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
  if (!input.stillDeclared) {
    return {
      itemId,
      plateId,
      disposition: 'torn-down',
      reason:
        `plate "${plateId}" is no longer declared by this template, so there is no look ` +
        `that can bring it back — its producer was cleared rather than held`,
    };
  }
  if (input.producer === undefined) {
    /*
      🔴 STILL DECLARED, BUT WE CANNOT SAY WHAT IS BEHIND IT — so we do the harmless thing.

      Holdability is a property of the producer FORM, and an unresolvable assignment leaves
      that unknown. Reading "unknown" as "tear it down" would destroy a working picture over
      a missing fact — and the fact is routinely missing for perfectly healthy reasons (a
      live action resolves only the plates going on screen). Holding costs a band layer and
      is reversible; a teardown is not.
    */
    return {
      itemId,
      plateId,
      disposition: 'held',
      reason:
        `plate "${plateId}" is not shown by the active look and its source could not be ` +
        `resolved, so its producer was held rather than cleared — an unknown source form is ` +
        `not a reason to destroy a picture that is working`,
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
