/**
 * Pure easing-curve geometry — the non-React math behind the keyframe
 * inspector's bézier-handle editor (`EasingEditor.tsx`) and the preset matching
 * the inspector uses. Extracted from the React closures so it can be unit-tested
 * in isolation; the drag interaction itself is covered by the E2E suite.
 *
 * The editor draws a cubic bézier in **curve space** — both axes run 0→1, x is
 * normalized time, y is eased progress — inside a square SVG of side `SIZE` with
 * `PAD` px of margin, leaving a `PLOT = SIZE − 2·PAD` plotting area. Curve→screen
 * flips y because SVG y grows downward while progress grows upward. This module
 * is authoring-only; the runtime that *samples* the curve per frame is
 * `cubicBezierEase` in `@cg/shared-schema`.
 */

import { EASING_PRESETS, type BezierEasing, type Easing } from '@cg/shared-schema';

/** Clamp to the unit interval `[0, 1]` (handle x stays in-range; y may overshoot). */
export function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Curve x ∈ [0,1] → screen x inside the padded plot. */
export function curveToScreenX(x: number, pad: number, plot: number): number {
  return pad + x * plot;
}

/** Curve y ∈ [0,1] → screen y (progress points **up**, so the axis is flipped). */
export function curveToScreenY(y: number, pad: number, plot: number): number {
  return pad + (1 - y) * plot;
}

/** A point in curve space (both axes 0→1, y = eased progress). */
export interface CurvePoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Pointer client position → the curve-space point under it, inverting
 * {@link curveToScreenX}/{@link curveToScreenY}. x is clamped to `[0,1]` (a
 * control point can't precede the start or pass the end in time); y is clamped
 * too here — the editor's number inputs allow y overshoot, but a *dragged*
 * handle stays within the visible plot.
 */
export function screenToCurve(
  clientX: number,
  clientY: number,
  rectLeft: number,
  rectTop: number,
  pad: number,
  plot: number,
): CurvePoint {
  const x = clamp01((clientX - rectLeft - pad) / plot);
  const y = clamp01(1 - (clientY - rectTop - pad) / plot);
  return { x, y };
}

/**
 * The SVG path `d` for a bézier easing `[x1,y1,x2,y2]`: a cubic from (0,0) to
 * (1,1) with the two control points, all mapped to screen space. P0=(0,0) and
 * P3=(1,1) are implicit (CSS `cubic-bezier()` form).
 */
export function bezierPathD(bezier: BezierEasing, pad: number, plot: number): string {
  const [x1, y1, x2, y2] = bezier;
  const sx = (x: number): string => String(curveToScreenX(x, pad, plot));
  const sy = (y: number): string => String(curveToScreenY(y, pad, plot));
  return `M ${sx(0)} ${sy(0)} C ${sx(x1)} ${sy(y1)} ${sx(x2)} ${sy(y2)} ${sx(1)} ${sy(1)}`;
}

/** True if two bézier curves match within `eps` on every component. */
export function bezierApproxEqual(a: BezierEasing, b: BezierEasing, eps = 0.005): boolean {
  return a.every((v, i) => Math.abs(v - (b[i] ?? 0)) < eps);
}

/**
 * The preset key whose curve matches `bezier` (within tolerance), or `'custom'`
 * when none does — drives the editor's preset dropdown selection.
 */
export function presetKeyFor(bezier: BezierEasing): string {
  for (const [key, preset] of Object.entries(EASING_PRESETS)) {
    if (bezierApproxEqual(bezier, preset)) return key;
  }
  return 'custom';
}

/**
 * The bézier to *show* for a keyframe: its custom curve when set, else the
 * preset matching its named `easing` (`step`, which has no smooth curve, falls
 * back to linear). The runtime ignores this display fallback — it snaps `step`
 * and reads the named easing directly.
 */
export function effectiveBezier(easing: Easing, bezier: BezierEasing | undefined): BezierEasing {
  if (bezier !== undefined) return bezier;
  return EASING_PRESETS[easing] ?? EASING_PRESETS.linear ?? [0, 0, 1, 1];
}
