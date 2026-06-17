import type { Element, Scene } from '@cg/shared-schema';
import type { AssetMeta } from '@cg/shared-ipc';

/**
 * D-062 — the shared image-asset resolution seam for the export paths (`.vcg`
 * packaging + single-file HTML inlining). One place collects which images an
 * export needs and one place resolves an image's bytes, so packaging, inlining,
 * and preflight never drift — and so D-040/PR-2 (the shared image library) adds a
 * `'shared'` source in exactly one spot.
 */

/** An image element reference found in a scene. */
export interface ImageRef {
  readonly elementId: string;
  readonly assetId: string;
  /** D-040 — which store `assetId` lives in (`'project'` for pre-D-040 scenes). */
  readonly source: 'project' | 'shared';
}

/**
 * Every image element in a scene — the main scene AND all compositions, recursing
 * containers (mirrors `Exporter.preflight`'s element walk). Deduped by element id.
 * The single source of "which images does this export need" for packaging /
 * inlining / preflight.
 */
export function collectImageElements(scene: Scene): ImageRef[] {
  const out: ImageRef[] = [];
  const seen = new Set<string>();
  const walk = (children: readonly Element[]): void => {
    for (const el of children) {
      if (el.type === 'image') {
        if (!seen.has(el.id)) {
          seen.add(el.id);
          out.push({ elementId: el.id, assetId: el.assetId, source: el.source });
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
 * The minimal asset-byte source the exporters resolve image bytes from. The
 * project `AssetStore` satisfies it structurally (it has `get` + `bytes`).
 */
export interface ImageAssetSource {
  get(assetId: string): Promise<AssetMeta | null>;
  bytes(assetId: string): Promise<Uint8Array | null>;
}

/**
 * An image store that can also be enumerated — the project `AssetStore` and the
 * D-040 `SharedImageStore` both satisfy it. `preflight` lists both to decide
 * whether an image reference resolves in EITHER store.
 */
export interface ImageAssetLibrary extends ImageAssetSource {
  list(): Promise<AssetMeta[]>;
}

/**
 * Resolve one image element's bytes + metadata for export. **THE source extension
 * point.** The caller passes the `ImageAssetSource` to resolve from; for D-040 that
 * is a {@link compositeImageSource} (the element's source-indicated store first,
 * the other store as a fallback). The exporters and the runtime's `assetUrls` seam
 * stay unchanged.
 */
export async function resolveImageAsset(
  source: ImageAssetSource,
  assetId: string,
): Promise<{ meta: AssetMeta; bytes: Uint8Array } | null> {
  const meta = await source.get(assetId);
  if (meta === null) return null;
  const bytes = await source.bytes(assetId);
  if (bytes === null) return null;
  return { meta, bytes };
}

const NULL_IMAGE_SOURCE: ImageAssetSource = {
  get: () => Promise.resolve(null),
  bytes: () => Promise.resolve(null),
};

/**
 * D-040 — the two-source resolver. Builds an {@link ImageAssetSource} that tries
 * the element's source-indicated store FIRST (the shared library for
 * `source: 'shared'`, the project store otherwise) and the other store as a
 * tolerant fallback. The two stores have independent uuid id-spaces, so an id
 * resolves in at most one — the fallback covers a mis-tagged `source` (or a shared
 * image later localised) and is never ambiguous. `shared` is optional so the
 * exporters degrade to project-only resolution when no library is wired (e.g.
 * tests / the runtime contract is unchanged).
 */
export function compositeImageSource(
  source: 'project' | 'shared',
  shared: ImageAssetSource | undefined,
  project: ImageAssetSource,
): ImageAssetSource {
  const sharedSrc = shared ?? NULL_IMAGE_SOURCE;
  const primary = source === 'shared' ? sharedSrc : project;
  const fallback = source === 'shared' ? project : sharedSrc;
  return {
    get: async (id) => {
      const meta = await primary.get(id);
      return meta ?? (await fallback.get(id));
    },
    bytes: async (id) => {
      const bytes = await primary.bytes(id);
      return bytes ?? (await fallback.bytes(id));
    },
  };
}

/** Image MIME from a filename's extension (for a base64 `data:` URI). */
export function imageMimeOf(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf('.') + 1).toLowerCase();
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}
