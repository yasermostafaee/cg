import { useEffect, useState } from 'react';

/**
 * `D-163` — SMALL thumbnails of a book's pages, made once per asset and kept for the session.
 *
 * A book can be hundreds of full-size scans. A grid of the pictures themselves would decode every
 * one at full size (a 1920×1080 page is 8 MB decoded), so each page is decoded ONCE, scaled to
 * {@link THUMB_W} wide and kept as a small WebP. Two are made at a time, in the order asked, so the
 * first cards fill first. Where the browser cannot scale (a test DOM), the picture's own URL is
 * used.
 */
const THUMB_W = 320;
const AT_ONCE = 2;

const made = new Map<string, Promise<string | null>>();
/** The URLs this module created — the only ones it may revoke. */
const ours = new Set<string>();
const waiting: (() => void)[] = [];
let running = 0;
let watching = false;

function turn(): Promise<void> {
  if (running < AT_ONCE) {
    running += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) =>
    waiting.push(() => {
      running += 1;
      resolve();
    }),
  );
}

function done(): void {
  running -= 1;
  waiting.shift()?.();
}

async function make(assetId: string): Promise<string | null> {
  await turn();
  try {
    const url = await window.cg.assets.url(assetId);
    if (url === null) return null;
    if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') {
      return url;
    }
    // Decoded through an <img> (img-src already admits the asset's blob URL) rather than fetch.
    const img = new Image();
    img.src = url;
    await img.decode();
    const bitmap = await createImageBitmap(img, {
      resizeWidth: Math.min(THUMB_W, img.naturalWidth),
      resizeQuality: 'medium',
    });
    try {
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
      const thumb = URL.createObjectURL(
        await canvas.convertToBlob({ type: 'image/webp', quality: 0.8 }),
      );
      ours.add(thumb);
      return thumb;
    } finally {
      bitmap.close();
    }
  } catch {
    return null;
  } finally {
    done();
  }
}

/** A project switch empties the cache: another project's pages are not this one's. */
function watch(): void {
  if (watching) return;
  watching = true;
  window.cg.assets.onCleared(() => {
    for (const url of ours) URL.revokeObjectURL(url);
    ours.clear();
    made.clear();
  });
}

export function pageThumb(assetId: string): Promise<string | null> {
  watch();
  let thumb = made.get(assetId);
  if (thumb === undefined) {
    thumb = make(assetId);
    made.set(assetId, thumb);
  }
  return thumb;
}

/** A page's thumbnail URL, or `null` while it is being made (or when there is none). */
export function usePageThumb(assetId: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (assetId === undefined) {
      setUrl(null);
      return;
    }
    let live = true;
    void pageThumb(assetId).then((u) => {
      if (live) setUrl(u);
    });
    return () => {
      live = false;
    };
  }, [assetId]);
  return url;
}
