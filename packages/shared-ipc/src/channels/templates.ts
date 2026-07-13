import { z } from 'zod';
import { CompositionFieldGroupSchema, DynamicFieldSchema, IdSchema } from '@cg/shared-schema';
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
  /**
   * R-004 — the human-readable display name (the `.vcg` manifest's `name`; a bundled
   * starter's label). The Library shows this instead of the raw `templateId`, which for a
   * Designer-authored package is a UUID and means nothing to an operator.
   *
   * Optional and DISPLAY-ONLY: `templateId` remains the sole identity everywhere (the
   * registry key, the stack item's `templateId`, the served `/template/<id>` URL), and the
   * name never reaches an AMCP argument. Absent — or blank, which the manifest schema
   * permits since its `name` has no `.min(1)` — means "fall back to the id".
   */
  name: z.string().optional(),
  templateType: z.string(),
  /** The ENTRY composition's own flat fields. */
  fields: z.array(DynamicFieldSchema),
  /**
   * B-067 — the nested-composition field namespaces (recursive). A D-119 starter is a
   * graphic composition nested in a full-frame one, and its authored fields live on the
   * NESTED comp — so `fields` alone is empty and the operator saw "No fields." Additive:
   * absent/`[]` means a flat, single-composition template, exactly as before.
   */
  groups: z.array(CompositionFieldGroupSchema).optional(),
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

/**
 * Register a template in the runtime library (R-001). The `.vcg` is verified
 * (`@cg/vcg-format.verify`) and unpacked in the browser before this call — the
 * format is isomorphic, so no Node APIs reach the renderer — and the resulting
 * `TemplateInfo` is handed to the registry. `templates.list` / `templates.get`
 * see it immediately, so the operator can load it onto the stack with its field
 * schema in the Inspector. A package that fails verification never reaches here.
 *
 * B-038 Phase 2 — the request also carries `html`: the rendered **self-contained
 * standalone HTML** the browser produces from the unpacked `.vcg` (the D-019
 * single-file export, runtime + scene + images inlined). The bridge retains it
 * keyed by `templateId` so a later phase can serve it over HTTP and `CG ADD` it.
 * This is a **Runtime-only** channel (the Designer does not consume it); the
 * offline `MockRuntime` accepts and ignores `html`.
 */
export const TemplatesImportChannel = defineChannel(
  'templates.import',
  z.object({ template: TemplateInfoSchema, html: z.string() }),
  z.object({ registered: z.boolean(), templateId: IdSchema }),
);
