import type { CSSProperties } from 'react';
import {
  defaultLayerAlias,
  type ChannelRaster,
  type FixedLayerBank,
  type Rehearsal,
  type TemplateLiveSources,
} from '@cg/shared-ipc';
import type { FieldValues, Position } from '@cg/shared-schema';

/**
 * R-022 — the SUBJECTS of a rehearsal render: one per rehearsing row, resolved
 * and ordered here so the panel does no ordering of its own.
 */
export interface RehearsalSubject {
  itemId: string;
  /** The REAL CasparCG layer number. The z-order is derived from THIS. */
  layer: number;
  channel: number;
  /** The row's operator-facing name — its alias, else `Layer <bankPosition>`. */
  rowName: string;
  /** The operator's applied placement override, when the item has one (R-011). */
  position: Position | undefined;
  /** Applied fields with any staged edits layered on. */
  fields: FieldValues;
  /**
   * R-049 — the template's Live Source carrier, when this browser's registry
   * holds one. `undefined` covers BOTH "this template declares none" and "the
   * registry has not answered yet", and the two are treated identically here on
   * purpose: with no declaration there is no rect to draw over, so there is
   * nothing an overlay could honestly say. The three-way distinction that DOES
   * matter — declared / none / unknown — is `liveSourceCarrierState`'s, and it is
   * consumed where a take can be refused, not on a preview surface.
   */
  liveSources: TemplateLiveSources | undefined;
  /**
   * R-049 — `plateId → the APPLIED source's operator-facing NAME`, or `null` for
   * a plate nothing is bound to.
   *
   * Resolved by the panel (which can see the sources store) rather than here, so
   * the stage stays a presentational component. The names are the JOIN the
   * exported page cannot make: it carries a plate identifier and nothing else, and
   * only the Runtime holds the installation's binding for it.
   */
  plateSourceNames: ReadonlyMap<string, string | null>;
  /**
   * 🔴 `B-151` — WHICH LOOK THIS ROW IS SHOWING, as the BRIDGE published it
   * (`StackItemState.activeLookId`), and `undefined` for a row nobody has switched.
   *
   * It is on the subject because BOTH halves of the preview need it and they must not
   * answer it separately: the placeholder overlay resolves its rects from it, and the
   * rehearsal frame tells the page the same id through the `__cg` payload key the plant
   * uses. PVW used to have no idea a look existed, so it drew the union of every look's
   * plates while the page inside it sat on the authored default.
   *
   * ⚠ Deliberately NOT a preview-local look state. Switching the previewed look goes
   * through `stack.set-active-look` like every other switch — which on a rehearsing (off-air)
   * row records the look and sends NOTHING to CasparCG — so one published fact drives the
   * overlay, the page, the row's picker and the look the next take enters.
   */
  activeLookId: string | undefined;
}

/**
 * R-049 — THE ONE EXPRESSION OF THE FIT TRANSFORM, used by every layer that must
 * land on the same pixels: each rehearsal frame's `<iframe>` and the live-plate
 * overlay drawn over the whole stack.
 *
 * It exists because the alternative is a second scale factor derived beside the
 * first, which is precisely how an overlay drifts off the page beneath it — and
 * the drift is invisible on a 16:9 raster, where the geometry inside each page
 * collapses to identity, so it would ship looking correct.
 *
 * Two scales stay apart, and this is only the second of them:
 *   - the AIR scale lives INSIDE each page (reference frame → raster), real placement;
 *   - the FIT scale is THIS (raster → panel), preview only.
 * A box sized to the raster and then scaled by a CSS transform cannot perturb what
 * the document inside measures, which is what keeps them apart.
 */
export function frameBox(raster: ChannelRaster, fit: number): CSSProperties {
  return {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: `${String(raster.width)}px`,
    height: `${String(raster.height)}px`,
    transformOrigin: 'center center',
    transform: `translate(-50%, -50%) scale(${String(fit)})`,
  };
}

/**
 * THE z-ORDER RULE, and the reason it is a named function with a test rather
 * than an inline `.sort()`.
 *
 * On a CasparCG channel the HIGHER layer number draws ON TOP. Two other numbers
 * on this surface look like they say the same thing and both run the OPPOSITE
 * way, so keying off either would invert the composite and look entirely
 * plausible:
 *
 *   - the row's DISPLAY INDEX — the list is sorted DESCENDING by layer, so the
 *     first row is the highest layer, i.e. index 0 is the TOP graphic;
 *   - the ALIAS number — `Layer 1` is `bankPosition` 1, which counts DOWN from
 *     the bank's highest layer, so `Layer 1` is layer 99 and `Layer 5` is 95.
 *
 * The only number that means what it says is the CasparCG layer itself, so that
 * is the only one this reads. Ascending, so the highest layer is rendered last
 * and therefore paints last — and the explicit `zIndex` below says the same
 * thing again, because document order alone is a property a future refactor can
 * quietly change.
 */
export function stackedByLayer(subjects: readonly RehearsalSubject[]): RehearsalSubject[] {
  // `channel` is compared first purely so the order is TOTAL and stable: this
  // bank is one channel today, and if that ever changes, a preview whose frames
  // reshuffled between renders would be worse than one with an arbitrary but
  // fixed inter-channel order.
  return [...subjects].sort((a, b) => a.channel - b.channel || a.layer - b.layer);
}

/**
 * The z-index for a subject at `index` in the {@link stackedByLayer} order.
 *
 * Starts at 1 so every frame sits ABOVE the transparency checker (z-index 0),
 * which is a single backdrop behind the WHOLE stack rather than one per frame —
 * a checker between two frames would read as opaque and hide exactly the alpha
 * it exists to reveal.
 */
export function frameZIndex(index: number): number {
  return index + 1;
}

/**
 * R-049 — the band the live-plate overlay occupies: ABOVE every frame in the
 * composite, whatever its size.
 *
 * Derived from the frame count rather than fixed, because the frames' own band is
 * open-ended — there is deliberately NO CAP on rehearsing rows, so a constant
 * picked today is a constant the fourth frame overtakes. A placeholder that ends
 * up UNDER a graphic is worse than none: it would show for one row and vanish for
 * another with nothing to say why.
 *
 * It is drawn OVER the frames rather than behind them even though the real live
 * layer composites BEHIND the template on air. That is deliberate: the overlay is
 * a MARKER, not a simulation of the composite, and a placeholder peeking through a
 * transparent hole is exactly the "looks like the real picture" reading R-049
 * forbids.
 */
export function overlayZIndex(frameCount: number): number {
  return frameZIndex(frameCount) + 1;
}

/**
 * The caveats disclosure, above the overlay and therefore above everything.
 *
 * It used to be a bare `3`, which was already a tie with the third frame and
 * would have lost to the placeholders outright. A note explaining the surface
 * must never be covered by the surface.
 */
export function caveatsZIndex(frameCount: number): number {
  return overlayZIndex(frameCount) + 1;
}

/** The row's display name: its configured alias, else the bank's default. */
export function rowNameFor(
  bank: FixedLayerBank | null,
  layer: number,
  alias: string | undefined,
): string {
  if (alias !== undefined) return alias;
  if (bank === null) return `Layer ${String(layer)}`;
  return defaultLayerAlias(bank, layer);
}

/**
 * What the panel says it is showing, ALWAYS VISIBLE and never behind a
 * disclosure.
 *
 * Two jobs, and the second is the load-bearing one:
 *
 *   1. it says how many rows are being composited, because a composite that does
 *      not say how many it composites is the same silently-partial surface this
 *      replaced;
 *   2. when `shown < rehearsing` it says SO, in the form "showing N of M". PVW
 *      must never render fewer frames than there are rehearsing rows without
 *      saying it out loud — a quiet drop reproduces exactly the bug being fixed,
 *      and burying the shortfall in the collapsed caveats would be a quiet drop
 *      with extra steps. There is no cap today; this is what a shortfall from
 *      any cause (a page this browser does not hold) has to look like.
 *
 * It also says REHEARSING rather than naming air: on-air rows are deliberately
 * NOT composited here (PGM is the surface for air), so the count and the caption
 * have to agree that this is the rehearsal set and nothing else.
 */
export function rehearsalCaption(shown: number, rehearsing: number): string {
  const noun = rehearsing === 1 ? 'row' : 'rows';
  if (shown < rehearsing) {
    return `Rehearsing ${String(rehearsing)} ${noun} — showing ${String(shown)} of ${String(rehearsing)}`;
  }
  if (rehearsing === 1) return 'Rehearsing 1 row';
  return `Rehearsing ${String(rehearsing)} rows`;
}

/** The rehearsals to render, newest contract first: EVERY one of them. */
export function subjectsFor(
  rehearsals: readonly Rehearsal[],
  resolve: (r: Rehearsal) => RehearsalSubject | null,
): RehearsalSubject[] {
  // NO CAP, and no quiet drop. A row that is rehearsing but absent from the
  // stack has no template and no fields, so it cannot be rendered at all — that
  // is the one exclusion, and it is a genuine impossibility rather than a budget.
  const out: RehearsalSubject[] = [];
  for (const r of rehearsals) {
    const subject = resolve(r);
    if (subject !== null) out.push(subject);
  }
  return stackedByLayer(out);
}
