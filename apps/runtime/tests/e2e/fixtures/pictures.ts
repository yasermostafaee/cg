import { deflateSync } from 'node:zlib';

/**
 * `RUN-NEXT-VERSION-03` — REAL pictures for the book specs: PNGs a browser decodes, so PVW draws
 * their pixels and the console's fitting (1.2) has something to scale. The older book specs use a
 * bare PNG header, which the bridge's probe reads and no browser can draw.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const b of bytes) c = (CRC_TABLE[(c ^ b) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encode(width: number, height: number, alpha: boolean, rows: Buffer): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = alpha ? 6 : 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A PNG of one colour; `a` below 255 makes it transparent (RGBA). Any size, few bytes. */
export function solidPng(
  width: number,
  height: number,
  [r, g, b, a]: readonly [number, number, number, number?],
): Buffer {
  const alpha = a !== undefined;
  const bpp = alpha ? 4 : 3;
  const row = Buffer.alloc(1 + width * bpp);
  for (let x = 0; x < width; x++) {
    row[1 + x * bpp] = r;
    row[2 + x * bpp] = g;
    row[3 + x * bpp] = b;
    if (alpha) row[4 + x * bpp] = a;
  }
  const rows = Buffer.alloc(row.length * height);
  for (let y = 0; y < height; y++) row.copy(rows, y * row.length);
  return encode(width, height, alpha, rows);
}

/**
 * A PNG of random noise — it does not compress, so a modest size is many megabytes (1600 × 900 is
 * about 4.3 MB): the picture that is within the channel and over the byte cap. With `alpha`, every
 * pixel is part-transparent too: a picture that must stay a PNG, so re-encoding cannot shrink it.
 */
export function noisePng(width: number, height: number, seed = 1, alpha = false): Buffer {
  let s = seed >>> 0 || 1;
  const stride = 1 + width * (alpha ? 4 : 3);
  const rows = Buffer.alloc(stride * height);
  for (let i = 0; i < rows.length; i++) {
    if (i % stride === 0) continue; // the row's filter byte stays 0
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    // An alpha byte stays under 255 so the picture is transparent everywhere.
    rows[i] = alpha && (i % stride) % 4 === 0 ? (s & 0x7f) + 64 : s & 0xff;
  }
  return encode(width, height, alpha, rows);
}
