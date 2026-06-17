import { z } from 'zod';
import {
  BoxStyleSchema,
  FillSchema,
  FilterSchema,
  HexColorSchema,
  IdSchema,
  OpacitySchema,
  PaddingSchema,
  ShadowSchema,
  TransformSchema,
  Vec2Schema,
  ZIndexSchema,
} from './primitives.js';
import { ElementAnimationSchema, FrameRangeSchema } from './animation.js';
import { ListItemSchema } from './fields.js';

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
  /** Text drop shadow on the glyphs (rendered as `text-shadow`); `shadow.*` keys. */
  textShadow: ShadowSchema.optional(),
  /**
   * D-057 — box drop shadow on the text BOX (rendered as `box-shadow`, like the shape's
   * `shadow`), independent of `textShadow`. Animated by the distinct `boxShadow.*` keys.
   */
  shadow: ShadowSchema.optional(),
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
}).merge(BoxStyleSchema);
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
  /** Text drop shadow (matches the text element's `textShadow`). */
  textShadow: ShadowSchema.optional(),
  /** Band background colour (defaults to transparent). */
  backgroundColor: HexColorSchema.optional(),
  /** Optional gradient (or solid) band background; overrides `backgroundColor`. */
  backgroundFill: FillSchema.optional(),
  /** Inner padding inside the band. */
  padding: PaddingSchema.optional(),
  /**
   * D-045 — vertical placement of the crawl text within the band height. Default
   * 'middle' preserves the prior hardcoded centring (non-breaking). The ticker has
   * NO horizontal align (it is a crawl). Non-keyframable.
   */
  verticalAlign: z.enum(['top', 'middle', 'bottom']).default('middle'),
  /**
   * READING direction — explicit only (no 'auto': the runtime's auto⇒LTR
   * container fallback is a footgun for a crawl). 'rtl' (Persian default) lays
   * items out right-to-left and the track moves visually left→right, mirroring
   * the English convention; 'ltr' is the exact mirror.
   */
  direction: z.enum(['ltr', 'rtl']),
  /** Crawl speed in px/s. */
  speed: z.number().positive(),
  /**
   * D-028 — the INNER repeat loop: how many crawl passes this ticker runs
   * before signalling completion to its scope's playout ('infinite' = crawl
   * until `stop()`). A finite run always ENDS CLEANLY: the last item fully
   * exits the band before completion fires — never cut mid-scroll. The
   * composition's own `playout.repeat` is the OUTER loop (open/close cycles);
   * each cycle restarts the crawl.
   */
  repeat: z.union([z.number().int().min(1), z.literal('infinite')]).default('infinite'),
  /**
   * D-028 — what the seam between crawl passes looks like: 'seamless' keeps
   * the treadmill continuous (the first item follows the last); 'drain' lets
   * each pass fully EXIT the band before the next re-enters.
   */
  cycleBoundary: z.enum(['seamless', 'drain']).default('seamless'),
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
}).merge(BoxStyleSchema);
export type TickerElement = z.infer<typeof TickerElementSchema>;

/**
 * Countdown target (D-027): a relative duration (counts down in ACTIVE hold
 * time) or an absolute wall-clock deadline (remaining = target − real now; a
 * pause never delays a real deadline).
 */
export const ClockTargetSchema = z.union([
  z.object({ kind: z.literal('duration'), ms: z.number().int().positive() }),
  z.object({
    kind: z.literal('datetime'),
    iso: z.string().datetime({ offset: true, local: true }),
  }),
]);
export type ClockTarget = z.infer<typeof ClockTargetSchema>;

/**
 * Digital clock element (D-027) — renders live time as text through a format
 * string (`HH H hh h mm m ss s A a` tokens + literal characters; the largest
 * unit present absorbs overflow, so `mm:ss` shows `90:00` for 90 minutes).
 * Time-driven like the ticker: a per-element runtime driver repaints it once
 * per second — keyframes/scrubbing never move it. A `countdown` reaching zero
 * signals completion and participates in the scope's
 * `holdSource: 'content-driven'` hold; `wall`/`countup` never complete.
 * Text styling mirrors the ticker's subset.
 */
export const ClockElementSchema = ElementBaseSchema.extend({
  type: z.literal('clock'),
  font: z.object({
    family: z.string().min(1),
    weight: FontWeightSchema,
    style: z.enum(['normal', 'italic']),
    size: z.number().positive(),
    lineHeight: z.number().positive(),
    letterSpacing: z.number(),
  }),
  color: HexColorSchema,
  /** Optional gradient (or solid) text fill; overrides `color` (cf. text). */
  colorFill: FillSchema.optional(),
  textShadow: ShadowSchema.optional(),
  /** Box background colour (defaults to transparent). */
  backgroundColor: HexColorSchema.optional(),
  /** Optional gradient (or solid) box background; overrides `backgroundColor`. */
  backgroundFill: FillSchema.optional(),
  /** Inner padding inside the box. */
  padding: PaddingSchema.optional(),
  /** Horizontal placement of the time text inside the box. */
  align: z.enum(['start', 'center', 'end']).default('center'),
  /**
   * D-045 — vertical placement of the time text inside the box (flex). Default
   * 'middle' preserves the prior hardcoded centring (non-breaking). Non-keyframable.
   */
  verticalAlign: z.enum(['top', 'middle', 'bottom']).default('middle'),
  /**
   * `wall` = current local time; `countup` = stopwatch from zero per hold
   * entry; `countdown` = to `target` (required — see the refinement).
   */
  mode: z.enum(['wall', 'countup', 'countdown']),
  /**
   * Format string. Tokens `HH H hh h mm m ss s A a` (longest-token-first);
   * non-token characters render literally. In count modes `hh`/`h` behave as
   * `HH`/`H` and `A`/`a` render empty (meridiem is wall-only).
   */
  format: z.string().min(1).default('HH:mm:ss'),
  /** Digit script, mapped via @cg/text-shaping AFTER formatting. */
  digits: z.enum(['latin', 'persian', 'arabic-indic']).default('persian'),
  /** Countdown target; ignored by `wall`/`countup`. */
  target: ClockTargetSchema.optional(),
})
  .merge(BoxStyleSchema)
  .superRefine((el, ctx) => {
    if (el.mode === 'countdown' && !el.target) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['target'],
        message: "mode 'countdown' requires a target (duration or datetime)",
      });
    }
  });
export type ClockElement = z.infer<typeof ClockElementSchema>;

/**
 * One authored sequence item (D-029). Stable `id` is the reconcile key (a
 * runtime `update()` with a new list never yanks the CURRENT item
 * mid-display); `dwellMs` overrides the element's `defaultDwellMs` for this
 * item only. (The dynamic `list` FIELD item stays the open, extensible
 * shape — see `fields.ts`; the element stores only what it renders.)
 */
export const SequenceItemSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  dwellMs: z.number().int().positive().optional(),
});
export type SequenceItem = z.infer<typeof SequenceItemSchema>;

/** A transition edge: where an item enters from / exits to. `none` = instant cut. */
const SequenceEdgeSchema = z.enum(['top', 'bottom', 'left', 'right', 'none']);

/**
 * Sequence / now-next element (D-029) — a clipped box that shows ONE item of
 * an ordered list at a time and advances on a per-item timer and/or on
 * command (`CG NEXT` / `runtime.next()`). The move between items is a
 * DECOMPOSED transition: an IN edge, an OUT edge, and a timing
 * (`simultaneous` push vs `sequential` out-then-in), each motion over
 * `transitionMs` — named presets (Push/Slide/Hide-show) are just values over
 * these fields, and the decomposition is the extensible seam for future
 * styles. `repeat` counts full passes; a FINITE sequence is a content
 * source: advancing past the last item of pass N signals completion to the
 * scope's `holdSource: 'content-driven'` hold (alongside finite tickers and
 * countdown clocks). Time-driven: scrubbing never moves it.
 */
export const SequenceElementSchema = ElementBaseSchema.extend({
  type: z.literal('sequence'),
  font: z.object({
    family: z.string().min(1),
    weight: FontWeightSchema,
    style: z.enum(['normal', 'italic']),
    size: z.number().positive(),
    lineHeight: z.number().positive(),
    letterSpacing: z.number(),
  }),
  color: HexColorSchema,
  /** Optional gradient (or solid) text fill; overrides `color` (cf. text). */
  colorFill: FillSchema.optional(),
  textShadow: ShadowSchema.optional(),
  /** Box background colour (defaults to transparent). */
  backgroundColor: HexColorSchema.optional(),
  /** Optional gradient (or solid) box background; overrides `backgroundColor`. */
  backgroundFill: FillSchema.optional(),
  /** Inner padding inside the box. */
  padding: PaddingSchema.optional(),
  /** Horizontal placement of the item text inside the box. */
  align: z.enum(['start', 'center', 'end']).default('start'),
  /**
   * D-045 — vertical placement of the item text inside the box (grid). Default
   * 'middle' preserves the prior hardcoded centring (non-breaking). Non-keyframable.
   */
  verticalAlign: z.enum(['top', 'middle', 'bottom']).default('middle'),
  /**
   * READING direction — drives per-item bidi isolation only. Transition
   * edges are PHYSICAL and never mirrored (the Persian-natural horizontal
   * motion is the …-right presets, matching the crawl convention).
   */
  direction: z.enum(['ltr', 'rtl']),
  /** Authored default items; a bound `list` field replaces them at playout. */
  items: z.array(SequenceItemSchema),
  /** Per-item display time when the item carries no own `dwellMs`. */
  defaultDwellMs: z.number().int().positive().default(5000),
  /** `auto` = dwell timer + next(); `manual` = only next() advances. */
  advance: z.enum(['auto', 'manual']).default('auto'),
  /** Where the incoming item enters from. */
  transitionIn: SequenceEdgeSchema.default('bottom'),
  /** Where the outgoing item exits to. */
  transitionOut: SequenceEdgeSchema.default('top'),
  /**
   * `simultaneous` = push (both motions together); `sequential` = the exit
   * completes before the entry begins (total 2 × transitionMs).
   */
  transitionTiming: z.enum(['simultaneous', 'sequential']).default('simultaneous'),
  /** Duration of EACH motion (ms). */
  transitionMs: z.number().int().positive().default(400),
  /**
   * D-029 — full passes through the list before signalling completion
   * ('infinite' = cycle until stop()). Advancing past the last item of pass
   * N — by timer or next() — completes the run; the LAST item stays on
   * screen.
   */
  repeat: z.union([z.number().int().min(1), z.literal('infinite')]).default('infinite'),
}).merge(BoxStyleSchema);
export type SequenceElement = z.infer<typeof SequenceElementSchema>;

/**
 * Repeater / data-driven layout (D-030) — a clipped box that renders one
 * instance of a referenced child composition PER ROW of a data list, laid
 * out automatically along an axis, each cell scaled to fit the box's cross
 * axis with the child's aspect preserved. The data surface is ONE `list`
 * field (binding target `repeater-items`) whose item keys are the child
 * composition's field ids; the authored `items` are the design-time rows
 * and the Data-key seed. Liveness model B: row VALUES update live mid-hold,
 * the row COUNT is stamped at each fresh `play()`. Every stamped row is a
 * REAL nested scope (own lifecycle, cascade, content-driven hold — the
 * D-025/D-026 machinery) but rows never join the per-instance field
 * NAMESPACES — the single list field is the data surface.
 */
export const RepeaterElementSchema = ElementBaseSchema.extend({
  type: z.literal('repeater'),
  /** The child composition stamped per row (cycle-guarded at author time). */
  compositionId: IdSchema,
  /** Layout axis: cells stack top-to-bottom or along the row axis. */
  direction: z.enum(['column', 'row']).default('column'),
  /** Row-axis order ('rtl' = first row at the right); ignored for column. */
  flow: z.enum(['rtl', 'ltr']).default('rtl'),
  /** Space between cells (px). */
  gap: z.number().min(0).default(8),
  /** Optional stamp clamp — at most this many rows per fresh play. */
  maxItems: z.number().int().positive().optional(),
  /**
   * Authored design-time rows — the open D-028 list-item shape (stable `id`
   * + open fields); row keys are the child composition's field ids.
   */
  items: z.array(ListItemSchema).default([]),
});
export type RepeaterElement = z.infer<typeof RepeaterElementSchema>;

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
  pathData: z.string().optional(),
  polygon: z.array(Vec2Schema).optional(),
  /** D-010 — drop shadow on the shape (rendered as box-shadow). */
  shadow: ShadowSchema.optional(),
}).merge(BoxStyleSchema);
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
  | ClockElement
  | SequenceElement
  | RepeaterElement
  | ImageElement
  | ShapeElement
  | LottieElement
  | VideoPlaceholderElement
  | CompositionElement
  | ContainerElement;

/**
 * The PARSE-INPUT side of the union. The ticker's `repeat`/`cycleBoundary`
 * carry Zod defaults, so stored JSON may omit them while the parsed `Element`
 * always has them — the recursive schemas below must be annotated with both
 * sides or the lazy `z.ZodType` annotation rejects the divergence.
 */
export type ElementInput =
  | TextElement
  | z.input<typeof TickerElementSchema>
  | z.input<typeof ClockElementSchema>
  | z.input<typeof SequenceElementSchema>
  | z.input<typeof RepeaterElementSchema>
  | ImageElement
  | ShapeElement
  | LottieElement
  | VideoPlaceholderElement
  | CompositionElement
  | ContainerElementInput;

export interface ContainerElement extends ElementBase {
  type: 'container';
  clip: boolean;
  children: Element[];
}

export interface ContainerElementInput extends ElementBase {
  type: 'container';
  clip: boolean;
  children: ElementInput[];
}

export const ContainerElementSchema: z.ZodType<
  ContainerElement,
  z.ZodTypeDef,
  ContainerElementInput
> = z.lazy(() =>
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
export const ElementSchema: z.ZodType<Element, z.ZodTypeDef, ElementInput> = z.lazy(() =>
  z.union([
    TextElementSchema,
    TickerElementSchema,
    ClockElementSchema,
    SequenceElementSchema,
    RepeaterElementSchema,
    ImageElementSchema,
    ShapeElementSchema,
    LottieElementSchema,
    VideoPlaceholderElementSchema,
    CompositionElementSchema,
    ContainerElementSchema,
  ]),
);
