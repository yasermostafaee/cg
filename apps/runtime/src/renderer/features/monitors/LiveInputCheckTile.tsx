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
import { liveInputPictures } from './liveInputPicture.js';
import { PgmAudioPlayer, PGM_AUDIO_SAMPLE_RATE, type PcmOut } from './pgmAudioPlayer.js';
import { InputAudioRails } from '../sources/InputAudioMeter.js';
import './live-input-check-tile.css';
import type { PreviewEngine, PreviewOriginChanged } from '../sources/usePreviewOrigins.js';

const PICTURE_TIMEOUT_MS = 2_500;
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
  const { channel, previewId } = view;
  const canvas = useRef<HTMLCanvasElement>(null);
  const ready = view.state === 'ready';
  const [decoded, setDecoded] = useState<{
    channel: number;
    previewId: string;
    engine: PreviewEngine | undefined;
  }>();
  const [busCount, setBusCount] = useState(2);
  const measuredBuses = view.dbFs?.length ?? 0;
  const pictureLive =
    ready &&
    decoded?.channel === channel &&
    decoded.previewId === previewId &&
    decoded.engine === view.engine;

  useEffect(() => {
    onPreviewEngineChange?.(pictureLive ? decoded?.engine : undefined);
  }, [pictureLive, decoded?.engine, onPreviewEngineChange]);

  useLayoutEffect(() => setDecoded(undefined), [channel, previewId, ready, view.engine]);

  useLayoutEffect(() => {
    if (measuredBuses > 0) setBusCount(Math.max(2, measuredBuses));
  }, [measuredBuses]);

  useEffect(() => {
    if (!ready) return undefined;
    const drawing = canvas.current;
    const context = drawing?.getContext('2d');
    const abort = new AbortController();
    const failed = (): void => {
      if (abort.signal.aborted) return;
      abort.abort();
      setDecoded(undefined);
      onStall(previewId);
    };
    let deadline = setTimeout(failed, PICTURE_TIMEOUT_MS);
    const run = async (): Promise<void> => {
      if (context == null || drawing === null) return;
      const url = await window.cg.livePreview.url({ channel, previewId }, 'picture');
      if (url === null || abort.signal.aborted) return;
      const response = await fetch(url, {
        signal: abort.signal,
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
      });
      if (!response.ok || response.body === null) return;
      for await (const jpeg of liveInputPictures(response.body)) {
        const bitmap = await createImageBitmap(new Blob([jpeg], { type: 'image/jpeg' })).catch(
          () => null,
        );
        if (bitmap === null) continue;
        try {
          if (abort.signal.aborted) return;
          if (drawing.width !== bitmap.width) drawing.width = bitmap.width;
          if (drawing.height !== bitmap.height) drawing.height = bitmap.height;
          context.drawImage(bitmap, 0, 0);
          setDecoded((previous) =>
            previous?.channel === channel &&
            previous.previewId === previewId &&
            previous.engine === view.engine
              ? previous
              : { channel, previewId, engine: view.engine },
          );
          clearTimeout(deadline);
          deadline = setTimeout(failed, PICTURE_TIMEOUT_MS);
        } finally {
          bitmap.close();
        }
      }
    };
    void run().then(failed, failed);
    return () => {
      abort.abort();
      clearTimeout(deadline);
      context?.clearRect(0, 0, drawing?.width ?? 0, drawing?.height ?? 0);
    };
  }, [channel, onStall, previewId, ready, view.engine]);

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
  const peer = view.engine === undefined ? undefined : `Server ${view.engine}`;
  const caption = [CAPTIONS[state], peer].filter(Boolean).join(' · ');
  const handleButtonKey = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
  };
  const message = [
    caption,
    view.message,
    audio === 'unavailable' ? 'Input sound unavailable' : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
  const levels = pictureLive ? (view.dbFs ?? []) : [];
  return (
    <span
      className="cg-input-picture-meter"
      role="region"
      aria-label="Live input preview"
      data-input-check=""
    >
      <span className="cg-input-thumbnail cg-input-check-tile" data-input-thumbnail="active">
        <canvas
          ref={canvas}
          hidden={!pictureLive}
          className="cg-input-check-tile__picture"
          role="img"
          aria-label={`Live input picture for ${view.sourceName}`}
          data-input-picture=""
        />
        {!pictureLive && (
          <span className="cg-input-check-tile__placeholder">
            {state === 'forbidden' ? (
              <span data-input-check-detail="">{view.message || 'Access denied'}</span>
            ) : state === 'connecting' ? (
              'Waiting for picture'
            ) : (
              'No current picture'
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
              aria-label="Input preview sound"
              aria-pressed={audible}
              title={audible ? 'Mute input preview' : 'Listen to input preview'}
              disabled={!pictureLive}
              onClick={toggleSound}
              onKeyDown={handleButtonKey}
            >
              <Icon icon={audible ? Volume2 : VolumeX} size={14} />
            </Button>
            <Button
              variant="icon"
              aria-label="Close input check"
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
