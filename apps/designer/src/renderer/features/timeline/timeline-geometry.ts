/**
 * Pure timeline-authoring geometry — the non-React, deterministic math behind
 * the dock's **time↔pixel** mapping, the ruler's **tick stride**, the keyframe
 * lane layout (**stacking** + interpolation **segments**), and the **selection**
 * predicate. Extracted from the React event closures in `FrameRuler.tsx`,
 * `TrackRow.tsx` and `TimelineDock.tsx` so it can be unit-tested in isolation;
 * the interactive React layer is covered by the Playwright E2E suite.
 *
 * This is the **authoring** side. The runtime that *evaluates* keyframes per
 * frame (interpolation, easing, the FrameDriver) lives in `@cg/template-runtime`
 * — see its deep-dive — and the bézier solver is `cubicBezierEase` in
 * `@cg/shared-schema`. Don't duplicate that here.
 *
 * Two pixel spaces meet on the timeline:
 *   - **client px** — viewport pixels from a pointer event (`clientX`), measured
 *     against a lane/ruler's `getBoundingClientRect()` (`rectLeft`, `rectWidth`).
 *   - **frame** — the scene's own integer frame index (what the schema stores).
 *     `frame = frameIn + ratio·span`, where `ratio` is the fraction across the
 *     lane and `span = frameOut − frameIn`.
 * Position is expressed as a **percent of span** (`frameToPct`) because the lane
 * and ruler inner wrappers are `width: zoom × 100%`, so a percent left-offset
 * stays correct at every zoom without re-measuring.
 */

import type { AnimatableProperty, Keyframe } from '@cg/shared-schema';

/** Clamp to the unit interval `[0, 1]`. */
export function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * The frame span used by every conversion, floored at 1 so a zero-length range
 * (`frameOut === frameIn`) can't divide by zero — it collapses to "one frame
 * wide" instead of producing `Infinity`/`NaN`.
 */
export function frameSpan(frameIn: number, frameOut: number): number {
  return Math.max(1, frameOut - frameIn);
}

/**
 * Pointer `clientX` → the integer frame under it, given the lane/ruler box's
 * left edge and width. The cross-lane ratio is clamped to `[0, 1]` (dragging
 * past either end pins to `frameIn`/`frameOut`) and the result is rounded to the
 * nearest integer — this rounding *is* the timeline's snap-to-frame. Shared by
 * the ruler scrub and the keyframe drag so both land on identical frames.
 */
export function frameFromClientX(
  clientX: number,
  rectLeft: number,
  rectWidth: number,
  frameIn: number,
  frameOut: number,
): number {
  const span = frameSpan(frameIn, frameOut);
  const ratio = clamp01((clientX - rectLeft) / rectWidth);
  return Math.round(frameIn + ratio * span);
}

/**
 * Frame → its left offset as a **percent of span** (unclamped — a frame outside
 * `[in, out]` returns a percent <0 or >100, which is what tick labels and
 * diamonds want so an off-range point sits off-lane rather than pinned to an
 * edge). Use {@link frameToPctClamped} for draggable markers that must stay in
 * view.
 */
export function frameToPct(frame: number, frameIn: number, frameOut: number): number {
  return ((frame - frameIn) / frameSpan(frameIn, frameOut)) * 100;
}

/** {@link frameToPct} clamped to `[0, 100]` — for markers/overlays that must stay on-lane. */
export function frameToPctClamped(frame: number, frameIn: number, frameOut: number): number {
  return Math.max(0, Math.min(100, frameToPct(frame, frameIn, frameOut)));
}

/**
 * Left/width (percent of span) of the interpolation segment between two adjacent
 * keyframes. `widthPct ≤ 0` means the next point is at or before this one (a
 * stacked pair) — the caller skips drawing the line.
 */
export function segmentPct(
  prevFrame: number,
  nextFrame: number,
  frameIn: number,
  frameOut: number,
): { leftPct: number; widthPct: number } {
  const leftPct = frameToPct(prevFrame, frameIn, frameOut);
  const rightPct = frameToPct(nextFrame, frameIn, frameOut);
  return { leftPct, widthPct: rightPct - leftPct };
}

/**
 * A horizontal drag of `dxPx` client pixels → the signed number of frames it
 * spans, given the lane width and the *total* frame range. Used by the
 * Scene-active-region and out-point marker drags, which move continuously (the
 * store clamps/rounds), so this returns a float, not a snapped integer.
 */
export function deltaFramesFromPx(
  dxPx: number,
  rectWidth: number,
  frameIn: number,
  frameOut: number,
): number {
  const pxPerFrame = rectWidth / frameSpan(frameIn, frameOut);
  return dxPx / pxPerFrame;
}

/** Smallest 1/2/2.5/5×10ⁿ interval at least as large as `raw`. */
function niceStride(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 1) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const step =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return Math.max(1, Math.round(step * magnitude));
}

/**
 * B-416 — choose labelled ticks from actual viewport width and label digits. Unlike the old
 * hard-coded terminal stride of 25, this continues scaling for 1,500/5,000+ frame compositions,
 * so labels retain a minimum readable gap instead of painting hundreds of numbers on each other.
 */
export function pickLabelStride(
  visibleFrames: number,
  viewportWidthPx: number,
  largestFrame: number,
): number {
  const digits = Math.max(1, String(Math.max(0, Math.round(Math.abs(largestFrame)))).length);
  const minimumLabelWidth = Math.max(38, digits * 7 + 14);
  const visibleLabels = Math.max(2, Math.floor(Math.max(1, viewportWidthPx) / minimumLabelWidth));
  return niceStride(Math.max(1, visibleFrames) / visibleLabels);
}

/**
 * Minor grid lines are denser than number labels but never become a solid smear. At maximum zoom
 * (≤40 visible frames) this resolves to one, making every individual frame column visible.
 */
export function pickGridStride(
  visibleFrames: number,
  viewportWidthPx: number,
  labelStride?: number,
): number {
  const visibleLines = Math.max(2, Math.floor(Math.max(1, viewportWidthPx) / 16));
  const desired = niceStride(Math.max(1, visibleFrames) / visibleLines);
  if (labelStride === undefined) return desired;
  // Keep every number on one of the same ruler/body lines. The label ladder is integral, so the
  // nearest divisor at or below the desired minor spacing is deterministic and stays readable.
  for (let divisor = Math.min(desired, labelStride); divisor >= 1; divisor -= 1) {
    if (labelStride % divisor === 0) return divisor;
  }
  return 1;
}

/** The labelled frames from `lo` to `hi` inclusive, every `stride`. */
export function tickFrames(lo: number, hi: number, stride: number): readonly number[] {
  if (hi <= lo) return [lo];
  const out: number[] = [];
  for (let f = lo; f <= hi; f += stride) out.push(f);
  return out;
}

/**
 * The CSS background-gradient period (percent of span) for one tick stride — the
 * same number drives the ruler's own gridlines and the lane body's, so labels
 * sit directly above their line.
 */
export function stridePeriodPct(stride: number, frameIn: number, frameOut: number): number {
  return (stride * 100) / frameSpan(frameIn, frameOut);
}

/**
 * Per-frame stack metadata for a track's keyframes. Keyframes that share a frame
 * are fanned vertically so each stays visible and grabbable; this records how
 * many sit on each frame and each point's slot within its frame's group.
 */
export interface KeyframeStacks {
  /** Frame → how many keyframes sit on it. */
  readonly countByFrame: ReadonlyMap<number, number>;
  /** Keyframe id → its slot index within its frame's stack (ids only; legacy id-less points are omitted). */
  readonly indexById: ReadonlyMap<string, number>;
}

/** Build the {@link KeyframeStacks} for a track's keyframes (in array order). */
export function buildKeyframeStacks(keyframes: readonly Keyframe[]): KeyframeStacks {
  const countByFrame = new Map<number, number>();
  for (const k of keyframes) countByFrame.set(k.frame, (countByFrame.get(k.frame) ?? 0) + 1);
  const indexById = new Map<string, number>();
  const seen = new Map<number, number>();
  for (const k of keyframes) {
    const i = seen.get(k.frame) ?? 0;
    if (k.id !== undefined) indexById.set(k.id, i);
    seen.set(k.frame, i + 1);
  }
  return { countByFrame, indexById };
}

/**
 * Vertical offset (px) for a keyframe at slot `index` of a `count`-high stack,
 * centred on the row: a lone point sits dead-centre (0), a pair straddles it
 * (∓gap/2), and so on. `gap` is the spacing between stacked diamonds.
 */
export function stackOffsetPx(index: number, count: number, gap = 5): number {
  return count > 1 ? (index - (count - 1) / 2) * gap : 0;
}

/** A label row's vertical span (names-column local Y), in visual top→bottom order. */
export interface RowSpan {
  readonly top: number;
  readonly height: number;
}

/**
 * D-047 — the reorder drop position for a pointer at `pointerY` (names-column local
 * Y) over the label rows `rowSpans` (visual top→bottom order). Returns the insertion
 * `gap` ∈ `[0, n]` (0 = above the first row, n = below the last) and the `indicatorY`
 * to draw the drop line at. `gap` counts the rows whose vertical midpoint is at or
 * above the pointer (midpoints increase down the list), so the indicator snaps to the
 * nearer edge of the hovered row.
 */
export function insertionFromPointer(
  rowSpans: readonly RowSpan[],
  pointerY: number,
): { gap: number; indicatorY: number } {
  const n = rowSpans.length;
  let gap = 0;
  for (const span of rowSpans) {
    if (pointerY >= span.top + span.height / 2) gap += 1;
  }
  const last = rowSpans[n - 1];
  const indicatorY =
    gap >= n && last !== undefined
      ? last.top + last.height
      : (rowSpans[gap]?.top ?? rowSpans[0]?.top ?? 0);
  return { gap, indicatorY };
}

/**
 * D-047 — convert an insertion `gap` ∈ `[0, n]` to a move-to target index for the
 * store's `reorderElement`, given the dragged row's `origin` index. Removing the
 * dragged row first shifts the rows below it up by one, so a gap past the origin
 * loses a slot. A target equal to the origin is the caller's no-op signal.
 */
export function dropTargetIndex(gap: number, origin: number): number {
  return gap > origin ? gap - 1 : gap;
}

/** A keyframe pointer — element + property + frame (structural subset of the store's `KeyframeRef`). */
export interface KeyframeRefLike {
  readonly elementId: string;
  readonly property: AnimatableProperty;
  readonly frame: number;
}

/** True if `(elementId, property, frame)` is in the selection set. */
export function isKeyframeSelected(
  selected: readonly KeyframeRefLike[],
  elementId: string,
  property: AnimatableProperty,
  frame: number,
): boolean {
  return selected.some(
    (r) => r.elementId === elementId && r.property === property && r.frame === frame,
  );
}
