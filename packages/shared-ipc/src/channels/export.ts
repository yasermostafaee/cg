import { z } from 'zod';
import { SceneSchema } from '@cg/shared-schema';
import { defineChannel } from '../channel.js';
import { definePublishChannel } from '../publish.js';

/**
 * Export pipeline channels (Phase 4 §7).
 *
 * `export.preflight` runs the validation step (Phase 4 §7 step 1) and
 * returns issues without producing a file. `export.run` runs the full
 * pipeline and returns the path + sha256 of the resulting .vcg.
 *
 * Progress is streamed via `export.progress` while a run is in flight.
 */

const ExportIssueSchema = z.object({
  severity: z.enum(['error', 'warning', 'info']),
  code: z.string().min(1),
  message: z.string().min(1),
  elementId: z.string().optional(),
  fieldId: z.string().optional(),
});

export type ExportIssue = z.infer<typeof ExportIssueSchema>;

const ExportProgressSchema = z.object({
  /** Pipeline step (manifest / assets / template / pack / sign). */
  step: z.enum(['validate', 'manifest', 'assets', 'template', 'pack', 'sign', 'done']),
  /** 0..1, monotonic per run. */
  progress: z.number().min(0).max(1),
  /** Optional human label (e.g. file being processed). */
  detail: z.string().optional(),
});

export type ExportProgress = z.infer<typeof ExportProgressSchema>;

export const ExportPreflightChannel = defineChannel(
  'export.preflight',
  z.object({ scene: SceneSchema }),
  z.object({ issues: z.array(ExportIssueSchema) }),
);

export const ExportRunChannel = defineChannel(
  'export.run',
  z.object({
    scene: SceneSchema,
    /** Absolute output path for the .vcg. */
    outputPath: z.string().min(1),
    /** Optional Ed25519 signing — key resolved by Main, only the toggle crosses. */
    sign: z.boolean().optional(),
  }),
  z.object({
    path: z.string(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/i),
    bytes: z.number().int().nonnegative(),
  }),
);

/** Main → Renderer push: streamed during `export.run`. */
export const ExportProgressChannel = definePublishChannel('export.progress', ExportProgressSchema);
