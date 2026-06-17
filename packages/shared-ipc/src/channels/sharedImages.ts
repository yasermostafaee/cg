import { z } from 'zod';
import { defineChannel } from '../channel.js';
import { definePublishChannel } from '../publish.js';
import { AssetMetaSchema } from './assets.js';

/**
 * D-040 — device-level shared image library channels. They mirror the
 * per-project `assets.*` surface but are project-independent and image-only,
 * and reuse the same `AssetMeta` encoding (no parallel asset shape). A shared
 * image referenced by a `source: 'shared'` image element is a "logo".
 */

/** Pick an image file and import it into the shared library. */
export const SharedImagesImportChannel = defineChannel(
  'sharedImages.import',
  z.void(),
  z.object({ image: AssetMetaSchema }),
);

/** List every image in the shared library. */
export const SharedImagesListChannel = defineChannel(
  'sharedImages.list',
  z.void(),
  z.array(AssetMetaSchema),
);

/** Remove a shared library image (index entry only; exported copies are unaffected). */
export const SharedImagesRemoveChannel = defineChannel(
  'sharedImages.remove',
  z.object({ assetId: z.string().min(1) }),
  z.object({ ok: z.boolean() }),
);

/** Main → Renderer push: fired after every successful shared-library import. */
export const SharedImagesImportedChannel = definePublishChannel(
  'sharedImages.imported',
  AssetMetaSchema,
);
