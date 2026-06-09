import { z } from 'zod';
import {
  DurationFramesSchema,
  FrameRateSchema,
  HexColorSchema,
  IdSchema,
  ISODateSchema,
  ResolutionSchema,
} from './primitives.js';
import { ElementSchema } from './elements.js';
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
 */
export const LifecycleSchema = z.object({
  outPoint: DurationFramesSchema,
});
export type Lifecycle = z.infer<typeof LifecycleSchema>;

/** No-code playout timing modes. `manual` holds after the intro until `stop()`. */
export const PlayoutModeSchema = z.enum(['manual', 'auto-out', 'loop-cycle', 'content-driven']);
export type PlayoutMode = z.infer<typeof PlayoutModeSchema>;

/**
 * D-020 — composition playout timing config. `auto-out` runs the outro after the
 * graphic reaches `outPoint` + `holdMs`; `loop-cycle` repeats `[in→outPoint]` →
 * hold(`holdMs`) → `[outPoint→end]` for `repeat` cycles (or forever when
 * `'infinite'`); `content-driven` is declared here and supplied a duration by the
 * runtime (the ticker computes it). Default `manual`. Absent `playout` ⇒ `manual`.
 */
export const PlayoutSchema = z.object({
  mode: PlayoutModeSchema.default('manual'),
  holdMs: z.number().min(0).optional(),
  repeat: z.union([z.number().int().min(1), z.literal('infinite')]).optional(),
});
export type Playout = z.infer<typeof PlayoutSchema>;

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
  const { outPoint } = data.lifecycle;
  const ok = active.in <= outPoint && outPoint <= active.out;
  if (!ok) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['lifecycle'],
      message: `lifecycle must satisfy activeRange.in (${String(active.in)}) ≤ outPoint (${String(outPoint)}) ≤ activeRange.out (${String(active.out)})`,
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
 */
export function playoutOf(scene: Pick<Scene, 'playout'>): Playout {
  return scene.playout ?? { mode: 'manual' };
}
