import type { AssetMeta } from '@cg/shared-ipc';

/**
 * D-040 — module-level cache resolving SHARED-library image ids to blob URLs,
 * mirroring the per-project {@link ../assets/assetUrlCache assetUrlCache} but
 * against `window.cg.sharedImages.url`. The canvas merges this map with the
 * project map when posting `assetUrls` to the preview iframe, so a
 * `source: 'shared'` logo renders.
 *
 * Unlike the project cache it is NOT cleared on project change — the shared
 * library outlives any one project. Entries are dropped only when a library
 * image is removed (`revoke`).
 */

const urls = new Map<string, string>();
type Handler = () => void;
const handlers = new Set<Handler>();

function notify(): void {
  for (const h of handlers) h();
}

export function getAll(): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [k, v] of urls) out[k] = v;
  return out;
}

export function subscribe(handler: Handler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

/** Resolve a shared image's blob URL and cache it. Idempotent. */
export async function prime(image: AssetMeta): Promise<void> {
  if (urls.has(image.assetId)) return;
  const url = await window.cg.sharedImages.url(image.assetId);
  if (url === null) return;
  urls.set(image.assetId, url);
  notify();
}

/** Bootstrap: list the shared library once and prime every image. */
export async function primeAll(): Promise<void> {
  const list = await window.cg.sharedImages.list();
  for (const image of list) await prime(image);
}

/** Drop a library image's cached blob URL and revoke it (the delete flow). */
export function revoke(assetId: string): void {
  const url = urls.get(assetId);
  if (url === undefined) return;
  URL.revokeObjectURL(url);
  urls.delete(assetId);
  notify();
}
