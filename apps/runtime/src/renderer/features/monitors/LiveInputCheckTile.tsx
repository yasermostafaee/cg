import { feedbackProblem, useUiText } from '../../i18n/locale.js';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { Volume2, VolumeX, X } from 'lucide-react';
import type { LivePreviewStatus } from '@cg/shared-ipc';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { useLiveInputPicture } from './useLiveInputPicture.js';
import { PgmAudioPlayer, PGM_AUDIO_SAMPLE_RATE, type PcmOut } from './pgmAudioPlayer.js';
import { InputAudioRails } from '../sources/InputAudioMeter.js';
import './live-input-check-tile.css';
import type { PreviewOriginChanged } from '../sources/usePreviewOrigins.js';

const CAPTIONS = {
  connecting: 'Connecting',
  ready: 'Picture received',
  stalled: 'Stalled',
  unavailable: 'Unavailable',
  conflict: 'In use',
  replaced: 'Replaced',
  expired: 'Expired',
  forbidden: 'Access denied',
} satisfies Record<LivePreviewStatus['state'], string>;

export function LiveInputCheckTile({
  view,
  onClose,
  onStall,
  onPreviewEngineChange,
}: {
  view: LivePreviewStatus;
  onClose: () => void;
  onStall: (previewId: string) => void;
  onPreviewEngineChange?: PreviewOriginChanged | undefined;
}): JSX.Element {
  const localizeUi = useUiText();
  const { channel, previewId } = view;
  const canvas = useRef<HTMLCanvasElement>(null);
  const picture = useLiveInputPicture(view, onStall);
  const attach = picture?.attach;
  const decodedEngine = picture?.engine;
  const pictureLive = picture !== undefined;
  const [busCount, setBusCount] = useState(2);
  const measuredBuses = view.dbFs?.length ?? 0;

  useEffect(() => {
    onPreviewEngineChange?.(decodedEngine);
  }, [decodedEngine, onPreviewEngineChange]);

  useLayoutEffect(() => {
    return canvas.current === null ? undefined : attach?.(canvas.current);
  }, [attach]);

  useLayoutEffect(() => {
    if (measuredBuses > 0) setBusCount(Math.max(2, measuredBuses));
  }, [measuredBuses]);

  const sound = useRef<{ context: AudioContext; player: PgmAudioPlayer } | null>(null);
  const [audio, setAudio] = useState<'off' | 'connecting' | 'playing' | 'unavailable'>('off');
  const closeSound = useCallback((): void => {
    const active = sound.current;
    sound.current = null;
    if (active === null) return;
    active.player.stop();
    void active.context.close().catch(() => undefined);
  }, []);

  useLayoutEffect(() => {
    if (!pictureLive) {
      closeSound();
      setAudio('off');
    }
    return closeSound;
  }, [closeSound, pictureLive]);

  const toggleSound = (): void => {
    if (sound.current !== null) {
      closeSound();
      setAudio('off');
      return;
    }
    if (!pictureLive) return;
    let context: AudioContext;
    try {
      context = new AudioContext({ sampleRate: PGM_AUDIO_SAMPLE_RATE, latencyHint: 'interactive' });
    } catch {
      setAudio('unavailable');
      return;
    }
    const lost = (): void => {
      if (sound.current?.context !== context) return;
      closeSound();
      setAudio('unavailable');
    };
    const player = new PgmAudioPlayer({
      url: () => window.cg.livePreview.url({ channel, previewId }, 'audio'),
      out: context as unknown as PcmOut,
      retry: false,
      retryWhileBusy: true,
      onState: (state) => {
        if (sound.current?.context !== context) return;
        if (state === 'stopped') lost();
        else setAudio(state);
      },
    });
    sound.current = { context, player };
    setAudio('connecting');
    void context.resume().then(() => {
      if (sound.current?.context === context) player.start();
    }, lost);
  };

  const audible = audio === 'connecting' || audio === 'playing';
  const state = view.state === 'ready' && !pictureLive ? 'connecting' : view.state;
  const status = localizeUi(CAPTIONS[state]);
  const caption =
    view.engine === undefined
      ? status
      : localizeUi('{status} · Server {server}', { status, server: view.engine });
  const detail =
    view.message === undefined
      ? undefined
      : feedbackProblem(view.message, 'No current input picture.');
  const handleButtonKey = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
  };
  const message = [
    caption,
    detail,
    audio === 'unavailable' ? localizeUi('Input sound unavailable') : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
  const levels = pictureLive ? (view.dbFs ?? []) : [];
  return (
    <span
      className="cg-input-picture-meter"
      role="region"
      aria-label={localizeUi('Live input preview')}
      data-input-check=""
    >
      <span className="cg-input-thumbnail cg-input-check-tile" data-input-thumbnail="active">
        <canvas
          ref={canvas}
          hidden={!pictureLive}
          className="cg-input-check-tile__picture"
          role="img"
          aria-label={localizeUi('Live input picture for {source}', { source: view.sourceName })}
          data-input-picture=""
        />
        {!pictureLive && (
          <span className="cg-input-check-tile__placeholder">
            {state === 'forbidden' ? (
              <span data-input-check-detail="">{detail ?? status}</span>
            ) : state === 'connecting' ? (
              localizeUi('Waiting for picture')
            ) : (
              localizeUi('No current picture')
            )}
          </span>
        )}
        <span className="cg-input-check-tile__top">
          <span
            className="cg-input-check-tile__status"
            role="status"
            data-input-check-state={state}
            aria-label={message}
            title={message}
          >
            {caption}
          </span>
          <span className="cg-input-check-tile__actions">
            <Button
              variant="icon"
              aria-label={localizeUi('Input preview sound')}
              aria-pressed={audible}
              title={
                audible ? localizeUi('Mute input preview') : localizeUi('Listen to input preview')
              }
              disabled={!pictureLive}
              onClick={toggleSound}
              onKeyDown={handleButtonKey}
            >
              <Icon icon={audible ? Volume2 : VolumeX} size={14} />
            </Button>
            <Button
              variant="icon"
              aria-label={localizeUi('Close input check')}
              onClick={onClose}
              onKeyDown={handleButtonKey}
            >
              <Icon icon={X} size={14} />
            </Button>
          </span>
        </span>
      </span>
      <InputAudioRails
        name={view.sourceName}
        count={busCount}
        levels={levels}
        state={levels.length > 0 ? 'measured' : 'unknown'}
        preview
      />
    </span>
  );
}
