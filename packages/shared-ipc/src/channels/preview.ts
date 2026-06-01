import { z } from 'zod';
import { FieldValuesSchema, SceneSchema } from '@cg/shared-schema';
import { defineChannel } from '../channel.js';
import { definePublishChannel } from '../publish.js';

/**
 * Preview channels — the Designer's live preview iframe loads the
 * template-runtime via cgpreview:// and accepts field updates from the
 * Inspector. Mirrors what CG INVOKE would do in CasparCG, so what the
 * Designer sees matches what the Runtime will show.
 */

export const PreviewLoadChannel = defineChannel(
  'preview.load',
  z.object({ scene: SceneSchema }),
  z.object({
    /** Blob/cgpreview URL — fallback for callers that can't use srcdoc. */
    src: z.string().url(),
    /**
     * Self-contained HTML document for the iframe. The Designer renderer
     * prefers `srcdoc={html}` over `src=blob:URL` because Chrome's
     * dynamic-ES-module restriction inside blob-loaded iframes silently
     * blocks the runtime import even when the iframe is unsandboxed.
     */
    html: z.string().min(1),
  }),
);

export const PreviewUpdateChannel = defineChannel(
  'preview.update',
  z.object({ fields: FieldValuesSchema }),
  z.object({ ok: z.boolean() }),
);

export const PreviewReloadChannel = defineChannel(
  'preview.reload',
  z.void(),
  z.object({ ok: z.boolean() }),
);

/** Main → Renderer push: fires when the iframe-side bootstrap completes. */
export const PreviewReadyChannel = definePublishChannel(
  'preview.ready',
  z.object({ at: z.string().datetime() }),
);
