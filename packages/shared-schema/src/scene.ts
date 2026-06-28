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

/** No-code playout timing modes. `manual` holds after the intro until `stop()`. */
export const PlayoutModeSchema = z.enum(['manual', 'auto-out', 'loop-cycle']);
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

export const CompositionSchema = z
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
    background: z.union([z.literal('transparent'), HexColorSchema]),
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
export type Composition = z.infer<typeof CompositionSchema>;

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

/** Scene — root of the editor's domain model. */
export const SceneSchema = z
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
    background: z.union([z.literal('transparent'), HexColorSchema]),
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
    metadata: SceneMetadataSchema,
  })
  .superRefine(refineLifecycle);
export type Scene = z.infer<typeof SceneSchema>;

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
export function playoutOf(scene: Pick<Scene, 'playout'>): Playout {
  const p = scene.playout;
  if (p === undefined) return { mode: 'manual', holdSource: 'timed' };
  if ((p.mode as string) === 'content-driven') {
    return { ...p, mode: 'loop-cycle', holdSource: 'content-driven' };
  }
  return { ...p, holdSource: p.holdSource ?? 'timed' };
}

/**
 * B-032 — does this composition tree have any EFFECTIVE content hold driver: a `ticker` /
 * `sequence` / countdown `clock` that EFFECTIVELY drives the hold, in its OWN layers OR reachable
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
  const drives = (
    el: { id: string; drivesHold?: boolean | undefined },
    overrides?: Readonly<Record<string, boolean>>,
  ): boolean => overrides?.[el.id] ?? el.drivesHold !== false;
  const walk = (
    children: readonly Element[],
    overrides?: Readonly<Record<string, boolean>>,
  ): boolean =>
    children.some((el) => {
      if (el.type === 'ticker' || el.type === 'sequence') return drives(el, overrides);
      if (el.type === 'clock' && el.mode === 'countdown') return drives(el, overrides);
      if (el.type === 'container') return walk(el.children, overrides);
      if (el.type === 'composition') {
        if (visited.has(el.compositionId)) return false;
        visited.add(el.compositionId);
        const comp = compositions?.find((c) => c.id === el.compositionId);
        // The nested instance's OWN content is governed by its own `holdOverrides` (cascade per level).
        return comp !== undefined && comp.layers.some((l) => walk(l.children, el.holdOverrides));
      }
      return false;
    });
  return root.layers.some((l) => walk(l.children, undefined));
}
