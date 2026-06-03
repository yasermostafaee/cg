import { z } from 'zod';
import {
  FrameRateSchema,
  HexColorSchema,
  IdSchema,
  ISODateSchema,
  ResolutionSchema,
} from './primitives.js';
import { ElementSchema } from './elements.js';
import { DynamicFieldSchema } from './fields.js';
import { FieldBindingSchema } from './bindings.js';
import { FrameRangeSchema } from './animation.js';

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
export const SceneSchema = z.object({
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
  background: z.union([z.literal('transparent'), HexColorSchema]),
  layers: z.array(LayerSchema),
  fields: z.array(DynamicFieldSchema),
  bindings: z.array(FieldBindingSchema),
  fonts: z.array(FontReferenceSchema),
  metadata: SceneMetadataSchema,
});
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
