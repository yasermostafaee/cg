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
import { ElementAnimationSchema, FrameRangeSchema } from './animation.js';

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
  /**
   * Optional per-element active range in scene frames. Inclusive on
   * both ends. When the playhead is outside `[in, out]` the runtime
   * hides the element (display: none). Absent means the element is
   * active for the full scene `frameRange` — the operator only sets
   * this once they want the element to enter / leave mid-scene.
   */
  lifespan: FrameRangeSchema.optional(),
  /**
   * Operator-chosen colour for this element's timeline lifespan bar
   * (set via the layer right-click → Color menu). Absent means the
   * timeline falls back to its deterministic per-id colour.
   */
  timelineColor: HexColorSchema.optional(),
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
  /**
   * Optional gradient (or solid) text fill. When present it overrides `color`
   * at render time: a gradient is painted through `background-clip: text`
   * (which consumes the element's `background`, so it supersedes
   * `backgroundFill` on the same element); a solid behaves like `color`. Absent
   * ⇒ use the plain `color` (backward compatible).
   */
  colorFill: FillSchema.optional(),
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
  /**
   * Optional gradient (or solid) text-box background. When present it
   * overrides `backgroundColor` at render time (a normal CSS `background`, so
   * linear/radial both render). Absent ⇒ use `backgroundColor`.
   */
  backgroundFill: FillSchema.optional(),
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

/**
 * One authored ticker item. Stable `id` is the reconcile key: a runtime
 * `update()` with a new list keeps/moves/retires items by id, so text edits
 * never restart the crawl. (The dynamic `list` FIELD item is the open,
 * extensible shape — see `fields.ts`; the element stores only what it renders.)
 */
export const TickerItemSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
});
export type TickerItem = z.infer<typeof TickerItemSchema>;

/**
 * Ticker / crawler element (D-028) — a clipped horizontal band that scrolls
 * its items continuously. Geometry comes from the base `transform` (the band
 * is the box; the runtime clips it). The scroll duration is content-driven:
 * measured content width ÷ `speed`, supplied per pass to the composition's
 * `content-driven` playout mode — never authored as a duration.
 */
export const TickerElementSchema = ElementBaseSchema.extend({
  type: z.literal('ticker'),
  font: z.object({
    family: z.string().min(1),
    weight: FontWeightSchema,
    style: z.enum(['normal', 'italic']),
    size: z.number().positive(),
    lineHeight: z.number().positive(),
    letterSpacing: z.number(),
  }),
  color: HexColorSchema,
  /** Band background colour (defaults to transparent). */
  backgroundColor: HexColorSchema.optional(),
  /** Optional gradient (or solid) band background; overrides `backgroundColor`. */
  backgroundFill: FillSchema.optional(),
  /** Band border-radius (px). */
  cornerRadius: z.number().nonnegative().optional(),
  /** Inner padding inside the band (items are vertically centred within). */
  padding: PaddingSchema.optional(),
  /**
   * READING direction — explicit only (no 'auto': the runtime's auto⇒LTR
   * container fallback is a footgun for a crawl). 'rtl' (Persian default) lays
   * items out right-to-left and the track moves visually left→right, mirroring
   * the English convention; 'ltr' is the exact mirror.
   */
  direction: z.enum(['ltr', 'rtl']),
  /** Crawl speed in px/s. */
  speed: z.number().positive(),
  /** Horizontal gap between items (px). */
  gap: z.number().nonnegative(),
  /**
   * Optional separator rendered between items as its own bidi-neutral span
   * (e.g. ' • '). Never concatenated into item text — keeps reconcile and
   * bidi isolation per item intact.
   */
  separator: z.string().optional(),
  /** Authored default items; a bound `list` field replaces them at playout. */
  items: z.array(TickerItemSchema),
});
export type TickerElement = z.infer<typeof TickerElementSchema>;

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
 * Composition instance — a reference to another composition (by id) placed as
 * a layer. The referenced composition's own layers are NOT copied in; the
 * runtime resolves and renders them nested at playout (a pre-comp instance).
 * Cycles are prevented at author time (you can't place a composition inside one
 * of its own descendants).
 */
export const CompositionElementSchema = ElementBaseSchema.extend({
  type: z.literal('composition'),
  compositionId: IdSchema,
});
export type CompositionElement = z.infer<typeof CompositionElementSchema>;

/**
 * Element discriminated union. `ContainerElement.children` is recursive, so
 * it's defined via `z.lazy` referencing `ElementSchema` below.
 */
export type Element =
  | TextElement
  | TickerElement
  | ImageElement
  | ShapeElement
  | LottieElement
  | VideoPlaceholderElement
  | CompositionElement
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
    TickerElementSchema,
    ImageElementSchema,
    ShapeElementSchema,
    LottieElementSchema,
    VideoPlaceholderElementSchema,
    CompositionElementSchema,
    ContainerElementSchema,
  ]),
);
