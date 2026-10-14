/**
 * `R-100` — **WHAT A PICTURE IS, read from its own bytes.** PNG, JPEG or WebP, and its size in
 * pixels, or `null` for anything else.
 *
 * The bridge never trusts a file's name or a claimed type for this: a page the operator loads is
 * handed to a template as a `data:image/…` URL, so the type in that URL must be the type of the
 * bytes. Header-only and dependency-free — nothing is decoded here.
 */
export interface ImageProbe {
  mime: 'image/png' | 'image/jpeg' | 'image/webp';
  width: number;
  height: number;
}

export function probeImage(bytes: Uint8Array): ImageProbe | null {
  return probePng(bytes) ?? probeJpeg(bytes) ?? probeWebp(bytes);
}

const u32be = (b: Uint8Array, o: number): number =>
  (b[o] ?? 0) * 0x1000000 + ((b[o + 1] ?? 0) << 16) + (((b[o + 2] ?? 0) << 8) | (b[o + 3] ?? 0));
const u16be = (b: Uint8Array, o: number): number => ((b[o] ?? 0) << 8) | (b[o + 1] ?? 0);
const u16le = (b: Uint8Array, o: number): number => (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8);
const u24le = (b: Uint8Array, o: number): number =>
  (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8) | ((b[o + 2] ?? 0) << 16);
const ascii = (b: Uint8Array, o: number, n: number): string =>
  String.fromCharCode(...b.subarray(o, o + n));

function sane(width: number, height: number): boolean {
  return width > 0 && height > 0 && Number.isInteger(width) && Number.isInteger(height);
}

/** PNG: the signature, then IHDR first, whose width and height are its first eight bytes. */
function probePng(b: Uint8Array): ImageProbe | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 24 || !sig.every((v, i) => b[i] === v)) return null;
  if (ascii(b, 12, 4) !== 'IHDR') return null;
  const width = u32be(b, 16);
  const height = u32be(b, 20);
  return sane(width, height) ? { mime: 'image/png', width, height } : null;
}

/** JPEG: SOI, then segments until a start-of-frame marker (SOF0–SOF15, not DHT/JPG/DAC). */
function probeJpeg(b: Uint8Array): ImageProbe | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let o = 2;
  while (o + 9 < b.length) {
    if (b[o] !== 0xff) return null;
    const marker = b[o + 1] ?? 0;
    if (marker === 0xff) {
      o += 1; // fill byte
      continue;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      o += 2;
      continue;
    }
    const len = u16be(b, o + 2);
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      const height = u16be(b, o + 5);
      const width = u16be(b, o + 7);
      return sane(width, height) ? { mime: 'image/jpeg', width, height } : null;
    }
    if (len < 2) return null;
    o += 2 + len;
  }
  return null;
}

/** WebP: RIFF…WEBP, then a VP8 (lossy), VP8L (lossless) or VP8X (extended) chunk. */
function probeWebp(b: Uint8Array): ImageProbe | null {
  if (b.length < 30 || ascii(b, 0, 4) !== 'RIFF' || ascii(b, 8, 4) !== 'WEBP') return null;
  const chunk = ascii(b, 12, 4);
  let width = 0;
  let height = 0;
  if (chunk === 'VP8 ') {
    // Frame tag (3) + start code 9d 01 2a, then 14-bit width / height.
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    width = u16le(b, 26) & 0x3fff;
    height = u16le(b, 28) & 0x3fff;
  } else if (chunk === 'VP8L') {
    if (b[20] !== 0x2f) return null;
    const bits = (b[21] ?? 0) | ((b[22] ?? 0) << 8) | ((b[23] ?? 0) << 16) | ((b[24] ?? 0) << 24);
    width = (bits & 0x3fff) + 1;
    height = ((bits >>> 14) & 0x3fff) + 1;
  } else if (chunk === 'VP8X') {
    width = u24le(b, 24) + 1;
    height = u24le(b, 27) + 1;
  } else {
    return null;
  }
  return sane(width, height) ? { mime: 'image/webp', width, height } : null;
}
