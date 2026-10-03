import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * 🔴 `CONSOLE-POLISH-01` (`R-083`) — **THE AUDIT IS A SET OF FILES NOW, AND THIS IS HOW THEY ARE
 * NAMED.** The current file keeps its configured name (`bridge-audit.ndjson`); a rotated file is
 * `bridge-audit.<stamp>.ndjson`, where the stamp is the time of its FIRST row with `:` written `-`
 * (Windows refuses a colon in a name). ISO order is name order, so sorting the names sorts the files
 * by time, and a file is named by something that never changes once written — which is what lets a
 * reader's cursor name a file before it rotates and still find it after.
 */

/** `2026-10-03T16:19:41.871Z` → `2026-10-03T16-19-41.871Z`. */
export function stampOf(ts: string): string {
  return ts.replace(/:/g, '-');
}

/** The inverse of {@link stampOf} (a `-n` uniqueness suffix dropped); `null` for a name that is not one. */
export function tsOfStamp(stamp: string): string | null {
  const m = /^(\d{4}-\d\d-\d\d)T(\d\d)-(\d\d)-(\d\d(?:\.\d+)?Z)(?:-\d+)?$/.exec(stamp);
  return m === null ? null : `${m[1] ?? ''}T${m[2] ?? ''}:${m[3] ?? ''}:${m[4] ?? ''}`;
}

/** One file of the record, by the stamp of its first row. */
export interface AuditFile {
  readonly stamp: string;
  readonly path: string;
  readonly current: boolean;
}

function parts(filePath: string): { dir: string; base: string; ext: string } {
  const ext = path.extname(filePath);
  return { dir: path.dirname(filePath), base: path.basename(filePath, ext), ext };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Where the file starting at `stamp` goes when it rotates. */
export function rotatedPath(filePath: string, stamp: string): string {
  const { dir, base, ext } = parts(filePath);
  return path.join(dir, `${base}.${stamp}${ext}`);
}

/** The rotated files beside `filePath`, OLDEST first. A missing directory is no files. */
export async function rotatedFiles(filePath: string): Promise<AuditFile[]> {
  const { dir, base, ext } = parts(filePath);
  const pattern = new RegExp(`^${escapeRegex(base)}\\.([0-9T.Z-]+)${escapeRegex(ext)}$`);
  let names: string[];
  try {
    names = await fs.promises.readdir(dir);
  } catch {
    return [];
  }
  return names
    .flatMap((name) => {
      const stamp = pattern.exec(name)?.[1];
      return stamp !== undefined && tsOfStamp(stamp) !== null
        ? [{ stamp, path: path.join(dir, name), current: false }]
        : [];
    })
    .sort((a, b) => (a.stamp < b.stamp ? -1 : a.stamp > b.stamp ? 1 : 0));
}

/**
 * The time of a file's first row, read from its first line only; `null` for an empty or missing
 * file, or a first line that is not a row.
 */
export async function firstRowTs(filePath: string): Promise<string | null> {
  let fh: fs.promises.FileHandle;
  try {
    fh = await fs.promises.open(filePath, 'r');
  } catch {
    return null;
  }
  try {
    return await firstRowTsOf(fh);
  } finally {
    await fh.close();
  }
}

/**
 * {@link firstRowTs}, through a handle already open — so the answer is about the very file the
 * handle reads, even if its name has since been taken by a rotation.
 */
export async function firstRowTsOf(fh: fs.promises.FileHandle): Promise<string | null> {
  try {
    const chunks: Buffer[] = [];
    let offset = 0;
    for (;;) {
      const buf = Buffer.alloc(4096);
      const { bytesRead } = await fh.read(buf, 0, buf.length, offset);
      if (bytesRead === 0) break;
      const piece = buf.subarray(0, bytesRead);
      const nl = piece.indexOf(0x0a);
      chunks.push(nl === -1 ? piece : piece.subarray(0, nl));
      if (nl !== -1) break;
      offset += bytesRead;
    }
    const line = Buffer.concat(chunks).toString('utf8');
    if (line === '') return null;
    const ts = (JSON.parse(line) as { ts?: unknown }).ts;
    return typeof ts === 'string' ? ts : null;
  } catch {
    return null;
  }
}

/**
 * Every file of the record, NEWEST first: the current file (when it holds a row), then the rotated
 * ones. The current file is named by its first row's stamp too, so a cursor taken on it still finds
 * it once it has rotated.
 */
export async function auditFiles(filePath: string): Promise<AuditFile[]> {
  const rotated = (await rotatedFiles(filePath)).reverse();
  const first = await firstRowTs(filePath);
  if (first !== null) return [{ stamp: stampOf(first), path: filePath, current: true }, ...rotated];
  /*
    A current file whose first line is not a row (a write torn by a full disk) still holds rows after
    it: it is read under {@link CURRENT_UNNAMED}, which a cursor can name until the file rotates.
  */
  const size = await fs.promises.stat(filePath).then(
    (s) => s.size,
    () => 0,
  );
  return size > 0
    ? [{ stamp: CURRENT_UNNAMED, path: filePath, current: true }, ...rotated]
    : rotated;
}

/** The stamp of a current file whose first line names no time. */
export const CURRENT_UNNAMED = 'current';
