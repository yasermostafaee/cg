import type { BackupChannelEntry, BackupChannelLine, BackupChannelsState } from '@cg/shared-ipc';
import { hostJoinsStation, type CatalogueRow } from './playout-catalogue.js';
import type { BackupChannelMap } from './server-b-line.js';

/**
 * 🔴 `RELEASE-0113-01` (`B-316`, `R-089`) — **EACH DECLARED CHANNEL'S MIRROR ON THE BACKUP ENGINE.**
 *
 * The Playout team's rule (`PLAYOUT-CG-RESPONSE-0112-PAIR-v1.md` §3), for the station's channel N, whose row
 * in the PRIMARY engine's D4 has `id` X:
 *
 *   1. read the BACKUP engine's own D4, with its own token (`R-085`); the rows whose `mirrorOf.id` is X and
 *      whose `mirrorOf.playout` names the primary engine — the HOST compared, the port ignored — match;
 *   2. a row whose `mirrorOf.playout` is EMPTY matches only when exactly one row in B carries that id;
 *   3. zero matches, or more than one, is no mapping: B is sent nothing for N;
 *   4. the row found gives B's own `casparChannel` (M); it is valid only when its `casparHost` is server B
 *      (rule 9: loopback = B's machine), its `videoMode` is A's, and its `cgLicensed` is `true`.
 *
 * Never A's `mirrors[].casparChannel` — not even parsed (`CatalogueRowSchema`). For a backup engine before
 * `2.9.5`, or where D4 names none, a station admin's explicit entry `N → M`, checked against B's D4 the same
 * way (and against being another channel's declared mirror). The two disagreeing is no mapping, said.
 *
 * ── IN FORCE vs RESOLVED ────────────────────────────────────────────────────────────────────────────────
 *
 * {@link channelOnB} — what the redundancy seam reads on every line — is the RESOLVED mapping, except for a
 * HELD channel: one whose mapping in force disappeared or changed while CG held live layers on it. A held
 * channel sends B nothing — not to the old M, not to the new one, no clean-up anywhere — until its next take
 * ({@link release}). A mapping that appears where there was none, or changes while nothing is live, is in
 * force at once; rows already live reach B at their next take, as after a backup reconnect.
 *
 * ── FRESHNESS ───────────────────────────────────────────────────────────────────────────────────────────
 *
 * B's D4 counts only while its last good read is under {@link BACKUP_D4_FRESH_MS} old: one missed 5 s poll
 * must not drop a live mirror, and a backup whose list cannot be read stops receiving within half a minute.
 * A's last good D4 is KEPT through an outage — a failover is exactly when the primary cannot be read, and
 * the mapping must hold then; it says only what A's own channel is called and how it runs.
 */

/** How old B's last good D4 may be while its mirrors are used. Six of its 5 s polls. */
export const BACKUP_D4_FRESH_MS = 30_000;

/** How often the mapping is re-judged with nothing else having changed (B's freshness crosses on time). */
export const BACKUP_CHANNELS_TICK_MS = 5_000;

export interface BackupChannelsOptions {
  /** The channels this station declares (on server A). */
  readonly declared: () => readonly number[];
  /** Server A's host as configured. */
  readonly serverAHost: () => string;
  /** Server B as configured; `undefined` — no server B. */
  readonly serverB: () => { readonly host: string; readonly amcpPort: number } | undefined;
  /** The primary ENGINE's API host — what `mirrorOf.playout` must name. `null`: no Playout configured. */
  readonly primaryEngineHost: () => string | null;
  /** The primary engine's D4, rule 9 applied; `null` — absent now. */
  readonly primaryRows: () => readonly CatalogueRow[] | null;
  /** The backup engine's D4, read with its own token, rule 9 applied; `null` — absent now. */
  readonly backupRows: () => readonly CatalogueRow[] | null;
  /** When the backup engine last ANSWERED its D4 (epoch ms), or `null`. */
  readonly backupReadAtMs: () => number | null;
  /** The station admin's entries for the server B in force, and whom saved ones were made for otherwise. */
  readonly entries: () => {
    readonly entries: readonly BackupChannelEntry[];
    readonly madeForAnother: string | null;
  };
  /** Does CG hold live layers on this channel (a row on air, or a seat in the ledger)? */
  readonly liveOn: (channel: number) => boolean;
  readonly now?: () => number;
  readonly tickMs?: number;
  readonly log?: (line: string) => void;
}

/** One channel's resolution, before HELD is applied. */
interface Resolution {
  readonly onB: number | null;
  readonly source?: 'playout' | 'entry';
  readonly reason?: string;
  readonly entry?: number;
  readonly entryRefusal?: string;
}

/**
 * The host a `mirrorOf.playout` names — with or without a scheme or a port — or `null` when it names none
 * that can be read. Its form is the admin's typing, never guessed: this only takes the host out of it.
 */
export function playoutHostOf(playout: string): string | null {
  const text = playout.trim();
  if (text === '') return null;
  try {
    const url = new URL(text.includes('://') ? text : `http://${text}`);
    const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    return host === '' ? null : host;
  } catch {
    return null;
  }
}

function sameHost(a: string, b: string): boolean {
  return a.replace(/^\[|\]$/g, '').toLowerCase() === b.replace(/^\[|\]$/g, '').toLowerCase();
}

/** Why a matched row (or an entry's row) is not a valid mirror of A's row, or `null` when it is. */
function rowRefusal(
  row: CatalogueRow,
  aRow: CatalogueRow,
  serverBHost: string,
  channel: number,
): string | null {
  const m = String(row.casparChannel);
  if (!hostJoinsStation(row.casparHost, [serverBHost])) {
    return `Backup CH ${m} is on ${row.casparHost}, not on server B (${serverBHost}).`;
  }
  const a = aRow.videoMode;
  const b = row.videoMode;
  if (typeof a !== 'string' || typeof b !== 'string') {
    return `The video mode of CH ${String(channel)} or backup CH ${m} is not known.`;
  }
  if (a !== b) {
    return `Video mode differs: CH ${String(channel)} is ${a}, backup CH ${m} is ${b}.`;
  }
  if (row.cgLicensed !== true) return `CG is not licensed on backup CH ${m}.`;
  return null;
}

export class BackupChannels implements BackupChannelMap {
  readonly #opts: BackupChannelsOptions;
  readonly #now: () => number;
  #lastA: readonly CatalogueRow[] | null = null;
  #lastB: readonly CatalogueRow[] | null = null;
  #resolved = new Map<number, Resolution>();
  #inForce = new Map<number, number>();
  readonly #held = new Set<number>();
  #state: BackupChannelsState = { backup: null };
  #stateText = JSON.stringify(this.#state);
  #ticker: ReturnType<typeof setInterval> | null = null;
  readonly #handlers = new Set<(state: BackupChannelsState) => void>();

  constructor(options: BackupChannelsOptions) {
    this.#opts = options;
    this.#now = options.now ?? ((): number => Date.now());
    this.recompute();
  }

  /** Re-judge every `tickMs` (unref'd), so B's freshness is crossed on time. */
  start(): void {
    if (this.#ticker !== null) return;
    this.#ticker = setInterval(() => {
      this.recompute();
    }, this.#opts.tickMs ?? BACKUP_CHANNELS_TICK_MS);
    this.#ticker.unref();
  }

  dispose(): void {
    if (this.#ticker !== null) clearInterval(this.#ticker);
    this.#ticker = null;
  }

  // ── the map the redundancy seam reads, on every line ─────────────────────────────────────────────────

  channelOnB(channel: number): number | null {
    return this.#inForce.get(channel) ?? null;
  }

  channelOnBAtTake(channel: number): number | null {
    return this.#resolved.get(channel)?.onB ?? null;
  }

  stationChannelOf(channelOnB: number): number | null {
    for (const [channel, onB] of this.#inForce) if (onB === channelOnB) return channel;
    return null;
  }

  release(channel: number): void {
    if (!this.#held.delete(channel)) return;
    const onB = this.#resolved.get(channel)?.onB ?? null;
    if (onB !== null) this.#inForce.set(channel, onB);
    this.#log(
      onB === null
        ? `CH ${String(channel)}: taken with no backup channel — nothing is sent to server B for it`
        : `CH ${String(channel)}: taken — its lines reach server B's channel ${String(onB)} from now`,
    );
    this.#publish();
  }

  // ── what every console reads ─────────────────────────────────────────────────────────────────────────

  state(): BackupChannelsState {
    return this.#state;
  }

  onChanged(handler: (state: BackupChannelsState) => void): () => void {
    this.#handlers.add(handler);
    return () => {
      this.#handlers.delete(handler);
    };
  }

  /** Re-judge every channel from what is held now. Cheap; called on every input change and every tick. */
  recompute(): void {
    const primary = this.#opts.primaryRows();
    if (primary !== null) this.#lastA = primary;
    const backup = this.#opts.backupRows();
    if (backup !== null) this.#lastB = backup;
    const serverB = this.#opts.serverB();
    const declared = [...new Set(this.#opts.declared())].sort((a, b) => a - b);
    const resolved = new Map<number, Resolution>();
    if (serverB !== undefined) {
      const entries = this.#opts.entries();
      for (const channel of declared) {
        resolved.set(channel, this.#resolve(channel, serverB.host, entries));
      }
    }
    this.#resolved = resolved;

    // In force: the resolution, unless a mapping in force moved while the channel was live (HELD).
    for (const channel of [...this.#inForce.keys(), ...this.#held]) {
      if (!resolved.has(channel)) {
        this.#inForce.delete(channel);
        this.#held.delete(channel);
      }
    }
    for (const [channel, resolution] of resolved) {
      if (this.#held.has(channel)) continue;
      const was = this.#inForce.get(channel) ?? null;
      const next = resolution.onB;
      if (was === next) continue;
      if (was !== null && this.#opts.liveOn(channel)) {
        this.#inForce.delete(channel);
        this.#held.add(channel);
        this.#log(
          `🔴 CH ${String(channel)}: its backup channel ${next === null ? 'is gone' : `moved to ${String(next)}`} ` +
            `while it is live (it was server B's ${String(was)}) — nothing more is sent to server B for ` +
            `CH ${String(channel)}, no clean-up to any channel, until its next take`,
        );
        continue;
      }
      if (next === null) {
        this.#inForce.delete(channel);
        this.#log(
          `CH ${String(channel)}: no backup channel (${resolution.reason ?? 'none'}) — nothing is sent to ` +
            `server B for it`,
        );
      } else {
        this.#inForce.set(channel, next);
        this.#log(`CH ${String(channel)} reaches server B's channel ${String(next)}`);
      }
    }
    this.#publish();
  }

  // ── inside ───────────────────────────────────────────────────────────────────────────────────────────

  #resolve(
    channel: number,
    serverBHost: string,
    entries: ReturnType<BackupChannelsOptions['entries']>,
  ): Resolution {
    const n = String(channel);
    const aHost = this.#opts.serverAHost();
    const aRow = this.#lastA?.find(
      (r) => r.casparChannel === channel && hostJoinsStation(r.casparHost, [aHost]),
    );
    const readAt = this.#opts.backupReadAtMs();
    const fresh = readAt !== null && this.#now() - readAt <= BACKUP_D4_FRESH_MS;
    const bRows = fresh ? this.#lastB : null;
    const entry = entries.entries.find((e) => e.channel === channel);
    const entryM = entry?.backupChannel;
    const entryFields = entryM !== undefined ? { entry: entryM } : {};

    // Why nothing can be judged at all: no channel list on one side or the other.
    const unreadable =
      aRow === undefined
        ? this.#lastA === null
          ? "The primary engine's channel list has not been read."
          : `The primary engine's channel list does not name CH ${n}.`
        : bRows === null
          ? this.#lastB === null
            ? "The backup engine's channel list has not been read."
            : "The backup engine's channel list has not answered for 30 s."
          : null;
    if (unreadable !== null || aRow === undefined || bRows === null) {
      const reason = unreadable ?? 'Not known.';
      return {
        onB: null,
        reason,
        ...entryFields,
        ...(entryM !== undefined ? { entryRefusal: reason } : {}),
      };
    }

    // ── 1. the backup engine's own D4 (`mirrorOf`, `2.9.5`) ──
    const primaryHost = this.#opts.primaryEngineHost();
    const publishes = bRows.some((r) => r.mirrorOf !== undefined);
    const withId = bRows.filter((r) => r.mirrorOf?.id === aRow.id);
    const names = (row: CatalogueRow): boolean => {
      const host = playoutHostOf(row.mirrorOf?.playout ?? '');
      return host !== null && primaryHost !== null && sameHost(host, primaryHost);
    };
    const isEmpty = (row: CatalogueRow): boolean => (row.mirrorOf?.playout ?? '').trim() === '';
    const matched = [
      ...withId.filter(names),
      ...(withId.length === 1 ? withId.filter(isEmpty) : []),
    ];
    let autoM: number | null = null;
    let autoReason: string;
    let autoValid = false;
    if (!publishes) {
      autoReason = 'The backup engine publishes no mirrors (Playout before 2.9.5).';
    } else if (matched.length === 1 && matched[0] !== undefined) {
      const row = matched[0];
      autoM = row.casparChannel;
      const refusal = rowRefusal(row, aRow, serverBHost, channel);
      autoValid = refusal === null;
      autoReason = refusal ?? '';
    } else if (matched.length > 1) {
      autoReason = `The backup engine names ${String(matched.length)} mirrors of CH ${n}.`;
    } else if (withId.length === 0) {
      autoReason = `The backup engine names no mirror of CH ${n}.`;
    } else if (withId.length > 1 && withId.every(isEmpty)) {
      autoReason = `The backup engine names ${String(withId.length)} mirrors of CH ${n}.`;
    } else {
      const named = withId.map((r) => (r.mirrorOf?.playout ?? '').trim()).filter((p) => p !== '');
      autoReason =
        `The backup engine's mirror of CH ${n} names another primary engine` +
        `${named.length > 0 ? ` (${named.join(', ')})` : ''}.`;
    }

    // ── 2. the station admin's entry, checked against B's D4 ──
    let entryRefusal: string | null = null;
    if (entryM !== undefined) {
      const m = String(entryM);
      const twice = entries.entries.filter((e) => e.backupChannel === entryM).length > 1;
      const row = bRows.find(
        (r) => r.casparChannel === entryM && hostJoinsStation(r.casparHost, [serverBHost]),
      );
      // Another channel's declared mirror. A row naming THIS id under a spelling CG cannot match (a name
      // where CG knows an IP) is exactly what an entry is for, so the id alone decides.
      const mirrorsOther =
        row?.mirrorOf !== undefined && row.mirrorOf !== null && row.mirrorOf.id !== aRow.id;
      entryRefusal = twice
        ? `CH ${m} is entered for two channels.`
        : row === undefined
          ? `The backup engine lists no CH ${m} on server B.`
          : mirrorsOther
            ? `Backup CH ${m} is the mirror of another channel.`
            : rowRefusal(row, aRow, serverBHost, channel);
    }

    // ── 3. together ──
    if (entryM !== undefined && autoM !== null && entryM !== autoM) {
      return {
        onB: null,
        reason: `The entry (CH ${String(entryM)}) and the backup engine (CH ${String(autoM)}) disagree.`,
        entry: entryM,
        entryRefusal: `The backup engine names CH ${String(autoM)}.`,
      };
    }
    if (autoM !== null) {
      return autoValid
        ? { onB: autoM, source: 'playout', ...entryFields }
        : {
            onB: null,
            reason: autoReason,
            ...entryFields,
            ...(entryM !== undefined ? { entryRefusal: autoReason } : {}),
          };
    }
    if (entryM !== undefined) {
      return entryRefusal === null
        ? { onB: entryM, source: 'entry', entry: entryM }
        : { onB: null, reason: entryRefusal, entry: entryM, entryRefusal };
    }
    const another =
      entries.madeForAnother !== null
        ? ` Entries were made for another server B (${entries.madeForAnother}).`
        : '';
    return { onB: null, reason: `${autoReason}${another}`.slice(0, 300) };
  }

  #publish(): void {
    const serverB = this.#opts.serverB();
    const next: BackupChannelsState =
      serverB === undefined
        ? { backup: null }
        : {
            backup: {
              backupHost: serverB.host,
              channels: [...this.#resolved].map(([channel, r]): BackupChannelLine => {
                const held = this.#held.has(channel);
                const onB = held ? r.onB : (this.#inForce.get(channel) ?? null);
                const state: BackupChannelLine['state'] = held
                  ? 'held'
                  : onB !== null
                    ? 'mapped'
                    : 'not-mapped';
                return {
                  channel,
                  state,
                  ...(onB !== null ? { backupChannel: onB } : {}),
                  ...(state === 'mapped' && r.source !== undefined ? { source: r.source } : {}),
                  ...(r.entry !== undefined ? { entry: r.entry } : {}),
                  ...(r.entryRefusal !== undefined
                    ? { entryRefusal: r.entryRefusal.slice(0, 300) }
                    : {}),
                  ...(state !== 'mapped' && r.reason !== undefined && r.reason !== ''
                    ? { reason: r.reason.slice(0, 300) }
                    : held
                      ? { reason: 'Its mapping changed while it was live.' }
                      : {}),
                };
              }),
            },
          };
    const text = JSON.stringify(next);
    if (text === this.#stateText) return;
    this.#state = next;
    this.#stateText = text;
    for (const handler of [...this.#handlers]) handler(next);
  }

  #log(line: string): void {
    (this.#opts.log ?? ((l: string) => process.stderr.write(`[caspar-bridge] ${l}\n`)))(line);
  }
}
