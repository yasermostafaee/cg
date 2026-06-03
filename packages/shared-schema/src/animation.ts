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
 */

/** Per-keyframe outgoing easing curve. */
export const EasingSchema = z.enum(['linear', 'step', 'ease-in', 'ease-out', 'ease-in-out']);
export type Easing = z.infer<typeof EasingSchema>;

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
  'shadow.offsetX',
  'shadow.offsetY',
  'shadow.blur',
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
