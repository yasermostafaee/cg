import { z } from 'zod';
import { DurationFramesSchema, HexColorSchema } from './primitives.js';

/**
 * Phase 9 / M12 keyframe-based animation model.
 *
 * Replaces the v1 preset model (entry/loop/exit kinds). Every animatable
 * property carries its own ordered list of keyframes; the runtime
 * interpolates the value between adjacent keyframes at the current
 * playhead frame.
 *
 * Schema invariants enforced via Zod:
 *   - Track.keyframes is non-empty when the property is keyframed.
 *   - Frame indices are integers >= 0.
 *   - Easing is per-keyframe (the value's *outgoing* curve) so adjacent
 *     keyframes can share or differ.
 *
 * The renderer enforces the additional invariant that frames within a
 * track are strictly ascending; Designer's preflight surfaces this.
 *
 * Deep-dive on this model + how it's authored (the timeline dock, the keyframe
 * diamond, the easing-curve editor) and the extension points (add an easing / a
 * new animatable property):
 *   apps/designer/src/renderer/features/timeline/README.md
 * The runtime side — how a track is *evaluated* per frame — lives in
 * packages/template-runtime/README.md.
 */

/** Per-keyframe outgoing easing curve. */
export const EasingSchema = z.enum(['linear', 'step', 'ease-in', 'ease-out', 'ease-in-out']);
export type Easing = z.infer<typeof EasingSchema>;

/**
 * Custom cubic-bézier easing `[x1, y1, x2, y2]` (CSS `cubic-bezier()` form,
 * control points P1/P2 with P0=(0,0), P3=(1,1)). When a keyframe carries this,
 * the runtime eases the outgoing segment through this curve instead of the
 * named `easing`. The two time components (x1, x2) are clamped to [0, 1].
 */
export const BezierEasingSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);
export type BezierEasing = z.infer<typeof BezierEasingSchema>;

/** Named presets → bézier control points (the curve editor's dropdown). */
export const EASING_PRESETS: Record<string, BezierEasing> = {
  linear: [0, 0, 1, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
  sine: [0.45, 0.05, 0.55, 0.95],
};

/**
 * Evaluate a cubic-bézier easing at progress `t ∈ [0,1]`: solve the curve's x
 * for the parameter, then return its y. Newton-Raphson with a bisection
 * fallback — the same approach browsers use for CSS `cubic-bezier()`.
 */
export function cubicBezierEase(p: BezierEasing, t: number): number {
  const [x1, y1, x2, y2] = p;
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (u: number): number => ((ax * u + bx) * u + cx) * u;
  const sampleY = (u: number): number => ((ay * u + by) * u + cy) * u;
  const sampleDX = (u: number): number => (3 * ax * u + 2 * bx) * u + cx;
  let u = t;
  for (let i = 0; i < 8; i++) {
    const x = sampleX(u) - t;
    if (Math.abs(x) < 1e-6) return sampleY(u);
    const d = sampleDX(u);
    if (Math.abs(d) < 1e-6) break;
    u -= x / d;
  }
  let lo = 0;
  let hi = 1;
  u = t;
  for (let i = 0; i < 32 && hi - lo > 1e-7; i++) {
    const x = sampleX(u);
    if (Math.abs(x - t) < 1e-6) break;
    if (t > x) lo = u;
    else hi = u;
    u = (lo + hi) / 2;
  }
  return sampleY(u);
}

/**
 * A single keyframe value. v2.0 keeps the value space narrow:
 *   - `number` for numeric properties (position, size, rotation, opacity, scale)
 *   - hex `#RRGGBB[AA]` for colors
 *
 * Booleans, image assetIds, and select-string values are intentionally
 * excluded — they don't interpolate. Toggles are still possible via
 * step easing on a numeric 0/1 track if the property is exposed that way.
 */
export const KeyframeValueSchema = z.union([z.number(), HexColorSchema]);
export type KeyframeValue = z.infer<typeof KeyframeValueSchema>;

export const KeyframeSchema = z.object({
  /**
   * Stable editor id. Lets the timeline track a point across moves and lets
   * multiple points share the same frame (an instant "step"): the runtime
   * sorts by frame with a stable sort and ignores the id, so two keyframes on
   * one frame produce a jump from the first value to the second. Optional so
   * scenes authored before this field still validate — the Designer assigns
   * ids on load and on create.
   */
  id: z.string().min(1).optional(),
  frame: DurationFramesSchema,
  value: KeyframeValueSchema,
  easing: EasingSchema,
  /**
   * Optional custom cubic-bézier outgoing easing. When present the runtime
   * eases through this curve and ignores `easing` (except `step`, which always
   * snaps). Absent ⇒ use the named `easing` — backward compatible.
   */
  bezier: BezierEasingSchema.optional(),
});
export type Keyframe = z.infer<typeof KeyframeSchema>;

/** One animatable property's keyframe sequence. */
export const TrackSchema = z.object({
  keyframes: z.array(KeyframeSchema).min(1),
});
export type Track = z.infer<typeof TrackSchema>;

/**
 * Animatable property paths. Mirrors the structure the runtime walks
 * to apply interpolated values back to the DOM. Adding a new property
 * is two steps: add it to this enum, teach the runtime's apply-step to
 * write it.
 *
 * v2.0 set chosen to match the Loopic reference: enough for production
 * lower-thirds and tickers without overpromising on per-element-type
 * style fields (text font-size etc. land in v2.1).
 */
export const AnimatablePropertySchema = z.enum([
  // Transform / opacity (M12.0).
  'position.x',
  'position.y',
  'size.w',
  'size.h',
  'scale.x',
  'scale.y',
  'rotation',
  'opacity',
  // Colors (M12.0).
  'fill.color',
  'text.color',
  // D-010 — numeric style properties. Composite styles (shadow,
  // filter) are decomposed into their numeric components; the runtime
  // recomposes the final CSS string each frame from static + animated
  // values.
  'stroke.width',
  'stroke.dash',
  'cornerRadius',
  // D-042 — per-corner border-radius sub-tracks, recomposed into `border-radius`
  // each frame; present only while the element is in per-corner (tuple) mode.
  'cornerRadius.tl',
  'cornerRadius.tr',
  'cornerRadius.br',
  'cornerRadius.bl',
  'shadow.offsetX',
  'shadow.offsetY',
  'shadow.blur',
  // D-043 — the box-shadow spread radius (the CSS 4th length). `shadow.spread` is the
  // shape's box-shadow / text's text-shadow spread carrier; only the box-shadow paths
  // read it (text-shadow ignores spread). `inset` is NOT here — it is not animatable.
  'shadow.spread',
  // D-057 — the text element's BOX shadow (box-shadow), distinct from `shadow.*` (which
  // is the text-shadow for text / box-shadow for shape) so the two animate independently.
  'boxShadow.offsetX',
  'boxShadow.offsetY',
  'boxShadow.blur',
  // D-043 — the text box-shadow spread radius (the CSS 4th length).
  'boxShadow.spread',
  'filter.blur',
  'filter.brightness',
  'filter.contrast',
  'filter.grayscale',
  'filter.hueRotate',
  'filter.invert',
  'filter.opacity',
  'filter.saturate',
  'filter.sepia',
  'font.size',
  'font.lineHeight',
  'font.letterSpacing',
  'padding.top',
  'padding.right',
  'padding.bottom',
  'padding.left',
  // D-010 colour properties.
  'stroke.color',
  'shadow.color',
  'boxShadow.color',
  'backgroundColor',
]);
export type AnimatableProperty = z.infer<typeof AnimatablePropertySchema>;

/**
 * Per-element animation: a partial record of property → Track. A property
 * with no entry means "use the element's static value, no animation."
 */
export const ElementAnimationSchema = z.object({
  tracks: z.record(AnimatablePropertySchema, TrackSchema),
});
export type ElementAnimation = z.infer<typeof ElementAnimationSchema>;

/**
 * Scene-level frame range. The runtime's playhead starts at `in` and
 * loops back to `in` when it reaches `out`. Designer's timeline dock
 * uses this to size the frame ruler.
 */
export const FrameRangeSchema = z.object({
  in: DurationFramesSchema,
  out: DurationFramesSchema,
});
export type FrameRange = z.infer<typeof FrameRangeSchema>;
