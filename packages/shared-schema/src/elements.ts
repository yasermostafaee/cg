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
  StrokeSchema,
  TransformSchema,
  Vec2Schema,
  ZIndexSchema,
} from './primitives.js';
import { ElementAnimationSchema, FrameRangeSchema } from './animation.js';
import { AnchorPointSchema, type AnchorPoint } from './path-points.js';
import { FieldDigitsSchema, ListItemSchema, type FieldDigits } from './fields.js';
import { LiveFitModeSchema } from './live-fit.js';
import {
  ChangeTransitionSchema,
  ElementChangeSchema,
  refineChangeList,
} from './element-changes.js';
import { AfterZeroSchema } from './countdown.js';

const TextDirectionSchema = z.enum(['auto', 'ltr', 'rtl']);

/**
 * D-141 — a zone KEY: the free-form name a zoned countdown broadcasts down its
 * composition subtree and an element overrides against. Deliberately NOT an enum:
 * the contract is a NAME MATCH and a mismatch is INERT at runtime (the element
 * renders its authored style — never an error, never a fallback colour), so the
 * schema has no safety reason to restrict the vocabulary. The Designer's picker
 * (`normal`/`caution`/`warning`/`critical` plus a Custom escape) is an authoring
 * affordance over this still-free-form field, never a validation boundary: a
 * scene carrying a custom key stays valid, parses, and renders.
 */
export const ZoneKeySchema = z.string().min(1);
export type ZoneKey = z.infer<typeof ZoneKeySchema>;

/**
 * D-141 — one slot of a per-zone override: an explicit colour, or the literal
 * `'zone'` meaning "take the ACTIVE ZONE's own colour". `'zone'` is the ergonomic
 * default — the common case ("in the danger zone I take the danger colour") is one
 * word, and a later palette change on the countdown reaches every follower without
 * walking the elements that opted in.
 */
export const ZoneColorSchema = z.union([HexColorSchema, z.literal('zone')]);
export type ZoneColor = z.infer<typeof ZoneColorSchema>;

/**
 * D-141 — one element's colour override for ONE zone. The four slots are exactly
 * the minimum colourable set (text colour, background colour, shape fill, shape
 * stroke) and map 1:1 onto the properties the existing `color` BINDING target
 * already writes — reusing that map is what keeps a rectangle recolouring
 * identically whether a zone or an operator's colour field drove it. A slot the
 * element's KIND does not own is INERT, never an error (the same stance `filter`
 * takes). At least one slot must be set: an override that sets nothing is a
 * typo, not a no-op worth storing.
 */
export const ZoneOverrideSchema = z
  .object({
    zone: ZoneKeySchema,
    textColor: ZoneColorSchema.optional(),
    backgroundColor: ZoneColorSchema.optional(),
    fill: ZoneColorSchema.optional(),
    stroke: ZoneColorSchema.optional(),
  })
  .superRefine((o, ctx) => {
    if (
      o.textColor === undefined &&
      o.backgroundColor === undefined &&
      o.fill === undefined &&
      o.stroke === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'a zone override must set at least one colour slot',
      });
    }
  });
export type ZoneOverride = z.infer<typeof ZoneOverrideSchema>;

/**
 * D-141 — one element's per-zone override LIST. Zone keys are unique within an
 * element: two overrides naming one zone have no defined winner.
 *
 * The uniqueness refinement lives on the ARRAY rather than on
 * {@link ElementBaseSchema}, because that schema must stay a plain `ZodObject` —
 * every element kind `.extend()`s (and most `.merge()`) it, and a `superRefine`
 * there would turn it into a `ZodEffects` and break all of them. Per-array is
 * per-element anyway, so the check is identical in effect.
 */
export const ZoneOverridesSchema = z.array(ZoneOverrideSchema).superRefine((list, ctx) => {
  const seen = new Set<string>();
  list.forEach((o, i) => {
    if (seen.has(o.zone)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [i, 'zone'],
        message: `duplicate zone override for key '${o.zone}'`,
      });
    }
    seen.add(o.zone);
  });
});

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
   * 🔴 D4 (`multibox-layout-switch` §13.7.2) — hide this element while an ARRANGEMENT
   * TRANSITION is running, so the move does not look messy.
   *
   * Authored beside the ELEMENT rather than on the arrangement, because the distinction
   * being authored is a property of the element: a box title should leave during the move,
   * while a logo inside the multi-box must not blink on every switch. An arrangement-level
   * flag would force one answer for everything the arrangement contains.
   *
   * ⚠ **This is the THIRD input to {@link resolveVisibility} and is read NOWHERE ELSE.**
   * A local `if (el.hideDuringTransition)` at a point of use looks obviously correct in
   * isolation and is the breach `visibility.ts` exists to prevent. Absent ⇒ `false`, so
   * every scene authored before this field resolves exactly as it did.
   *
   * 🔴 **PARKED (2026-08-19 — LOOKS adopted, `design.md` §14.4).** v1's look switch is a
   * CUT, and a cut has no transition window, so this flag has NOTHING TO GATE: no shipped
   * code path ever sets a transition active. It stays because deleting it would re-cost
   * the D4 decision when the window returns; it is parked EXPLICITLY so it is not the next
   * written-but-unreachable field (`B-147`'s class). **What un-parks it:** an ANIMATED
   * look-switch mode — the phase that gives `resolveVisibility`'s transition input a
   * window at all. Until then, do not surface it in new UI and do not read it anywhere
   * but `resolveVisibility`.
   */
  hideDuringTransition: z.boolean().optional(),
  /**
   * Operator-chosen colour for this element's timeline lifespan bar
   * (set via the layer right-click → Color menu). Absent means the
   * timeline falls back to its deterministic per-id colour.
   */
  timelineColor: HexColorSchema.optional(),
  /**
   * D-141 — ⚠ LEGACY input only (`DELTA-RUN-NEXT-VERSION-01-A`): per-zone colour overrides,
   * superseded by a countdown's {@link CountdownStepsSchema} changes, which name the element they
   * change from the countdown's side. Kept PARSEABLE (the shape shipped in the schema of `0.11.6`);
   * `migrateCountdownZones` turns every override into the equivalent step change on every load, with
   * the same on-air result, and drops the key. Nothing writes it.
   */
  zoneOverrides: ZoneOverridesSchema.optional(),
});
export type ElementBase = z.infer<typeof ElementBaseSchema>;

const FontWeightSchema = z
  .number()
  .int()
  .refine((n) => [100, 200, 300, 400, 500, 600, 700, 800, 900].includes(n), {
    message: 'weight must be one of 100..900 in steps of 100',
  });

/**
 * 🔴 `TEXT-FIT-01` — **THE SMALLEST A `shrink-to-fit` TEXT GOES: half its authored size.** Below that
 * a lower third's name stops being readable on air, so the text stops shrinking and its `overflow`
 * (clip / ellipsis) takes over. Part of what `shrink-to-fit` MEANS, so it lives with the schema.
 */
export const TEXT_FIT_MIN_SCALE = 0.5;

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
  /**
   * 🔴 `TEXT-FIT-01` (`B-147`) — **THE ONE SPELLING OF HOW TEXT AND BOX RELATE.**
   * `fixed` sizes the box from `transform.size` (default) and the text keeps its size. `autosize`
   * (D-060) makes the runtime hug the content in BOTH dimensions via CSS intrinsic sizing (honours
   * explicit `\n`, no auto-wrap; size keyframes are ignored while auto). `shrink-to-fit` keeps the
   * fixed box and shrinks the FONT (letter spacing with it — it is in `em`) until the rendered,
   * shaped text fits, down to {@link TEXT_FIT_MIN_SCALE} of the authored size; past that `overflow`
   * decides (`@cg/template-runtime`'s `text-fit.ts`).
   */
  fitMode: z.enum(['fixed', 'shrink-to-fit', 'autosize']),
  /**
   * `TEXT-FIT-01` — what a `shrink-to-fit` text does when it still does not fit at its smallest:
   * `clip` or `ellipsis` (one line). Read ONLY under `shrink-to-fit`: a `fixed` text renders exactly
   * as it always has. ⚠ `shrink` is LEGACY input only — a second spelling of fit that nothing ever
   * read; `migrateTextFit` rewrites it on every load and nothing writes it.
   */
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
   * ⚠ LEGACY input only (`TEXT-FIT-01`, `B-147`) — D-010-pic-5's third spelling of fit, which the
   * runtime never read. Kept in the schema so a file that carries it still opens with its intent:
   * `migrateTextFit` turns `true` on a fixed box into `fitMode: 'shrink-to-fit'` and drops the key
   * on every load. Nothing writes it; read `fitMode`.
   */
  autoSqueeze: z.boolean().optional(),
  /**
   * D-010-pic-5 — true (default) lets text wrap across lines; false
   * keeps it on a single line (CSS `white-space: nowrap`).
   */
  wrap: z.boolean().optional(),
  /** D-010-pic-5 — vertical alignment inside the text box. */
  verticalAlign: z.enum(['top', 'middle', 'bottom']).optional(),
  /**
   * `TEXT-DIGITS-01` — the digits the text its AUTHOR typed into this element is drawn in (a value a
   * field binds is drawn by the field's own choice). Absent is `as-typed` — Keyboard — the identity,
   * so a template made before this draws exactly as it did; optional, never defaulted, so parsing an
   * old document adds no key. Read it through {@link elementDigitsOf}.
   */
  digits: FieldDigitsSchema.optional(),
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
 * D-039ext — an image/logo separator between ticker items (a branded crawl
 * "channel bug"). Rendered BETWEEN items only (never trailing — D-081),
 * vertically centred, at the authored `size`. `size` is an explicit `w`×`h`
 * box (not a single dimension) so the treadmill has a deterministic separator
 * width with no asynchronous image measurement. The asset is resolved via the
 * same two-source resolver as image elements (`source` chooses project vs the
 * shared library).
 */
export const TickerImageSeparatorSchema = z.object({
  kind: z.literal('image'),
  assetId: IdSchema,
  source: z.enum(['project', 'shared']),
  size: z.object({ w: z.number().positive(), h: z.number().positive() }),
});
export type TickerImageSeparator = z.infer<typeof TickerImageSeparatorSchema>;

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
   * Optional separator rendered between items as its own node (never
   * concatenated into item text — keeps reconcile and bidi isolation per item
   * intact). A bidi-neutral text glyph (e.g. ' • '), OR — D-039ext — an
   * image/logo ({@link TickerImageSeparatorSchema}). Widening the old `string`
   * to `string | image` is backward-compatible (every existing string
   * separator stays valid), so no schema-version bump is needed.
   */
  separator: z.union([z.string(), TickerImageSeparatorSchema]).optional(),
  /** Authored default items; a bound `list` field replaces them at playout. */
  items: z.array(TickerItemSchema),
  /**
   * D-107 — whether this ticker DRIVES the composition's content-driven hold.
   * Under `holdSource: 'content-driven'` only content with `drivesHold !== false`
   * gates the hold, so a permanent/looping/decorative crawl can run WITHOUT
   * keeping the graphic on-air forever. Absent ⇒ participates (the pre-D-107
   * all-content behaviour) — additive + backward-compatible, no schema-version
   * bump. HOLD only: the ticker still STARTS and crawls regardless. Non-keyframable.
   */
  drivesHold: z.boolean().optional(),
  /**
   * `TEXT-DIGITS-01` — the digits the ticker's AUTHORED items and text separator are drawn in; a
   * bound `list` field's items are drawn by the list field's own choice. Absent is `as-typed`
   * (Keyboard), the identity. Read it through {@link elementDigitsOf}.
   */
  digits: FieldDigitsSchema.optional(),
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
  /**
   * D-141 — a TIME OF DAY (`HH:mm` or `HH:mm:ss`). The countdown reaches zero at
   * the NEXT LOCAL occurrence of that time on the rendering machine's clock —
   * today's when it is still ahead, otherwise tomorrow's — so the operator types
   * the official announced time and nothing else. ABSOLUTE like `datetime`: a
   * pause never delays it. The occurrence is resolved ONCE per run and PINNED as a
   * deadline (never re-resolved per paint, or the display would jump from 00:00 to
   * a full day the instant it arrived). Like the countdown family generally it
   * ignores the element's `timezone`, which stays `wall`-only.
   *
   * This regex is the CANONICAL spelling of the constraint; the Designer's
   * `Time (HH:MM)` pattern preset is the authoring aid for the operator-facing
   * FIELD. Two spellings of one constraint would drift.
   *
   * Additive: a value that validated against the old two-member union still
   * validates against this superset, so no schema-version bump.
   */
  z.object({
    kind: z.literal('timeofday'),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Expected HH:mm or HH:mm:ss'),
  }),
]);
export type ClockTarget = z.infer<typeof ClockTargetSchema>;

/**
 * D-141 — one zone STEP: while the countdown's REMAINING time is at or below
 * `atOrBelowMs`, this zone is active. Selection is first-match-wins over the
 * authored order, which validates as strictly decreasing. Each zone carries its
 * own colour — an element's `'zone'` slot resolves to exactly this value.
 */
export const ClockZoneStepSchema = z.object({
  /** Remaining ≤ this ⇒ this zone. */
  atOrBelowMs: z.number().int().nonnegative(),
  key: ZoneKeySchema,
  /** The zone's canonical colour. */
  color: HexColorSchema,
});
export type ClockZoneStep = z.infer<typeof ClockZoneStepSchema>;

/**
 * D-141 — a countdown's colour zones: ordered thresholds on remaining time plus
 * an OPTIONAL `base` zone, which is the zone ABOVE the highest threshold. `base`
 * absent ⇒ no zone is active up there and every override is inert (the SAME code
 * path as "no enclosing zone at all"), so a designer who only wants "red under ten
 * minutes" writes one step and nothing else. The 4-zone 60/30/10 preset is `base`
 * plus three steps — 3 boundaries, 4 zones.
 */
export const ClockZonesSchema = z
  .object({
    base: z.object({ key: ZoneKeySchema, color: HexColorSchema }).optional(),
    steps: z.array(ClockZoneStepSchema).min(1),
  })
  .superRefine((zones, ctx) => {
    // Strictly decreasing: first-match-wins is only well defined over a descending
    // list. The OFFENDING STEP is identified by path, so the Designer can mark that
    // row rather than refusing the whole section.
    zones.steps.forEach((step, i) => {
      const prev = zones.steps[i - 1];
      if (prev !== undefined && step.atOrBelowMs >= prev.atOrBelowMs) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['steps', i, 'atOrBelowMs'],
          message: `zone thresholds must be strictly decreasing (${String(step.atOrBelowMs)} is not below ${String(prev.atOrBelowMs)})`,
        });
      }
    });
    // Unique across base + steps: the published key is ONE attribute value, so two
    // zones sharing a name cannot be told apart by an element's override.
    const seen = new Set<string>();
    if (zones.base !== undefined) seen.add(zones.base.key);
    zones.steps.forEach((step, i) => {
      if (seen.has(step.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['steps', i, 'key'],
          message: `duplicate zone key '${step.key}'`,
        });
      }
      seen.add(step.key);
    });
  });
export type ClockZones = z.infer<typeof ClockZonesSchema>;

/**
 * 🔴 `DELTA-RUN-NEXT-VERSION-01-A` §2 / `-D` §2 — **ONE STEP OF A COUNTDOWN: when this much or less
 * remains, make these changes.**
 *
 * `atMs` is a threshold on REMAINING time, compared on the ONE-SECOND QUANTUM the digits paint, so a
 * step is entered on exactly the frame the display reaches it — never up to a second early:
 *
 * - `atMs > 0` — "when N min (or s) or less remain";
 * - `atMs === 0` — **At zero**: the event time is reached;
 * - `atMs < 0` — "|N| after zero": time keeps passing after zero even while the digits hold.
 *
 * The step holds a list of {@link ElementChange}s — any element of the countdown's composition or of
 * a composition instanced inside it — and the transition they arrive with. Leaving a step returns
 * every property it set to the element's authored value, unless the step entered sets it too.
 */
export const CountdownStepSchema = z.object({
  /** The author's name for the step: `Step 1` … by default, `60 min` from the preset. */
  name: z.string(),
  atMs: z.number().int(),
  changes: z.array(ElementChangeSchema),
  transition: ChangeTransitionSchema.optional(),
});
export type CountdownStep = z.infer<typeof CountdownStepSchema>;

/** The optional **Before** step: active while remaining is above every threshold. */
export const CountdownBeforeSchema = z.object({
  name: z.string(),
  changes: z.array(ElementChangeSchema),
  transition: ChangeTransitionSchema.optional(),
});
export type CountdownBefore = z.infer<typeof CountdownBeforeSchema>;

/**
 * A countdown's steps: an optional `before`, then thresholds STRICTLY DECREASING across zero (the
 * offending row is named by its path, so the Designer marks that row rather than refusing the
 * section). Within one step, at most one change per element and property.
 */
export const CountdownStepsSchema = z
  .object({
    before: CountdownBeforeSchema.optional(),
    steps: z.array(CountdownStepSchema),
  })
  .superRefine((s, ctx) => {
    s.steps.forEach((step, i) => {
      const prev = s.steps[i - 1];
      if (prev !== undefined && step.atMs >= prev.atMs) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['steps', i, 'atMs'],
          message: `step thresholds must be strictly decreasing (${String(step.atMs)} is not below ${String(prev.atMs)})`,
        });
      }
      refineChangeList(step.changes, ctx, ['steps', i, 'changes']);
    });
    if (s.before !== undefined) refineChangeList(s.before.changes, ctx, ['before', 'changes']);
  });
export type CountdownSteps = z.infer<typeof CountdownStepsSchema>;

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
  /**
   * D-141 — ⚠ LEGACY input only (`DELTA-RUN-NEXT-VERSION-01-A`): colour zones, superseded by
   * {@link steps}. Kept PARSEABLE because the shape shipped in the schema of `0.11.6` and a scene
   * saved by a development build may carry it; `migrateCountdownZones` (scene-migrations.ts) turns
   * it into steps with the same on-air result on every load, and nothing writes it. Still
   * countdown-only (the refinement below).
   */
  zones: ClockZonesSchema.optional(),
  /**
   * `DELTA-RUN-NEXT-VERSION-01-A` — the countdown's STEPS: what changes, on which elements, as the
   * remaining time crosses each threshold. Countdown-only at both layers (refined below; the
   * runtime ignores them on `wall` / `countup`). Absent ⇒ no step ever changes anything.
   */
  steps: CountdownStepsSchema.optional(),
  /**
   * `DELTA-RUN-NEXT-VERSION-01-D` / `-E` — what the countdown does after zero. Absent ⇒ `hold`, the
   * behaviour every countdown had before, so no existing scene changes.
   */
  afterZero: AfterZeroSchema.optional(),
  /**
   * D-084 — optional IANA time-zone name (e.g. 'Europe/London'). When set,
   * `wall` mode renders that zone's current time (via Intl.DateTimeFormat);
   * absent ⇒ the machine's local zone (the prior behaviour). `countup`/
   * `countdown` ignore it. Additive + backward-compatible — no schema-version
   * bump: a clock authored without it parses and renders unchanged.
   */
  timezone: z.string().optional(),
  /**
   * D-103 — blink the colon separator(s) on/off. Off/absent by default (steady colons —
   * the unchanged render). Additive + backward-compatible: no schema-version bump.
   */
  blinkColon: z.boolean().optional(),
  /**
   * D-103 — the colon blink half-period in ms: the colon toggles every `blinkPeriodMs`
   * (phase = `Math.floor(now / blinkPeriodMs) % 2`). Absent ⇒ 1000. Ignored unless
   * `blinkColon` is on.
   */
  blinkPeriodMs: z.number().int().positive().optional(),
  /**
   * D-107 — whether this clock DRIVES the composition's content-driven hold.
   * Only meaningful for `mode: 'countdown'`: `wall`/`countup` never complete, so
   * they never gate a hold regardless of this flag. Absent ⇒ participates (the
   * pre-D-107 behaviour) — additive + backward-compatible, no schema-version
   * bump. HOLD only: the clock still renders/ticks regardless. Non-keyframable.
   */
  drivesHold: z.boolean().optional(),
})
  .merge(BoxStyleSchema)
  .superRefine((el, ctx) => {
    if (el.mode === 'countdown' && !el.target) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['target'],
        message: "mode 'countdown' requires a target (duration, datetime or timeofday)",
      });
    }
    // D-141 — zones ride on a countdown's remaining time, which `wall`/`countup`
    // do not have. Refusing at author time is the first of the two layers; the
    // runtime ignoring them for those modes is the second.
    if (el.mode !== 'countdown' && el.zones !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['zones'],
        message: "zones are countdown-only — 'wall' and 'countup' have no remaining time",
      });
    }
    // DELTA-RUN-NEXT-VERSION-01-A / -D — steps and the after-zero choice ride on remaining time too.
    if (el.mode !== 'countdown' && el.steps !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['steps'],
        message: "steps are countdown-only — 'wall' and 'countup' have no remaining time",
      });
    }
    if (el.mode !== 'countdown' && el.afterZero !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['afterZero'],
        message: "afterZero is countdown-only — 'wall' and 'countup' never reach zero",
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
/**
 * D-083 Phase 1 — a TEXT sequence item (the bindable one). `kind` is OPTIONAL (not
 * `.default('text')`) so an item authored before D-083 ({id,text,dwellMs?} with no
 * `kind`) parses UNCHANGED — no `kind` injected — and the runtime treats an absent
 * `kind` as text. The non-breaking widening: no schema-version bump, no migration.
 * The union disambiguates on the required `text` vs `compositionId` field, so the
 * literal here is belt-and-braces.
 */
export const SequenceTextItemSchema = z.object({
  kind: z.literal('text').optional(),
  id: z.string().min(1),
  text: z.string(),
  dwellMs: z.number().int().positive().optional(),
});

/**
 * D-083 Phase 1 — a COMPOSITION sequence item: references a scene composition by
 * `compositionId` (the SAME reference the `composition` element uses) and renders
 * that composition's content for the item's dwell, under the sequence's
 * transitions. A single clock/logo is just a one-element composition.
 */
export const SequenceCompositionItemSchema = z.object({
  kind: z.literal('composition'),
  id: z.string().min(1),
  compositionId: IdSchema,
  dwellMs: z.number().int().positive().optional(),
});

/**
 * D-149 — how a picture is scaled inside its box: the image element's `fit`, and (`D-163`) the ONE
 * fit a sequence applies to all its picture items. Declared once so the two cannot drift. The first
 * four are CSS `object-fit` values; `fit-width` / `fit-height` are resolved by the renderer (see
 * {@link ImageElementSchema}).
 */
export const ImageFitSchema = z.enum([
  'contain',
  'cover',
  'fill',
  'none',
  'fit-width',
  'fit-height',
]);
export type ImageFit = z.infer<typeof ImageFitSchema>;

/**
 * `D-163` — a PICTURE sequence item: one page of a book read on air. It names its picture in
 * exactly ONE of two ways:
 *
 * - `assetId` — a page the AUTHOR put in the template (a project asset, packaged with it);
 * - `media` — the SHA-256 of a page the OPERATOR loaded in CG Control, held by CG Bridge and
 *   delivered to the page with the turn that shows it (`__cg.page`).
 *
 * `name` is the picked file's name, for people (the items list, a refusal); it never decides
 * anything. Drawn by the image element's own renderer at the sequence's `imageFit`.
 */
export const SequenceImageItemSchema = z
  .object({
    kind: z.literal('image'),
    id: z.string().min(1),
    assetId: IdSchema.optional(),
    media: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional(),
    name: z.string().optional(),
    dwellMs: z.number().int().positive().optional(),
  })
  .refine((item) => (item.assetId === undefined) !== (item.media === undefined), {
    message: 'a picture item names exactly one of assetId or media',
  });

/**
 * D-083 Phase 1 — a sequence item is TEXT or a COMPOSITION reference; `D-163` adds a PICTURE. A
 * z.union (not z.discriminatedUnion) so an old item without `kind` still parses (its text variant
 * leaves `kind` absent); the variants are unambiguous via their required fields (`text` vs
 * `compositionId` vs `kind: 'image'`).
 */
export const SequenceItemSchema = z.union([
  SequenceTextItemSchema,
  SequenceCompositionItemSchema,
  SequenceImageItemSchema,
]);
export type SequenceItem = z.infer<typeof SequenceItemSchema>;
export type SequenceTextItem = z.infer<typeof SequenceTextItemSchema>;
export type SequenceCompositionItem = z.infer<typeof SequenceCompositionItemSchema>;
export type SequenceImageItem = z.infer<typeof SequenceImageItemSchema>;

/**
 * 🔴 `D-163` — THE ONE ANSWER to "how may this sequence's item LIST be data-bound?" (golden rule 6):
 *
 * - `'text'` — every item is text (or there are none): a bound `list` of text items, as D-029/D-083;
 * - `'pages'` — every item is a picture: a PAGE LIST the operator loads in CG Control;
 * - `null` — anything mixed, or any composition item: not bindable (a bound list value cannot carry
 *   a composition, and a list that is half text and half pictures is neither surface).
 *
 * The Designer's bind resolver, its Data-key lock and its store all read this; none re-derives it.
 */
export function sequenceItemsBinding(
  items: readonly { kind?: string | undefined }[],
): 'text' | 'pages' | null {
  if (items.some((i) => i.kind === 'composition')) return null;
  const pictures = items.filter((i) => i.kind === 'image').length;
  if (pictures === 0) return 'text';
  return pictures === items.length ? 'pages' : null;
}

/**
 * A transition edge: where an item enters from / exits to. `none` = instant cut. `fade` (`D-163`)
 * = no motion, the item's opacity eased in or out over `transitionMs`; IN and OUT both `fade` under
 * `simultaneous` is a true DISSOLVE (the two items mixed, never dimmed in the middle) — the smooth
 * page turn a book needs. `fade-right` / `fade-left` / `fade-bottom` / `fade-top` fade AND drift a
 * short way (a few percent of the box, never from off-screen) from that side into place — the
 * broadcast "fade with a nudge" the owner asked for, across or up and down; under RTL text the drift
 * from the right moves with the reading. Additive: every sequence authored before them parses
 * unchanged.
 */
export const SequenceEdgeSchema = z.enum([
  'top',
  'bottom',
  'left',
  'right',
  'none',
  'fade',
  'fade-right',
  'fade-left',
  'fade-bottom',
  'fade-top',
]);

/**
 * Sequence / now-next element (D-029) — a clipped box that shows ONE item of
 * an ordered list at a time and advances on a per-item timer and/or on
 * command (`CG NEXT` / `runtime.next()`). The move between items is a
 * DECOMPOSED transition: an IN edge, an OUT edge, and a timing
 * (`simultaneous` push vs `sequential` out-then-in), each motion over
 * `transitionMs` — named presets (Push/Slide/Crossfade/Cut) are just values over
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
  /**
   * `D-163` — how EVERY picture item of this sequence is scaled in the box (the image element's
   * `fit` values). Optional, read as `contain` when absent, so a sequence authored before picture
   * items parses unchanged; it means nothing to a sequence that holds none.
   */
  imageFit: ImageFitSchema.optional(),
  /** Per-item display time when the item carries no own `dwellMs`. */
  defaultDwellMs: z.number().int().positive().default(5000),
  /** `auto` = dwell timer + next(); `manual` = only next() advances. */
  advance: z.enum(['auto', 'manual']).default('auto'),
  /**
   * `D-163` (the owner, 2026-10-14) — may the OPERATOR step this sequence: CG Control's NEXT, and a
   * book's Previous / Next / Go to? Absent ⇒ yes, so every template authored before keeps its
   * NEXT. A sequence that runs by itself — the clocks of several cities turning beside a strap —
   * sets `false`, and no console verb moves it. Read it through {@link sequenceStepsByOperator}.
   */
  operatorSteps: z.boolean().optional(),
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
  /**
   * D-107 — whether this sequence DRIVES the composition's content-driven hold.
   * Under `holdSource: 'content-driven'` only content with `drivesHold !== false`
   * gates the hold, so a permanent/looping sequence can run WITHOUT keeping the
   * graphic on-air forever. Absent ⇒ participates (the pre-D-107 all-content
   * behaviour) — additive + backward-compatible, no schema-version bump. HOLD
   * only: the sequence still advances/renders regardless. Non-keyframable.
   */
  drivesHold: z.boolean().optional(),
  /**
   * `TEXT-DIGITS-01` — the digits the sequence's AUTHORED text items are drawn in; an item bound to
   * a field, and a bound `list` field's items, are drawn by that field's own choice. Absent is
   * `as-typed` (Keyboard), the identity. Read it through {@link elementDigitsOf}.
   */
  digits: FieldDigitsSchema.optional(),
}).merge(BoxStyleSchema);
export type SequenceElement = z.infer<typeof SequenceElementSchema>;

/**
 * `D-163` — **THE ONE ANSWER to "may the operator step this sequence?"** (golden rule 6): CG
 * Control's NEXT (`hasNextStep`), the page's `CG NEXT` / Previous / Go to, and a book's stepping all
 * read it. Absent is yes.
 */
export function sequenceStepsByOperator(element: Pick<SequenceElement, 'operatorSteps'>): boolean {
  return element.operatorSteps !== false;
}

/**
 * `TEXT-DIGITS-01` — THE ANSWER to "which digits is the text an author typed into this element drawn
 * in", read by the page and the Designer alike (golden rule 6): the element's choice, absent read as
 * `as-typed` (Keyboard) — the identity, so a template made before the setting draws unchanged.
 */
export function elementDigitsOf(element: {
  readonly type: string;
  readonly digits?: FieldDigits | undefined;
}): FieldDigits {
  switch (element.type) {
    case 'text':
    case 'ticker':
    case 'sequence':
      return element.digits ?? 'as-typed';
    default:
      return 'as-typed';
  }
}

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
  /** Optional stamp clamp — at most this many rows per fresh play. Read through `repeaterRowLimit`. */
  maxItems: z.number().int().positive().optional(),
  /**
   * Authored design-time rows — the open D-028 list-item shape (stable `id`
   * + open fields); row keys are the child composition's field ids.
   */
  items: z.array(ListItemSchema).default([]),
});
export type RepeaterElement = z.infer<typeof RepeaterElementSchema>;

/**
 * 🔴 `B-106` — **THE ONE reading of a repeater's row limit**: how many rows it may show, or
 * `undefined` for no limit. The page's build-time stamp, the driver's restamp and the Designer's
 * row editor all read it, so the three cannot disagree — they did: the stamp and the driver each
 * spelled the clamp themselves, and on a value the schema refuses they differed (`2.5` stamped 3
 * rows then 2; `-1` stamped 0 then N-1).
 *
 * An exported page never re-parses its scene, so a hand-edited value reaches here unvalidated.
 * Anything that is not a number of at least 1 — `0`, a negative, `NaN`, `null` — is NO limit,
 * which is what the Designer already says ("0 = unlimited"); a fraction is floored.
 */
export function repeaterRowLimit(element: {
  readonly maxItems?: number | null | undefined;
}): number | undefined {
  const m = element.maxItems;
  if (typeof m !== 'number' || !Number.isFinite(m)) return undefined;
  const n = Math.floor(m);
  return n >= 1 ? n : undefined;
}

/**
 * Image element. References an asset by id.
 *
 * D-040 — `source` says WHICH store `assetId` lives in: a per-project asset
 * (`'project'`, the default) or a device-level shared-library image
 * (`'shared'`). A "logo" is simply an image with `source: 'shared'`; there is
 * one image element kind and one renderer. `source` defaults to `'project'`, so
 * scenes authored before D-040 (no `source`) parse and render exactly as before.
 * It's a structural reference (like `assetId`/`font.family`), never keyframed.
 */
export const ImageElementSchema = ElementBaseSchema.extend({
  type: z.literal('image'),
  assetId: IdSchema,
  source: z.enum(['project', 'shared']).default('project'),
  /**
   * D-149 — how the asset is scaled inside the element's box.
   *
   * The first four are CSS `object-fit` values, written straight through. The
   * last two are NOT CSS keywords and are resolved by the renderer:
   *
   * - `'fit-width'` — scale so the WIDTH matches the box; the height overflows
   *   (or falls short) and the overflow is CLIPPED.
   * - `'fit-height'` — the mirror: the HEIGHT matches the box, the width
   *   overflows, clipped.
   *
   * ⚠ `'none'` is LABELLED **"original"** in the Designer and its STORED value
   * is deliberately unchanged. A rename of the stored value would be a scene
   * migration for a label, and the migration registry is empty
   * (`migrations/index.ts`) — see D-149. Do NOT "tidy" this to `'original'`:
   * every scene ever saved carries `'none'`.
   *
   * Widening an enum is additive, so no schema-version bump and no migration:
   * a document written before D-149 parses unchanged, and one written after is
   * only unreadable by an older build if it actually USES a new value.
   */
  fit: ImageFitSchema,
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

// D-110 — `AnchorPointSchema` lives in `path-points.ts` (a leaf module) so the
// animation model can hold path snapshots without an elements↔animation cycle.
// Re-exported from the package index; imported here for the path element.

/**
 * D-109 — an editable Bézier `path` element (distinct from the legacy
 * `shape: 'path'` + `pathData` string variant). `points` live in the element's
 * local space; `transform.size` is the points' bounding box, so the B-022 gizmo
 * resizes via `scale` without re-baking coordinates. A CLOSED path renders
 * fill + stroke; an OPEN path renders stroke only. Only the STROKE part of the
 * D-042 box mixin is reused (a freeform path has no border radius) — inlined
 * here rather than merging `BoxStyleSchema`. The point set is not keyframe-able
 * in this item (per-point morphing is D-110).
 */
export const PathElementSchema = ElementBaseSchema.extend({
  type: z.literal('path'),
  points: z.array(AnchorPointSchema).min(2),
  closed: z.boolean(),
  fill: FillSchema.optional(),
  stroke: StrokeSchema.optional(),
});
export type PathElement = z.infer<typeof PathElementSchema>;

/**
 * D-109 — the axis-aligned bounding box of a path's ANCHOR points (in the
 * element's local space). The element's `transform.size` tracks this, and the
 * runtime renders the SVG with `viewBox` = this box + `preserveAspectRatio:
 * none`, so the B-022 gizmo resizes by changing `transform.size` (the viewBox
 * rescales the outline to fill it) WITHOUT re-baking point coordinates. An empty
 * set is a zero box. Handle overshoot is not included (size is the anchor bbox).
 */
export function pathBBox(points: readonly AnchorPoint[]): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Evaluate one cubic-bézier component at `t`. */
function cubicAt(t: number, p0: number, c1: number, c2: number, p3: number): number {
  const mt = 1 - t;
  return mt * mt * mt * p0 + 3 * mt * mt * t * c1 + 3 * mt * t * t * c2 + t * t * t * p3;
}

/**
 * Interior extremum parameters (0 < t < 1) of one cubic component — the roots of
 * the derivative `3[(c1−p0) + 2t(c2−2c1+p0) + t²(p3−3c2+3c1−p0)]` (quadratic in t,
 * linear fallback when the t² coefficient degenerates).
 */
function cubicExtremaT(p0: number, c1: number, c2: number, p3: number): number[] {
  const a = p3 - 3 * c2 + 3 * c1 - p0;
  const b = 2 * (c2 - 2 * c1 + p0);
  const c = c1 - p0;
  const out: number[] = [];
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) {
      const t = -c / b;
      if (t > 0 && t < 1) out.push(t);
    }
    return out;
  }
  const disc = b * b - 4 * a * c;
  if (disc < 0) return out;
  const s = Math.sqrt(disc);
  for (const t of [(-b + s) / (2 * a), (-b - s) / (2 * a)]) {
    if (t > 0 && t < 1) out.push(t);
  }
  return out;
}

/**
 * B-059 — the axis-aligned bounding box of a path's VISIBLE outline: the union of
 * each cubic segment's exact bézier extents (endpoints + derivative-root extrema),
 * using the SAME control-point convention the runtime renders (`c1 = a + a.out`,
 * `c2 = b + b.in`; a segment is straight only when BOTH handles are absent; a
 * closed path includes the closing segment). Under the owner-decided model
 * (2026-07-10) this IS the stored convention: points live with their visual bbox
 * at local (0,0) and `transform.size` equals its extents (see
 * {@link migratePathGeometry} for legacy content). Anchors-only input degrades to
 * exactly `pathBBox`. An empty set is a zero box.
 */
export function pathVisualBBox(
  points: readonly AnchorPoint[],
  closed: boolean,
): { x: number; y: number; w: number; h: number } {
  if (points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const fold = (x: number, y: number): void => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  for (const p of points) fold(p.x, p.y);
  const segCount = closed ? points.length : points.length - 1;
  for (let i = 0; i < segCount; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (a === undefined || b === undefined) continue;
    if (a.out === undefined && b.in === undefined) continue; // straight — endpoints suffice
    const c1x = a.x + (a.out?.x ?? 0);
    const c1y = a.y + (a.out?.y ?? 0);
    const c2x = b.x + (b.in?.x ?? 0);
    const c2y = b.y + (b.in?.y ?? 0);
    for (const t of cubicExtremaT(a.x, c1x, c2x, b.x)) {
      fold(cubicAt(t, a.x, c1x, c2x, b.x), cubicAt(t, a.y, c1y, c2y, b.y));
    }
    for (const t of cubicExtremaT(a.y, c1y, c2y, b.y)) {
      fold(cubicAt(t, a.x, c1x, c2x, b.x), cubicAt(t, a.y, c1y, c2y, b.y));
    }
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

const MIGRATE_EPS = 1e-6;

/**
 * B-059/B-062 (owner model, 2026-07-10) — migrate ONE path element from the
 * legacy D-109 convention (anchors bbox at local (0,0); the render mapped it onto
 * `transform.size` via the viewBox, so a resize never touched the points) to the
 * CURRENT convention: the points' VISUAL (curve-aware) bbox sits at local (0,0)
 * and `transform.size` equals its extents — a resize scales the coordinates like
 * a rectangle's. Pure and deterministic, so it runs in BOTH the Designer (scene
 * load) and the runtime (scene ingestion — legacy `.vcg` packages render
 * pixel-identically without rewriting the signed package). Conforming elements
 * return unchanged (identity).
 *
 * The bake: scale points + handle vectors by the legacy render factor
 * `f = size / max(anchorExtent, 1)` per axis, re-anchor to the new visual bbox,
 * shift `position` by the visual offset, and set `size` to the visual extents.
 * Fidelity compensations: `size.w/h` keyframe values scale by the constant
 * per-axis ratio and `position.x/y` keyframe values shift by the constant delta
 * (both exact); a STATIC rotation/scale keeps its rendered geometry via a pivot
 * correction `(I − S·R)(pivotOld − pivotNew)` (the anchor is a box FRACTION, so a
 * bigger box moves the pivot). Known corner: an ANIMATED rotation combined with a
 * legacy-resized curved path cannot be compensated with independent tracks — the
 * pivot correction uses the static rotation (documented in the change design).
 */
export function migratePathGeometry(el: PathElement): PathElement {
  const v0 = pathVisualBBox(el.points, el.closed);
  const { size, position, rotation, anchor, scale } = el.transform;
  if (
    Math.abs(v0.x) < MIGRATE_EPS &&
    Math.abs(v0.y) < MIGRATE_EPS &&
    Math.abs(size.w - Math.max(v0.w, 1)) < MIGRATE_EPS &&
    Math.abs(size.h - Math.max(v0.h, 1)) < MIGRATE_EPS
  ) {
    return el; // already conforming
  }
  const a = pathBBox(el.points);
  const fx = size.w / Math.max(a.w, 1);
  const fy = size.h / Math.max(a.h, 1);
  const scaled: AnchorPoint[] = el.points.map((p) => ({
    ...p,
    x: (p.x - a.x) * fx,
    y: (p.y - a.y) * fy,
    ...(p.in !== undefined ? { in: { x: p.in.x * fx, y: p.in.y * fy } } : {}),
    ...(p.out !== undefined ? { out: { x: p.out.x * fx, y: p.out.y * fy } } : {}),
  }));
  const v = pathVisualBBox(scaled, el.closed);
  const points: AnchorPoint[] = scaled.map((p) => ({ ...p, x: p.x - v.x, y: p.y - v.y }));
  const newSize = { w: Math.max(v.w, 1), h: Math.max(v.h, 1) };
  // Unrotated fidelity: legacy rendered the scaled drawing's anchor-origin at
  // `position`, so the visual min sat at position + v.min — the new origin.
  let pos = { x: position.x + v.x, y: position.y + v.y };
  // Pivot correction for a static rotation/scale about the anchor fraction.
  if (rotation !== 0 || scale.x !== 1 || scale.y !== 1) {
    const pivO = { x: position.x + anchor.x * size.w, y: position.y + anchor.y * size.h };
    const pivN = { x: pos.x + anchor.x * newSize.w, y: pos.y + anchor.y * newSize.h };
    const dx = pivO.x - pivN.x;
    const dy = pivO.y - pivN.y;
    const rad = (rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    // M = S·R (the renderer's scale(sx,sy) rotate(r) order): M·d.
    const mdx = scale.x * (dx * cos - dy * sin);
    const mdy = scale.y * (dx * sin + dy * cos);
    pos = { x: pos.x + (dx - mdx), y: pos.y + (dy - mdy) };
  }
  // Track compensation: size values scale by the ratio; position values shift by
  // the same constant delta the base position took.
  let animation = el.animation;
  if (animation !== undefined) {
    const ratioW = newSize.w / size.w;
    const ratioH = newSize.h / size.h;
    const dPosX = pos.x - position.x;
    const dPosY = pos.y - position.y;
    const tracks = { ...animation.tracks };
    const mapTrack = (
      prop: 'size.w' | 'size.h' | 'position.x' | 'position.y',
      fn: (v: number) => number,
    ): void => {
      const track = tracks[prop];
      if (track === undefined) return;
      tracks[prop] = {
        ...track,
        keyframes: track.keyframes.map((k) =>
          typeof k.value === 'number' ? { ...k, value: fn(k.value) } : k,
        ),
      };
    };
    mapTrack('size.w', (n) => n * ratioW);
    mapTrack('size.h', (n) => n * ratioH);
    mapTrack('position.x', (n) => n + dPosX);
    mapTrack('position.y', (n) => n + dPosY);
    animation = { ...animation, tracks };
  }
  return {
    ...el,
    points,
    ...(animation !== undefined ? { animation } : {}),
    transform: { ...el.transform, position: pos, size: newSize },
  };
}

/**
 * D-125 — the element's phase mapping in the ANIMATION's own frame space (§D2.1).
 * The intro plays `[ip, introEnd]`, the hold sits at `introEnd` (or loops the idle
 * segment), and the outro plays `[outroStart, op]`. Read from bodymovin `markers`
 * on import (`source: 'markers'`) or set by hand in the Inspector (`source:
 * 'manual'`). Optional + additive: a Lottie authored before D-125 (no `phases`) has
 * no distinct intro/outro — the whole clip is the intro, held at `op`, empty outro.
 */
export const LottiePhasesSchema = z.object({
  /**
   * Animation frame where the intro ends and the hold begins.
   *
   * Session Y — under `source: 'composition'` an AUTHORED value WINS (the clip's own intro,
   * scheduled to finish at the effective content start); ABSENT (what attach writes now) the
   * window is DERIVED (`followWindowMs` / `lottieFollowWindow`). The pre-Y attach SEED
   * SIGNATURE (`introEnd == lottieClipMidpoint`, `outroStart == op`) derives as if absent —
   * see `lottieFollowClipFacts`. OPTIONAL since session Y so attach can write the source alone.
   */
  introEnd: z.number().nonnegative().optional(),
  /** Animation frame where the outro begins. `introEnd ≤ outroStart`. Session Y: optional; authored wins under follow (the clip's own `[outroStart → op]`), absent derives END-anchored. */
  outroStart: z.number().nonnegative().optional(),
  /** Optional `[in, out]` idle-loop range inside the hold window. Under `'composition'` it COMPOSES with the derived hold time (idle is never derived — absent means freeze). */
  idle: z.tuple([z.number().nonnegative(), z.number().nonnegative()]).optional(),
  /**
   * Where the mapping comes from: bodymovin markers, manual marking, or — the third source
   * (media-phases-follow-composition) — DERIVED from the composition's lifecycle
   * (`'composition'`): intro settles at the effective content start, outro fits the OUT segment.
   * The element stores the RELATIONSHIP, not numbers, so a marker drag moves the window with no
   * re-sync step.
   */
  source: z.enum(['markers', 'manual', 'composition']),
  /**
   * The clip time whose look the composition HOLDS (`H`), in ANIMATION frames — meaningful ONLY
   * under `source: 'composition'`, ignored otherwise. Absent ⇒ `H` = clip start + entrance span,
   * which degenerates exactly to "play the clip from its head". Optional + additive.
   */
  holdAt: z.number().nonnegative().optional(),
});
export type LottiePhases = z.infer<typeof LottiePhasesSchema>;

/** Lottie animation element. */
export const LottieElementSchema = ElementBaseSchema.extend({
  type: z.literal('lottie'),
  assetId: IdSchema,
  speed: z.number().positive(),
  loopMode: z.enum(['none', 'loop', 'bounce']),
  segment: z.tuple([z.number().nonnegative(), z.number().nonnegative()]).optional(),
  /**
   * D-125 §D1 — the intro-end / outro-start (+ optional idle) phase mapping in the
   * animation's own frame space. Optional + additive (no schema-version bump).
   */
  phases: LottiePhasesSchema.optional(),
  /**
   * D-125 §D2.2 — HOLD behaviour: `freeze` at the hold frame (default) or `idle-loop`
   * the mapped idle segment. Defaults to `freeze` so a pre-D-125 Lottie is unchanged.
   */
  holdBehavior: z.enum(['freeze', 'idle-loop']).default('freeze'),
  /**
   * D-125 §D2.1 — whether this Lottie DRIVES the composition's content-driven hold.
   * The INVERSE default of the ticker/clock/sequence `drivesHold` (absent ⇒ drives):
   * for the Lottie, absent/`false` ⇒ does NOT drive (a ticker on top drives the hold
   * and the furniture holds beneath); `true` ⇒ opts in. The runtime reads it as
   * `=== true`, never `!== false`. (Consumed in D-125 Phase 2.)
   */
  drivesHold: z.boolean().optional(),
  /**
   * RESERVED — unused. Runtime Lottie overrides shipped (D-125 Phase 3c) through the
   * `lottie-override` FieldBinding target (`bindings.ts`), not through this record:
   * an override is a runtime VALUE routed by a binding, not element state, so the
   * stored template stays byte-unchanged. Kept (optional, additive) only so stored
   * scenes that ever wrote it keep parsing; nothing reads it. Remove in a future
   * schema-version bump.
   */
  fieldOverrides: z.record(z.string(), z.unknown()).optional(),
});
export type LottieElement = z.infer<typeof LottieElementSchema>;

/**
 * D-137 / C-015 — a Live Source's SYMBOLIC id, and the format that makes it
 * symbolic. A plain identifier: it must start alphanumeric, and may then carry
 * alphanumerics, `_` and `-`.
 *
 * THE POINT IS WHAT IT REFUSES, not what it accepts. A scene may NOT name a
 * concrete device, because binding an id to a producer is an INSTALLATION fact
 * configured in CG Control, per plant — and a template that names `DECKLINK
 * DEVICE 3` stops being portable the moment it is opened anywhere else. The form
 * refuses all three device shapes by construction:
 *
 *   - `DECKLINK DEVICE 3` — spaces
 *   - `route://1-1`       — colon and slashes
 *   - `C:\media\guest.mp4` — colon and backslashes
 *
 * BEFORE this, `routeKey` was `z.string().min(1)` and all three parsed
 * identically, with nothing anywhere validating it — no refinement, no preflight,
 * no lint, no UI. Tightening it is deliberate and is NOT the additive half of this
 * change: the fields below are additive, this refinement is a narrowing. It is
 * safe to narrow because no stored scene in the repo carries the type at all (the
 * two `fixtures/b034/*.scene.json`, `fixtures/b068/legacy-root-layers.cg.json` and
 * all six tracked `.vcg` archives were byte-scanned; none contains it) and no
 * living spec references it — see `live-source-multibox` design.md §11 (C1).
 *
 * The Designer ALSO refuses a device-shaped id at preflight, with a message that
 * names the element. Two enforcement points, because the schema boundary is not
 * reached by a hand-edited scene that never round-trips through a parse.
 */
export const LiveSourceIdSchema = z
  .string()
  .min(1)
  .regex(
    /^[a-z0-9][a-z0-9_-]*$/i,
    'A Live Source id is symbolic: letters, digits, "_" and "-", starting alphanumeric. ' +
      'A concrete device (DECKLINK DEVICE 3, route://1-1, a file path) is an installation ' +
      'concern and never travels in the scene.',
  );

/**
 * D-137 — a **Live Source**: an axis-aligned region that renders as NOTHING in
 * both exports, so CasparCG can composite a live input on a LOWER layer behind the
 * hole (C-015). The authoring surfaces show procedural SMPTE bars instead, because
 * an invisible element is unusable to author against.
 *
 * The type stays `video-placeholder`. Renaming it is a scene MIGRATION, not a
 * label change, and is deliberately out of scope — the D-128 freeze forbids
 * REPURPOSING this type for file video (that is the separate `video` element), not
 * IMPLEMENTING it for the purpose it was reserved for.
 *
 * `keySourceId` is now DEPRECATED (see the field): never written, still parsed, so
 * every stored scene keeps loading with no schema-version bump. `expectedAspect` acquires its first consumer in phase 6 — it is
 * the author's DECLARATION to validate the mapped source against, never the input
 * to the fit computation, which is an installation fact (design.md §3).
 */
export const VideoPlaceholderElementSchema = ElementBaseSchema.extend({
  type: z.literal('video-placeholder'),
  posterAssetId: IdSchema.optional(),
  /**
   * D-147 — the author's DECLARATION about the source's shape, and now OPTIONAL.
   *
   * It was required. Making it optional is a WIDENING (every stored scene still
   * parses; only the TypeScript type gains `| undefined`) and it exists because of
   * what this field DOES downstream: under `live-source-multibox` design.md §3 the
   * bridge compares it against the installation's mapping and **refuses the take**
   * when the two disagree. A required field forces every author into that assertion
   * — including one who has never seen the feed and is guessing — and a wrong guess
   * becomes a refused take on air.
   *
   * Absent therefore means "I am not asserting anything about this source": no
   * comparison, no refusal. It is a third state, not a missing value, and the
   * Inspector offers it as `— not specified —`.
   */
  expectedAspect: z.number().positive().optional(),
  /**
   * ⭐ `C-028` — **how the picture is placed in this plate's box: `contain` (fit the
   * whole picture, centred, margins showing the template) or `cover` (scale to cover
   * and centre-crop).**
   *
   * 🔴 **PER ELEMENT, and that is a decision rather than a default.** The same catalog
   * source seated in a 16:9 box and a 3:4 box needs DIFFERENT fits, so a per-SOURCE
   * field would have to be wrong in one of them. The mode is a property of the PAIRING
   * of a picture with a box, and the element is where that pairing is authored.
   *
   * OPTIONAL, and absent means `contain` — the default, never `cover`. That flip
   * changes what an existing template puts on air for any plate whose source aspect is
   * both known and different from its box; permitted under `P-031`'s compatibility
   * floor and named as an on-air change in the change's proposal rather than left to
   * be discovered.
   *
   * ⚠ Distinct from {@link expectedAspect} and resolved by a different chain. That one
   * is the author's ASSERTION about the feed and is outranked by the SOURCE (`D-147` —
   * the author cannot see the feed). This one is a presentation choice the author
   * states and the OPERATOR may revise on the day, so it is outranked by the
   * per-assignment override instead. Two chains, opposite orders, deliberately
   * separate concerns.
   */
  fitMode: LiveFitModeSchema.optional(),
  /**
   * The FILL source's symbolic id, e.g. `guest-1` — **or absent, meaning UNASSIGNED.**
   *
   * ⭐ **`B-183` — a new plate points at NOTHING until the author says otherwise.** It used
   * to default to `live-1` (and, from the canvas tool, to `nextLiveSourceId`'s first free
   * `live-N`), which was the placeholder text of the Looks panel's source input — a
   * SUGGESTION the author had not accepted. The owner's principle: **nothing lands
   * unconfirmed.**
   *
   * 🔴 **`B-188` — THIS FIELD IS THE ONLY PLACE A SOURCE ID IS WRITTEN NOW.** The multi-frame
   * group used to declare a list beside it and `LookSource.routeKey` was the required half of
   * an asymmetry recorded here. That declaration is deleted: the group's source list is
   * DERIVED from these fields (`deriveLookSources`), so this optional field is the whole truth
   * and there is no second copy for it to contradict. A source comes into existence by being
   * typed here.
   *
   * ⚠ **Absent is not "invalid".** The export refuses it — `live-source-unset` in
   * `live-source-preflight.ts`, in DOCUMENT scope, so it refuses whether or not the template
   * has a group. (Its companion `look-source-undeclared` — "you chose something that does not
   * exist" — went with the declaration; there is nothing left to not-exist.)
   *
   * Two rejected alternatives, recorded so they are not relitigated: defaulting to the first
   * source already in use silently binds two plates to one input and the error is never seen;
   * keeping `live-N` means drawing a box invents a source the author never asked for.
   *
   * ⭐ **`B-187` (owner, 2026-10-14, Q2 (c)) re-opens the second half, ON A CONDITION.** A plate
   * drawn with the canvas tool now gets the next free `live-N` IN ITS LOOK — but marked
   * {@link routeKeyAuto} until the author confirms or replaces it, so the surface says the tool
   * chose it. That is what keeps "nothing lands unconfirmed": the name lands, labelled as not yet
   * the author's. A plate made any other way (the factory, a paste) is still unassigned.
   */
  routeKey: LiveSourceIdSchema.optional(),
  /**
   * 🔴 `B-187` — `true` while {@link routeKey} is an AUTOMATIC name the canvas tool gave a new
   * plate and the author has not confirmed or replaced it. The Inspector marks it "auto";
   * confirming it, or committing any id, drops the flag. Nothing reaches air differently: the
   * operator maps the id in CG Control either way, and the Live Source carrier never emits this
   * flag. Absent means the id (if any) is the author's.
   */
  routeKeyAuto: z.literal(true).optional(),
  /**
   * ⚠ DEPRECATED (owner, 2026-08-10; `live-source-multibox` design.md §1a).
   *
   * **Never written by a new document, still parsed so every stored scene keeps
   * loading.** A template declares ONE symbolic id; whether it resolves to a
   * single device or to a fill/key DEVICE PAIR is a property of the
   * installation's MAPPING, never of the scene — the author cannot know how a
   * source arrives at a plant. The Inspector's control for it is gone, and
   * `collectLiveSources` no longer emits it onto the declaration.
   *
   * ⚠ NOT REMOVED, and that is deliberate: it shipped and it is optional, so
   * deleting it is a MIGRATION with its own decision, not a tidy-up. A field
   * that stops being written but stays on screen is worse than either state —
   * which is why the control went and this did not.
   */
  keySourceId: LiveSourceIdSchema.optional(),
  /**
   * ⭐ The plate's FRAME (owner, 2026-08-10; `live-source-multibox` design.md
   * §9a.1). Optional and additive — no schema-version bump, and every stored scene
   * keeps parsing with it absent.
   *
   * **This is `StrokeSchema`, unchanged — NOT a second stroke concept.** The shared
   * schema is `{ width, color, dash? }` and has NO alignment notion; box kinds render
   * it as a CSS `border`, and for a Live Source the renderer places that border
   * OUTSIDE the declared `width`/`height` by declaring `box-sizing: content-box` on
   * the plate.
   *
   * ⚠ That placement is DECLARED, not inherited from the CSS default: every surface
   * the page renders on ships a `*{box-sizing:border-box}` reset (`cgCss` in both
   * exporters and the Preview, `@cg/ui`'s `theme.css` on the canvas), so the default
   * never applies. `scene-builder.ts`'s `buildLiveSource` carries the detail.
   *
   * 🔴 **That is the property the rest of the feature rests on: the declared rect
   * stays the CONTENT box.** `collectLiveSources` reads `transform.size`, so a
   * stroke of any width leaves the declared hole — and the overlap preflight that
   * reads it — exactly where they were. Two plates whose FRAMES overlap is not a
   * fault; two plates whose HOLES overlap is.
   *
   * `width: 0` is legal and means NO FRAME with the colour REMEMBERED: it renders
   * identically to an absent stroke, so nothing may read the zero as "unset" and
   * substitute a default (the falsy-zero trap this repo has already met twice).
   *
   * If shapes ever gain a stroke ALIGNMENT notion, a Live Source offers only
   * `outside` — for the reason above, not as a limitation of the control.
   */
  stroke: StrokeSchema.optional(),
});
export type VideoPlaceholderElement = z.infer<typeof VideoPlaceholderElementSchema>;

/**
 * D-128 — the video element's phase marks, in the CLIP'S OWN TIME SPACE (ms from
 * clip start). OPTIONAL and MANUAL — video has no bodymovin `markers` equivalent
 * to read them from. Absent ⇒ the whole clip is the intro, the hold loops the
 * whole clip, and there is no outro. Time-based (ms), NOT frame-based: unlike
 * bodymovin (which declares `fr`/`ip`/`op`), a WebM clip's authoritative axis is
 * time — its frame rate is an encoding detail the browser does not expose
 * reliably.
 */
export const VideoPhasesSchema = z
  .object({
    /**
     * End of the IN phase (ms from clip start). The hold point.
     *
     * Session Y — under `source: 'composition'` an AUTHORED value WINS (the clip's own intro,
     * scheduled to finish at the effective content start); ABSENT (what attach writes now) the
     * window is DERIVED (`followWindowMs`). The pre-Y attach SEED SIGNATURE
     * (`introEnd == round(durationMs/2)`, `outroStart == durationMs`) derives as if absent —
     * see `videoFollowClipFacts`. OPTIONAL since session Y so attach can write the source alone.
     */
    introEnd: z.number().nonnegative().optional(),
    /** Start of the OUT phase (ms); the outro is `[outroStart → clip end]`. Session Y: optional; authored wins under follow, absent derives END-anchored. */
    outroStart: z.number().nonnegative().optional(),
    /** Optional hold segment looped instead of `[introEnd → outroStart]`. Under `'composition'` it COMPOSES with the derived hold time (idle is never derived — absent means freeze at `H`). */
    idle: z
      .object({ start: z.number().nonnegative(), end: z.number().nonnegative() })
      .refine((r) => r.start <= r.end, { message: 'idle.start must not exceed idle.end' })
      .optional(),
    /**
     * Where the marks come from (media-phases-follow-composition). Video had NO source field —
     * manual was the only possibility — so this is OPTIONAL and absent ⇒ exactly
     * `'manual'`-equivalent: every stored scene round-trips unchanged. `'composition'` DERIVES
     * the window from the composition's lifecycle (see `introEnd`'s note). Units are NOT unified
     * with the Lottie's: video stays in the clip's own ms.
     */
    source: z.enum(['manual', 'composition']).optional(),
    /**
     * The clip time whose look the composition HOLDS (`H`), in MS — meaningful ONLY under
     * `source: 'composition'`, ignored otherwise. Absent ⇒ `H` = entrance span ("play the clip
     * from its head"). Optional + additive.
     */
    holdAt: z.number().nonnegative().optional(),
  })
  .refine(
    (p) => p.introEnd === undefined || p.outroStart === undefined || p.introEnd <= p.outroStart,
    { message: 'introEnd must not exceed outroStart' },
  );
export type VideoPhases = z.infer<typeof VideoPhasesSchema>;

/**
 * D-128 — an imported video clip as a lifecycle-aware element. DISTINCT from
 * `video-placeholder` (the live-source plate reserved for D-137) — the two are
 * never merged. The referenced asset is the ONE canonical stored form produced
 * at import: VP8+alpha WebM (`libvpx`, `-auto-alt-ref 0`, `yuva420p`, audio
 * stripped `-an`, conformed to the project frame rate; crop, when marked, is
 * BAKED into these bytes — so the element carries no crop field, and preview
 * and both exporters read identical bytes). Opaque by design: positioned /
 * scaled / rotated / opacity-animated and timed like any element, never edited
 * frame-by-frame. Lifecycle wiring (hold/outro/drivesHold consumption) lands in
 * Phase 4 — this schema only makes the shape valid and round-trippable.
 */
export const VideoElementSchema = ElementBaseSchema.extend({
  type: z.literal('video'),
  /** The converted canonical WebM asset (`kind: 'video'`; the ONLY stored form). */
  assetId: IdSchema,
  /** Clip duration in ms, captured at conversion (validation + timeline span). */
  durationMs: z.number().positive(),
  /**
   * HOLD behaviour — the INVERSE of the Lottie's `freeze` default (D-128 note
   * (d)): video furniture is authored as a loop, so on reaching the hold point
   * the clip LOOPS by default; `freeze` is the opt-in alternative.
   */
  holdBehavior: z.enum(['loop', 'freeze']).default('loop'),
  /**
   * Whether this video DRIVES the composition's content-driven hold — the
   * Lottie's inverse default (D-128 note (j)): absent/`false` ⇒ does NOT drive
   * (a ticker on top drives the hold and the clip holds beneath); `true` ⇒ opts
   * in. Read as `=== true`, never `!== false`. (Consumed in Phase 4.)
   */
  drivesHold: z.boolean().optional(),
  /** Manual phase marks; absent ⇒ whole-clip intro, loop-all hold, no outro. */
  phases: VideoPhasesSchema.optional(),
});
export type VideoElement = z.infer<typeof VideoElementSchema>;

/**
 * `D-165` — WHEN a sound effect starts: at the graphic's ENTRANCE (its take — `CG PLAY`), a TIME in
 * ms after that entrance, or at its EXIT (`CG STOP` / an auto-exit). A hard Clear is no exit, so it
 * starts nothing.
 */
export const AudioStartSchema = z.discriminatedUnion('at', [
  z.object({ at: z.literal('entrance') }),
  z.object({ at: z.literal('exit') }),
  z.object({ at: z.literal('time'), ms: z.number().int().nonnegative() }),
]);
export type AudioStart = z.infer<typeof AudioStartSchema>;

/** `D-165` — the element's volume bounds, in dB (0 = as imported). */
export const AUDIO_VOLUME_DB_MIN = -60;
export const AUDIO_VOLUME_DB_MAX = 6;

/**
 * 🔴 `D-165` — a SOUND EFFECT authored in the template: a whoosh as the graphic enters, a hit as it
 * leaves. NOT drawn on the canvas — it lives on the timeline and in the Inspector; the base
 * `transform` is carried only because every element has one. It plays ONCE per occurrence (a hold
 * never loops it) and never drives a hold. The referenced asset is the ONE stored form the import
 * produces: 16-bit PCM WAV, 48 kHz stereo (`kind: 'audio'`) — measured to play from a template
 * page on CasparCG 2.5.0. The page plays it through its own audio; the bridge sends no command for
 * it.
 */
export const AudioElementSchema = ElementBaseSchema.extend({
  type: z.literal('audio'),
  /** The stored WAV asset (`kind: 'audio'`). */
  assetId: IdSchema,
  /** Sound duration in ms, measured at import (timeline span). */
  durationMs: z.number().positive(),
  start: AudioStartSchema.default({ at: 'entrance' }),
  /** Gain in dB applied on playback, −60…+6; 0 plays the sound as imported. */
  volumeDb: z.number().min(AUDIO_VOLUME_DB_MIN).max(AUDIO_VOLUME_DB_MAX).default(0),
  /** Optional linear fades, in ms, from the sound's start and to its end. */
  fadeInMs: z.number().int().nonnegative().optional(),
  fadeOutMs: z.number().int().nonnegative().optional(),
});
export type AudioElement = z.infer<typeof AudioElementSchema>;

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
  /**
   * D-112 — per-INSTANCE hold overrides. Keyed by a nested content element's stable id; the value
   * is whether that element drives THIS instance's parent hold. Absent key ⇒ fall back to the
   * element's own `drivesHold` (absent ⇒ drives, `false` ⇒ excluded). Scopes to the referenced
   * composition's OWN direct content; a deeper instance carries its own `holdOverrides` (cascade per
   * level). Lives on the parent's instance, NOT the shared child — so other instances are unaffected.
   * Optional + additive: pre-D-112 scenes round-trip unchanged (no schema-version bump).
   */
  holdOverrides: z.record(z.string(), z.boolean()).optional(),
  /**
   * 🔴 `DELTA-RUN-NEXT-VERSION-01-F` — **STARTS HIDDEN: this instance waits for a countdown step to
   * show it.** At Take it does NOT enter with the graphic (unless the step current at Take shows it);
   * a step's `visible: true` plays its OWN entrance and it then holds per its own settings, and a
   * step's `visible: false` plays its OWN exit. Unlike `visible: false` (B-034: never shown, its
   * subtree inert), a hidden-at-start instance is a live part of the graphic waiting for its cue.
   * Absent ⇒ `false`: every instance authored before this enters with its graphic, as it did.
   */
  startsHidden: z.boolean().optional(),
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
  | PathElement
  | LottieElement
  | VideoPlaceholderElement
  | VideoElement
  | AudioElement
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
  | z.input<typeof ImageElementSchema>
  | ShapeElement
  | PathElement
  | z.input<typeof LottieElementSchema>
  | VideoPlaceholderElement
  | z.input<typeof VideoElementSchema>
  | z.input<typeof AudioElementSchema>
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
    PathElementSchema,
    LottieElementSchema,
    VideoPlaceholderElementSchema,
    VideoElementSchema,
    AudioElementSchema,
    CompositionElementSchema,
    ContainerElementSchema,
  ]),
);
