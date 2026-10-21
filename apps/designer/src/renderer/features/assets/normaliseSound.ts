import { useEffect, useState } from 'react';
import type { AssetMeta } from '@cg/shared-ipc';
import { designerStore } from '../../state/store.js';
import {
  loudnessInfo,
  measureLoudness,
  offeredGainDb,
  storedLoudness,
  withGain,
  type Loudness,
} from './loudness.js';
import { wavStats } from './wav-stats.js';

/**
 * 🔴 `RUN-NEXT-VERSION-02` Q10 — NORMALISING ONE SOUND, offered in its Sound section and never done
 * without the author asking. The normalised sound is stored as a NEW asset (`<name> (-23.0 LUFS).wav`,
 * measured like any import) and every element that played the original plays it instead, in one
 * undo step (`replaceAudioAsset`). The original stays in Project Assets, untouched: the author can
 * go back, or delete it.
 */

/** A stored sound's bytes, read through the same blob URL its previews use. */
async function soundBytes(assetId: string): Promise<Uint8Array | null> {
  const url = await window.cg.assets.url(assetId);
  if (url === null) return null;
  try {
    return new Uint8Array(await (await fetch(url)).arrayBuffer());
  } catch {
    return null;
  }
}

/** Measurements of sounds stored before Q10, made once per asset from their bytes. */
const measured = new Map<string, Loudness | null>();

/**
 * A sound's loudness: the stored measurement, or — for a sound stored before it was measured at
 * import — one made from its bytes when its Sound section opens. `null` until known, and for a
 * sound whose bytes cannot be read.
 */
export function useSoundLoudness(asset: AssetMeta | undefined): Loudness | null {
  const stored = asset?.audio !== undefined ? storedLoudness(asset.audio) : null;
  const hasStored = stored !== null;
  const assetId = asset?.assetId;
  const [late, setLate] = useState<Loudness | null>(() =>
    assetId !== undefined ? (measured.get(assetId) ?? null) : null,
  );
  useEffect(() => {
    if (hasStored || assetId === undefined) return;
    if (measured.has(assetId)) {
      setLate(measured.get(assetId) ?? null);
      return;
    }
    let cancelled = false;
    void soundBytes(assetId).then((bytes) => {
      const loud = bytes === null ? null : measureLoudness(bytes);
      measured.set(assetId, loud);
      if (!cancelled) setLate(loud);
    });
    return () => {
      cancelled = true;
    };
  }, [assetId, hasStored]);
  return stored ?? late;
}

export type NormaliseResult =
  | { readonly ok: true; readonly asset: AssetMeta; readonly gainDb: number; readonly uses: number }
  | { readonly ok: false; readonly message: string };

function stripExt(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? filename : filename.slice(0, dot);
}

/** Normalise `asset` and re-point its uses; the sentence to show when it cannot. */
export async function normaliseSound(asset: AssetMeta): Promise<NormaliseResult> {
  const bytes = await soundBytes(asset.assetId);
  if (bytes === null) return { ok: false, message: 'That sound could not be read.' };
  const before =
    (asset.audio !== undefined ? storedLoudness(asset.audio) : null) ?? measureLoudness(bytes);
  const gainDb = before === null ? null : offeredGainDb(before);
  if (gainDb === null) return { ok: false, message: 'That sound is already normalised.' };
  const out = withGain(bytes, gainDb);
  const stats = wavStats(out);
  const after = measureLoudness(out);
  if (stats === null || after === null)
    return { ok: false, message: 'That sound could not be read.' };
  const level = after.loudnessLufs === null ? '' : ` (${after.loudnessLufs.toFixed(1)} LUFS)`;
  const { asset: stored } = await window.cg.assets.storeBytes({
    bytes: out,
    filename: `${stripExt(asset.filename)}${level}.wav`,
    kind: 'audio',
    audio: {
      sourceFilename: asset.audio?.sourceFilename ?? asset.filename,
      durationMs: stats.durationMs,
      peakDbfs: stats.peakDbfs,
      sampleRate: stats.sampleRate,
      channels: stats.channels,
      ...loudnessInfo(after),
    },
  });
  const uses = designerStore.replaceAudioAsset(asset.assetId, stored.assetId);
  return { ok: true, asset: stored, gainDb, uses };
}
