import type { MixerRect } from './types.js';

/**
 * D-137 / C-015 — what a layer with a `FILL` and a `CLIP` actually puts on the
 * channel: the INTERSECTION of the two rects, or `null` when they do not
 * intersect at all.
 *
 * ── WHY `null` IS THE POINT OF THIS FUNCTION ────────────────────────────────
 *
 * `MIXER CLIP` masks in the same channel-normalized space as `FILL` and does
 * **not** travel with it. Measured on CasparCG 2.5.0 and re-confirmed
 * qualitatively on the plant's 2.3.2: a box placed bottom-right by
 * `FILL 0.5 0.5 0.5 0.5` and then masked top-left by `CLIP 0 0 0.5 0.5`
 * **disappeared entirely — nothing anywhere on the frame.**
 *
 * That disjoint case is not an edge case to round off; it is the ON-AIR FAILURE
 * MODE of this whole feature. The hole in the template is transparent by design,
 * so a live layer rendering nothing looks exactly like a correctly-authored
 * empty region: no error, no operator signal, a black rectangle where a guest
 * should be. A test can only assert "the guest is actually visible" if the mock
 * can say `null`, so `null` is a first-class answer here rather than an empty
 * rect — an empty rect is a rect, and `width: 0` reads as "very small" to a
 * naive assertion.
 *
 * Edge-touching counts as disjoint: two rects sharing only an edge enclose zero
 * area, and zero area is nothing rendered.
 */
export function renderedRect(fill: MixerRect, clip: MixerRect): MixerRect | null {
  const x = Math.max(fill.x, clip.x);
  const y = Math.max(fill.y, clip.y);
  const right = Math.min(fill.x + fill.width, clip.x + clip.width);
  const bottom = Math.min(fill.y + fill.height, clip.y + clip.height);
  if (!(right > x) || !(bottom > y)) return null;
  return { x, y, width: right - x, height: bottom - y };
}
