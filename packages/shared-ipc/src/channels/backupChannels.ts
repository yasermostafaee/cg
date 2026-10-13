import { z } from 'zod';
import { defineChannel } from '../channel.js';
import { definePublishChannel } from '../publish.js';

/**
 * 🔴 `RELEASE-0113-01` (`B-316`, `R-089`) — **WHERE EACH CHANNEL'S LINES GO ON THE BACKUP ENGINE.**
 *
 * On the Playout, redundancy belongs to a CHANNEL: the mirror of the primary's channel N is a channel of the
 * backup engine's OWN, M — its largest channel + 1 when the mirror was made — and the backup's channel N is
 * something else, perhaps another programme on air (`PLAYOUT-CG-RESPONSE-0112-PAIR-v1.md` §2). CG Bridge
 * sends server B every line for N on M, or nothing for N at all. These are the facts every console reads:
 *
 *   - `mapped` — N's lines reach server B on `backupChannel`; `source` says where M comes from: the backup
 *     engine's own D4 (`mirrorOf`, Playout `2.9.5`) or a station admin's entry;
 *   - `not-mapped` — nothing for N reaches server B; `reason` says why, in words;
 *   - `held` — N's mapping changed while N was live: nothing for N reaches server B until N's next take,
 *     which puts `backupChannel` (the new M, when there is one) in force.
 *
 * `entry` is a station admin's own entry for N, and `entryRefusal` why it is not used.
 */
export const BACKUP_CHANNEL_STATES = ['mapped', 'not-mapped', 'held'] as const;
export type BackupChannelState = (typeof BACKUP_CHANNEL_STATES)[number];

export const BACKUP_CHANNEL_SOURCES = ['playout', 'entry'] as const;
export type BackupChannelSource = (typeof BACKUP_CHANNEL_SOURCES)[number];

export const BackupChannelLineSchema = z.object({
  /** The station's channel, on the primary engine. */
  channel: z.number().int().positive(),
  state: z.enum(BACKUP_CHANNEL_STATES),
  /** Server B's own channel: in force (`mapped`), or the one the next take puts in force (`held`). */
  backupChannel: z.number().int().positive().optional(),
  source: z.enum(BACKUP_CHANNEL_SOURCES).optional(),
  entry: z.number().int().positive().optional(),
  entryRefusal: z.string().min(1).max(300).optional(),
  reason: z.string().min(1).max(300).optional(),
});
export type BackupChannelLine = z.infer<typeof BackupChannelLineSchema>;

export const BackupChannelsSchema = z.object({
  /** Server B's host — the machine every `mapped` line goes to. */
  backupHost: z.string().min(1),
  channels: z.array(BackupChannelLineSchema),
});
export type BackupChannels = z.infer<typeof BackupChannelsSchema>;

/** `backup: null` — no server B is declared. */
export const BackupChannelsStateSchema = z.object({ backup: BackupChannelsSchema.nullable() });
export type BackupChannelsState = z.infer<typeof BackupChannelsStateSchema>;

/** Pull the mapping (a console's initial read). Station-wide: one server B, one mapping. */
export const BackupChannelsStateChannel = defineChannel(
  'backupChannels.state',
  z.void(),
  BackupChannelsStateSchema,
);

/** Pushed whenever any channel's line changes. */
export const BackupChannelsChangedChannel = definePublishChannel(
  'backupChannels.changed',
  BackupChannelsStateSchema,
);

export const BackupChannelEntrySchema = z.object({
  channel: z.number().int().positive(),
  backupChannel: z.number().int().positive(),
});
export type BackupChannelEntry = z.infer<typeof BackupChannelEntrySchema>;

/**
 * A station admin's entries, COMPLETE (a channel left out has none): `CH N (primary) → CH M (backup)`, for a
 * backup engine before `2.9.5` or where its D4 names no mirror. Each is checked against the backup engine's
 * D4 before it is used, and its refusal is said beside it. `station-admin` only; refused while the lock
 * holds; recorded in the audit.
 */
export const BackupChannelEntriesSetChannel = defineChannel(
  'backupChannels.set-entries',
  z.object({ entries: z.array(BackupChannelEntrySchema).max(64) }),
  z.object({ ok: z.boolean(), message: z.string().min(1).max(300).optional() }),
);

/** A take refused while server B is the primary: no mapping in force for its channel. */
export const BACKUP_UNMAPPED_CODE = 'backup-unmapped';
/** A `route://` line, which never reaches server B. */
export const BACKUP_ROUTE_CODE = 'backup-route';
/** A line server B's guard refused: not a mirror channel in force, outside CG's layers, or of no known shape. */
export const BACKUP_GUARD_CODE = 'backup-guard';

/** The take's refusal while server B is the primary and channel N has no backup channel. */
export function backupUnmappedRefusal(channel: number): string {
  return `No backup channel is known for CH ${String(channel)}.`;
}

/** 🔴 **A CHANNEL'S BACKUP LINE, in its own view — the one spelling.** */
export function backupChannelLineText(line: BackupChannelLine, backupHost: string): string {
  if (line.state === 'mapped' && line.backupChannel !== undefined) {
    return `Backup: CH ${String(line.backupChannel)} on ${backupHost}`;
  }
  if (line.state === 'held')
    return 'Backup: held until the next take — nothing is sent to the backup';
  return 'Backup: not mapped — nothing is sent to the backup';
}

/** How the status bar draws the count: plain when every channel is mapped. */
export type BackupMappedTone = 'ok' | 'warn' | 'alarm';

/**
 * 🔴 **THE STATUS BAR'S COUNT — `BACKUP B · n of m channels mapped`.** `null` with no server B, or before a
 * channel is declared. The alarm tone when none is mapped, the warning tone when some are not.
 */
export function backupMappedSummary(
  state: BackupChannelsState,
): { readonly text: string; readonly tone: BackupMappedTone } | null {
  const backup = state.backup;
  if (backup === null || backup.channels.length === 0) return null;
  const m = backup.channels.length;
  const n = backup.channels.filter((c) => c.state === 'mapped').length;
  return {
    text: `BACKUP B · ${String(n)} of ${String(m)} channels mapped`,
    tone: n === m ? 'ok' : n === 0 ? 'alarm' : 'warn',
  };
}

/** While server B is the primary: the programme return, its sound and its meter are not read there. */
export const NOT_ON_BACKUP_ENGINE_WORDS = 'Not available on the backup engine';
