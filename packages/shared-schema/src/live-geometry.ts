import {
  outputLetterbox,
  outputScale,
  outputTranslate,
  type Position,
  type Raster,
} from './scene.js';
import { DEFAULT_LIVE_FIT_MODE, fitPictureToBox, type LiveFitMode } from './live-fit.js';
import type { LiveSourceRect } from './live-source.js';

/**
 * C-015 phase 6 (tasks 6.2 / 6.3 / 6.4) — **scene pixels → the `MIXER FILL` and
 * `MIXER CLIP` rects for one Live Source plate.**
 *
 * ── WHY THIS IS IN `@cg/shared-schema` AND NOT IN THE BRIDGE ────────────────
 *
 * The derivation RUNS bridge-side — that decision is design.md §6's and is
 * unchanged: only the bridge holds the channel raster, the operator's override and
 * the item, and only it can resolve them at take time. What lives here is the pure
 * ARITHMETIC it runs, for the same reason `outputTranslate` and friends moved here
 * in 6.2a: this is the one package the page, the bridge and `@cg/vcg-format` all
 * already depend on.
 *
 * That placement is what makes 6.2b's contract test possible at all. The test has
 * to compare THIS computation against the PAGE's composed CSS transform, and it can
 * only import both if neither lives in a package the other cannot see. Had this
 * function sat in `tools/caspar-bridge`, the test would have had to re-implement one
 * side — which is precisely the second spelling both guards exist to prevent.
 *
 * ── THE CHAIN, AND THE FORM THAT MUST NOT BE USED ──────────────────────────
 *
 * ```
 * s   = outputScale(raster)                    // ONE uniform min(), the page's
 * pad = outputLetterbox(raster)                // centring for a non-16:9 raster
 * T   = outputTranslate(scene, position)       // the anchor translate
 *
 * X = pad.x + s*(T.x + rect.x)   W = s*rect.width
 * Y = pad.y + s*(T.y + rect.y)   H = s*rect.height
 *
 * FILL = [ X/raster.w, Y/raster.h, W/raster.w, H/raster.h ]   ← PER AXIS
 * ```
 *
 * 🔴 **`rect.x / scene.resolution.width` IS WRONG AND MUST NOT BE USED.** That naive
 * form — which C-015's own original wording used — omits `s`, `pad` AND the anchor
 * translate. Worked example from design.md §6: a 960×540 scene, centred, on a
 * 1440×1080 channel, hole at x=100 gives `0.302083` through the chain and
 * `100/960 = 0.104` through the naive form. **Wrong by a fifth of the frame width** —
 * far enough that the live picture is not merely misaligned, it is somewhere else.
 *
 * 🔴 **PER-AXIS normalization is the measured basis** (design.md §0b fact 1,
 * confirmed on the plant's 2.3.2), and it is the term most likely to be "corrected"
 * to a uniform fraction by someone reading the page's uniform `outputScale` beside
 * it. The page scales uniformly and LETTERBOXES; `MIXER FILL` normalizes per axis
 * and STRETCHES. They agree only on a 16:9 raster — which is the whole reason the
 * contract test requires a non-16:9 case, and why this chain reproduces the page's
 * transform exactly rather than approximating it.
 */

/**
 * A rect in CHANNEL-NORMALIZED space — each component a fraction of the channel
 * raster ON ITS OWN AXIS. Structurally identical to the bridge ledger's
 * `NormalizedRect`, and deliberately declared here too: this package cannot import
 * from `tools/`, and the alternative (the bridge's type leaking into the schema
 * package) is the dependency inversion 6.2a just removed.
 */
export interface NormalizedRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** What the plate's placement is derived from. Every term is required. */
export interface LiveSourceFitInput {
  /** The hole, flattened to SCENE pixels through its full ancestor chain. */
  readonly rect: LiveSourceRect;
  /** The scene's own pixel raster — the space `rect` is expressed in. */
  readonly sceneResolution: { readonly width: number; readonly height: number };
  /** The CHANNEL's real output geometry. */
  readonly raster: Raster;
  /**
   * The RESOLVED position — the tail of the same three-step chain the page runs
   * (`operator override ?? carried defaultPosition ?? centred`). Resolved by the
   * CALLER, because only the bridge holds the override; passing an already-resolved
   * value keeps this function total.
   */
  readonly position: Position;
  /**
   * The source's display aspect (width ÷ height), or `null` when NOTHING in the
   * chain states one.
   *
   * `null` means NO CROP — the picture is drawn into the hole exactly, which is
   * today's stretch behaviour. It is the caller's job to decide whether `null` is
   * even reachable (tasks.md 6.3 / D-147); this function only says what the
   * geometry is once that decision is made.
   */
  readonly sourceAspect: number | null;
  /**
   * `C-028` — how the picture is placed in the hole: `contain` (the default — the whole
   * picture, centred, margins showing the template) or `cover` (scale to cover and
   * centre-crop).
   *
   * Optional, defaulting to {@link DEFAULT_LIVE_FIT_MODE}, so a caller that has not
   * learned about modes gets the shipped default rather than a compile error — and
   * `undefined` can never be read as `cover` by accident, which is the way this would
   * silently keep the old behaviour while looking implemented.
   *
   * RESOLVED by the caller, exactly as `position` is: the chain is the operator's
   * per-assignment override → the element's authored value → `contain`, and only the
   * bridge holds the override.
   */
  readonly fitMode?: LiveFitMode | undefined;
}

/** The two rects, always produced together — see `CommandBuilder.mixerFit`. */
export interface LiveSourceFit {
  /** Where the producer's picture is drawn. Oversized on one axis when cropping. */
  readonly fill: NormalizedRect;
  /**
   * The mask. The hole, INTERSECTED with the scene rect (6.4).
   *
   * `null` when the hole lies entirely outside the scene rect: the intersection is
   * empty, so there is nothing to show, and that is a first-class answer rather than
   * a zero-area rect. Zero area reads as "very small" to a naive consumer, and this
   * is the case where the correct behaviour is to seat no producer at all.
   */
  readonly clip: NormalizedRect | null;
}

/**
 * The hole in RASTER pixels, before any aspect fit — the chain's core, factored out
 * so the fit and the clamp read against the same numbers.
 */
function holeInRaster(input: LiveSourceFitInput): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const s = outputScale(input.raster);
  const pad = outputLetterbox(input.raster);
  const t = outputTranslate({ resolution: input.sceneResolution }, input.position);
  return {
    x: pad.x + s * (t.x + input.rect.x),
    y: pad.y + s * (t.y + input.rect.y),
    width: s * input.rect.width,
    height: s * input.rect.height,
  };
}

/**
 * C-015 phase 6 — **the placement of one Live Source plate: `FILL` and `CLIP`, from
 * ONE computation.**
 *
 * Returns both because they are not independent: `CLIP` masks in the same
 * channel-normalized space as `FILL` and does not travel with it, so a fill box that
 * moves out from under its clip window renders NOTHING AT ALL (measured, design.md
 * §3). `CommandBuilder.mixerFit` takes exactly this shape and emits both.
 *
 * ── ⭐ THE FIT (6.3, as REVERSED by `C-028`) — AND WHAT CHANGED THE ANSWER ──
 *
 * This function used to argue AGAINST the behaviour it now implements, and the old
 * text is quoted here rather than deleted because its reasoning was not wrong — it was
 * ANSWERED, and the next reader deserves to see which premise moved:
 *
 * > _"Pillarbox was weighed and REJECTED: a multi-box guest window is a designed
 * > graphic element, not a video player viewport, and black bars inside a frame the
 * > designer drew do not read as 'the source is 4:3', they read as a fault on air."_
 *
 * 🔴 **THE PREMISE THAT MOVED: THE MARGIN IS NOT BLACK.** That argument rests entirely
 * on the bars being BLACK, and they were — because the mask hole was punched at the
 * BOX, so the margin was a transparent hole with the channel showing through it. Under
 * `C-028` the hole is punched at the FITTED rect ({@link fitPictureToBox}'s `visible`),
 * so the margin is **the template's own background**: the designed graphic, continuing
 * across the space the picture does not fill. There is no bar to read as a fault.
 *
 * With that premise gone the objection has nothing left to stand on, and the client's
 * decision (2026-08-23, via the owner) governs: **the picture must not be cut.**
 * `contain` is the default; the old crop-to-fill survives verbatim as `cover`, for the
 * shots where losing the edges is the accepted cost. The choice is the AUTHOR's, and
 * the operator's to revise.
 *
 * The arithmetic is NOT here. It is {@link fitPictureToBox}, which the template's mask
 * hole reads too — two implementations that must agree is the defect, not the design.
 *
 * ── THE CLAMP (6.4), and why it lands on the CLIP and not on the FILL ──────
 *
 * `.cg-stage` has `overflow: hidden`, so a hole partly outside the scene rect is
 * clipped ON THE TEMPLATE LAYER — but the live source behind it is on its own layer
 * and would not be. So the visible region is intersected with the scene rect.
 *
 * 🔴 It is the **CLIP** that is intersected, and the **FILL is left alone**, and that
 * split is the whole correctness of it. The clip is the mask — it is what decides
 * what is SEEN — so intersecting it is what actually stops the picture spilling.
 * Shrinking the FILL instead would re-scale the picture to a box the author never
 * drew, squashing a face to fit the visible sliver; the task name says "clamp the
 * FILL" and means "clamp what the fill SHOWS". The template's own frame graphic
 * behaves identically: drawn at full size, clipped by the stage.
 */
export function liveSourceFit(input: LiveSourceFitInput): LiveSourceFit {
  const raster = input.raster;
  const hole = holeInRaster(input);

  // ── the fit, in raster px: THE ONE COMPUTATION (`C-028`) ──────────────────
  //
  // `picture` is where the whole picture is drawn — the FILL, oversized under `cover`.
  // `visible` is what is SEEN — `picture ∩ hole`, which is the picture itself under
  // `contain` and the hole itself under `cover`. The template's mask punches `visible`
  // through this same function, in scene px; see `fitPictureToBox` for why the two
  // spaces agree.
  const fitted = fitPictureToBox(hole, input.sourceAspect, input.fitMode ?? DEFAULT_LIVE_FIT_MODE);

  // ── the mask: what is VISIBLE ∩ the scene rect, both in raster px ──────────
  //
  // 🔴 `fitted.visible`, NOT the hole. Under `cover` they are the same rect and this is
  // byte-identical to what shipped; under `contain` the clip shrinks to the picture,
  // which is what stops the margin being a transparent hole onto the channel.
  const s = outputScale(raster);
  const pad = outputLetterbox(raster);
  const t = outputTranslate({ resolution: input.sceneResolution }, input.position);
  const stage = {
    x: pad.x + s * t.x,
    y: pad.y + s * t.y,
    width: s * input.sceneResolution.width,
    height: s * input.sceneResolution.height,
  };
  const seen = fitted.visible;
  const left = Math.max(seen.x, stage.x);
  const top = Math.max(seen.y, stage.y);
  const right = Math.min(seen.x + seen.width, stage.x + stage.width);
  const bottom = Math.min(seen.y + seen.height, stage.y + stage.height);

  return {
    fill: normalize(fitted.picture, raster),
    // Strictly greater-than on BOTH axes. A hole touching the scene edge exactly
    // produces a zero-width intersection, which shows nothing — reported as `null`
    // (nothing to seat) rather than as a rect of width 0, which a naive reader would
    // treat as "a very thin box" and emit.
    clip:
      right > left && bottom > top
        ? normalize({ x: left, y: top, width: right - left, height: bottom - top }, raster)
        : null,
  };
}

/**
 * Raster px → channel-normalized, PER AXIS (the measured basis).
 *
 * Not a uniform divisor: `x`/`width` go against the raster's WIDTH and `y`/`height`
 * against its HEIGHT. On a 16:9 raster the two divisors happen to preserve the
 * on-screen aspect, which is why a wrong implementation survives a 16:9-only test.
 */
function normalize(
  r: { x: number; y: number; width: number; height: number },
  raster: Raster,
): NormalizedRect {
  return {
    x: r.x / raster.width,
    y: r.y / raster.height,
    width: r.width / raster.width,
    height: r.height / raster.height,
  };
}

/**
 * Where a SCENE-pixel point lands on the channel raster, under the same transform
 * the page composes.
 *
 * Exported for 6.2b's contract test and for nothing else in production: it is the
 * one function whose answer both sides can be asked for directly, so the test can
 * compare a POINT rather than trying to invert a CSS matrix into a rect. Kept beside
 * the chain it belongs to so it cannot drift from it.
 */
export function scenePointOnRaster(
  point: { x: number; y: number },
  input: Pick<LiveSourceFitInput, 'sceneResolution' | 'raster' | 'position'>,
): { x: number; y: number } {
  const s = outputScale(input.raster);
  const pad = outputLetterbox(input.raster);
  const t = outputTranslate({ resolution: input.sceneResolution }, input.position);
  return { x: pad.x + s * (t.x + point.x), y: pad.y + s * (t.y + point.y) };
}
