import { z } from 'zod';
import { DynamicFieldSchema, IdSchema } from '@cg/shared-schema';
import { defineChannel } from '../channel.js';

/**
 * Templates channels (Phase 7 §3 / Phase 8 M7.2). The Runtime's
 * watched-folder ingest populates a registry of available templates;
 * the operator UI needs the field schema (not just the URL) so it can
 * render the right editor controls. M7.2 introduces `templates.fields`
 * to expose that schema to the Renderer.
 */

const TemplateInfoSchema = z.object({
  templateId: IdSchema,
  templateType: z.string(),
  fields: z.array(DynamicFieldSchema),
});
export type TemplateInfo = z.infer<typeof TemplateInfoSchema>;

export const TemplatesGetChannel = defineChannel(
  'templates.get',
  z.object({ templateId: IdSchema }),
  z.union([TemplateInfoSchema, z.null()]),
);

export const TemplatesListChannel = defineChannel(
  'templates.list',
  z.void(),
  z.array(TemplateInfoSchema),
);
