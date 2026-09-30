import * as fs from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { deflateRaw } from 'node:zlib';

const deflate = promisify(deflateRaw);

/**
 * `CENTRAL-BRIDGE-01` §1 A — **ONE ZIP OF CG BRIDGE'S LOGS**, for a station admin's download. A small
 * writer rather than a dependency: deflated entries, a central directory, UTF-8 names, and nothing
 * else (no ZIP64 — a log folder is megabytes, and the writer refuses past {@link MAX_ZIP_INPUT}).
 *
 * ⚠ ASYNCHRONOUS on purpose: this runs in the bridge's own process, whose event loop also carries
 * every AMCP command, so the reads and the deflate (libuv's thread pool) never hold a take back.
 */

export interface ZipEntry {
  /** The name inside the archive (`/` separated). */
  readonly name: string;
  readonly data: Buffer;
  readonly mtime: Date;
}

/** The most the logs may hold before the download refuses (the service rotates daily, 14 kept). */
export const MAX_ZIP_INPUT = 512 * 1024 * 1024;

const CRC_TABLE = ((): Uint32Array => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** MS-DOS time and date (the ZIP header's), local time as Windows' Explorer shows it. */
function dosTimeDate(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export async function zipEntries(entries: readonly ZipEntry[]): Promise<Buffer> {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const compressed = await deflate(entry.data);
    const crc = crc32(entry.data);
    const { time, date } = dosTimeDate(entry.mtime);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // flags: UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42); // local header offset (the rest stay zero)
    centrals.push(central, name);

    offset += local.length + name.length + compressed.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

/**
 * Every file under `dir` (recursively), as entries named relative to it. Files that vanish or cannot
 * be read while this runs are skipped: a log rotating mid-download is not an error.
 */
export async function entriesUnder(dir: string): Promise<ZipEntry[]> {
  const entries: ZipEntry[] = [];
  let total = 0;
  const walk = async (rel: string): Promise<void> => {
    let listed: fs.Dirent[];
    try {
      listed = await fs.promises.readdir(path.join(dir, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of listed) {
      const child = rel === '' ? e.name : path.join(rel, e.name);
      if (e.isDirectory()) {
        await walk(child);
        continue;
      }
      if (!e.isFile()) continue;
      const file = path.join(dir, child);
      let data: Buffer;
      let mtime: Date;
      try {
        data = await fs.promises.readFile(file);
        mtime = (await fs.promises.stat(file)).mtime;
      } catch {
        continue; // rotated away mid-download
      }
      total += data.length;
      if (total > MAX_ZIP_INPUT) {
        throw new Error(`the logs are larger than ${String(MAX_ZIP_INPUT)} bytes`);
      }
      entries.push({ name: child.split(path.sep).join('/'), data, mtime });
    }
  };
  await walk('');
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}
