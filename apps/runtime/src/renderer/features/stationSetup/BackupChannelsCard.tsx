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
function backupEntryStateText(
  line: BackupChannelLine,
  localizeUi: ReturnType<typeof useUiText>,
): string {
  if (line.state === 'mapped' && line.backupChannel !== undefined) {
    return localizeUi(
      line.source === 'entry'
        ? 'CH {channel} in force · from this entry'
        : 'CH {channel} in force · from the backup engine',
      { channel: line.backupChannel },
    );
  }
  if (line.state === 'held') return localizeUi('Held until the next take');
  const why = line.entryRefusal ?? line.reason;
  return why === undefined
    ? localizeUi('Not mapped')
    : localizeUi('Not mapped · {reason}', { reason: localizeUi(why) });
}

function defaultChoiceText(
  backup: BackupChannels,
  line: BackupChannelLine,
  localizeUi: ReturnType<typeof useUiText>,
): string {
  const automatic =
    line.automaticChannel ?? (line.source === 'playout' ? line.backupChannel : undefined);
  if (automatic !== undefined)
    return localizeUi('Automatic · CH {channel}', { channel: automatic });
  switch (backup.channelListState) {
    case 'unread':
      return localizeUi('Waiting for channel list');
    case 'stale':
      return localizeUi('Channel list out of date');
    case 'empty':
      return localizeUi('No channels on server B');
    case 'ready':
      return localizeUi(
        line.manualChoices?.length ? 'No manual mapping' : 'No compatible channels',
      );
    default:
      return localizeUi('Channel choices unavailable');
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
      return localizeUi('CH {channel} is no longer an available choice.', { channel: choice });
    }
    if (rows.some((row) => row.line.channel !== line.channel && row.choice === choice)) {
      return localizeUi('CH {channel} is already selected for another channel.', {
        channel: choice,
      });
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
            {localizeUi(
              bridgeAutoFailover
                ? 'CG Bridge manages the graphics backup. Automatic CG failover is on. Playout switches programme separately.'
                : 'CG Bridge manages the graphics backup. Automatic CG failover is off. Playout switches programme separately.',
            )}
          </p>
        )}
        {rows.map(({ line, choice, dirty: rowDirty }) => {
          const id = `backup-channel-${String(line.channel)}`;
          const choices = line.manualChoices ?? [];
          const fallback =
            choice !== null && !choices.some((available) => available.channel === choice);
          const refusal = rowDirty ? refusalFor(line, choice) : null;
          const words = refusal ?? backupEntryStateText(line, localizeUi);
          const defaultChoice = defaultChoiceText(backup, line, localizeUi);
          const value = choice === null ? '' : String(choice);
          return (
            <div
              key={line.channel}
              className="cg-setup-backup-row"
              data-backup-entry-row={String(line.channel)}
            >
              <label htmlFor={id}>
                {localizeUi('CH {channel} (primary) →', { channel: line.channel })}
              </label>
              {mayChange ? (
                <SelectInput
                  id={id}
                  className={rowDirty ? 'is-dirty' : undefined}
                  aria-label={localizeUi('Backup channel for CH {channel}', {
                    channel: line.channel,
                  })}
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
                      {localizeUi('CH {channel}', { channel: value })} ·{' '}
                      {localizeUi(
                        line.entryRefusal !== undefined || rowDirty ? 'Unavailable' : 'Saved',
                      )}
                    </option>
                  )}
                  {choices.map(({ channel, name }) => (
                    <option key={channel} value={channel}>
                      {localizeUi('CH {channel} · {name}', { channel, name })}
                    </option>
                  ))}
                </SelectInput>
              ) : (
                <span id={id}>
                  {choice === null ? defaultChoice : localizeUi('CH {channel}', { channel: value })}
                </span>
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
