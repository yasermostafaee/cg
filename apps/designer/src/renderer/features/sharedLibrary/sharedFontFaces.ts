import { useEffect } from 'react';
import type { AssetMeta } from '@cg/shared-ipc';
import { prime } from './sharedFontUrlCache.js';
import { useSharedFonts } from './useSharedFonts.js';

const faces = new Map<string, FontFace>();

export async function registerSharedFont(font: AssetMeta): Promise<void> {
  if (font.kind !== 'font' || faces.has(font.assetId) || typeof FontFace === 'undefined') return;
  const url = await prime(font);
  if (url === null) return;
  try {
    const buffer = await (await fetch(url)).arrayBuffer();
    const face = new FontFace(`asset-${font.assetId}`, buffer);
    await face.load();
    (document as Document & { fonts: FontFaceSet }).fonts.add(face);
    faces.set(font.assetId, face);
  } catch {
    // A broken font remains listed so the author can remove it; render falls back.
  }
}

export function unregisterSharedFont(assetId: string): void {
  const face = faces.get(assetId);
  if (face === undefined) return;
  (document as Document & { fonts: FontFaceSet }).fonts.delete(face);
  faces.delete(assetId);
}

/** Register every device-level font regardless of which left panel is open. */
export function useSharedFontFaces(): void {
  const fonts = useSharedFonts();
  useEffect(() => {
    for (const font of fonts) void registerSharedFont(font);
  }, [fonts]);
}
