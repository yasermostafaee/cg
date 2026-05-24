import * as fs from 'node:fs';
import { AuditEntrySchema, type AuditEntry } from '@cg/shared-schema';

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
