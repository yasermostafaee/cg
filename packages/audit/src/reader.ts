import * as fs from 'node:fs';
import { AuditEntrySchema, type AuditEntry } from '@cg/shared-schema';
import { auditFiles, CURRENT_UNNAMED, firstRowTsOf, stampOf, type AuditFile } from './files.js';

/**
 * Read the tail of an audit NDJSON file (Phase 8 §11 / M8.5).
 *
 * The audit log is append-only and forensic, but the operator needs to
 * see recent activity in the Settings inspector. This reader:
 *
 *   - opens the file (returns `[]` if missing — first boot, no audit yet)
 *   - parses each line with `AuditEntrySchema`; malformed lines are
 *     skipped, not thrown (forensic logs may grow corrupted entries on
 *     disk failure and we still want to render what we can)
 *   - returns entries newest-first, capped at `limit`
 *   - supports cheap filters by action and actor — applied during the
 *     parse to keep memory usage flat
 *
 * Filesystem reads are streamed via `createReadStream` so a multi-MB
 * audit file doesn't load entirely into memory. Lines are accumulated
 * in a ring buffer of size `limit` after filtering.
 */
export interface ReadAuditOptions {
  /** Absolute path to the NDJSON file. */
  filePath: string;
  /** Cap on returned entries. Default 200. */
  limit?: number;
  /** Optional filter by exact-match action. */
  action?: AuditEntry['action'];
  /** Optional filter by exact-match actor. */
  actor?: string;
}

const DEFAULT_LIMIT = 200;

export async function readRecentEntries(options: ReadAuditOptions): Promise<AuditEntry[]> {
  const limit = options.limit ?? DEFAULT_LIMIT;
  if (limit <= 0) return [];

  let buf: string;
  try {
    buf = await fs.promises.readFile(options.filePath, 'utf-8');
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') return [];
    throw err;
  }

  // Ring buffer holding the most recent `limit` parsed entries. Walking
  // the file end-to-start would be faster on huge logs, but operator
  // audit files in v1 stay small (< 10 MB / day) so forward parse +
  // ring is simpler and the algorithmic difference is invisible.
  const ring: AuditEntry[] = [];
  let head = 0;
  let count = 0;

  const lines = buf.split('\n');
  for (const line of lines) {
    if (line.length === 0) continue;
    let parsed: AuditEntry;
    try {
      const raw: unknown = JSON.parse(line);
      const result = AuditEntrySchema.safeParse(raw);
      if (!result.success) continue;
      parsed = result.data;
    } catch {
      continue;
    }
    if (options.action !== undefined && parsed.action !== options.action) continue;
    if (options.actor !== undefined && parsed.actor !== options.actor) continue;
    ring[head] = parsed;
    head = (head + 1) % limit;
    count++;
  }

  // Reconstruct in chronological order, then reverse for newest-first.
  const result: AuditEntry[] = [];
  if (count <= limit) {
    for (let i = 0; i < count; i++) {
      const entry = ring[i];
      if (entry !== undefined) result.push(entry);
    }
  } else {
    for (let i = 0; i < limit; i++) {
      const idx = (head + i) % limit;
      const entry = ring[idx];
      if (entry !== undefined) result.push(entry);
    }
  }
  result.reverse();
  return result;
}

/** Where a page ends: the file (by its first row's stamp) and the byte the next page ends before. */
export interface AuditPageCursor {
  readonly file: string;
  readonly before: number;
}

export interface ReadAuditPageOptions {
  /** The CURRENT file's path; rotated files are found beside it. */
  filePath: string;
  /** Continue before this; absent — from the newest row. */
  cursor?: AuditPageCursor;
  /** Rows on the page. */
  limit: number;
  /** Which rows the page may hold (the filters, the channel grant). Asked of every parsed row. */
  accept: (entry: AuditEntry) => boolean;
}

/** How far back one read reaches. The first page of a long record reads its last chunk only. */
const CHUNK_BYTES = 64 * 1024;

/**
 * 🔴 `CONSOLE-POLISH-01` (`R-083`) — **ONE PAGE OF THE RECORD, NEWEST FIRST, READ BACKWARDS.**
 *
 * `readRecentEntries` reads the whole file to keep the last 200 — fine for the 10 MB a day this
 * record was sized for, and not for the owner's station, whose Log never got past a tail. A page
 * walks the files newest first, reading each from its end in 64 KB chunks and stopping the moment it
 * holds `limit` accepted rows: the first page of a 50,000-row record reads one chunk. A row that does
 * not parse is skipped, never thrown (a forensic record may hold a torn line).
 *
 * `next` names the file the page ended in and the byte its oldest row starts at; `null` when nothing
 * older is left. A cursor whose file has since been deleted by retention continues in the newest
 * file older than it.
 *
 * ⚠ **A ROTATION CAN HAPPEN MID-READ** — the writer renames the current file the moment a row lands
 * on a new day, and a page asked for just then would open the fresh, near-empty file under the old
 * one's name. So each file is read through ONE handle (which keeps reading the file it opened, renamed
 * or not), and the current file's first row is checked through that handle: a file that is no longer
 * the one listed means the list is stale, and the page is read again from a fresh list.
 *
 * 🔴 `B-310` — **AND THE LIST ITSELF CAN BE TORN.** It is two reads — the rotated names, then the
 * current file's first row — and a rename landing between them gives a list with neither the file
 * just rotated nor (until the writer opens its fresh one) any current file: an EMPTY list, so the
 * page was empty with `next: null` and no file was ever opened for the check above to catch (CI run
 * 37185337111: 0 rows of 100). No single read can see that, so the list is taken AGAIN once the page
 * is read, and the page is kept only when nothing moved in between — a rename always adds a rotated
 * name and changes the current file's first row, so a list that is unchanged across the read is one
 * no rotation crossed. Otherwise the page is read again, a few times with a short wait (a rotation is
 * once a day or once per 20 MB); a record still moving after that is {@link AuditRecordMovedError} —
 * a read the console reports as failed, never an empty or a partial page.
 */
export async function readAuditPage(
  options: ReadAuditPageOptions,
): Promise<{ entries: AuditEntry[]; next: AuditPageCursor | null }> {
  for (let attempt = 0; attempt < PAGE_ATTEMPTS; attempt++) {
    if (attempt > 0) await wait(RETRY_WAIT_MS * attempt);
    const files = await auditFiles(options.filePath);
    const page = await readOnce(options, files);
    if (page === MOVED) continue;
    if (sameFiles(files, await auditFiles(options.filePath))) return page;
  }
  throw new AuditRecordMovedError(
    'The audit record kept rotating while it was read. Read it again.',
  );
}

/** `B-310` — how many reads one page may take, and the wait before each re-read (times the attempt). */
const PAGE_ATTEMPTS = 5;
const RETRY_WAIT_MS = 10;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The same files, by the same names, in the same order. */
function sameFiles(a: readonly AuditFile[], b: readonly AuditFile[]): boolean {
  return (
    a.length === b.length &&
    a.every((f, i) => {
      const g = b[i];
      return g !== undefined && g.stamp === f.stamp && g.path === f.path && g.current === f.current;
    })
  );
}

/** The list a page was read from no longer names the current file: read it again. */
const MOVED: unique symbol = Symbol('moved');

/** `B-310` — the record rotated across every read of one page: there is no page to give. */
export class AuditRecordMovedError extends Error {
  override readonly name = 'AuditRecordMovedError';
}

async function readOnce(
  options: ReadAuditPageOptions,
  files: readonly AuditFile[],
): Promise<{ entries: AuditEntry[]; next: AuditPageCursor | null } | typeof MOVED> {
  const entries: AuditEntry[] = [];
  if (options.limit <= 0) return { entries, next: null };

  let index = 0;
  let end: number | null = null;
  const cursor = options.cursor;
  if (cursor !== undefined) {
    index = files.findIndex((f) => f.stamp === cursor.file);
    if (index >= 0) end = cursor.before;
    else index = files.findIndex((f) => f.stamp < cursor.file);
    if (index < 0) return { entries, next: null };
  }

  for (; index < files.length; index++) {
    const file = files[index];
    if (file === undefined) break;
    let fh: fs.promises.FileHandle;
    try {
      fh = await fs.promises.open(file.path, 'r');
    } catch {
      if (file.current) return MOVED;
      continue; // pruned since it was listed
    }
    try {
      if (file.current && !(await isStill(fh, file))) return MOVED;
      const size = (await fh.stat()).size;
      const from = end === null ? size : Math.min(end, size);
      end = null;
      for await (const line of linesBackward(fh, from)) {
        const entry = parseRow(line.text);
        if (entry === null || !options.accept(entry)) continue;
        entries.push(entry);
        if (entries.length === options.limit) {
          return {
            entries,
            next:
              line.start > 0
                ? { file: file.stamp, before: line.start }
                : await olderThan(files, index),
          };
        }
      }
    } finally {
      await fh.close();
    }
  }
  return { entries, next: null };
}

/** Is the file this handle reads still the one `file` lists (by its first row)? */
async function isStill(fh: fs.promises.FileHandle, file: AuditFile): Promise<boolean> {
  const first = await firstRowTsOf(fh);
  return first === null ? file.stamp === CURRENT_UNNAMED : stampOf(first) === file.stamp;
}

async function sizeOf(file: AuditFile): Promise<number> {
  return fs.promises.stat(file.path).then(
    (s) => s.size,
    () => 0,
  );
}

/** The cursor at the END of the file after `index`, or `null` when there is none. */
async function olderThan(
  files: readonly AuditFile[],
  index: number,
): Promise<AuditPageCursor | null> {
  const older = files[index + 1];
  return older === undefined ? null : { file: older.stamp, before: await sizeOf(older) };
}

function parseRow(text: string): AuditEntry | null {
  try {
    const result = AuditEntrySchema.safeParse(JSON.parse(text));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/**
 * The lines of `[0, end)` of a file, LAST first, each with the byte it starts at. A line is the
 * bytes after a newline (or the file's start) up to the next newline; an empty one is skipped.
 * Bytes, not characters: a Persian row is multi-byte, and the cursor is a byte offset.
 */
async function* linesBackward(
  fh: fs.promises.FileHandle,
  end: number,
): AsyncGenerator<{ start: number; text: string }> {
  let pos = end;
  // The bytes from `pos` on that precede the first newline of what was read last: the END of a
  // line whose start lies further back.
  let carry: Buffer = Buffer.alloc(0);
  while (pos > 0) {
    const from = Math.max(0, pos - CHUNK_BYTES);
    const chunk = Buffer.alloc(pos - from);
    await fh.read(chunk, 0, chunk.length, from);
    const buf = carry.length === 0 ? chunk : Buffer.concat([chunk, carry]);
    let segEnd = buf.length;
    let nl = segEnd === 0 ? -1 : buf.lastIndexOf(0x0a, segEnd - 1);
    while (nl !== -1) {
      const start = nl + 1;
      if (segEnd > start) yield { start: from + start, text: buf.toString('utf8', start, segEnd) };
      segEnd = nl;
      nl = segEnd === 0 ? -1 : buf.lastIndexOf(0x0a, segEnd - 1);
    }
    if (from === 0) {
      if (segEnd > 0) yield { start: 0, text: buf.toString('utf8', 0, segEnd) };
      carry = Buffer.alloc(0);
    } else {
      carry = buf.subarray(0, segEnd);
    }
    pos = from;
  }
}
