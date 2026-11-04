import { useEffect, useState } from 'react';
import type { AssetMeta } from '@cg/shared-ipc';
import { prime } from './sharedFontUrlCache.js';

type RemovedHandler = (assetId: string) => void;
const removedHandlers = new Set<RemovedHandler>();

export function emitSharedFontRemoved(assetId: string): void {
  for (const handler of removedHandlers) handler(assetId);
}

export function useSharedFonts(): readonly AssetMeta[] {
  const [list, setList] = useState<readonly AssetMeta[]>([]);

  useEffect(() => {
    // Unit/DOM tests render inspector controls without installing the desktop bridge.
    // Shared fonts are an enhancement there, not a reason for the entire inspector to fail.
    const api = window.cg?.sharedFonts;
    if (api === undefined) return;
    let cancelled = false;
    void api.list().then(async (initial) => {
      if (cancelled) return;
      setList([...initial].reverse());
      await Promise.all(initial.map((font) => prime(font)));
    });
    const offImported = api.onImported((font) => {
      setList((prev) => [font, ...prev.filter((item) => item.assetId !== font.assetId)]);
      void prime(font);
    });
    const onRemoved: RemovedHandler = (assetId) => {
      setList((prev) => prev.filter((item) => item.assetId !== assetId));
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
