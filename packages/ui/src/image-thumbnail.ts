import { probeImage } from '@cg/shared-ipc';

const MAX_CONCURRENT = 3;
const cache = new Map<string, Promise<string>>();
const ownedUrls = new Set<string>();
const waiters: (() => void)[] = [];
let running = 0;

async function takeSlot(): Promise<void> {
  if (running < MAX_CONCURRENT) {
    running += 1;
    return;
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
  running += 1;
}

function releaseSlot(): void {
  running -= 1;
  waiters.shift()?.();
}

function fitInside(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function imageBlob(sourceUrl: string): Promise<Blob> {
  if (!sourceUrl.startsWith('data:')) return fetch(sourceUrl).then((response) => response.blob());
  const comma = sourceUrl.indexOf(',');
  if (comma < 0) throw new Error('Invalid image data URL.');
  const header = sourceUrl.slice(5, comma);
  const payload = sourceUrl.slice(comma + 1);
  const mime = header.split(';', 1)[0] || 'application/octet-stream';
  if (header.split(';').includes('base64')) {
    const decoded = atob(payload);
    const bytes = new Uint8Array(decoded.length);
    for (let index = 0; index < decoded.length; index += 1) {
      bytes[index] = decoded.charCodeAt(index);
    }
    return new Blob([bytes], { type: mime });
  }
  return new Blob([new TextEncoder().encode(decodeURIComponent(payload))], { type: mime });
}

async function makeThumbnail(
  sourceUrl: string,
  maxWidth: number,
  maxHeight: number,
): Promise<string> {
  if (!sourceUrl.startsWith('data:') && typeof fetch !== 'function') return sourceUrl;
  await takeSlot();
  try {
    const blob = await imageBlob(sourceUrl);
    const probe = probeImage(new Uint8Array(await blob.arrayBuffer()));
    // SVG already scales at paint time; an unknown format keeps its normal browser path.
    if (probe === null) return sourceUrl;
    const size = fitInside(probe.width, probe.height, maxWidth, maxHeight);
    // Small, already-light pictures cost less to keep than to decode and re-encode.
    if (size.width === probe.width && size.height === probe.height && blob.size <= 128 * 1024) {
      return sourceUrl;
    }

    // Once the data URL has been decoded locally (rather than fetched through CSP), Chromium's
    // bitmap path is the fastest and most reliable way to drain a multi-picture picker queue.
    if (typeof createImageBitmap === 'function' && typeof OffscreenCanvas === 'function') {
      try {
        const bitmap = await createImageBitmap(blob, {
          resizeWidth: size.width,
          resizeHeight: size.height,
          resizeQuality: 'medium',
        });
        try {
          const canvas = new OffscreenCanvas(size.width, size.height);
          const context = canvas.getContext('2d');
          if (context === null) throw new Error('Could not create image thumbnail canvas.');
          context.drawImage(bitmap, 0, 0, size.width, size.height);
          const thumbnail = URL.createObjectURL(
            await canvas.convertToBlob({ type: 'image/webp', quality: 0.78 }),
          );
          ownedUrls.add(thumbnail);
          return thumbnail;
        } finally {
          bitmap.close();
        }
      } catch {
        // Installed WebViews without a working Offscreen encoder use the DOM canvas below.
      }
    }

    if (typeof document !== 'undefined' && typeof Image !== 'undefined') {
      const inputUrl = URL.createObjectURL(blob);
      try {
        const image = new Image();
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error('Could not decode image thumbnail source.'));
          image.src = inputUrl;
        });
        const canvas = document.createElement('canvas');
        canvas.width = size.width;
        canvas.height = size.height;
        const context = canvas.getContext('2d');
        if (context === null) throw new Error('Could not create image thumbnail canvas.');
        context.drawImage(image, 0, 0, size.width, size.height);
        const thumbnailBlob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (result) =>
              result === null
                ? reject(new Error('Could not encode image thumbnail.'))
                : resolve(result),
            'image/webp',
            0.78,
          );
        });
        const thumbnail = URL.createObjectURL(thumbnailBlob);
        ownedUrls.add(thumbnail);
        return thumbnail;
      } finally {
        URL.revokeObjectURL(inputUrl);
      }
    }

    return sourceUrl;
  } catch {
    return sourceUrl;
  } finally {
    releaseSlot();
  }
}

/**
 * A small, session-cached preview for an image URL. The original URL remains untouched for canvas
 * and export; only cards, tables and pickers consume this derivative.
 */
export function imageThumbnailUrl(
  sourceUrl: string,
  options: { maxWidth?: number; maxHeight?: number } = {},
): Promise<string> {
  const maxWidth = options.maxWidth ?? 320;
  const maxHeight = options.maxHeight ?? 180;
  const key = `${String(maxWidth)}x${String(maxHeight)}\u0000${sourceUrl}`;
  let result = cache.get(key);
  if (result === undefined) {
    result = makeThumbnail(sourceUrl, maxWidth, maxHeight);
    cache.set(key, result);
  }
  return result;
}

/** Release only thumbnail object URLs made by this module. */
export function clearImageThumbnailCache(): void {
  for (const url of ownedUrls) URL.revokeObjectURL(url);
  ownedUrls.clear();
  cache.clear();
}
