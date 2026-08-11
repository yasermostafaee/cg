import { z } from 'zod';

/**
 * Asset metadata — the DOMAIN shape of an imported project asset.
 *
 * D-150 — this lived in `@cg/shared-ipc` until the project package needed to
 * derive its manifest entry from it. `@cg/shared-schema` cannot import
 * `@cg/shared-ipc` (the dependency runs the other way), so the choice was to
 * declare a SECOND asset shape in the manifest or to move the domain type to
 * where golden rule 3 says domain types live. A second shape is exactly how two
 * descriptions of one thing drift apart, so this moved instead.
 *
 * `@cg/shared-ipc` re-exports all three names, so every existing import is
 * unchanged — this is a move, not a rename.
 */

export const AssetKindSchema = z.enum(['image', 'font', 'lottie', 'video']);

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
  /**
   * D-128 fast-path (owner decision 2026-07-25) — whether the ALPHA BLEED
   * (transparent-region colour fill) ran at conversion. The bleed became an
   * OPT-IN correction (it was unconditionally on the hot path before —
   * revisions ≤ 2026-07-24.3 imply it ran). Recorded, like `premultipliedAlpha`,
   * so the lineage names exactly which pixel-math stages produced the bytes and
   * the pre-convert dedupe can distinguish outputs that genuinely differ.
   */
  alphaBleed: z.boolean().optional(),
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
export type AssetKind = z.infer<typeof AssetKindSchema>;
