import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import { BackupChannelEntrySchema, type BackupChannelEntry } from '@cg/shared-ipc';

/**
 * 🔴 `RELEASE-0113-01` (`R-089`) — **A STATION ADMIN'S BACKUP CHANNEL ENTRIES, KEPT WITH THE STATION.**
 *
 * `bridge-backup-channels.json`, beside the connection file (`B-312`'s lesson: a fact the service must keep
 * across a restart and an upgrade lives in the station's own state folder, which no flag overrides). The
 * entries are STAMPED with the server B they were made for: an entry made for one backup is never used for
 * another, because on another engine the same number is another channel.
 */

export const StoredBackupEntriesSchema = z.object({
  server: z.object({ host: z.string().min(1), amcpPort: z.number().int().positive() }),
  entries: z.array(BackupChannelEntrySchema),
});
export type StoredBackupEntries = z.infer<typeof StoredBackupEntriesSchema>;

/** The file's path, beside the connection file. */
export function backupChannelsPath(connectionPath: string): string {
  return path.join(path.dirname(connectionPath), 'bridge-backup-channels.json');
}

/** The saved entries, or `null` — none saved, or a file that cannot be used (said once, never fatal). */
export function loadBackupEntries(file: string): StoredBackupEntries | null {
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  try {
    return StoredBackupEntriesSchema.parse(JSON.parse(raw));
  } catch (err) {
    process.stderr.write(
      `[caspar-bridge] ⚠ ignoring unusable backup channel entries at ${file}: ` +
        `${err instanceof Error ? err.message : String(err)}\n`,
    );
    return null;
  }
}

/**
 * Write durably: a temp file, flushed to disk, then renamed over the old one — a crash leaves the old file or
 * the new one, never half of either. Throws on failure: a station admin's entry that was not kept is not said
 * to be.
 */
export function saveBackupEntries(file: string, value: StoredBackupEntries): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${String(process.pid)}.tmp`;
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, `${JSON.stringify(StoredBackupEntriesSchema.parse(value), null, 2)}\n`);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}

/** The entries in force for this server B: the saved ones when they were made for it, else none. */
export function entriesFor(
  stored: StoredBackupEntries | null,
  serverB: { readonly host: string; readonly amcpPort: number } | undefined,
): { readonly entries: readonly BackupChannelEntry[]; readonly madeForAnother: string | null } {
  if (stored === null || serverB === undefined) return { entries: [], madeForAnother: null };
  if (stored.server.host === serverB.host && stored.server.amcpPort === serverB.amcpPort) {
    return { entries: stored.entries, madeForAnother: null };
  }
  return {
    entries: [],
    madeForAnother:
      stored.entries.length === 0
        ? null
        : `${stored.server.host}:${String(stored.server.amcpPort)}`,
  };
}
