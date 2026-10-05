import { useState } from 'react';
import type { BackupChannelEntry, BackupChannelLine, BackupChannelsState } from '@cg/shared-ipc';
import { AsyncButton } from '../../ui/AsyncButton.js';
import { NumericInput } from '../../ui/NumericInput.js';
import { Tag } from '../../ui/Tag.js';

/**
 * 🔴 `RELEASE-0113-01` (`B-316`, `R-089`) — **STATION SETUP → SERVERS → BACKUP ENGINE: ONE LINE PER CHANNEL.**
 *
 * `CH N (primary) → CH M (backup)`: which of the backup engine's OWN channels mirrors each of this station's.
 * A Playout from `2.9.5` names it in its own channel list and the line says so; for an older backup engine a
 * station admin types M, and CG Bridge checks it against the backup engine's list (the row exists on server
 * B, the same video mode, CG licensed) before using it — a failed check is said beside the line, and the
 * channel stays unmapped: nothing for it reaches the backup. Anyone else reads the lines.
 *
 * Words only: the state, or the refusal. Saving does not wait for anything to leave air — an entry changes
 * where the NEXT lines go, and a change while a channel is live holds it until its next take (bridge-side).
 */

/** A line's state, in words — the refusal itself when there is one. */
export function backupEntryStateText(line: BackupChannelLine): string {
  if (line.state === 'mapped' && line.backupChannel !== undefined) {
    return `CH ${String(line.backupChannel)} in force · ${
      line.source === 'entry' ? 'from this entry' : 'from the backup engine'
    }`;
  }
  if (line.state === 'held') return 'Held until the next take';
  const why = line.entryRefusal ?? line.reason;
  return why === undefined ? 'Not mapped' : `Not mapped · ${why}`;
}

export function BackupChannelsCard({
  state,
  mayChange,
}: {
  /** The bridge's lines (`backupChannels.state`); `null` before the first answer. */
  state: BackupChannelsState | null;
  /** A station admin types the entries; anyone else reads them. */
  mayChange: boolean;
}): JSX.Element | null {
  /** The fields as typed, by channel; a channel not typed in shows its saved entry. */
  const [drafts, setDrafts] = useState<Readonly<Record<number, string>>>({});
  const backup = state?.backup ?? null;
  if (backup === null) return null;
  const valueOf = (line: BackupChannelLine): string =>
    drafts[line.channel] ?? (line.entry !== undefined ? String(line.entry) : '');
  const entries = (): BackupChannelEntry[] =>
    backup.channels.flatMap((line) => {
      const n = Number(valueOf(line));
      return Number.isInteger(n) && n > 0 ? [{ channel: line.channel, backupChannel: n }] : [];
    });

  return (
    <section className="cg-card" aria-label="Backup engine" data-backup-channels-card="">
      <div className="cg-card__head">
        <Tag className="cg-setup-server-chip" aria-hidden="true">
          B
        </Tag>
        <span className="cg-card__title">Backup engine</span>
        <span className="cg-card__spacer" />
        {mayChange && (
          <AsyncButton
            run={async () => {
              const result = await window.cg.backupChannels.setEntries({ entries: entries() });
              if (result.ok) setDrafts({});
              return {
                accepted: result.ok,
                ...(result.message !== undefined ? { message: result.message } : {}),
              };
            }}
          >
            Save backup channels
          </AsyncButton>
        )}
      </div>
      <div className="cg-card__body">
        {backup.channels.map((line) => {
          const id = `backup-channel-${String(line.channel)}`;
          const words = backupEntryStateText(line);
          return (
            <div
              key={line.channel}
              className="cg-setup-backup-row"
              data-backup-entry-row={String(line.channel)}
            >
              <label htmlFor={id}>{`CH ${String(line.channel)} (primary) → CH`}</label>
              {mayChange ? (
                <NumericInput
                  id={id}
                  allow="digits"
                  aria-label={`Backup channel for CH ${String(line.channel)}`}
                  value={valueOf(line)}
                  onValueChange={(next) => {
                    setDrafts((d) => ({ ...d, [line.channel]: next }));
                  }}
                />
              ) : (
                <span id={id}>{line.entry !== undefined ? String(line.entry) : '—'}</span>
              )}
              <span>(backup)</span>
              <span
                className="cg-setup-backup-state"
                data-state={line.state}
                data-backup-entry-state=""
                title={words}
              >
                {words}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
