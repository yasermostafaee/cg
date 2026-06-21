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
  z.object({
    scene: SceneSchema,
    /**
     * D-087 — render like the on-air/export runtime: keep the runtime's native
     * `cg-pending` state (stage blank) until `play()`, instead of revealing
     * frame 0 on load. The Preview modal sets this so it opens loaded-but-
     * unpainted (CG ADD before CG PLAY); the editor canvas omits it (absent =
     * today's authoring reveal, so the canvas stays visible for editing).
     */
    broadcast: z.boolean().optional(),
    /**
     * D-071 Phase B — authoring PASTEBOARD: lift the `.cg-stage { overflow:
     * hidden }` clip + a dark margin so off-frame shapes paint beyond the frame
     * (the iframe element size — the pasteboard extent — is set by the canvas, with
     * a `device-width` viewport). INDEPENDENT of `broadcast`: the editor canvas sets
     * `authoring: true`; the broadcast modal + exports leave it absent (native clip
     * — UNCHANGED).
     */
    authoring: z.boolean().optional(),
  }),
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
