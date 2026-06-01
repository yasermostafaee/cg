import { z } from 'zod';
import {
  FillSchema,
  FilterSchema,
  HexColorSchema,
  IdSchema,
  OpacitySchema,
  PaddingSchema,
  ShadowSchema,
  StrokeSchema,
  TransformSchema,
  Vec2Schema,
  ZIndexSchema,
} from './primitives.js';
import { ElementAnimationSchema } from './animation.js';

const TextDirectionSchema = z.enum(['auto', 'ltr', 'rtl']);

/** Properties common to every element. */
export const ElementBaseSchema = z.object({
  id: IdSchema,
  name: z.string(),
  transform: TransformSchema,
  opacity: OpacitySchema,
  visible: z.boolean(),
  locked: z.boolean(),
  zIndex: ZIndexSchema,
  animation: ElementAnimationSchema.optional(),
  /**
   * CSS-filter stack (D-010). Optional and applied to every element
   * type by the runtime when present.
   */
  filter: FilterSchema.optional(),
});
export type ElementBase = z.infer<typeof ElementBaseSchema>;

const FontWeightSchema = z
  .number()
  .int()
  .refine((n) => [100, 200, 300, 400, 500, 600, 700, 800, 900].includes(n), {
    message: 'weight must be one of 100..900 in steps of 100',
  });

/** Text element. */
export const TextElementSchema = ElementBaseSchema.extend({
  type: z.literal('text'),
  text: z.string(),
  font: z.object({
    family: z.string().min(1),
    weight: FontWeightSchema,
    style: z.enum(['normal', 'italic']),
    size: z.number().positive(),
    lineHeight: z.number().positive(),
    letterSpacing: z.number(),
  }),
  color: HexColorSchema,
  align: z.enum(['start', 'end', 'center', 'justify']),
  direction: TextDirectionSchema,
  textShadow: ShadowSchema.optional(),
  maxLines: z.number().int().positive().optional(),
  fitMode: z.enum(['fixed', 'shrink-to-fit', 'autosize']),
  overflow: z.enum(['clip', 'ellipsis', 'shrink']),
  /** D-010 — inner padding inside the text box. */
  padding: PaddingSchema.optional(),
  /** D-010 — text-box background colour (defaults to transparent). */
  backgroundColor: HexColorSchema.optional(),
  /** D-010 — text-box border-radius (in pixels). */
  cornerRadius: z.number().nonnegative().optional(),
  /**
   * D-010-pic-5 — when true, the runtime shrinks the font to fit the
   * box (CSS-side; analogous to fitMode === 'shrink-to-fit'). Default
   * false.
   */
  autoSqueeze: z.boolean().optional(),
  /**
   * D-010-pic-5 — true (default) lets text wrap across lines; false
   * keeps it on a single line (CSS `white-space: nowrap`).
   */
  wrap: z.boolean().optional(),
  /** D-010-pic-5 — vertical alignment inside the text box. */
  verticalAlign: z.enum(['top', 'middle', 'bottom']).optional(),
});
export type TextElement = z.infer<typeof TextElementSchema>;

/** Image element. References an asset by id. */
export const ImageElementSchema = ElementBaseSchema.extend({
  type: z.literal('image'),
  assetId: IdSchema,
  fit: z.enum(['contain', 'cover', 'fill', 'none']),
  preserveAspect: z.boolean(),
  tint: HexColorSchema.optional(),
});
export type ImageElement = z.infer<typeof ImageElementSchema>;

/** Shape element. */
export const ShapeElementSchema = ElementBaseSchema.extend({
  type: z.literal('shape'),
  shape: z.enum(['rect', 'rounded-rect', 'ellipse', 'polygon', 'path']),
  fill: FillSchema.optional(),
  stroke: StrokeSchema.optional(),
  cornerRadius: z
    .union([z.number().nonnegative(), z.tuple([z.number(), z.number(), z.number(), z.number()])])
    .optional(),
  pathData: z.string().optional(),
  polygon: z.array(Vec2Schema).optional(),
  /** D-010 — drop shadow on the shape (rendered as box-shadow). */
  shadow: ShadowSchema.optional(),
});
export type ShapeElement = z.infer<typeof ShapeElementSchema>;

/** Lottie animation element. */
export const LottieElementSchema = ElementBaseSchema.extend({
  type: z.literal('lottie'),
  assetId: IdSchema,
  speed: z.number().positive(),
  loopMode: z.enum(['none', 'loop', 'bounce']),
  segment: z.tuple([z.number().nonnegative(), z.number().nonnegative()]).optional(),
  /**
   * Lottie field overrides — typed sub-grammar deferred (Phase 3 §10).
   * For M2, accept arbitrary keys; M8 tightens once lottie-bridge lands.
   */
  fieldOverrides: z.record(z.string(), z.unknown()).optional(),
});
export type LottieElement = z.infer<typeof LottieElementSchema>;

/** Video placeholder. Runtime injects an NDI/SDI source at playout. */
export const VideoPlaceholderElementSchema = ElementBaseSchema.extend({
  type: z.literal('video-placeholder'),
  posterAssetId: IdSchema.optional(),
  expectedAspect: z.number().positive(),
  routeKey: z.string().min(1),
});
export type VideoPlaceholderElement = z.infer<typeof VideoPlaceholderElementSchema>;

/**
 * Element discriminated union. `ContainerElement.children` is recursive, so
 * it's defined via `z.lazy` referencing `ElementSchema` below.
 */
export type Element =
  | TextElement
  | ImageElement
  | ShapeElement
  | LottieElement
  | VideoPlaceholderElement
  | ContainerElement;

export interface ContainerElement extends ElementBase {
  type: 'container';
  clip: boolean;
  children: Element[];
}

export const ContainerElementSchema: z.ZodType<ContainerElement> = z.lazy(() =>
  ElementBaseSchema.extend({
    type: z.literal('container'),
    clip: z.boolean(),
    children: z.array(ElementSchema),
  }),
);

/**
 * Top-level Element schema. Uses `z.union` rather than `z.discriminatedUnion`
 * because the recursive ContainerElementSchema is a `ZodLazy`, which
 * `discriminatedUnion` doesn't accept. Parse perf is fine for scene-graph
 * loads (cold-start path, not hot path).
 */
export const ElementSchema: z.ZodType<Element> = z.lazy(() =>
  z.union([
    TextElementSchema,
    ImageElementSchema,
    ShapeElementSchema,
    LottieElementSchema,
    VideoPlaceholderElementSchema,
    ContainerElementSchema,
  ]),
);
