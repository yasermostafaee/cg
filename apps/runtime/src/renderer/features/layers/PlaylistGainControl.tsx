import { useEffect, useId, useState } from 'react';
import {
  PLAYLIST_GAIN_MAX_DB,
  PLAYLIST_GAIN_MIN_DB,
  type PlaylistGainFailure,
  type PlaylistGainReply,
  type PlaylistGainState,
} from '@cg/shared-ipc';
import { SlidersHorizontal } from 'lucide-react';
import { useConnections } from '../../hooks/useConnections.js';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { Modal, ModalAction } from '../../ui/Modal.js';
import { NumericInput } from '../../ui/NumericInput.js';
import { BRIDGE_DOWN_REASON } from '../../ui/reachWording.js';
import { Tag } from '../../ui/Tag.js';

const refusal: Record<PlaylistGainFailure, string> = {
  unavailable: 'The connected Playout does not provide Playlist gain for this channel.',
  forbidden: 'This sign-in cannot control Playlist gain for this channel.',
  'backup-sign-in': 'Server B owns this channel and needs its own authorized operator session.',
  'owner-changed': 'The channel owner or sign-in changed. Refresh to read its current gain.',
  'invalid-request': 'Playout refused that gain value.',
  conflict: 'The gain changed or the edit expired. Review the current value before applying again.',
  busy: 'Playout is busy. Review the current value before applying again.',
  'peer-owner': 'The peer Engine owns this channel.',
  uncertain: 'Playout did not confirm the edit. Check the current gain before applying again.',
};

const application: Record<PlaylistGainState['application'], string> = {
  applied: 'Applied',
  ramping: 'Ramping',
  pending: 'Saved · waiting for Playout',
};
const usage: Record<PlaylistGainState['usage'], string> = {
  used: 'Used in a live frame · copy muted',
  unused: 'No live frame uses this output',
  unknown: 'Live-frame use unconfirmed',
};

export function PlaylistGainControl({
  channel,
  linkDown,
}: {
  channel: number;
  linkDown: boolean;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const health = useConnections();
  const ownerEpoch = `${health?.currentPrimary ?? 'A'}:${health?.lastFailover?.at ?? ''}`;
  return (
    <>
      <Button
        variant="secondary"
        disabled={linkDown}
        title={linkDown ? BRIDGE_DOWN_REASON : 'Adjust the original Playlist output'}
        onClick={() => setOpen(true)}
      >
        <Icon icon={SlidersHorizontal} size={14} />
        Playlist gain
      </Button>
      {open && (
        <PlaylistGainDialog key={ownerEpoch} channel={channel} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function PlaylistGainDialog({
  channel,
  onClose,
}: {
  channel: number;
  onClose: () => void;
}): JSX.Element {
  const [reply, setReply] = useState<PlaylistGainReply>();
  const [draft, setDraft] = useState<string>();
  const [refresh, setRefresh] = useState(0);
  const [reading, setReading] = useState(true);
  const [saving, setSaving] = useState(false);
  const fieldId = useId();
  const state = reply?.ok === true ? reply.state : reply?.current;
  const failure = reply?.ok === false ? refusal[reply.reason] : undefined;
  const draftValue = draft ?? (state === undefined ? '' : String(state.gainDb));
  const parsed = draftValue.trim() === '' ? NaN : Number(draftValue);
  const canApply =
    !reading &&
    !saving &&
    state !== undefined &&
    parsed !== state.gainDb &&
    parsed >= PLAYLIST_GAIN_MIN_DB &&
    parsed <= PLAYLIST_GAIN_MAX_DB;

  useEffect(() => {
    let active = true;
    setReading(true);
    void window.cg.playlistGain
      .get({ channel })
      .then(
        (result) => {
          if (active) setReply(result);
        },
        () => {
          if (active) setReply({ ok: false, reason: 'unavailable' });
        },
      )
      .finally(() => {
        if (active) setReading(false);
      });
    return () => {
      active = false;
    };
  }, [channel, refresh]);

  useEffect(() => {
    if (
      reply?.ok !== true ||
      reply.state.application === 'applied' ||
      draft !== undefined ||
      reading ||
      saving
    ) {
      return;
    }
    const timer = setTimeout(() => setRefresh((value) => value + 1), 2_000);
    return () => clearTimeout(timer);
  }, [reply, draft, reading, saving]);

  const apply = (): void => {
    if (!canApply || state === undefined) return;
    setSaving(true);
    void window.cg.playlistGain
      .set({ channel, gainDb: parsed, editToken: state.editToken })
      .then(
        (result) => {
          setReply(result);
          if (result.ok) setDraft(undefined);
        },
        () => setReply({ ok: false, reason: 'uncertain' }),
      )
      .finally(() => setSaving(false));
  };

  return (
    <Modal
      title="Playlist gain"
      subtitle={`CH ${String(channel)} · Programme output`}
      emblem={SlidersHorizontal}
      onClose={onClose}
      busy={saving}
      {...(failure !== undefined && { message: { role: 'refusal', text: failure } })}
      footer={
        <>
          <ModalAction actionRole="cancel" disabled={saving} onClick={onClose}>
            Close
          </ModalAction>
          <Button
            variant="secondary"
            disabled={reading || saving}
            onClick={() => {
              setReading(true);
              setRefresh((value) => value + 1);
            }}
          >
            Refresh
          </Button>
          <ModalAction actionRole="primary" disabled={!canApply} onClick={apply}>
            Apply
          </ModalAction>
        </>
      }
    >
      {state === undefined ? (
        reading && <p role="status">Reading Playlist gain…</p>
      ) : (
        <>
          <p aria-live="polite">
            <Tag>{`${String(state.gainDb)} dB · ${application[state.application]}`}</Tag>
            <Tag>{usage[state.usage]}</Tag>
          </p>
          <label htmlFor={fieldId}>
            Programme gain (dB)
            <NumericInput
              id={fieldId}
              className="cg-field cg-field--mono"
              value={draftValue}
              onValueChange={setDraft}
              allow="number"
              decimal
              dir="ltr"
              title={`${String(PLAYLIST_GAIN_MIN_DB)} to +${String(PLAYLIST_GAIN_MAX_DB)} dB`}
              disabled={reading || saving}
            />
          </label>
          <Button variant="secondary" disabled={reading || saving} onClick={() => setDraft('0')}>
            0 dB
          </Button>
        </>
      )}
    </Modal>
  );
}
