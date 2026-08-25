import { z } from 'zod';

/**
 * ⭐ **`C-028` — HOW A LIVE PICTURE IS PLACED IN ITS BOX. The ONE computation, which
 * the bridge's `MIXER FILL`/`CLIP` and the template's mask hole both read.**
 *
 * ── THE CLIENT'S DECISION (2026-08-23, relayed by the owner) ────────────────
 *
 * **The picture must not be cut.** A live input keeps its own aspect, is centred on
 * BOTH axes inside its box, and the leftover margin on the short axis shows **the
 * template's own background, never black**. The box's shape is no longer
 * authoritative for the picture. Centre-crop survives as a selectable mode.
 *
 * The owner accepted the consequence in advance: a stroke or frame authored tight
 * around a box **no longer hugs the picture** when the source aspect differs. That is
 * a trade the client made, not a defect to engineer away.
 *
 * ── 🔴 WHY THIS IS ONE FUNCTION IN THIS PACKAGE ─────────────────────────────
 *
 * Two implementations that must agree is the defect, not the design — golden rule 7's
 * shape, one machine apart. `B-149` is the precedent that makes it concrete: the
 * arrangement mask punched every hole at the AUTHORED size while the picture went
 * somewhere else, opening the live layer where no box existed. On-air crosstalk,
 * fixed 2026-08-19. This item re-opens the exact coupling B-149 closed, so it is
 * built with that failure in view: ONE function, two callers, no second spelling.
 *
 * It lives in `@cg/shared-schema` for the reason `live-geometry.ts`'s own header
 * already gives for `liveSourceFit`: **this is the one package the page, the bridge
 * and `@cg/vcg-format` all already depend on.** `tools/caspar-bridge` can import it
 * and so can `@cg/template-runtime`; neither can import the other.
 *
 * ── 🔴 THE MEASURED PREMISE — CASPARCG STRETCHES ────────────────────────────
 *
 * Measured on the plant 2026-08-25, production 2.5.0 `69e8ad5`
 * (`docs/recon/2026-08-25-decklink-model-walk.md` Q3). A `1080i5000` (16:9) input into
 * a channel set to `SET 1 MODE PAL` (720×576, 4:3), with `MIXER 1-10 FILL 0.25 0.25
 * 0.5 0.5`, filled the box **edge to edge on both axes** — measured 415 px tall against
 * the **291 px** a letterboxing producer would have given. The two hypotheses are
 * 124 px apart; it is not a close call.
 *
 * ⇒ **CasparCG applies NO aspect correction of its own.** The correction here is
 * REQUIRED and does **not** double-count. Do not "simplify" it away on the reasoning
 * that the producer must surely handle its own aspect — that reasoning was tested on
 * the hardware and is false.
 */

/** How a picture whose aspect differs from its box is placed in it. */
export const LIVE_FIT_MODES = ['contain', 'cover'] as const;
export const LiveFitModeSchema = z.enum(LIVE_FIT_MODES);
export type LiveFitMode = z.infer<typeof LiveFitModeSchema>;

/**
 * `C-028` — the DEFAULT, and it is `contain` rather than today's `cover`.
 *
 * ⚠ **This changes what an existing template puts on air** for any plate whose source
 * aspect is both KNOWN and DIFFERENT from its box. Where nothing states an aspect, or
 * where the two already agree, nothing changes at all. Permitted under `P-031`'s
 * compatibility floor (nothing has shipped to a client), and named in the change's
 * proposal as an on-air behaviour change rather than left to be discovered.
 */
export const DEFAULT_LIVE_FIT_MODE: LiveFitMode = 'contain';

/** A plain axis-aligned rect, in whatever square-pixel space the caller is working in. */
export interface FitRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Where the picture lands, and what of it is SEEN. Always produced together.
 *
 * 🔴 **They are DIFFERENT rects, and that is why this returns a pair rather than "the
 * fitted rect".** The two consumers do not want the same thing:
 *
 * ```
 *              picture (MIXER FILL)      visible (MIXER CLIP, the mask hole)
 *   contain    ⊆ the box                 = picture
 *   cover      ⊇ the box                 = the box
 * ```
 *
 * `visible` is `picture ∩ box` in BOTH modes, which is what makes one function honest
 * for both. A "fitted rect" alone would be right under `contain` and WRONG under
 * `cover`, where the picture deliberately exceeds the box and the hole must stay at
 * the box — punching the overflow would open the live layer outside the box the author
 * drew, which is `B-149` exactly.
 */
export interface FittedPicture {
  /**
   * The whole picture, at its own aspect. EXCEEDS the box on one axis under `cover`;
   * this is `MIXER FILL`, which is deliberately allowed to be oversized because the
   * clip is what decides what is seen.
   */
  readonly picture: FitRect;
  /**
   * What is actually SEEN: `picture ∩ box`. The template's mask hole and the bridge's
   * `MIXER CLIP` are both this rect.
   *
   * 🔴 **Punching the hole HERE rather than at the box is the half of `C-028` that
   * reaches air.** Under `contain` the picture covers only part of the box; a hole at
   * the BOX rect would leave the margin a transparent hole with no picture behind it,
   * showing the channel behind the CG layer — BLACK, which is exactly what the client
   * rejected. The feature would deliver the opposite of its own requirement. Punching
   * at the fitted rect makes the template's own background fill the margin for free:
   * no new compositing, no second layer, no extra command.
   */
  readonly visible: FitRect;
}

/**
 * **Fit a picture of a given aspect into a box.** Pure, total, and the ONE place this
 * arithmetic exists.
 *
 * `sourceAspect` is the picture's display aspect (width ÷ height), or `null` when
 * NOTHING in the chain states one — see `resolvePlateAspect`'s `D-147` decision. `null`
 * means **NO FIT**: the picture is drawn into the box exactly, stretched, which is
 * today's behaviour for an undescribed source and is unchanged by `C-028`. A fit is
 * impossible without a known aspect, so there is nothing to choose between the modes.
 *
 * ⚠ **`=== null`, never a truthiness test.** An aspect of `0` is not a legal aspect but
 * IS falsy; reading it as "no aspect stated" would silently stretch where the caller
 * can see nothing wrong. A non-positive aspect is treated the same as `null` — there is
 * no rect it could describe — but the `null` test is written separately because the two
 * are different facts.
 *
 * ── THE SPACE THIS IS COMPUTED IN, AND WHY EITHER SIDE MAY CHOOSE ITS OWN ───
 *
 * 🔴 The bridge fits in RASTER pixels and the page fits in SCENE pixels, and they
 * agree. That is not luck: scene → raster is `pad + s·(t + x)` with a SINGLE uniform
 * `s` (`outputScale` is a `min`, never a per-axis pair), i.e. a similarity transform,
 * and an aspect-preserving fit COMMUTES with one. Both spaces have square pixels, so
 * `width / height` means the same thing in each.
 *
 * ⚠ This is the assumption the whole two-consumer design rests on, so it is pinned by
 * a test that fits-then-maps and maps-then-fits and compares — not left to be re-derived
 * by the next reader. If `outputScale` ever became per-axis, that test is what fails.
 */
export function fitPictureToBox(
  box: FitRect,
  sourceAspect: number | null,
  mode: LiveFitMode,
): FittedPicture {
  if (sourceAspect === null || sourceAspect <= 0 || box.width <= 0 || box.height <= 0) {
    // NO FIT — the picture is the box, and all of it is seen. Identical objects rather
    // than one shared reference so a caller mutating one cannot surprise the other.
    return { picture: { ...box }, visible: { ...box } };
  }

  // The source's natural box is `aspect × 1`. `k` is the scale at which it meets the
  // box: the LARGER of the two required ratios covers, the SMALLER contains.
  //
  // `cover` is `max` and `contain` is `min`, and that one word is the entire difference
  // between the two modes. Everything else — the centring, the intersection, the null
  // case — is shared, which is what stops the modes drifting into two implementations.
  const ratios = [box.width / sourceAspect, box.height];
  const k = mode === 'cover' ? Math.max(...ratios) : Math.min(...ratios);
  const width = k * sourceAspect;
  const height = k;
  const picture: FitRect = {
    // Centred on BOTH axes. Under `cover` that makes the crop take evenly from both
    // edges — an off-centre crop would cut one side of a face and not the other. Under
    // `contain` it is what the client asked for in so many words.
    x: box.x + (box.width - width) / 2,
    y: box.y + (box.height - height) / 2,
    width,
    height,
  };
  return { picture, visible: intersect(picture, box) };
}

/**
 * `a ∩ b`, clamped to a non-negative extent.
 *
 * The empty case is unreachable from {@link fitPictureToBox} — the fitted rect is
 * CENTRED on its box, so under `contain` it lies inside it and under `cover` it
 * contains it, and either way they overlap on both axes. The clamp is written anyway,
 * and written as a `Math.max` rather than a guard clause, so the function is total
 * without carrying a branch no test can reach: a negative width reaching the one value
 * that feeds both a mask hole and a `MIXER CLIP` is not a failure worth leaving
 * representable to save two characters.
 */
function intersect(a: FitRect, b: FitRect): FitRect {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}
