import { useEffect, useState } from 'react';
import type { AssetMeta } from '@cg/shared-ipc';
import { prime } from './sharedImageUrlCache.js';

/**
 * Renderer-side broadcast for "this shared image was removed". The bridge
 * doesn't push a `sharedImages.removed` channel, so the delete flow notifies
 * subscribers locally and every live list shrinks immediately.
 */
type RemovedHandler = (assetId: string) => void;
const removedHandlers = new Set<RemovedHandler>();
export function emitSharedImageRemoved(assetId: string): void {
  for (const h of removedHandlers) h(assetId);
}

/**
 * D-040 — live list of the device shared image library. Mirrors `useAssets`
 * but project-independent: no `onCleared` (the library persists across project
 * switches). Lists once on mount and patches on `sharedImages.imported` and the
 * local removed broadcast.
 */
export function useSharedImages(): readonly AssetMeta[] {
  const [list, setList] = useState<readonly AssetMeta[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function refresh(): Promise<void> {
      const initial = await window.cg.sharedImages.list();
      if (cancelled) return;
      // D-067 — newest first (reverse the oldest→newest store index) so a freshly
      // imported image (prepended below) sits at the TOP of the library.
      setList([...initial].reverse());
      for (const image of initial) await prime(image);
    }

    void refresh();
    const offImported = window.cg.sharedImages.onImported((image) => {
      // D-067 — prepend so a freshly imported image appears at the top.
      setList((prev) => (prev.some((a) => a.assetId === image.assetId) ? prev : [image, ...prev]));
      void prime(image);
    });
    const onRemoved: RemovedHandler = (assetId) => {
      setList((prev) => prev.filter((a) => a.assetId !== assetId));
    };
    removedHandlers.add(onRemoved);
    return () => {
      cancelled = true;
      offImported();
      removedHandlers.delete(onRemoved);
    };
  }, []);

  return list;
}

/** Per-image blob-URL hook for the shared library. Returns `null` while loading. */
export function useSharedImageUrl(assetId: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (assetId === null) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    void window.cg.sharedImages.url(assetId).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [assetId]);
  return url;
}
