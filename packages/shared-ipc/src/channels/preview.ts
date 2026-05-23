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
    /** URL the renderer should set as the iframe's src. Includes cgpreview://. */
    src: z.string().url(),
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
