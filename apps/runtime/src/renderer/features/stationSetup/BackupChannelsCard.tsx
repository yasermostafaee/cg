import { useUiText } from '../../i18n/locale.js';
import { useState } from 'react';
import type {
  BackupChannelEntry,
  BackupChannelLine,
  BackupChannels,
  BackupChannelsState,
} from '@cg/shared-ipc';
import { AsyncButton } from '../../ui/AsyncButton.js';
import { SelectInput } from '../../ui/SelectInput.js';
import { Tag } from '../../ui/Tag.js';

/**
 * 🔴 `RELEASE-0113-01` (`B-316`, `R-089`) — **STATION SETUP → SERVERS → BACKUP ENGINE: ONE LINE PER CHANNEL.**
 *
 * `CH N (primary) → CH M (backup)`: which of the backup engine's OWN channels mirrors each of this station's.
 * A Playout from `2.9.5` names it in its own channel list and the line says so; for an older backup engine a
 * station admin selects M, and CG Bridge checks it against the backup engine's list (the row exists on server
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

function defaultChoiceText(backup: BackupChannels, line: BackupChannelLine): string {
  const automatic =
    line.automaticChannel ?? (line.source === 'playout' ? line.backupChannel : undefined);
  if (automatic !== undefined) return `Automatic · CH ${String(automatic)}`;
  switch (backup.channelListState) {
    case 'unread':
      return 'Waiting for channel list';
    case 'stale':
      return 'Channel list out of date';
    case 'empty':
      return 'No channels on server B';
    case 'ready':
      return line.manualChoices?.length ? 'No manual mapping' : 'No compatible channels';
    default:
      return 'Channel choices unavailable';
  }
}

export function BackupChannelsCard({
  state,
  mayChange,
  bridgeAutoFailover,
}: {
  /** The bridge's lines (`backupChannels.state`); `null` before the first answer. */
  state: BackupChannelsState | null;
  /** A station admin chooses the entries; anyone else reads them. */
  mayChange: boolean;
  /** A Playout-connected station still uses the Bridge's independent graphics backup. */
  bridgeAutoFailover?: boolean;
}): JSX.Element | null {
  const localizeUi = useUiText();
  const [drafts, setDrafts] = useState<Readonly<Record<number, number | null>>>({});
  const [saving, setSaving] = useState(false);
  const backup = state?.backup ?? null;
  if (backup === null) return null;
  const rows = backup.channels.map((line) => {
    const draft = drafts[line.channel];
    const choice = draft === undefined ? (line.entry ?? null) : draft;
    return { line, choice, dirty: choice !== (line.entry ?? null) };
  });
  const entries = rows.flatMap(({ line, choice }): BackupChannelEntry[] =>
    choice === null ? [] : [{ channel: line.channel, backupChannel: choice }],
  );
  const dirty = rows.some((row) => row.dirty);
  const refusalFor = (line: BackupChannelLine, choice: number | null): string | null => {
    if (choice === null) return null;
    if (!line.manualChoices?.some((available) => available.channel === choice)) {
      return `CH ${String(choice)} is no longer an available choice.`;
    }
    if (rows.some((row) => row.line.channel !== line.channel && row.choice === choice)) {
      return `CH ${String(choice)} is already selected for another channel.`;
    }
    return null;
  };
  const invalid = rows.some((row) => row.dirty && refusalFor(row.line, row.choice) !== null);

  return (
    <section
      className="cg-card"
      aria-label={localizeUi('Backup engine')}
      data-backup-channels-card=""
    >
      <div className="cg-card__head">
        <Tag className="cg-setup-server-chip" aria-hidden="true">
          B
        </Tag>
        <span className="cg-card__title">{localizeUi('Backup engine')}</span>
        <span className="cg-card__spacer" />
        {mayChange && (
          <AsyncButton
            variant="primary"
            disabled={!dirty || invalid || saving}
            run={async () => {
              setSaving(true);
              try {
                const result = await window.cg.backupChannels.setEntries({ entries });
                if (result.ok) setDrafts({});
                return {
                  accepted: result.ok,
                  ...(result.message !== undefined ? { message: result.message } : {}),
                };
              } finally {
                setSaving(false);
              }
            }}
          >
            {localizeUi('Save backup channels')}
          </AsyncButton>
        )}
      </div>
      <div className="cg-card__body">
        {bridgeAutoFailover !== undefined && (
          <p className="cg-setup-field__hint">
            {localizeUi('CG Bridge manages the graphics backup. Automatic CG failover is')}{' '}
            {bridgeAutoFailover ? 'on' : 'off'}
            {localizeUi('. Playout switches programme separately.')}
          </p>
        )}
        {rows.map(({ line, choice, dirty: rowDirty }) => {
          const id = `backup-channel-${String(line.channel)}`;
          const choices = line.manualChoices ?? [];
          const fallback =
            choice !== null && !choices.some((available) => available.channel === choice);
          const refusal = rowDirty ? refusalFor(line, choice) : null;
          const words = refusal ?? backupEntryStateText(line);
          const defaultChoice = defaultChoiceText(backup, line);
          const value = choice === null ? '' : String(choice);
          return (
            <div
              key={line.channel}
              className="cg-setup-backup-row"
              data-backup-entry-row={String(line.channel)}
            >
              <label htmlFor={id}>{`CH ${String(line.channel)} (primary) →`}</label>
              {mayChange ? (
                <SelectInput
                  id={id}
                  className={rowDirty ? 'is-dirty' : undefined}
                  aria-label={`Backup channel for CH ${String(line.channel)}`}
                  aria-describedby={`${id}-status`}
                  aria-invalid={refusal !== null}
                  disabled={saving || (choices.length === 0 && choice === null && !rowDirty)}
                  value={value}
                  onChange={(event) => {
                    const next = event.currentTarget.value;
                    setDrafts((prev) => ({
                      ...prev,
                      [line.channel]: next === '' ? null : Number(next),
                    }));
                  }}
                >
                  <option value="">{defaultChoice}</option>
                  {fallback && (
                    <option value={value} disabled>
                      CH {value} ·{' '}
                      {line.entryRefusal !== undefined || rowDirty ? 'Unavailable' : 'Saved'}
                    </option>
                  )}
                  {choices.map(({ channel, name }) => (
                    <option key={channel} value={channel}>
                      CH {channel} · {name}
                    </option>
                  ))}
                </SelectInput>
              ) : (
                <span id={id}>{choice === null ? defaultChoice : `CH ${value}`}</span>
              )}
              <span
                id={`${id}-status`}
                className="cg-setup-backup-state"
                data-state={refusal !== null ? 'not-mapped' : line.state}
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
