import { useEffect, useState } from 'react';
import type { AssetMeta } from '@cg/shared-ipc';
import { measureLoudness, storedLoudness, type Loudness } from './loudness.js';

/** A stored sound's bytes, read through the same blob URL its previews use. */
async function soundBytes(assetId: string): Promise<Uint8Array | null> {
  try {
    const url = await window.cg.assets.url(assetId);
    if (url === null) return null;
    return new Uint8Array(await (await fetch(url)).arrayBuffer());
  } catch {
    return null;
  }
}

/** Measurements of sounds stored before Q10, made once per asset from their bytes. */
const measured = new Map<string, Loudness>();

/**
 * A sound's loudness: the stored measurement, or — for a sound stored before it was measured at
 * import — one made from its bytes when its Sound section opens. `null` until known, and for a
 * sound whose bytes cannot be read.
 */
export function useSoundLoudness(asset: AssetMeta | undefined): Loudness | null {
  const stored = asset?.audio !== undefined ? storedLoudness(asset.audio) : null;
  const hasStored = stored !== null;
  const assetId = asset?.assetId;
  const [late, setLate] = useState<{ assetId: string; loudness: Loudness } | null>(null);
  useEffect(() => {
    if (hasStored || assetId === undefined || measured.has(assetId)) return;
    let cancelled = false;
    void soundBytes(assetId).then((bytes) => {
      const loudness = bytes === null ? null : measureLoudness(bytes);
      if (loudness === null) return;
      measured.set(assetId, loudness);
      if (!cancelled) setLate({ assetId, loudness });
    });
    return () => {
      cancelled = true;
    };
  }, [assetId, hasStored]);
  if (stored !== null || assetId === undefined) return stored;
  return late?.assetId === assetId ? late.loudness : (measured.get(assetId) ?? null);
}
