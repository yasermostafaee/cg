import { useId, useRef, useState, useSyncExternalStore } from 'react';
import { Pause, Play, RotateCcw, SlidersHorizontal } from 'lucide-react';
import {
  MEDIA_WHEN_HIDDEN,
  mediaPlaybackOf,
  type MediaPlateState,
  type MediaPlateTransportAction,
  type MediaPlayback,
  type MediaWhenHidden,
  type SourceDefinition,
} from '@cg/shared-ipc';
import { AsyncButton } from '../../ui/AsyncButton.js';
import { Button } from '../../ui/Button.js';
import { Checkbox } from '../../ui/Checkbox.js';
import { Icon } from '../../ui/Icon.js';
import { IsolatedName } from '../../ui/OperatorNames.js';
import { Popover } from '../../ui/Popover.js';
import { Tag } from '../../ui/Tag.js';
import { reportCommandError } from '../status/commandFeedback.js';
import { formatMediaDuration } from './SourceLabel.js';
import { currentSourceCatalog, sourcesVersion, subscribeSources } from './sourceStore.js';

/**
 * 🔴 `MEDIA-PLATES-01` §2 — **A CLIP'S PLAYBACK, WHERE IT IS BOUND, AND ITS TRANSPORT ON AIR.**
 *
 * Two pieces, both small:
 *
 *   - {@link MediaPlaybackControl} — beside a bound clip (Look inputs, Source defaults): one button,
 *     `Playback`, opening an anchored panel (the source picker's `Popover`) whose heading is the
 *     clip's NAME, because the setting is the clip's, station-wide: `Loop`, and `When hidden` —
 *     `Pause` · `Restart` · `Keep playing`. A choice applies at once; it is not a row's draft.
 *   - {@link MediaTransport} — on an on-air row, beside a plate the bridge reports as a clip: Play /
 *     Pause and Restart as icon buttons (each with its `title`), the remaining time `−0:12` only
 *     when the server reported it, and `Paused` / `Ended` as facts.
 *
 * No explanatory prose (the operator-surface rule): labels, values and state facts only. A live
 * input gets neither piece — the catalogue says which entry is a clip, and the BRIDGE says which
 * seat carries one; this file re-derives neither.
 */

/** `When hidden`'s three words, in the order the control shows them. */
export const WHEN_HIDDEN_LABEL: Readonly<Record<MediaWhenHidden, string>> = {
  pause: 'Pause',
  restart: 'Restart',
  continue: 'Keep playing',
};

/** The panel's size: wide enough for `When hidden` and its three choices on one line. */
const PLAYBACK_MIN_WIDTH = 380;
const PLAYBACK_MAX_HEIGHT = 240;

/** The bound clip's catalogue entry, or `null` when `sourceId` names no clip. */
function clipEntry(sourceId: string | null | undefined): SourceDefinition | null {
  if (sourceId === null || sourceId === undefined || sourceId === '') return null;
  const entry = currentSourceCatalog().sources.find((s) => s.id === sourceId);
  return entry !== undefined && entry.producer.kind === 'media' ? entry : null;
}

/** A clip's remaining time as the console shows it: `−0:12`, in whole seconds, rounded UP. */
export function formatRemaining(ms: number): string {
  return `−${formatMediaDuration(Math.ceil(ms / 1000) * 1000)}`;
}

export function MediaPlaybackControl({
  sourceId,
}: {
  /** The catalogue id bound where this sits. Anything but a clip renders nothing. */
  sourceId: string | null | undefined;
}): JSX.Element | null {
  useSyncExternalStore(subscribeSources, sourcesVersion);
  const button = useRef<HTMLButtonElement>(null);
  const base = useId();
  const panelId = `${base}-playback`;
  const loopId = `${base}-loop`;
  const [open, setOpen] = useState(false);
  const entry = clipEntry(sourceId);
  if (entry === null) return null;
  const playback = mediaPlaybackOf(entry);
  const set = (next: MediaPlayback): void => {
    void window.cg.sources
      .setMediaPlayback({ mediaId: entry.id, loop: next.loop, whenHidden: next.whenHidden })
      .then((res) => {
        if (!res.ok) reportCommandError(res.message ?? 'The clip’s playback was not changed.');
      });
  };
  return (
    <>
      <Button
        ref={button}
        variant="icon"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Playback: ${entry.name}`}
        title="Playback"
        data-media-playback={entry.id}
        onClick={() => setOpen(true)}
      >
        <Icon icon={SlidersHorizontal} size={14} />
      </Button>
      {open && (
        <Popover
          anchor={button}
          onClose={() => setOpen(false)}
          id={panelId}
          aria-label="Playback"
          minWidth={PLAYBACK_MIN_WIDTH}
          maxHeight={PLAYBACK_MAX_HEIGHT}
          initialFocusSelector="[data-media-loop] input"
        >
          <div className="cg-playback" data-media-playback-panel={entry.id}>
            <h3 className="cg-playback__title">
              <IsolatedName>{entry.name}</IsolatedName>
            </h3>
            <div className="cg-playback__row" data-media-loop="">
              <label className="cg-playback__label" htmlFor={loopId}>
                Loop
              </label>
              <Checkbox
                id={loopId}
                checked={playback.loop}
                onChange={(loop) => set({ ...playback, loop })}
              />
            </div>
            <div className="cg-playback__row">
              <span className="cg-playback__label">When hidden</span>
              <div className="cg-playback__choices" role="group" aria-label="When hidden">
                {MEDIA_WHEN_HIDDEN.map((whenHidden) => (
                  <Button
                    key={whenHidden}
                    variant="neutral"
                    // The chosen one wears the console's chosen-not-on-air blue, keyed off
                    // `aria-pressed` (`controls.css`) — never `active`, whose violet means PVW.
                    aria-pressed={playback.whenHidden === whenHidden}
                    data-media-when-hidden={whenHidden}
                    onClick={() => set({ ...playback, whenHidden })}
                  >
                    {WHEN_HIDDEN_LABEL[whenHidden]}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </Popover>
      )}
    </>
  );
}

export function MediaTransport({
  itemId,
  plateId,
  state,
}: {
  itemId: string;
  plateId: string;
  /** The BRIDGE's statement that this plate's seat carries a clip, and how it is playing. */
  state: MediaPlateState;
}): JSX.Element {
  const press = (action: MediaPlateTransportAction) => async () => {
    const res = await window.cg.stack.mediaPlateTransport({ itemId, plateId, action });
    return {
      accepted: res.ok,
      ...(res.reason !== undefined ? { errorCode: res.reason } : {}),
      ...(res.message !== undefined ? { message: res.message } : {}),
    };
  };
  return (
    <span className="cg-media-transport" data-media-transport={plateId}>
      <AsyncButton
        variant="icon"
        iconOnly
        icon={state.paused ? Play : Pause}
        title={state.paused ? 'Play' : 'Pause'}
        data-media-transport-play={state.paused ? 'play' : 'pause'}
        run={press(state.paused ? 'play' : 'pause')}
        onError={(message) => reportCommandError(message)}
      >
        {state.paused ? 'Play' : 'Pause'}
      </AsyncButton>
      <AsyncButton
        variant="icon"
        iconOnly
        icon={RotateCcw}
        title="Restart"
        data-media-transport-restart=""
        run={press('restart')}
        onError={(message) => reportCommandError(message)}
      >
        Restart
      </AsyncButton>
      {state.remainingMs !== undefined && (
        <span className="cg-media-transport__time" data-media-remaining="">
          {formatRemaining(state.remainingMs)}
        </span>
      )}
      {state.paused && (
        <Tag className="cg-source-tag cg-source-tag--paused" data-testid="media-paused">
          Paused
        </Tag>
      )}
      {state.ended && (
        <Tag className="cg-source-tag cg-source-tag--ended" data-testid="media-ended">
          Ended
        </Tag>
      )}
    </span>
  );
}
