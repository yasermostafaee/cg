import { useEffect, useState } from 'react';
import type { AssetMeta } from '@cg/shared-ipc';
import { prime } from './assetUrlCache.js';

/**
 * Renderer-side broadcast for "this assetId was deleted". The bridge
 * doesn't (yet) push an `assets.removed` channel, so the delete flow
 * notifies subscribers locally and the asset list shrinks immediately.
 */
type RemovedHandler = (assetId: string) => void;
const removedHandlers = new Set<RemovedHandler>();
export function emitAssetRemoved(assetId: string): void {
  for (const h of removedHandlers) h(assetId);
}

/**
 * D-011 — small subscription hook that keeps a live list of all imported
 * assets. Calls `assets.list()` once on mount and patches the list as the
 * bridge emits `assets.imported`.
 */
export function useAssets(): readonly AssetMeta[] {
  const [list, setList] = useState<readonly AssetMeta[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function refresh(): Promise<void> {
      const initial = await window.cg.assets.list();
      if (cancelled) return;
      setList(initial);
      for (const a of initial) await prime(a);
    }

    void refresh();
    const offImported = window.cg.assets.onImported((asset) => {
      setList((prev) => (prev.some((a) => a.assetId === asset.assetId) ? prev : [...prev, asset]));
      void prime(asset);
    });
    // Project switch — the previous list belongs to a different
    // project; drop it immediately and re-read from the new project's
    // index. See [[assets-are-per-project]].
    const offCleared = window.cg.assets.onCleared(() => {
      setList([]);
      void refresh();
    });
    const onRemoved: RemovedHandler = (assetId) => {
      setList((prev) => prev.filter((a) => a.assetId !== assetId));
    };
    removedHandlers.add(onRemoved);
    return () => {
      cancelled = true;
      offImported();
      offCleared();
      removedHandlers.delete(onRemoved);
    };
  }, []);

  return list;
}

/**
 * Per-asset blob-URL hook. Resolves once per assetId and caches in
 * component state. Returns `null` while loading.
 */
export function useAssetUrl(assetId: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (assetId === null) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    void window.cg.assets.url(assetId).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [assetId]);
  return url;
}
