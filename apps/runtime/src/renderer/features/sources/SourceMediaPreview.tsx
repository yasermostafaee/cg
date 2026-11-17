import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, Square } from 'lucide-react';
import { MAX_MEDIA_PREVIEW_POSITION_MS, MEDIA_THUMBNAIL_DATA_URL_PREFIX } from '@cg/shared-ipc';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { IsolatedName } from '../../ui/OperatorNames.js';
import { RangeInput } from '../../ui/RangeInput.js';
import { useModalForeground } from '../../ui/modalForeground.js';
import { createMediaThumbnailLoader, type MediaThumbnailLoader } from './MediaThumbnail.js';
import { formatMediaDuration } from './SourceLabel.js';
import { subscribeMediaPreviewFrame } from './inputThumbnailDemand.js';
import './source-media-preview.css';

interface SourceMediaPreviewProps {
  id: string;
  name: string;
  durationMs?: number | undefined;
  channel?: number | undefined;
  poster?: string | undefined;
  loadThumbnail?: MediaThumbnailLoader;
  inline?: boolean;
}

interface PreviewRequest {
  positionMs: number;
  /** A null clock requests one silent frame at the selected position. */
  startedAt: number | null;
}

export function SourceMediaPreview({
  id,
  name,
  durationMs,
  channel,
  poster,
  loadThumbnail,
  inline = false,
}: SourceMediaPreviewProps): JSX.Element {
  const foreground = useModalForeground();
  const end = Math.min(Math.ceil(durationMs ?? 0) - 1, MAX_MEDIA_PREVIEW_POSITION_MS);
  const enabled = channel !== undefined && end > 0;
  const autoPlay = inline && enabled;
  const loadPoster = useMemo(() => loadThumbnail ?? createMediaThumbnailLoader(), [loadThumbnail]);
  const [loadedPoster, setLoadedPoster] = useState<string | null>(null);
  const [positionMs, setPositionMs] = useState(0);
  const position = useRef(positionMs);
  position.current = positionMs;
  const [request, setRequest] = useState<PreviewRequest | null>(() =>
    autoPlay ? { positionMs: 0, startedAt: performance.now() } : null,
  );
  const [picture, setPicture] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>(
    autoPlay ? 'loading' : 'idle',
  );
  const playing = request !== null && request.startedAt !== null;
  const src = picture ?? poster ?? loadedPoster;
  const playbackButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (inline) playbackButton.current?.focus();
  }, [inline]);

  useEffect(() => {
    if (!foreground || poster !== undefined || loadedPoster !== null) return;
    let current = true;
    void loadPoster(id).then((value) => {
      if (current) setLoadedPoster(value);
    });
    return () => {
      current = false;
    };
  }, [id, loadPoster, poster, foreground]);

  useEffect(() => {
    if (!foreground || !enabled || channel === undefined || request === null) return;
    const from = request.startedAt === null ? request.positionMs : position.current;
    const startedAt = request.startedAt === null ? null : performance.now();
    const at = (): number =>
      Math.min(end, from + (startedAt === null ? 0 : Math.floor(performance.now() - startedAt)));
    let misses = 0;
    const stopReading = subscribeMediaPreviewFrame({
      channel,
      sourceId: id,
      position: at,
      publish: (frame) => {
        if (frame?.jpegBase64 === undefined || frame.signal === 'absent') {
          if (++misses < 3) return;
          setRequest(null);
          setStatus('unavailable');
          return;
        }
        misses = 0;
        setPicture(MEDIA_THUMBNAIL_DATA_URL_PREFIX + frame.jpegBase64);
        setStatus('ready');
        if (startedAt === null) setRequest(null);
      },
    });
    const clock =
      startedAt === null
        ? undefined
        : setInterval(() => {
            const current = at();
            setPositionMs(current);
            if (current === end) setRequest({ positionMs: end, startedAt: null });
          }, 125);
    return () => {
      stopReading();
      clearInterval(clock);
    };
  }, [channel, enabled, end, id, request, foreground]);

  const start = (nextPosition: number, play: boolean): void => {
    setPositionMs(nextPosition);
    setStatus('loading');
    setRequest({ positionMs: nextPosition, startedAt: play ? performance.now() : null });
  };
  const stop = (): void => {
    setRequest(null);
    setPositionMs(0);
    setPicture(null);
    setStatus('idle');
  };
  const message =
    status === 'unavailable' ? 'Preview unavailable' : status === 'loading' ? 'Loading frame…' : '';

  return (
    <section
      className={
        inline ? 'cg-source-media-preview cg-source-media-preview--tile' : 'cg-source-media-preview'
      }
      aria-label="Media preview"
    >
      {!inline && (
        <div className="cg-source-media-preview__heading">
          <IsolatedName>{name}</IsolatedName>
          <span>{enabled ? 'Silent preview · sampled frames' : 'Poster'}</span>
        </div>
      )}
      <div className="cg-source-media-preview__picture">
        {src === null ? (
          <span>{status === 'loading' ? 'Loading frame…' : 'No picture'}</span>
        ) : (
          <img src={src} alt="" />
        )}
      </div>
      {enabled && (
        <div className="cg-source-media-preview__transport">
          <div className="cg-source-media-preview__controls">
            <Button
              ref={playbackButton}
              variant="icon"
              title={playing ? 'Pause preview' : 'Play preview'}
              aria-label={playing ? 'Pause preview' : 'Play preview'}
              onClick={() =>
                playing
                  ? start(positionMs, false)
                  : start(positionMs === end ? 0 : positionMs, true)
              }
            >
              <Icon icon={playing ? Pause : Play} size={16} />
            </Button>
            <Button
              variant="icon"
              title="Stop preview"
              aria-label="Stop preview"
              onClick={stop}
              disabled={status === 'idle'}
            >
              <Icon icon={Square} size={14} />
            </Button>
          </div>
          <RangeInput
            aria-label="Preview position"
            aria-valuetext={formatMediaDuration(positionMs)}
            min={0}
            max={end}
            step={1}
            value={positionMs}
            onChange={(event) => start(event.currentTarget.valueAsNumber, playing)}
          />
          <span className="cg-source-media-preview__time">
            {formatMediaDuration(positionMs)} / {formatMediaDuration(end + 1)}
          </span>
          <span className="cg-source-media-preview__status" role="status">
            {message}
          </span>
        </div>
      )}
    </section>
  );
}
