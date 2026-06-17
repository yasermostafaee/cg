import { z } from 'zod';
import { defineChannel } from '../channel.js';
import { definePublishChannel } from '../publish.js';

/**
 * Asset channels — image / font / lottie ingest. Lottie + video arrive
 * with M8; for M6 the surface accepts any file path and the service
 * decides based on extension + sniff.
 */

const AssetKindSchema = z.enum(['image', 'font', 'lottie', 'video']);

export const AssetMetaSchema = z.object({
  assetId: z.string().min(1),
  kind: AssetKindSchema,
  filename: z.string().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/i),
  byteSize: z.number().int().nonnegative(),
  /** Resolved working-directory path (sandboxed inside the project). */
  workingPath: z.string(),
  /** Optional decoded width/height for images. */
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

export type AssetMeta = z.infer<typeof AssetMetaSchema>;

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

export const AssetsListChannel = defineChannel('assets.list', z.void(), z.array(AssetMetaSchema));

export const AssetsRemoveChannel = defineChannel(
  'assets.remove',
  z.object({ assetId: z.string().min(1) }),
  z.object({ ok: z.boolean() }),
);

/** Main → Renderer push: fired after every successful import. */
export const AssetsImportedChannel = definePublishChannel('assets.imported', AssetMetaSchema);
