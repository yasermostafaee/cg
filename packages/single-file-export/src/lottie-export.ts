import type { Element, Scene } from '@cg/shared-schema';
import type { AssetMeta } from '@cg/shared-ipc';

/**
 * D-125 — the shared Lottie-asset resolution seam for the export paths (`.vcg`
 * packaging + single-file HTML inlining), mirroring `image-export.ts`. One place
 * collects which Lottie assets an export needs and one place resolves an asset's
 * bytes, so packaging and inlining never drift.
 *
 * Unlike images (referenced by `<img src>`), a Lottie is passed to the player as
 * `animationData` — the PARSED JSON object. So the exporters bake a
 * `lottieAssets: Record<assetId, animationData>` map into `createRuntime` (single
 * file: a JS literal in the boot script; `.vcg`: parsed from the packaged
 * `assets/lottie/<sha>.json`). Zero external requests either way.
 */

/** A Lottie element reference found in a scene. */
export interface LottieRef {
  readonly elementId: string;
  readonly assetId: string;
}

/**
 * Every Lottie element in a scene — the main scene AND all compositions, recursing
 * containers (mirrors `collectImageElements`). Deduped by element id. The single
 * source of "which Lottie assets does this export need" for packaging / inlining.
 */
export function collectLottieElements(scene: Scene): LottieRef[] {
  const out: LottieRef[] = [];
  const seen = new Set<string>();
  const walk = (children: readonly Element[]): void => {
    for (const el of children) {
      if (el.type === 'lottie') {
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
 * The minimal asset-byte source the exporters resolve Lottie bytes from — the same
 * structural contract as the image source (the project `AssetStore` satisfies it).
 */
export interface LottieAssetSource {
  get(assetId: string): Promise<AssetMeta | null>;
  bytes(assetId: string): Promise<Uint8Array | null>;
}

const UTF8 = new TextDecoder('utf-8');

/**
 * Parse Lottie JSON bytes into an `animationData` object. Returns `null` when the
 * bytes are not valid JSON (a corrupt asset is reported as a preflight warning, not
 * a thrown export). Kept here so packaging and inlining parse identically.
 */
export function parseLottieJson(bytes: Uint8Array): unknown | null {
  try {
    return JSON.parse(UTF8.decode(bytes));
  } catch {
    return null;
  }
}

/**
 * Resolve one Lottie element's parsed `animationData` + metadata for export. Returns
 * `null` when the asset is missing or its bytes are not valid JSON.
 */
export async function resolveLottieAsset(
  source: LottieAssetSource,
  assetId: string,
): Promise<{ meta: AssetMeta; bytes: Uint8Array; animationData: unknown } | null> {
  const meta = await source.get(assetId);
  if (meta === null) return null;
  const bytes = await source.bytes(assetId);
  if (bytes === null) return null;
  const animationData = parseLottieJson(bytes);
  if (animationData === null) return null;
  return { meta, bytes, animationData };
}
