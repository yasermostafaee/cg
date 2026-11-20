import { CONTROL_LIVE_LAYOUT_MAX_FRAMES, ManifestSchema } from '@cg/shared-schema';
import { probeImage, TEMPLATE_SOURCE_MAX_BYTES } from '@cg/shared-ipc';
import { readZipEntry, sha256Hex } from '@cg/vcg-format';
import { readSavedControlLiveLayoutPackage } from '../liveLayouts/savedControlLiveLayoutPackage.js';

const POSTER_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const EMPTY: ReadonlyMap<string, string> = new Map();
const CACHE_SIZE = 8;
const MAX_POSTER_PIXELS = 8192 * 4096;
const POSTER_PATH = /^assets\/image\/[0-9a-f]{64}\.(png|jpe?g|webp|gif)$/i;

function canDecodePoster(asset: Uint8Array, mime: string): boolean {
  if (mime === 'image/gif') {
    const header = String.fromCharCode(...asset.subarray(0, 6));
    if (asset.length < 13 || (header !== 'GIF87a' && header !== 'GIF89a')) return false;
    const info = new DataView(asset.buffer, asset.byteOffset, asset.byteLength);
    const width = info.getUint16(6, true);
    const height = info.getUint16(8, true);
    return width > 0 && height > 0 && width * height <= MAX_POSTER_PIXELS;
  }
  const image = probeImage(asset);
  return image?.mime === mime && image.width * image.height <= MAX_POSTER_PIXELS;
}

export type LayoutPosterPreviewLoader = (
  sha256: string,
  assetIds: readonly string[],
  signal: AbortSignal,
) => Promise<ReadonlyMap<string, string>>;

async function readPosters(
  sha256: string,
  assetIds: readonly string[],
  signal: AbortSignal,
): Promise<ReadonlyMap<string, string>> {
  const wanted = new Set([...new Set(assetIds)].slice(0, CONTROL_LIVE_LAYOUT_MAX_FRAMES));
  if (wanted.size === 0) return EMPTY;
  const { bytes } = await readSavedControlLiveLayoutPackage(sha256);
  if (signal.aborted || bytes.byteLength > TEMPLATE_SOURCE_MAX_BYTES) return EMPTY;
  const member = await readZipEntry(bytes, 'manifest.json');
  if (member === undefined || signal.aborted) return EMPTY;
  const manifest = ManifestSchema.parse(JSON.parse(new TextDecoder().decode(member)) as unknown);
  const { thumbnailImageStill } = await import('@cg/template-runtime/static-scene');
  const posters = new Map<string, string>();
  const derivatives = new Map<string, string | null>();
  for (const { id, path, kind, mime, bytes: size, sha256: digest } of manifest.assetIndex) {
    if (signal.aborted) return EMPTY;
    if (
      !wanted.has(id) ||
      kind !== 'image' ||
      !POSTER_MIMES.has(mime) ||
      !POSTER_PATH.test(path) ||
      size > TEMPLATE_SOURCE_MAX_BYTES
    )
      continue;
    if (!derivatives.has(path)) {
      const asset = await readZipEntry(bytes, path);
      if (signal.aborted) return EMPTY;
      if (
        asset?.byteLength !== size ||
        !canDecodePoster(asset, mime) ||
        sha256Hex(asset) !== digest.toLowerCase()
      )
        continue;
      derivatives.set(path, await thumbnailImageStill(asset, mime));
    }
    const thumbnail = derivatives.get(path);
    if (thumbnail != null) posters.set(id, thumbnail);
  }
  return posters;
}

/** Only the selected detail may recover a missing poster from an older editable package. */
export function createLayoutPosterPreviewLoader(): LayoutPosterPreviewLoader {
  const cache = new Map<string, ReadonlyMap<string, string>>();
  let pending = Promise.resolve<ReadonlyMap<string, string>>(EMPTY);
  return (sha256, assetIds, signal) => {
    const key = JSON.stringify([sha256, [...assetIds].sort()]);
    pending = pending.then(async () => {
      if (signal.aborted) return EMPTY;
      const cached = cache.get(key);
      if (cached !== undefined) return cached;
      try {
        const posters = await readPosters(sha256, assetIds, signal);
        if (!signal.aborted && posters.size > 0) {
          cache.set(key, posters);
          if (cache.size > CACHE_SIZE) {
            const oldest = cache.keys().next().value;
            if (oldest !== undefined) cache.delete(oldest);
          }
        }
        return posters;
      } catch {
        return EMPTY;
      }
    });
    return pending;
  };
}
