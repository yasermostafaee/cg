import { z } from 'zod';
import { defineChannel } from '../channel.js';
import { definePublishChannel } from '../publish.js';

/**
 * Asset channels — image / font / lottie ingest. Lottie + video arrive
 * with M8; for M6 the surface accepts any file path and the service
 * decides based on extension + sniff.
 */

const AssetKindSchema = z.enum(['image', 'font', 'lottie', 'video']);

/**
 * D-128 — SOURCE lineage for a converted video asset, captured at conversion and
 * stored with the asset. Explicitly-typed and small — NOT a free-form bag. This is
 * the re-edit affordance (what a future re-crop would start from / what an
 * Inspector "this clip was conformed" notice reads); the PLAYOUT-relevant facts
 * (`durationMs`, `phases`, hold behavior) live on the `video` ELEMENT, never here.
 * The crop is BOTH baked into the stored WebM bytes (baked = what plays) AND
 * recorded here (provenance = what a future re-crop would start from).
 */
export const VideoProvenanceSchema = z.object({
  /** The picked source file's name (the stored asset's filename is the converted WebM's). */
  sourceFilename: z.string().min(1),
  /** The source clip's native frame rate, as probed at import. */
  sourceFps: z.number().positive(),
  /** The project channel rate the output was CONFORMED to (D-128 decision (d)). */
  targetFps: z.number().positive(),
  /** Source dimensions in pixels (pre-crop). */
  sourceWidth: z.number().int().positive(),
  sourceHeight: z.number().int().positive(),
  /**
   * D-128 — sha256 of the SOURCE file's bytes: the PRE-convert dedupe key. Re-picking
   * the same source with the same crop + target fps matches an existing asset and
   * skips the (minutes-long) re-encode. Optional + additive so assets stored before
   * this field parse unchanged (they simply re-convert once, then carry the hash).
   */
  sourceSha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/i)
    .optional(),
  /** Source file size in bytes — the cheap partner to `sourceFilename` for display / future pre-filtering. */
  sourceBytes: z.number().int().nonnegative().optional(),
  /** The crop rect baked at conversion, in SOURCE pixels. Absent ⇒ full frame. */
  crop: z
    .object({
      x: z.number().int().nonnegative(),
      y: z.number().int().nonnegative(),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    })
    .optional(),
  /**
   * D-128 — the converter revision that produced this asset. Bumped whenever the
   * conversion OUTPUT changes (e.g. the premultiplied-alpha fringe fix), so a
   * future item can flag stale assets that predate a correctness fix and prompt a
   * re-import. Additive + optional: assets stored before this field parse unchanged
   * (an ABSENT revision reads as "older than the first recorded revision").
   */
  converterRevision: z.string().min(1).optional(),
  /**
   * D-128 — whether the source was treated as PREMULTIPLIED (matted-against-black)
   * alpha and un-premultiplied at conversion (legacy AE/BGRA archives). Recorded so
   * the lineage names how the alpha was handled, not just that it was converted.
   */
  premultipliedAlpha: z.boolean().optional(),
});
export type VideoProvenance = z.infer<typeof VideoProvenanceSchema>;

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
  /**
   * D-128 — optional source lineage; only converted VIDEO assets populate it for
   * now (superset-friendly: future kinds may carry their own shapes). Optional +
   * additive: every existing stored asset parses unchanged.
   */
  provenance: VideoProvenanceSchema.optional(),
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
