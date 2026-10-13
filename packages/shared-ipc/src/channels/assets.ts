import { z } from 'zod';
import { AssetKindSchema, AssetMetaSchema, VideoProvenanceSchema } from '@cg/shared-schema';
import { defineChannel } from '../channel.js';
import { definePublishChannel } from '../publish.js';

/**
 * Asset channels — image / font / lottie ingest. Lottie + video arrive
 * with M8; for M6 the surface accepts any file path and the service
 * decides based on extension + sniff.
 */

/**
 * D-150 — the asset DOMAIN types moved to `@cg/shared-schema` so the project
 * package's manifest entry could be DERIVED from `AssetMetaSchema` instead of
 * re-declaring the asset shape (`@cg/shared-schema` cannot import this package).
 * They are re-exported here unchanged, so every existing
 * `import { AssetMeta } from '@cg/shared-ipc'` keeps working — a move, not a
 * rename. Channels below still compose them exactly as before.
 */
export {
  AssetKindSchema,
  VideoProvenanceSchema,
  AssetMetaSchema,
  type AssetKind,
  type VideoProvenance,
  type AssetMeta,
} from '@cg/shared-schema';

export const AssetsImportChannel = defineChannel(
  'assets.import',
  z.object({
    /** Absolute source path on the operator's filesystem. */
    sourcePath: z.string().min(1),
    /** Optional hint for the kind — service still verifies. */
    kind: AssetKindSchema.optional(),
  }),
  z.object({ asset: AssetMetaSchema }),
);

/**
 * D-128 — store already-converted bytes (the canonical WebM the in-app converter
 * produced) as an asset, with optional provenance. The raw-bytes sibling of
 * `assets.import`: same dedupe/index/persist path, no `File` round-trip.
 */
export const AssetsStoreBytesChannel = defineChannel(
  'assets.storeBytes',
  z.object({
    bytes: z.instanceof(Uint8Array),
    filename: z.string().min(1),
    kind: AssetKindSchema,
    provenance: VideoProvenanceSchema.optional(),
  }),
  z.object({ asset: AssetMetaSchema }),
);

export const AssetsListChannel = defineChannel('assets.list', z.void(), z.array(AssetMetaSchema));

export const AssetsRemoveChannel = defineChannel(
  'assets.remove',
  z.object({ assetId: z.string().min(1) }),
  z.object({ ok: z.boolean() }),
);

/** Main → Renderer push: fired after every successful import. */
export const AssetsImportedChannel = definePublishChannel('assets.imported', AssetMetaSchema);
