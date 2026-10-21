import { PAGE_MAX_BYTES, probeImage, type ImageProbe } from '@cg/shared-ipc';

/**
 * 🔴 `RUN-NEXT-VERSION-03` 1.2 — **A PAGE IS FITTED, NOT REFUSED** (the owner's decision, 2026-10-21).
 *
 * Pictures from scans and cameras are larger than any channel (6000 × 4000) and over the 4 MB a page
 * may be. The console makes each one fit BEFORE it is sent, in the browser:
 *
 * - larger than the channel's frame on either side → scaled to fit inside it, the aspect kept, never
 *   upscaled;
 * - within the frame but over the byte cap → re-encoded at the same size;
 * - otherwise → sent exactly as picked, byte for byte (nothing is re-encoded that need not be).
 *
 * A re-encoded picture is a PNG when it has transparency — a JPEG cannot carry alpha, and a keyed page
 * must keep it — and otherwise a JPEG at quality 0.92: visually indistinguishable from the source for
 * photographs and scans at broadcast viewing size (it is Chrome's own default for `toBlob`), and it
 * keeps a 1920 × 1080 page around 0.3–1.5 MB, so a turn's fetch stays well inside the ~0.1 s per MB
 * measured on the owner's CasparCG (`add-image-pages/design.md` §0.4). A JPEG still over the cap is
 * tried once more at 0.85 (a UHD channel's noisy scan); only what is STILL over after that is refused.
 *
 * The decode and the scale run in the browser's image decoder (`createImageBitmap`, off the page's
 * main thread) and the encode in the canvas's own (`convertToBlob` / `toBlob`), so the console stays
 * responsive while a folder of camera pictures is fitted.
 */

export interface Raster {
  readonly width: number;
  readonly height: number;
}

export type FitOutcome =
  | {
      readonly ok: true;
      /** The bytes to send — the picked file's own when nothing needed doing. */
      readonly bytes: Uint8Array;
      /** Scaled down to fit the channel's frame. */
      readonly resized: boolean;
      /** Re-encoded at its own size to come under the byte cap. */
      readonly reencoded: boolean;
    }
  | { readonly ok: false; readonly reason: 'not-a-picture' | 'too-large-after-fit' };

const JPEG_QUALITIES = [0.92, 0.85] as const;

/** The largest size inside `raster` with the picture's aspect ratio — never larger than it already is. */
export function fitInside(
  width: number,
  height: number,
  raster: Raster,
): { width: number; height: number } {
  const scale = Math.min(1, raster.width / width, raster.height / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** What a picked picture needs, read from its header alone. */
export function fitNeeded(
  probe: ImageProbe,
  byteLength: number,
  raster: Raster,
): 'none' | 'resize' | 'reencode' {
  if (probe.width > raster.width || probe.height > raster.height) return 'resize';
  if (byteLength > PAGE_MAX_BYTES) return 'reencode';
  return 'none';
}

interface Surface {
  readonly draw: (bitmap: ImageBitmap) => void;
  readonly hasAlpha: () => boolean;
  readonly encode: (type: 'image/png' | 'image/jpeg', quality?: number) => Promise<Blob>;
}

function surfaceOf(width: number, height: number): Surface {
  if (typeof OffscreenCanvas === 'function') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (ctx === null) throw new Error('no 2d context');
    return {
      draw: (bitmap) => ctx.drawImage(bitmap, 0, 0, width, height),
      hasAlpha: () => anyTransparent(ctx.getImageData(0, 0, width, height).data),
      encode: (type, quality) =>
        canvas.convertToBlob(quality === undefined ? { type } : { type, quality }),
    };
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('no 2d context');
  return {
    draw: (bitmap) => ctx.drawImage(bitmap, 0, 0, width, height),
    hasAlpha: () => anyTransparent(ctx.getImageData(0, 0, width, height).data),
    encode: (type, quality) =>
      new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => (b === null ? reject(new Error('encode failed')) : resolve(b)),
          type,
          quality,
        );
      }),
  };
}

function anyTransparent(rgba: Uint8ClampedArray): boolean {
  for (let i = 3; i < rgba.length; i += 4) if ((rgba[i] ?? 255) < 255) return true;
  return false;
}

/** Fit one picked picture to `raster` and the byte cap (see the module note). */
export async function fitPicture(
  file: Blob,
  bytes: Uint8Array,
  raster: Raster,
): Promise<FitOutcome> {
  const probe = probeImage(bytes);
  if (probe === null) return { ok: false, reason: 'not-a-picture' };
  const need = fitNeeded(probe, bytes.byteLength, raster);
  if (need === 'none') return { ok: true, bytes, resized: false, reencoded: false };
  const size = fitInside(probe.width, probe.height, raster);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(
      file,
      need === 'resize'
        ? { resizeWidth: size.width, resizeHeight: size.height, resizeQuality: 'high' }
        : {},
    );
  } catch {
    return { ok: false, reason: 'not-a-picture' };
  }
  try {
    const surface = surfaceOf(size.width, size.height);
    surface.draw(bitmap);
    // Only a type that can carry alpha is scanned; a JPEG never has any.
    const keepAlpha = probe.mime !== 'image/jpeg' && surface.hasAlpha();
    const attempts = keepAlpha ? [undefined] : JPEG_QUALITIES;
    for (const quality of attempts) {
      const blob = await surface.encode(keepAlpha ? 'image/png' : 'image/jpeg', quality);
      if (blob.size <= PAGE_MAX_BYTES) {
        return {
          ok: true,
          bytes: new Uint8Array(await blob.arrayBuffer()),
          resized: need === 'resize',
          reencoded: need === 'reencode',
        };
      }
    }
    return { ok: false, reason: 'too-large-after-fit' };
  } finally {
    bitmap.close();
  }
}

/**
 * The one line that says what fitting did: `12 pictures were resized to fit 1920×1080`, and the
 * pictures re-encoded at their own size under the cap. `null` when nothing was changed.
 */
export function fitLine(resized: number, reencoded: number, raster: Raster): string | null {
  const parts: string[] = [];
  if (resized > 0) {
    parts.push(
      `${resized === 1 ? '1 picture was' : `${String(resized)} pictures were`} resized to fit ${String(raster.width)}×${String(raster.height)}`,
    );
  }
  if (reencoded > 0) {
    parts.push(
      `${reencoded === 1 ? '1 picture was' : `${String(reencoded)} pictures were`} made smaller than ${String(PAGE_MAX_BYTES / (1024 * 1024))} MB`,
    );
  }
  return parts.length === 0 ? null : parts.join(' · ');
}
