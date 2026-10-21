import { probeImage } from '@cg/shared-ipc';
import { cssVars } from '../../theme.js';

/**
 * 🔴 `RUN-NEXT-VERSION-03` 1.1 — **A BOOK'S PICTURES, AS THIS CONSOLE CAN SHOW THEM.**
 *
 * A page an operator loads travels to CG Bridge once and is named by the SHA-256 the bridge answers
 * (`pages.put`). CasparCG fetches it from the template server by that hash. The console's own
 * surfaces — PVW, the Inspector's strip, `Manage pages…` — cannot fetch that address (another
 * origin; the installed console cannot reach loopback HTTP at all), so they draw from here:
 *
 * - the bytes this console SENT, kept the moment the bridge accepted them ({@link rememberPicture});
 * - else the bytes the bridge HOLDS for that hash, read back once over the signed-in socket
 *   (`pages.get`, {@link ensurePicture}).
 *
 * Both are the bytes stored under the hash the page names, so the picture drawn here is the picture
 * the air gets — one store, one key, nothing re-encoded on the way back.
 *
 * Held as `Blob`s (outside the script heap), with a `blob:` URL for the console's own `<img>`s and
 * a `data:` URL for PVW's frame, whose page admits `img-src data: 'self'` only (`blob:` is neither).
 */

type PictureMime = 'image/png' | 'image/jpeg' | 'image/webp';

const blobs = new Map<string, Blob>();
const objectUrls = new Map<string, string>();
/** The last few `data:` URLs PVW asked for — a frame needs the page on screen and the next one. */
const dataUrls = new Map<string, string>();
const DATA_URLS_KEPT = 8;
/** Hashes the bridge answered it does not hold — asked once, not on every render. */
const missing = new Set<string>();
const inFlight = new Map<string, Promise<boolean>>();
const listeners = new Set<() => void>();
let version = 0;

function changed(): void {
  version += 1;
  for (const l of listeners) l();
}

/** `useSyncExternalStore`'s pair: a surface re-renders when a picture arrives. */
export function subscribePictures(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function picturesVersion(): number {
  return version;
}

function mimeOf(bytes: Uint8Array): PictureMime | null {
  return probeImage(bytes)?.mime ?? null;
}

/** Keep the bytes this console just sent, under the hash the bridge answered for them. */
export function rememberPicture(sha256: string, bytes: Uint8Array): void {
  if (blobs.has(sha256)) return;
  const mime = mimeOf(bytes);
  if (mime === null) return;
  // A copy on its own buffer: the Blob must not hold a view of a buffer the caller reuses.
  blobs.set(sha256, new Blob([new Uint8Array(bytes)], { type: mime }));
  missing.delete(sha256);
  changed();
}

/** Whether this console can draw the picture now, without asking the bridge. */
export function holdsPicture(sha256: string): boolean {
  return blobs.has(sha256);
}

/** Whether the bridge answered it does not hold this picture (a page that cannot be shown). */
export function pictureMissing(sha256: string): boolean {
  return missing.has(sha256);
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * Make the picture drawable: held already, or read back from CG Bridge once. Resolves `true` when it
 * is, `false` when the bridge holds no such picture (or cannot be asked). Concurrent asks share one
 * read.
 */
export function ensurePicture(sha256: string): Promise<boolean> {
  if (blobs.has(sha256)) return Promise.resolve(true);
  if (missing.has(sha256)) return Promise.resolve(false);
  const pending = inFlight.get(sha256);
  if (pending !== undefined) return pending;
  const read = (async (): Promise<boolean> => {
    try {
      const got = await window.cg.pages.get({ sha256 });
      if (!got.ok) {
        missing.add(sha256);
        changed();
        return false;
      }
      blobs.set(sha256, new Blob([base64ToBytes(got.base64)], { type: got.mime }));
      changed();
      return true;
    } catch {
      // Not asked (no bridge, a dropped socket): not "missing" — the next ask tries again.
      return false;
    } finally {
      inFlight.delete(sha256);
    }
  })();
  inFlight.set(sha256, read);
  return read;
}

/** A `blob:` URL for the console's own `<img>` — `undefined` until the picture is held. */
export function pictureObjectUrl(sha256: string): string | undefined {
  const known = objectUrls.get(sha256);
  if (known !== undefined) return known;
  const blob = blobs.get(sha256);
  if (blob === undefined || typeof URL.createObjectURL !== 'function') return undefined;
  const url = URL.createObjectURL(blob);
  objectUrls.set(sha256, url);
  return url;
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(blob);
  });
}

/**
 * A `data:` URL for PVW's frame (its page admits `data:`, never `blob:`), or `null` when the picture
 * cannot be had. The last {@link DATA_URLS_KEPT} are kept, so turning back and forth re-reads nothing.
 */
export async function pictureDataUrl(sha256: string): Promise<string | null> {
  const known = dataUrls.get(sha256);
  if (known !== undefined) {
    dataUrls.delete(sha256);
    dataUrls.set(sha256, known);
    return known;
  }
  if (!(await ensurePicture(sha256))) return null;
  const blob = blobs.get(sha256);
  if (blob === undefined) return null;
  const url = await readAsDataUrl(blob);
  dataUrls.set(sha256, url);
  while (dataUrls.size > DATA_URLS_KEPT) {
    const oldest = dataUrls.keys().next().value;
    if (oldest === undefined) break;
    dataUrls.delete(oldest);
  }
  return url;
}

/**
 * The page-route extension for a picture's `data:` URL — what the bridge's address for the same hash
 * ends in (`/page/<sha>.<ext>`). The placeholder, which no route serves, is filed under `png`.
 */
export function pageExtOf(dataUrl: string): 'png' | 'jpg' | 'webp' {
  if (dataUrl.startsWith('data:image/jpeg')) return 'jpg';
  if (dataUrl.startsWith('data:image/webp')) return 'webp';
  return 'png';
}

/**
 * The picture PVW draws for a page that cannot be had: a hatched frame with a crossed-out picture
 * mark, and no words — the graphic never carries a sentence; the Inspector says which page and why.
 * Its colours are the theme's (`--r-pvw-missing-*`): an SVG needs literal values, and `theme.ts` is
 * the one place a colour is spelled.
 */
export const MISSING_PICTURE_URL = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90" preserveAspectRatio="xMidYMid meet">' +
    '<defs><pattern id="h" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
    `<rect width="8" height="8" fill="${cssVars['--r-pvw-missing-fill']}"/>` +
    `<rect width="4" height="8" fill="${cssVars['--r-pvw-missing-stripe']}"/></pattern></defs>` +
    '<rect width="160" height="90" fill="url(#h)"/>' +
    `<rect x="1" y="1" width="158" height="88" fill="none" stroke="${cssVars['--r-pvw-missing-line']}" stroke-width="2" stroke-dasharray="6 4"/>` +
    `<g fill="none" stroke="${cssVars['--r-pvw-missing-mark']}" stroke-width="3"><rect x="58" y="27" width="44" height="36" rx="3"/>` +
    '<path d="M62 57l12-12 9 9 6-6 9 9"/><path d="M54 23l52 44"/></g></svg>',
)}`;

/** TEST-ONLY — forget everything (each test starts with an empty console). */
export function resetPicturesForTest(): void {
  if (typeof URL.revokeObjectURL === 'function') {
    for (const url of objectUrls.values()) URL.revokeObjectURL(url);
  }
  blobs.clear();
  objectUrls.clear();
  dataUrls.clear();
  missing.clear();
  inFlight.clear();
  version = 0;
}
