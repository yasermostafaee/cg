import { z } from 'zod';
import {
  DurationFramesSchema,
  FrameRateSchema,
  HexColorSchema,
  IdSchema,
  ISODateSchema,
  ResolutionSchema,
} from './primitives.js';
import { ElementSchema, type Element } from './elements.js';
import { DynamicFieldSchema } from './fields.js';
import { FieldBindingSchema } from './bindings.js';
import { FrameRangeSchema, type FrameRange } from './animation.js';

/**
 * D-020 — composition lifecycle out-point, defined **inside** the active region.
 * A single marker (matching Loopic's single outro frame): IN = `[activeRange.in,
 * outPoint]` (plays fully), HOLD = the held `outPoint`, OUT = `[outPoint,
 * activeRange.out]`. The invariant `activeRange.in ≤ outPoint ≤ activeRange.out`
 * is enforced on the host composition (see `refineLifecycle`). Absent `lifecycle`
 * keeps today's behavior (no distinct phases — the full active region plays).
 *
 * D-104 follow-up — `contentStart` is the OPTIONAL symmetric "in" marker: the frame
 * where this composition's CONTENT (ticker / clock / sequence) begins, the designer's
 * explicit override of the runtime's `entranceSettleFrame()` heuristic. ABSENT ⇒ the
 * heuristic (entrance completion) is used, so existing scenes are unchanged (no version
 * bump). Constrained to `[activeRange.in, outPoint]` (see `refineLifecycle`).
 */
export const LifecycleSchema = z.object({
  outPoint: DurationFramesSchema,
  contentStart: DurationFramesSchema.optional(),
});
export type Lifecycle = z.infer<typeof LifecycleSchema>;

/**
 * No-code playout timing modes. `manual` holds after the intro until `stop()`.
 * D-114 — `static` is the no-out-point mode: play intro → hold → hard cut on `stop()`,
 * with NO animated exit. `manual` / `auto-out` / `loop-cycle` all require an out-point;
 * `playoutOf` resolves a composition with no out-point to `static`.
 */
export const PlayoutModeSchema = z.enum(['manual', 'auto-out', 'loop-cycle', 'static']);
export type PlayoutMode = z.infer<typeof PlayoutModeSchema>;

/**
 * D-028 — what ends a hold (orthogonal to `mode`): `timed` holds for `holdMs`;
 * `content-driven` holds until the scope's content elements (tickers) signal
 * completion — all finite tickers done; an infinite ticker holds until `stop()`;
 * a scope with no content elements gets a zero-length hold. Ignored by `manual`
 * (the operator ends the hold).
 */
export const HoldSourceSchema = z.enum(['timed', 'content-driven']);
export type HoldSource = z.infer<typeof HoldSourceSchema>;

const PlayoutObjectSchema = z.object({
  mode: PlayoutModeSchema.default('manual'),
  /** Absent ⇒ 'timed' (resolved by `playoutOf` / the controller). */
  holdSource: HoldSourceSchema.optional(),
  holdMs: z.number().min(0).optional(),
  repeat: z.union([z.number().int().min(1), z.literal('infinite')]).optional(),
});

/**
 * D-020/D-028 — composition playout timing config, TWO orthogonal axes:
 * `mode` answers "how many open/close cycles" (`auto-out` runs the outro once
 * after the hold; `loop-cycle` repeats `[in→outPoint]` → hold → `[outPoint→end]`
 * for `repeat` cycles or forever when `'infinite'`); `holdSource` answers "how
 * long each hold lasts" (`timed` = `holdMs`; `content-driven` = until the
 * scope's tickers complete — the ticker's own `repeat` counts crawl passes).
 * Default `manual`/`timed`. Absent `playout` ⇒ `manual`.
 *
 * Legacy: `mode: 'content-driven'` (pre-D-028, when it was a sibling mode) is
 * normalized at parse time to `mode: 'loop-cycle', holdSource: 'content-driven'`
 * — behaviourally faithful for every stored scene (none had tickers, so holds
 * were zero-length in both forms). A registry migration is deferred until a
 * schema-version bump is unavoidable.
 */
export const PlayoutSchema = z.preprocess((raw) => {
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    if (o['mode'] === 'content-driven') {
      return { ...o, mode: 'loop-cycle', holdSource: 'content-driven' };
    }
  }
  return raw;
}, PlayoutObjectSchema);
export type Playout = z.infer<typeof PlayoutObjectSchema>;

/**
 * Enforce the lifecycle phase invariant against the host's active region
 * (`activeRange ?? frameRange`). A no-op when `lifecycle` is absent.
 */
function refineLifecycle(
  data: {
    frameRange: FrameRange;
    activeRange?: FrameRange | undefined;
    lifecycle?: Lifecycle | undefined;
  },
  ctx: z.RefinementCtx,
): void {
  if (data.lifecycle === undefined) return;
  const active = data.activeRange ?? data.frameRange;
  const { outPoint, contentStart } = data.lifecycle;
  const ok = active.in <= outPoint && outPoint <= active.out;
  if (!ok) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['lifecycle'],
      message: `lifecycle must satisfy activeRange.in (${String(active.in)}) ≤ outPoint (${String(outPoint)}) ≤ activeRange.out (${String(active.out)})`,
    });
  }
  // D-104 follow-up — the content-start marker sits inside the entrance: in ≤ contentStart ≤ outPoint.
  if (contentStart !== undefined && !(active.in <= contentStart && contentStart <= outPoint)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['lifecycle', 'contentStart'],
      message: `lifecycle.contentStart (${String(contentStart)}) must satisfy activeRange.in (${String(active.in)}) ≤ contentStart ≤ outPoint (${String(outPoint)})`,
    });
  }
}

/** Categories of broadcast template. v1 set; `custom` is the escape hatch. */
export const TemplateTypeSchema = z.enum([
  'logo-bug',
  'lower-third',
  'ticker',
  'breaking-news',
  'fullscreen',
  'custom',
]);
export type TemplateType = z.infer<typeof TemplateTypeSchema>;

/** Layer = logical editor grouping. Distinct from CasparCG layer slots. */
export const LayerSchema = z.object({
  id: IdSchema,
  name: z.string(),
  visible: z.boolean(),
  locked: z.boolean(),
  children: z.array(ElementSchema),
  blendMode: z.literal('normal'),
});
export type Layer = z.infer<typeof LayerSchema>;

/**
 * A reusable composition (After-Effects-style pre-comp). Each carries its own
 * size + duration + layers and can be opened and edited like the main scene,
 * or placed inside another composition as a `composition` element. The project
 * keeps these in `Scene.compositions`; the main scene is the `Scene` itself.
 */

/**
 * D-086 — the playout target a composition exports for. A single member for now
 * (CasparCG is the only target); the enum is the extensible seam so a real 2nd
 * target (C-001) is a one-line addition. The visible per-composition selector is
 * deferred until then — this is the persisted field only.
 */
export const PlayoutTargetSchema = z.enum(['casparcg']);
export type PlayoutTarget = z.infer<typeof PlayoutTargetSchema>;

/**
 * B-129 — the EDITOR's backdrop, and nothing else: a viewing aid that makes
 * authored content legible while working.
 *
 * 🔴 **It is NEVER rendered to output and never travels in an exported package.**
 * The name is the contract (golden rule 6) — it was called `background`, one field
 * carrying two different facts ("let me see my white text" and "this graphic paints
 * a background on air"), and the render path could not tell them apart, so an
 * editor preference reached air as a full-frame card over live video.
 *
 * An authored background is a REAL ELEMENT — a full-frame rect, with a real entry
 * in the scene, which renders unchanged. That is the only way to paint on air.
 */
const EditorBackdropSchema = z.union([z.literal('transparent'), HexColorSchema]);

const CompositionObjectSchema = z
  .object({
    id: IdSchema,
    name: z.string(),
    resolution: ResolutionSchema,
    // D-026 — fps is a single PROJECT-level setting on `Scene.frameRate`, shared by
    // every composition (one CasparCG channel fps; keeps cascade timing comparable
    // across nested children). Compositions no longer carry their own `frameRate`;
    // legacy per-composition fps is stripped on load (schema) and the project fps
    // applies everywhere.
    frameRange: FrameRangeSchema,
    activeRange: FrameRangeSchema.optional(),
    /** D-020 lifecycle out-point marker (optional; absent = no distinct phases). */
    lifecycle: LifecycleSchema.optional(),
    /** D-020 no-code playout timing (optional; absent = `manual`). */
    playout: PlayoutSchema.optional(),
    /**
     * D-086 — the playout target this composition exports for (CasparCG-only for
     * now). Optional + backward-compatible: absent ⇒ the default `casparcg`. It
     * persists into the `.vcg` and travels with the composition; the visible
     * selector is deferred to a 2nd target (C-001).
     */
    playoutTarget: PlayoutTargetSchema.optional(),
    /** B-129 — EDITOR affordance only; never rendered to output. See {@link EditorBackdropSchema}. */
    editorBackdrop: EditorBackdropSchema,
    layers: z.array(LayerSchema),
    /**
     * D-025 — this composition's OWN dynamic fields + their bindings. Fields are
     * per-composition (each composition scopes its own data keys, flat and unique
     * within it). A parent that nests this composition aggregates these under the
     * instance's namespace (see `aggregateCompositionFields`). Default `[]` so
     * compositions authored before this field validate unchanged (absent ⇒ none).
     */
    fields: z.array(DynamicFieldSchema).optional(),
    bindings: z.array(FieldBindingSchema).optional(),
  })
  .superRefine(refineLifecycle);
/**
 * P-031 — NO legacy `background` → `editorBackdrop` shim any more.
 *
 * B-129 renamed the key and left a `z.preprocess` that accepted the old one. The
 * owner's compatibility-floor decision (see `P-031` in `docs/prd/platform.md`)
 * retires it: nothing has shipped, so no document in the world needs it, and a
 * conversion nobody needs is debt that reads as safety. A document carrying
 * `background` and no `editorBackdrop` now fails to parse — loudly, with zod
 * naming the missing required key — which is the honest answer for a file that
 * predates the current format.
 */
export const CompositionSchema = CompositionObjectSchema;
export type Composition = z.infer<typeof CompositionObjectSchema>;

const FontReferenceSchema = z.object({
  family: z.string().min(1),
  weights: z.array(z.number().int().positive()).min(1),
  styles: z.array(z.enum(['normal', 'italic'])).min(1),
  source: z.enum(['bundled', 'system']),
  bundledPath: z.string().optional(),
  licenseRef: z.string().optional(),
});
export type FontReference = z.infer<typeof FontReferenceSchema>;

export { FontReferenceSchema };

const SceneMetadataSchema = z.object({
  author: z.string().optional(),
  createdAt: ISODateSchema,
  updatedAt: ISODateSchema,
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

/**
 * R-011 — a 9-point on-air position: the anchor aligns the graphic's
 * matching handle to the OUTPUT frame's matching handle (corners are 4 of
 * the 9), and the offset is a pixel nudge in output space (x→right,
 * y→down). Authored/applied against the 1920×1080 reference output frame;
 * non-1080 channels are documented future work.
 */
export const PositionAnchorSchema = z.enum([
  'top-left',
  'top-center',
  'top-right',
  'mid-left',
  'center',
  'mid-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
]);
export type PositionAnchor = z.infer<typeof PositionAnchorSchema>;

export const PositionSchema = z.object({
  anchor: PositionAnchorSchema,
  offset: z.object({ x: z.number(), y: z.number() }),
});
export type Position = z.infer<typeof PositionSchema>;

/**
 * R-011 — THE serialisation of an operator override onto a page's query string:
 * `pos=<anchor>&dx=<x>&dy=<y>`, with no leading `?` (the caller joins it with
 * whatever else rides the same query).
 *
 * ONE builder, deliberately, because there are now TWO deliverers of the same
 * override and they must not drift: the bridge appends it to the served
 * `/template/<id>` URL for CasparCG, and the Runtime's PVW hands the identical
 * string to the rehearsal frame's own `applyOutputPosition`. A preview that
 * spelled the query differently from air would place the graphic differently
 * from air while looking authoritative — the exact failure a rehearsal exists to
 * prevent.
 *
 * It lives HERE, next to {@link PositionSchema}, because it is the only package
 * all three sides already depend on. `@cg/template-runtime`'s
 * `parsePositionQuery` is its inverse and round-trips against it under test.
 */
export function positionQuery(position: Position): string {
  return [
    `pos=${position.anchor}`,
    `dx=${String(position.offset.x)}`,
    `dy=${String(position.offset.y)}`,
  ].join('&');
}

/**
 * R-011 — where a scene sits when NOBODY has said otherwise: dead centre, no
 * nudge. The last step of the page's own `query override ?? scene.defaultPosition
 * ?? centered` chain (`@cg/template-runtime`'s `resolveOutputPosition`).
 */
export const CENTERED_POSITION: Position = { anchor: 'center', offset: { x: 0, y: 0 } };

/**
 * The AUTHORED default position, resolved — `scene.defaultPosition` when the
 * author set one, else {@link CENTERED_POSITION}.
 *
 * ONE spelling, for the same reason {@link positionQuery} is one builder. The
 * `live-source-multibox` carrier records this value on `TemplateInfo` at import
 * so the bridge can resolve the SAME position chain the page does; the page
 * resolves its own tail through `resolveOutputPosition`. If the two spelled
 * "centred" separately, a template with no operator override would place its
 * live box against one origin and paint its hole against another — and the hole
 * is transparent, so nothing on air would say why (design.md §6).
 */
export function resolveDefaultPosition(scene: {
  defaultPosition?: Position | undefined;
}): Position {
  return scene.defaultPosition ?? CENTERED_POSITION;
}

/** Scene — root of the editor's domain model. */
const SceneObjectSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: IdSchema,
    name: z.string(),
    templateType: TemplateTypeSchema,
    resolution: ResolutionSchema,
    frameRate: FrameRateSchema,
    safeAreas: z.object({
      title: z.number().min(0).max(50),
      action: z.number().min(0).max(50),
    }),
    /**
     * The scene's **total** frame count — the full extent the timeline
     * ruler, gridlines, and playhead scrub across. Defaults to [0, 50] in
     * newScene().
     */
    frameRange: FrameRangeSchema,
    /**
     * The **active region** — the play / export / preview window, drawn as
     * the resizable scene (main-layer) bar at the top of the timeline. When
     * absent the active region is the full `frameRange`, so scenes authored
     * before this field validate and play unchanged. Resizing the scene bar
     * narrows this without touching `frameRange`, so the ruler keeps the
     * full frame count and the trailing frames stay visible but inactive.
     * Invariant: `frameRange.in ≤ activeRange.in ≤ activeRange.out ≤
     * frameRange.out` and `activeRange.out > activeRange.in`.
     */
    activeRange: FrameRangeSchema.optional(),
    /** D-020 lifecycle out-point marker (optional; absent = no distinct phases). */
    lifecycle: LifecycleSchema.optional(),
    /** D-020 no-code playout timing (optional; absent = `manual`). */
    playout: PlayoutSchema.optional(),
    /**
     * R-011 — the template's default ON-AIR position (the manifest default
     * the operator can override per item). Consumed by the on-air runtime
     * only — the Designer preview shows the comp at its own resolution.
     * Optional + backward-compatible: absent ⇒ the runtime centers the
     * graphic on the output frame. Auto-populating it from the nested
     * instance position is the D-119 Designer track.
     */
    defaultPosition: PositionSchema.optional(),
    /** B-129 — EDITOR affordance only; never rendered to output. See {@link EditorBackdropSchema}. */
    editorBackdrop: EditorBackdropSchema,
    layers: z.array(LayerSchema),
    fields: z.array(DynamicFieldSchema),
    bindings: z.array(FieldBindingSchema),
    fonts: z.array(FontReferenceSchema),
    /**
     * Reusable sub-compositions (pre-comps). The main scene is the `Scene`
     * itself; these are the extra comps shown in the Compositions panel and
     * resolved when a `composition` element references one by id. Optional so
     * scenes authored before the feature validate unchanged.
     */
    compositions: z.array(CompositionSchema).optional(),
    /**
     * D-115 — the explicitly designated MAIN / entry composition: which composition the editor
     * opens on by default (and the template's intended entry), independent of list order. A
     * `compositions[].id`. Absent ⇒ no designation: fall back to the first composition (the prior
     * default), so scenes authored before this field open + play unchanged. Cleared when the
     * referenced composition is deleted.
     */
    entryCompositionId: IdSchema.optional(),
    metadata: SceneMetadataSchema,
  })
  .superRefine(refineLifecycle);
export const SceneSchema = SceneObjectSchema;
export type Scene = z.infer<typeof SceneObjectSchema>;

/**
 * B-129 — the scene as an EXPORTER must emit it: every backdrop forced transparent,
 * on the scene and on every composition.
 *
 * ⚠ **This is DEFENCE IN DEPTH, not the guard.** The guard is the render path, which
 * paints the backdrop only in `author` mode ({@link EditorBackdropSchema}). This makes
 * the artifact unable to carry the value even if a future renderer forgot the mode
 * check — belt to the render path's braces.
 *
 * ONE implementation, exported from here because BOTH exporters need it and two
 * spellings of one rule is how the render path and the artifact come to disagree
 * (golden rule 6).
 */
export function withoutEditorBackdrop(scene: Scene): Scene {
  const compositions = scene.compositions?.map((c) =>
    c.editorBackdrop === 'transparent' ? c : { ...c, editorBackdrop: 'transparent' as const },
  );
  return {
    ...scene,
    editorBackdrop: 'transparent',
    ...(compositions === undefined ? {} : { compositions }),
  };
}

/**
 * The effective active region (play / export / preview window) of a scene:
 * its explicit `activeRange` when set, otherwise the full `frameRange`. This
 * is the single place renderer and runtime resolve the window so an absent
 * `activeRange` always behaves exactly as the full scene.
 */
export function activeRangeOf(scene: Pick<Scene, 'frameRange' | 'activeRange'>): {
  in: number;
  out: number;
} {
  return scene.activeRange ?? scene.frameRange;
}

/**
 * The effective playout config: the composition's explicit `playout`, or the
 * `manual` default when absent. Single place the runtime resolves timing so an
 * absent `playout` always behaves as `manual` (hold after intro until stop).
 * Defensively normalizes the legacy `mode: 'content-driven'` for scene objects
 * handed straight to `createRuntime` without re-parsing (e.g. old exported
 * `template.json` driven by a NEW runtime bundle).
 */
export function playoutOf(scene: Pick<Scene, 'playout' | 'lifecycle'>): Playout {
  const p = scene.playout;
  const base: Playout =
    p === undefined
      ? { mode: 'manual', holdSource: 'timed' }
      : (p.mode as string) === 'content-driven'
        ? { ...p, mode: 'loop-cycle', holdSource: 'content-driven' }
        : { ...p, holdSource: p.holdSource ?? 'timed' };
  // D-114 — a composition with NO out-point and the DEFAULT (`manual`) mode is `static`: it plays in,
  // holds until `stop()`, and hard-cuts (no animated exit). Resolve-on-read (non-destructive, like the
  // legacy content-driven normalization above), so the runtime controller, exporter, and inspector
  // agree without a stored migration. SCOPE — only `manual`/absent resolves: an explicit `auto-out` /
  // `loop-cycle` (or normalized `content-driven`) WITHOUT an out-point keeps its timed / content-driven
  // hold + empty (cut) outro (B-032). The designer UI never SETS those without an out-point — clearing
  // the out-point reverts to `static` — so a no-out-point composition authored in the editor IS static;
  // the auto-out-without-out-point case is legacy / programmatic only.
  if (scene.lifecycle === undefined && base.mode === 'manual') return { ...base, mode: 'static' };
  return base;
}

/**
 * B-032 — does this composition tree have any EFFECTIVE content hold driver: a `ticker` /
 * `sequence` / countdown `clock` (absent `drivesHold` ⇒ drives), or an OPTED-IN media element —
 * `lottie` (D-125) / `video` (D-128), `drivesHold === true` — in its OWN layers OR reachable
 * through a nested composition instance (recursing containers; cycle-guarded)? A `content-driven`
 * hold with NONE is a zero-length, meaningless hold, so the resolution boundary (this is consumed by
 * the exporter's `buildPlayoutMetadata`, the Designer Playout inspector, and mirrored by the
 * runtime's per-scope `effectivePlayoutFor`) falls `content-driven` back to `timed` — honoring the
 * authored `holdMs` so export + on-air agree. Wall/countup clocks never complete, so they are not
 * drivers. D-112 — effective participation through a nested instance is the instance's
 * `holdOverrides[id]` (force-include / force-exclude per instance) when defined, else the element's
 * own `drivesHold !== false`; so a nested element excluded via an override correctly counts as "no
 * driver" (→ timed), and a `drivesHold:false` element force-included via an override counts as one.
 */
export function hasEffectiveHoldDrivers(
  root: Pick<Scene, 'layers'>,
  compositions: readonly Composition[] | undefined,
): boolean {
  const visited = new Set<string>();
  // `overrides` are the per-instance `holdOverrides` governing THIS level's direct content (undefined
  // at the root — the root's own content uses its own `drivesHold`).
  // B-034 — a HIDDEN content element (`visible: false`) is never an effective driver, regardless of
  // `drivesHold` / `holdOverrides`, so a composition whose only content is hidden has no drivers.
  const drives = (
    el: { id: string; drivesHold?: boolean | undefined; visible?: boolean },
    overrides?: Readonly<Record<string, boolean>>,
  ): boolean => el.visible !== false && (overrides?.[el.id] ?? el.drivesHold !== false);
  const walk = (
    children: readonly Element[],
    overrides?: Readonly<Record<string, boolean>>,
  ): boolean =>
    children.some((el) => {
      if (el.type === 'ticker' || el.type === 'sequence') return drives(el, overrides);
      if (el.type === 'clock' && el.mode === 'countdown') return drives(el, overrides);
      // D-125 §D2.1 / D-128 (c) — MEDIA (a Lottie, a video) drives the hold ONLY when it OPTED
      // IN (`drivesHold === true`), the INVERSE default of the kinds above (absent ⇒ drives), so
      // it cannot reuse `drives()`. B-034 — a hidden media element is never an effective driver.
      // Mirrors the runtime's `scopeHasEffectiveHoldDrivers` (which reads video and lottie with
      // the same opt-in), so export metadata, the Playout inspector, and on-air agree.
      if (el.type === 'lottie' || el.type === 'video')
        return el.visible !== false && (overrides?.[el.id] ?? el.drivesHold === true);
      // B-034 — a HIDDEN container / composition instance makes its WHOLE subtree inert: SHORT-CIRCUIT
      // before descending, so a visible driver inside a hidden ancestor is not an effective driver
      // (mirrors render's display:none + the runtime's subtree-skip).
      if (el.type === 'container') return el.visible !== false && walk(el.children, overrides);
      if (el.type === 'composition') {
        if (el.visible === false || visited.has(el.compositionId)) return false;
        visited.add(el.compositionId);
        const comp = compositions?.find((c) => c.id === el.compositionId);
        // The nested instance's OWN content is governed by its own `holdOverrides` (cascade per level).
        return comp !== undefined && comp.layers.some((l) => walk(l.children, el.holdOverrides));
      }
      return false;
    });
  return root.layers.some((l) => walk(l.children, undefined));
}

/**
 * D-029 / R-028 (5.4) — can `runtime.next()` advance anything in this scene?
 *
 * THE ONE predicate, shared by the Designer's preview transport and the
 * Runtime's per-row NEXT verb. A second copy is exactly the drift this repo
 * forbids (a Designer that greys Next while the Runtime offers it, or worse
 * the reverse: an enabled control that can only no-op — the anti-pattern
 * R-021 stage 2b named).
 *
 * True iff a REACHABLE, VISIBLE `sequence` element exists. `next()` dispatches
 * to each scope's sequence drivers and nothing else (`runtime.ts` `dispatchNext`
 * → `scope.sequences`), so a sequence element is precisely what makes a scene
 * steppable — today. When the D-031 authored-steps model joins that dispatch,
 * it joins THIS predicate too.
 *
 * Reachability follows the runtime's own subtree cascade, so all THREE
 * composition reference kinds are walked (the `collectChildCompositionRefs`
 * set): a plain `composition` instance, a `repeater` (which stamps one subtree
 * per row), and a D-083 sequence COMPOSITION ITEM (which builds its own item
 * subtree). Missing the latter two under-reports — a sequence nested inside a
 * repeater row genuinely IS steppable on air.
 *
 * B-034 — a hidden instance/container SHORT-CIRCUITS its whole subtree before
 * descending: content under a hidden ancestor is inert (render's `display:none`
 * and the runtime's subtree-skip agree), so it must not make a scene steppable.
 * Cycle-guarded like every other instance walk here.
 *
 * NOT gated on `advance` (`'auto'` sequences still respond to `next()`), nor on
 * `items.length` (a bound `list` field REPLACES the authored items at playout,
 * so an empty authored list can still be many steps on air), nor on the
 * `sequence-items` binding (a sequence with authored items and no binding is
 * steppable). Those would each be a different question.
 */
export function hasNextStep(
  root: Pick<Scene, 'layers'>,
  compositions: readonly Composition[] | undefined,
): boolean {
  const visited = new Set<string>();
  const intoComposition = (compositionId: string): boolean => {
    if (visited.has(compositionId)) return false;
    visited.add(compositionId);
    const comp = compositions?.find((c) => c.id === compositionId);
    return comp !== undefined && comp.layers.some((l) => walk(l.children));
  };
  const walk = (children: readonly Element[]): boolean =>
    children.some((el) => {
      if (el.visible === false) return false;
      if (el.type === 'sequence') {
        // The sequence itself is steppable; its composition ITEMS need no
        // further inspection for that answer (a sequence with any items — or a
        // list binding supplying them — is what NEXT advances).
        return true;
      }
      if (el.type === 'container') return walk(el.children);
      if (el.type === 'composition') return intoComposition(el.compositionId);
      // A repeater stamps its composition once per row; a sequence inside one
      // is reached by the runtime's cascade, so it counts.
      if (el.type === 'repeater') return intoComposition(el.compositionId);
      return false;
    });
  return root.layers.some((l) => walk(l.children));
}
