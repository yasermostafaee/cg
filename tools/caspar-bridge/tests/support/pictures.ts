/**
 * `R-100` — minimal picture BYTES for tests: a real header (what the bridge reads) and a tail that
 * makes each one unique (what the SHA-256 reads). Nothing here is decodable as an image, and nothing
 * in the bridge decodes.
 */
function u32be(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

export function pngBytes(width: number, height: number, seed = 0, tail = 16): Buffer {
  return Buffer.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...u32be(13),
    0x49,
    0x48,
    0x44,
    0x52,
    ...u32be(width),
    ...u32be(height),
    8,
    2,
    0,
    0,
    0,
    ...u32be(0),
    ...Array.from({ length: tail }, (_, i) => (seed * 31 + i) & 0xff),
  ]);
}

export function jpegBytes(width: number, height: number, seed = 0): Buffer {
  return Buffer.from([
    0xff,
    0xd8,
    // APP0, length 16
    0xff,
    0xe0,
    0x00,
    0x10,
    0x4a,
    0x46,
    0x49,
    0x46,
    0x00,
    0x01,
    0x01,
    0x00,
    0x00,
    0x01,
    0x00,
    0x01,
    0x00,
    0x00,
    // SOF0: length 17, precision 8, height, width, 3 components
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    0x03,
    0x01,
    0x22,
    0x00,
    0x02,
    0x11,
    0x01,
    0x03,
    0x11,
    0x01,
    seed & 0xff,
    0xff,
    0xd9,
  ]);
}

export function webpBytes(width: number, height: number, seed = 0): Buffer {
  const w = width - 1;
  const h = height - 1;
  return Buffer.from([
    0x52,
    0x49,
    0x46,
    0x46,
    0x1e,
    0x00,
    0x00,
    0x00,
    0x57,
    0x45,
    0x42,
    0x50,
    0x56,
    0x50,
    0x38,
    0x58,
    0x0a,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    w & 0xff,
    (w >> 8) & 0xff,
    (w >> 16) & 0xff,
    h & 0xff,
    (h >> 8) & 0xff,
    (h >> 16) & 0xff,
    seed & 0xff,
    0,
    0,
    0,
  ]);
}
