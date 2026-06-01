import type { AssetMeta } from '@cg/shared-ipc';

/**
 * D-011 — module-level cache that resolves image assetIds to blob URLs.
 *
 * The Designer iframe renders ImageElements by setting `<img>.src` to a
 * blob: URL the bridge produced from the workspace bytes. Resolving on
 * demand inside the React tree would race with the scene-replace
 * postMessage, so we maintain a single cache + subscribe model:
 *
 *   - `prime(asset)` is called for every image asset the renderer learns
 *     about (initial list + every later import).
 *   - `getAll()` returns the current snapshot; CanvasArea attaches it
 *     to every scene-replace message so the iframe can fix up image
 *     `src` attributes after each rebuild.
 *   - `subscribe(handler)` lets CanvasArea re-flush when a new URL
 *     resolves after the initial mount.
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

/** Resolve an image asset's URL and cache it. Idempotent. */
export async function prime(asset: AssetMeta): Promise<void> {
  if (asset.kind !== 'image') return;
  if (urls.has(asset.assetId)) return;
  const url = await window.cg.assets.url(asset.assetId);
  if (url === null) return;
  urls.set(asset.assetId, url);
  notify();
}

/** Bootstrap: list assets once and prime every image. */
export async function primeAll(): Promise<void> {
  const list = await window.cg.assets.list();
  for (const a of list) await prime(a);
}

/**
 * Drop an asset's cached blob URL and revoke the object URL so the
 * browser can release the underlying bytes. Called by the right-click
 * delete flow.
 */
export function revoke(assetId: string): void {
  const url = urls.get(assetId);
  if (url === undefined) return;
  URL.revokeObjectURL(url);
  urls.delete(assetId);
  notify();
}
