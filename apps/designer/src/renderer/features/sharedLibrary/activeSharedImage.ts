import type { AssetMeta } from '@cg/shared-ipc';

/**
 * D-040 — the operator's currently-selected shared-library image. Clicking a
 * thumbnail in the Shared Library panel makes it active; the canvas logo tool
 * stamps the active image (falling back to the first in the library when none
 * is selected). A tiny module (not the designer store) because it is transient,
 * cross-feature UI state with no undo/persistence semantics.
 */

let active: AssetMeta | null = null;
type Handler = (active: AssetMeta | null) => void;
const handlers = new Set<Handler>();

export function getActiveSharedImage(): AssetMeta | null {
  return active;
}

export function setActiveSharedImage(image: AssetMeta | null): void {
  active = image;
  for (const h of handlers) h(active);
}

export function subscribeActiveSharedImage(handler: Handler): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}
