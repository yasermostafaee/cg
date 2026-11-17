import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, Square, Volume2, VolumeX } from 'lucide-react';
import {
  MAX_MEDIA_PREVIEW_POSITION_MS,
  MEDIA_THUMBNAIL_DATA_URL_PREFIX,
  type MediaPlaybackPreview,
} from '@cg/shared-ipc';
import type { RuntimeBridge } from '../../../shared/runtime-bridge.js';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { IsolatedName } from '../../ui/OperatorNames.js';
import { RangeInput } from '../../ui/RangeInput.js';
import { useModalForeground } from '../../ui/modalForeground.js';
import { createMediaThumbnailLoader, type MediaThumbnailLoader } from './MediaThumbnail.js';
import { formatMediaDuration } from './SourceLabel.js';
import { subscribeMediaPreviewFrame } from './inputThumbnailDemand.js';
import './source-media-preview.css';
import type { PreviewEngine, PreviewOriginChanged } from './usePreviewOrigins.js';

interface SourceMediaPreviewProps {
  id: string;
  name: string;
  durationMs?: number | undefined;
  channel?: number | undefined;
  poster?: string | undefined;
  loadThumbnail?: MediaThumbnailLoader;
  inline?: boolean;
  onPreviewEngineChange?: PreviewOriginChanged | undefined;
}

interface PreviewRequest {
  positionMs: number;
  /** A null clock requests one silent frame at the selected position. */
  startedAt: number | null;
}

export function SourceMediaPreview(props: SourceMediaPreviewProps): JSX.Element {
  const { mediaOpen, mediaClose } = window.cg.sourcePreviews ?? {};
  if (mediaOpen === undefined || mediaClose === undefined || props.channel === undefined) {
    return <SampledSourceMediaPreview {...props} />;
  }
  return (
    <FileSourceMediaPreview
      key={`${String(props.channel)}:${props.id}`}
      {...props}
      mediaOpen={mediaOpen}
      mediaClose={mediaClose}
    />
  );
}

interface FileSourceMediaPreviewProps extends SourceMediaPreviewProps {
  mediaOpen: NonNullable<RuntimeBridge['sourcePreviews']['mediaOpen']>;
  mediaClose: NonNullable<RuntimeBridge['sourcePreviews']['mediaClose']>;
}

const MEDIA_LEASE_REFRESH_MS = 15_000;
const MAX_PROXY_PREPARATION_MS = 20 * 60_000;

function matchesReadyPreview(
  player: HTMLVideoElement,
  preview: MediaPlaybackPreview | null,
): boolean {
  return (
    preview?.state === 'ready' &&
    preview.videoUrl !== undefined &&
    player.getAttribute('src') === preview.videoUrl
  );
}

function FileSourceMediaPreview(props: FileSourceMediaPreviewProps): JSX.Element {
  const {
    id,
    name,
    channel,
    durationMs,
    poster,
    inline = false,
    mediaOpen,
    mediaClose,
    onPreviewEngineChange,
  } = props;
  const foreground = useModalForeground();
  const video = useRef<HTMLVideoElement>(null);
  const playbackButton = useRef<HTMLButtonElement>(null);
  const [preview, setPreview] = useState<MediaPlaybackPreview | null>(null);
  const currentPreview = useRef<MediaPlaybackPreview | null>(null);
  const [positionMs, setPositionMs] = useState(0);
  const position = useRef(0);
  const [duration, setDuration] = useState(durationMs ?? 0);
  const [intent, setIntent] = useState<'playing' | 'paused' | 'stopped'>(
    inline ? 'playing' : 'paused',
  );
  const currentIntent = useRef(intent);
  const [muted, setMuted] = useState(true);
  const [videoVisible, setVideoVisible] = useState(false);
  const [videoOrigin, setVideoOrigin] = useState<PreviewEngine>();
  const [posterOrigin, setPosterOrigin] = useState<PreviewEngine>();
  const [buffering, setBuffering] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const refresh = useRef<(() => void) | null>(null);
  const release = useRef<(() => void) | null>(null);
  const unsupported = useRef(false);

  useEffect(() => {
    if (inline) playbackButton.current?.focus();
  }, [inline]);

  useEffect(() => {
    if (!foreground || channel === undefined || unsupported.current) return;
    let alive = true;
    let pending = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let preparingSince: number | null = null;
    let pollDelay = 1_000;
    const stopped = (): boolean => currentIntent.current === 'stopped';
    const close = (session: MediaPlaybackPreview | null): void => {
      if (session?.previewId !== undefined) {
        void mediaClose({ previewId: session.previewId }).catch(() => undefined);
      }
    };
    const stopLease = (): void => {
      clearTimeout(timer);
      close(currentPreview.current);
      currentPreview.current = null;
      preparingSince = null;
    };
    const read = async (prepare = true): Promise<void> => {
      if (pending || stopped()) return;
      clearTimeout(timer);
      pending = true;
      try {
        const result = await mediaOpen({
          channel,
          sourceId: id,
          ...(currentPreview.current?.previewId === undefined
            ? {}
            : { previewId: currentPreview.current.previewId }),
          prepare,
        });
        if (!alive || stopped()) {
          close(result);
          return;
        }
        currentPreview.current = result;
        setPreview(result);
        if (result.durationMs !== undefined && result.durationMs > 0) {
          setDuration(result.durationMs);
        }
        if (result.state === 'unsupported') {
          unsupported.current = true;
          stopLease();
          return;
        }
        if (result.state === 'unavailable' || result.state === 'error') {
          video.current?.pause();
          currentIntent.current = 'paused';
          setIntent('paused');
        }
        if (result.state === 'preparing') {
          preparingSince ??= performance.now();
          if (performance.now() - preparingSince >= MAX_PROXY_PREPARATION_MS) {
            stopLease();
            setPlayerError('Preview preparation timed out. Try again.');
            currentIntent.current = 'paused';
            setIntent('paused');
            return;
          }
          timer = setTimeout(() => void read(), pollDelay);
          pollDelay = Math.min(5_000, pollDelay * 2);
        } else if (result.previewId !== undefined) {
          preparingSince = null;
          pollDelay = 1_000;
          timer = setTimeout(() => void read(), MEDIA_LEASE_REFRESH_MS);
        }
      } catch {
        if (alive && !stopped()) {
          video.current?.pause();
          stopLease();
          setPlayerError('Preview unavailable. Try again.');
          currentIntent.current = 'paused';
          setIntent('paused');
        }
      } finally {
        pending = false;
      }
    };
    refresh.current = () => void read(true);
    release.current = stopLease;
    if (currentIntent.current !== 'stopped') void read(true);
    return () => {
      alive = false;
      refresh.current = null;
      release.current = null;
      const player = video.current;
      if (player !== null) {
        if (currentIntent.current !== 'stopped') {
          position.current = Math.round(player.currentTime * 1_000);
        }
        player.pause();
      }
      stopLease();
    };
  }, [channel, foreground, id, mediaClose, mediaOpen]);

  const play = useCallback((): void => {
    const player = video.current;
    if (
      !foreground ||
      player === null ||
      currentIntent.current !== 'playing' ||
      !matchesReadyPreview(player, currentPreview.current)
    )
      return;
    const source = player.getAttribute('src');
    void player.play().catch(() => {
      if (
        currentIntent.current !== 'playing' ||
        video.current !== player ||
        player.getAttribute('src') !== source ||
        !matchesReadyPreview(player, currentPreview.current)
      )
        return;
      currentIntent.current = 'paused';
      setIntent('paused');
      setPlayerError('Preview could not play. Try again.');
    });
  }, [foreground]);

  useEffect(() => {
    if (foreground && preview?.state === 'ready' && preview.videoUrl !== undefined) play();
  }, [foreground, play, preview?.state, preview?.videoUrl]);

  const setPlayback = (): void => {
    setPlayerError(null);
    if (currentIntent.current === 'playing') {
      currentIntent.current = 'paused';
      setIntent('paused');
      video.current?.pause();
      return;
    }
    currentIntent.current = 'playing';
    setIntent('playing');
    if (duration > 0 && position.current >= duration) {
      position.current = 0;
      setPositionMs(0);
      if (video.current !== null) video.current.currentTime = 0;
    }
    if (currentPreview.current?.state === 'ready') play();
    else refresh.current?.();
  };

  const stop = (): void => {
    currentIntent.current = 'stopped';
    setIntent('stopped');
    if (video.current !== null) {
      video.current.pause();
      video.current.currentTime = 0;
    }
    position.current = 0;
    setPositionMs(0);
    setVideoVisible(false);
    setBuffering(false);
    setPlayerError(null);
    release.current?.();
  };

  const posterUrl = preview?.posterUrl ?? poster;
  const showVideo =
    videoVisible &&
    intent !== 'stopped' &&
    preview?.state === 'ready' &&
    preview.videoUrl !== undefined;
  const displayedEngine = showVideo
    ? videoOrigin
    : posterUrl === undefined
      ? undefined
      : posterOrigin;
  useEffect(() => {
    if (posterUrl === undefined) setPosterOrigin(undefined);
    if (!showVideo) setVideoOrigin(undefined);
    if (preview?.state !== 'unsupported') onPreviewEngineChange?.(displayedEngine);
  }, [displayedEngine, onPreviewEngineChange, preview?.state, posterUrl, showVideo]);

  if (preview?.state === 'unsupported') return <SampledSourceMediaPreview {...props} />;
  let message = '';
  if (intent !== 'stopped') {
    if (playerError !== null) message = playerError;
    else if (preview === null) message = 'Loading preview…';
    else if (preview.state === 'preparing') message = 'Preparing preview…';
    else if (preview.state === 'unavailable' || preview.state === 'error') {
      message = preview.message ?? 'Preview unavailable';
    } else if (buffering) message = 'Loading…';
  }
  const origin = displayedEngine === undefined ? null : `Server ${displayedEngine}`;

  return (
    <section
      className={
        inline ? 'cg-source-media-preview cg-source-media-preview--tile' : 'cg-source-media-preview'
      }
      aria-label="Media preview"
      data-media-file-preview=""
    >
      {!inline && (
        <div className="cg-source-media-preview__heading">
          <IsolatedName>{name}</IsolatedName>
          <span>{origin ?? 'Media preview'}</span>
        </div>
      )}
      <div className="cg-source-media-preview__picture">
        {preview?.videoUrl !== undefined && (
          // Library preview manifests do not include caption assets.
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            ref={video}
            src={preview.videoUrl}
            poster={posterUrl}
            muted={muted}
            preload="metadata"
            playsInline
            hidden={!showVideo}
            onLoadedData={(event) => {
              if (matchesReadyPreview(event.currentTarget, currentPreview.current))
                setVideoOrigin(currentPreview.current?.engine);
            }}
            onLoadedMetadata={(event) => {
              const player = event.currentTarget;
              if (Number.isFinite(player.duration) && player.duration > 0) {
                setDuration(Math.round(player.duration * 1_000));
              }
              if (position.current > 0) player.currentTime = position.current / 1_000;
              play();
            }}
            onPlay={(event) => {
              if (
                !foreground ||
                currentIntent.current !== 'playing' ||
                !matchesReadyPreview(event.currentTarget, currentPreview.current)
              ) {
                event.currentTarget.pause();
                return;
              }
              setVideoVisible(true);
              setBuffering(false);
            }}
            onWaiting={() => setBuffering(true)}
            onEmptied={() => setVideoOrigin(undefined)}
            onPlaying={(event) => {
              setBuffering(false);
              if (matchesReadyPreview(event.currentTarget, currentPreview.current))
                setVideoOrigin(currentPreview.current?.engine);
            }}
            onTimeUpdate={(event) => {
              position.current = Math.round(event.currentTarget.currentTime * 1_000);
              setPositionMs(position.current);
            }}
            onEnded={(event) => {
              if (!matchesReadyPreview(event.currentTarget, currentPreview.current)) return;
              currentIntent.current = 'paused';
              setIntent('paused');
              setBuffering(false);
            }}
            onError={(event) => {
              if (
                !foreground ||
                currentIntent.current === 'stopped' ||
                !matchesReadyPreview(event.currentTarget, currentPreview.current)
              )
                return;
              setVideoOrigin(undefined);
              release.current?.();
              setPlayerError('Preview cannot play in this browser.');
              currentIntent.current = 'paused';
              setIntent('paused');
            }}
          />
        )}
        {posterUrl === undefined ? (
          <span hidden={showVideo}>No picture</span>
        ) : (
          <img
            src={posterUrl}
            alt=""
            hidden={showVideo}
            onLoad={() =>
              setPosterOrigin(posterUrl === preview?.posterUrl ? preview?.engine : undefined)
            }
            onError={() => setPosterOrigin(undefined)}
          />
        )}
        {inline && origin !== null && (
          <span className="cg-source-media-preview__origin" title={origin}>
            {displayedEngine}
          </span>
        )}
      </div>
      <div className="cg-source-media-preview__transport">
        <div className="cg-source-media-preview__controls">
          <Button
            ref={playbackButton}
            variant="icon"
            title={intent === 'playing' ? 'Pause preview' : 'Play preview'}
            aria-label={intent === 'playing' ? 'Pause preview' : 'Play preview'}
            disabled={!foreground}
            onClick={setPlayback}
          >
            <Icon icon={intent === 'playing' ? Pause : Play} size={16} />
          </Button>
          <Button
            variant="icon"
            title="Stop preview"
            aria-label="Stop preview"
            onClick={stop}
            disabled={intent === 'stopped'}
          >
            <Icon icon={Square} size={14} />
          </Button>
          <Button
            variant="icon"
            title={muted ? 'Listen to preview' : 'Mute preview'}
            aria-label={muted ? 'Listen to preview' : 'Mute preview'}
            aria-pressed={!muted}
            disabled={!foreground}
            onClick={() => setMuted((value) => !value)}
          >
            <Icon icon={muted ? VolumeX : Volume2} size={15} />
          </Button>
        </div>
        <RangeInput
          aria-label="Preview position"
          aria-valuetext={formatMediaDuration(positionMs)}
          min={0}
          max={Math.max(0, duration)}
          step={1}
          value={positionMs}
          disabled={!foreground || duration <= 0}
          onChange={(event) => {
            position.current = event.currentTarget.valueAsNumber;
            setPositionMs(position.current);
            if (video.current !== null) video.current.currentTime = position.current / 1_000;
          }}
        />
        <span className="cg-source-media-preview__time">
          {formatMediaDuration(positionMs)} / {formatMediaDuration(duration)}
        </span>
        <span className="cg-source-media-preview__status" role="status">
          {message}
        </span>
      </div>
    </section>
  );
}

function SampledSourceMediaPreview({
  id,
  name,
  durationMs,
  channel,
  poster,
  loadThumbnail,
  inline = false,
  onPreviewEngineChange,
}: SourceMediaPreviewProps): JSX.Element {
  const foreground = useModalForeground();
  const end = Math.min(Math.ceil(durationMs ?? 0) - 1, MAX_MEDIA_PREVIEW_POSITION_MS);
  const enabled = channel !== undefined && end > 0;
  const autoPlay = inline && enabled;
  const loadPoster = useMemo(
    () => loadThumbnail ?? createMediaThumbnailLoader(channel),
    [loadThumbnail, channel],
  );
  const [loadedPoster, setLoadedPoster] = useState<string | null>(null);
  const [positionMs, setPositionMs] = useState(0);
  const position = useRef(positionMs);
  position.current = positionMs;
  const [request, setRequest] = useState<PreviewRequest | null>(() =>
    autoPlay ? { positionMs: 0, startedAt: performance.now() } : null,
  );
  const [picture, setPicture] = useState<string | null>(null);
  const [pictureOrigin, setPictureOrigin] = useState<PreviewEngine>();
  const [decodedOrigin, setDecodedOrigin] = useState<PreviewEngine>();
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>(
    autoPlay ? 'loading' : 'idle',
  );
  const playing = request !== null && request.startedAt !== null;
  const src = picture ?? poster ?? loadedPoster;
  useEffect(() => {
    if (src === null) setDecodedOrigin(undefined);
    onPreviewEngineChange?.(src === null ? undefined : decodedOrigin);
  }, [src, decodedOrigin, onPreviewEngineChange]);
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
        setPictureOrigin(frame.engine);
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
          <img
            src={src}
            alt=""
            onLoad={() =>
              setDecodedOrigin(
                picture === null
                  ? poster === undefined
                    ? loadPoster.origin?.(id)
                    : undefined
                  : pictureOrigin,
              )
            }
            onError={() => setDecodedOrigin(undefined)}
          />
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
