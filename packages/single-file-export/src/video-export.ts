import type { Element, Scene } from '@cg/shared-schema';
import type { AssetMeta } from '@cg/shared-ipc';

/**
 * D-128 Phase 5 — the shared VIDEO-asset resolution seam for the export paths
 * (`.vcg` packaging + single-file HTML inlining), mirroring `lottie-export.ts`.
 * One place collects which video assets an export needs and one place resolves
 * an asset's bytes, so packaging and inlining never drift.
 *
 * A video is referenced by `<video src>` exactly like an image's `<img src>`:
 * the exporters bake `assetId → url` into the `assetUrls` map `createRuntime`
 * receives (single file: a base64 `data:video/webm` URI; `.vcg`: the packaged
 * `assets/video/<sha>.webm` relative path), and the runtime's asset-src walk
 * wires it. The bytes are the STORED CANONICAL WebM verbatim — crop baked, fps
 * conformed, alpha corrected at import — never re-encoded at export.
 *
 * Sequence-item closure: a sequence item can reference a COMPOSITION, never an
 * asset directly, and this collector (like the image/lottie ones) walks EVERY
 * composition — so a video inside a sequence-referenced composition is always
 * collected.
 */

/** A video element reference found in a scene. */
export interface VideoRef {
  readonly elementId: string;
  readonly assetId: string;
}

/**
 * Every video element in a scene — the main scene AND all compositions,
 * recursing containers (mirrors `collectLottieElements`). Deduped by element id.
 * The single source of "which video assets does this export need".
 */
export function collectVideoElements(scene: Scene): VideoRef[] {
  const out: VideoRef[] = [];
  const seen = new Set<string>();
  const walk = (children: readonly Element[]): void => {
    for (const el of children) {
      if (el.type === 'video') {
        if (!seen.has(el.id)) {
          seen.add(el.id);
          out.push({ elementId: el.id, assetId: el.assetId });
        }
      } else if (el.type === 'container') {
        walk(el.children);
      }
    }
  };
  for (const layer of scene.layers) walk(layer.children);
  for (const comp of scene.compositions ?? []) {
    for (const layer of comp.layers) walk(layer.children);
  }
  return out;
}

/**
 * The minimal asset-byte source the exporters resolve video bytes from — the
 * same structural contract as the Lottie source (the project `AssetStore`
 * satisfies it). Videos are project-scoped only (no shared-library source).
 */
export interface VideoAssetSource {
  get(assetId: string): Promise<AssetMeta | null>;
  bytes(assetId: string): Promise<Uint8Array | null>;
}

/** The MIME of a stored video asset (the canonical form is WebM; mp4 legacy). */
export function videoMimeOf(filename: string): string {
  return filename.toLowerCase().endsWith('.mp4') ? 'video/mp4' : 'video/webm';
}

/**
 * Resolve one video element's stored bytes + metadata for export. Returns
 * `null` when the asset is missing (reported by the callers — a preflight
 * ERROR for the `.vcg`, a warning on the never-blocking single-file path).
 */
export async function resolveVideoAsset(
  source: VideoAssetSource,
  assetId: string,
): Promise<{ meta: AssetMeta; bytes: Uint8Array } | null> {
  const meta = await source.get(assetId);
  if (meta === null) return null;
  const bytes = await source.bytes(assetId);
  if (bytes === null) return null;
  return { meta, bytes };
}
