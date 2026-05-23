import { z } from 'zod';

/**
 * Stable, opaque identifier. ULID convention — 26 base32 chars — but the
 * schema only enforces non-emptiness; consumers should mint via ULID.
 */
export const IdSchema = z.string().min(1);
export type Id = z.infer<typeof IdSchema>;

/**
 * Hex color. `#RRGGBB` or `#RRGGBBAA`. Case-insensitive at parse time;
 * the value is preserved verbatim (no normalization here).
 */
export const HexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/, 'Invalid hex color');
export type HexColor = z.infer<typeof HexColorSchema>;

/** Project frame rates supported in v1. */
export const FrameRateSchema = z.union([
  z.literal(25),
  z.literal(29.97),
  z.literal(50),
  z.literal(59.94),
  z.literal(60),
]);
export type FrameRate = z.infer<typeof FrameRateSchema>;

/**
 * Duration in frames. Frame-locked timing — see Phase 4 §6. Non-negative.
 */
export const DurationFramesSchema = z.number().int().nonnegative();
export type DurationFrames = z.infer<typeof DurationFramesSchema>;

/** ISO-8601 timestamp. */
export const ISODateSchema = z.string().datetime({ message: 'Expected ISO-8601 datetime' });
export type ISODate = z.infer<typeof ISODateSchema>;

/** 2D vector. */
export const Vec2Schema = z.object({
  x: z.number(),
  y: z.number(),
});
export type Vec2 = z.infer<typeof Vec2Schema>;

/** 2D size. */
export const SizeSchema = z.object({
  w: z.number(),
  h: z.number(),
});
export type Size = z.infer<typeof SizeSchema>;

/** Resolution in pixels. */
export const ResolutionSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type Resolution = z.infer<typeof ResolutionSchema>;

/**
 * Transform applied to an element. Position is top-left in scene coords;
 * anchor is normalized 0..1 in local space (0.5, 0.5 = center).
 */
export const TransformSchema = z.object({
  position: Vec2Schema,
  size: SizeSchema,
  scale: Vec2Schema,
  rotation: z.number(),
  anchor: Vec2Schema,
  skew: Vec2Schema.optional(),
});
export type Transform = z.infer<typeof TransformSchema>;

/** Drop-shadow on text or shapes. */
export const ShadowSchema = z.object({
  offsetX: z.number(),
  offsetY: z.number(),
  blur: z.number().nonnegative(),
  color: HexColorSchema,
});
export type Shadow = z.infer<typeof ShadowSchema>;

const GradientStopSchema = z.object({
  at: z.number().min(0).max(1),
  color: HexColorSchema,
});

/** Fill: solid, linear gradient, or radial gradient. */
export const FillSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('solid'), color: HexColorSchema }),
  z.object({
    kind: z.literal('linear'),
    stops: z.array(GradientStopSchema).min(2),
    angle: z.number(),
  }),
  z.object({
    kind: z.literal('radial'),
    stops: z.array(GradientStopSchema).min(2),
    center: Vec2Schema,
    radius: z.number().positive(),
  }),
]);
export type Fill = z.infer<typeof FillSchema>;

/** Stroke. Dash pattern is the SVG-style array. */
export const StrokeSchema = z.object({
  width: z.number().nonnegative(),
  color: HexColorSchema,
  dash: z.array(z.number().nonnegative()).optional(),
});
export type Stroke = z.infer<typeof StrokeSchema>;

/** Opacity is 0..1 inclusive. */
export const OpacitySchema = z.number().min(0).max(1);

/** Z-index is a finite integer; negative is allowed (below siblings). */
export const ZIndexSchema = z.number().int();
