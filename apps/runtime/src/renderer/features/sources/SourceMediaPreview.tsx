import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LoaderCircle, Maximize2, Pause, Play, Square, Volume2, VolumeX, X } from 'lucide-react';
import {
  MAX_MEDIA_PREVIEW_POSITION_MS,
  MEDIA_THUMBNAIL_DATA_URL_PREFIX,
  type MediaPlaybackPreview,
} from '@cg/shared-ipc';
import type { RuntimeBridge } from '../../../shared/runtime-bridge.js';
import { sourcePreviewRoute, useProgramTopology } from '../../hooks/useProgramTopology.js';
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
  /** Each new explicit row Play request starts/resumes this player without remounting it. */
  playRequest?: number | undefined;
  onPreviewEngineChange?: PreviewOriginChanged | undefined;
}

interface PreviewRequest {
  positionMs: number;
  /** A null clock requests one silent frame at the selected position. */
  startedAt: number | null;
}

function MediaPreviewSurface({
  name,
  description,
  inline,
  file,
  picture,
  loading,
  children,
}: {
  name: string;
  description: string;
  inline: boolean;
  file?: boolean;
  picture: ReactNode;
  loading: string | undefined;
  children: ReactNode;
}): JSX.Element {
  const surface = useRef<HTMLElement>(null);
  const fullscreenButton = useRef<HTMLButtonElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [fullscreenError, setFullscreenError] = useState(false);

  useEffect(() => {
    const element = surface.current;
    if (element === null || !document.fullscreenEnabled) return;
    let wasExpanded = false;
    const change = (): void => {
      const next = document.fullscreenElement === element;
      if (next === wasExpanded) return;
      wasExpanded = next;
      setExpanded(next);
      fullscreenButton.current?.focus({ preventScroll: true });
    };
    const escape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || document.fullscreenElement !== element) return;
      event.preventDefault();
      // This Escape belongs to the player, so the source picker's dialog stays open.
      event.stopPropagation();
      void document.exitFullscreen().catch(() => setFullscreenError(true));
    };
    document.addEventListener('fullscreenchange', change);
    window.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('fullscreenchange', change);
      window.removeEventListener('keydown', escape, true);
    };
  }, []);

  const fullscreenLabel = expanded ? 'Close fullscreen preview' : 'Fullscreen preview';
  return (
    <section
      ref={surface}
      className={
        inline ? 'cg-source-media-preview cg-source-media-preview--tile' : 'cg-source-media-preview'
      }
      aria-label="Media preview"
      data-media-file-preview={file ? '' : undefined}
    >
      <div className="cg-source-media-preview__heading">
        <IsolatedName>{name}</IsolatedName>
        <span>{description}</span>
      </div>
      <div className="cg-source-media-preview__picture">
        {picture}
        {loading !== undefined && (
          <span className="cg-source-media-preview__loading" role="status">
            <Icon icon={LoaderCircle} size={18} />
            {loading}
          </span>
        )}
        {document.fullscreenEnabled && (
          <Button
            ref={fullscreenButton}
            variant="icon"
            className="cg-source-media-preview__fullscreen"
            title={fullscreenLabel}
            aria-label={fullscreenLabel}
            onClick={() => {
              const element = surface.current;
              if (element === null) return;
              setFullscreenError(false);
              const request =
                document.fullscreenElement === element
                  ? document.exitFullscreen()
                  : element.requestFullscreen();
              void request.catch(() => setFullscreenError(true));
            }}
          >
            <Icon icon={expanded ? X : Maximize2} size={18} />
          </Button>
        )}
        {fullscreenError && (
          <span className="cg-source-media-preview__fullscreen-error" role="status">
            Fullscreen is unavailable.
          </span>
        )}
      </div>
      {children}
    </section>
  );
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
    playRequest,
    mediaOpen,
    mediaClose,
    onPreviewEngineChange,
  } = props;
  const foreground = useModalForeground();
  const topology = useProgramTopology(foreground ? (channel ?? null) : null);
  const route = sourcePreviewRoute(topology);
  const activeEngine = topology?.active;
  const lastRoute = useRef<string>();
  const video = useRef<HTMLVideoElement>(null);
  const playbackButton = useRef<HTMLButtonElement>(null);
  const [preview, setPreview] = useState<MediaPlaybackPreview | null>(null);
  const currentPreview = useRef<MediaPlaybackPreview | null>(null);
  const [positionMs, setPositionMs] = useState(0);
  const position = useRef(0);
  const positionHeld = useRef(false);
  const [duration, setDuration] = useState(durationMs ?? 0);
  const [intent, setIntent] = useState<'playing' | 'paused' | 'stopped'>(
    inline || playRequest !== undefined ? 'playing' : 'paused',
  );
  const currentIntent = useRef(intent);
  const [muted, setMuted] = useState(true);
  const [videoVisible, setVideoVisible] = useState(false);
  const [videoOrigin, setVideoOrigin] = useState<PreviewEngine>();
  const [posterOrigin, setPosterOrigin] = useState<PreviewEngine>();
  const [buffering, setBuffering] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const refresh = useRef<(() => void) | null>(null);
  const recover = useRef<(() => void) | null>(null);
  const release = useRef<(() => void) | null>(null);
  const unsupported = useRef(false);

  useEffect(() => {
    if (inline) playbackButton.current?.focus();
  }, [inline]);

  useEffect(() => {
    if (!foreground || channel === undefined || unsupported.current) return;
    let alive = true;
    let pending = false;
    let generation = 0;
    let queuedRead = false;
    let queuedProbe: string | undefined;
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
      generation += 1;
      queuedRead = false;
      queuedProbe = undefined;
      clearTimeout(timer);
      close(currentPreview.current);
      currentPreview.current = null;
      preparingSince = null;
    };
    const failPlayer = (): void => {
      video.current?.pause();
      stopLease();
      setVideoOrigin(undefined);
      setVideoVisible(false);
      setBuffering(false);
      setPlayerError('Preview cannot play in this browser.');
      currentIntent.current = 'paused';
      setIntent('paused');
    };
    const holdPosition = (): void => {
      const player = video.current;
      if (player !== null) {
        if (!positionHeld.current) {
          position.current = Math.round(player.currentTime * 1_000);
          setPositionMs(position.current);
        }
        positionHeld.current = true;
        player.pause();
      }
      setVideoOrigin(undefined);
      setVideoVisible(false);
      setBuffering(true);
    };
    const read = async (probeId?: string): Promise<void> => {
      if (stopped() || (probeId !== undefined && currentPreview.current?.previewId !== probeId))
        return;
      if (pending) {
        if (probeId === undefined) queuedRead = true;
        else queuedProbe = probeId;
        return;
      }
      clearTimeout(timer);
      pending = true;
      const requestGeneration = generation;
      const prepare = currentIntent.current === 'playing';
      const current = (): boolean => alive && !stopped() && requestGeneration === generation;
      const playQueued = (): boolean =>
        !prepare && queuedRead && currentIntent.current === 'playing';
      try {
        const held = currentPreview.current;
        let result = await mediaOpen({
          channel,
          sourceId: id,
          ...(held?.previewId === undefined ? {} : { previewId: held.previewId }),
          prepare,
        });
        if (!current()) {
          close(result);
          return;
        }
        if ('recovery' in result && result.recovery === 'target-changed' && held?.previewId) {
          // Only the Bridge can prove the same media moved to another authenticated engine.
          // One fresh acquisition is allowed for this verified handoff, never for a codec error.
          holdPosition();
          currentPreview.current = null;
          close(held);
          result = await mediaOpen({
            channel,
            sourceId: id,
            prepare: currentIntent.current === 'playing',
          });
          if (!current()) {
            close(result);
            return;
          }
          setPlayerError(null);
        } else if (probeId !== undefined) {
          // A valid unchanged lease or a terminal refusal does not authorize an automatic restart.
          if (result.previewId !== held?.previewId) close(result);
          failPlayer();
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
        if ((result.state === 'unavailable' || result.state === 'error') && !playQueued()) {
          video.current?.pause();
          setPlayerError(result.message ?? 'Preview unavailable');
          currentIntent.current = 'paused';
          setIntent('paused');
        }
        if (result.state === 'preparing' && currentIntent.current === 'playing') {
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
        if (current() && !playQueued()) {
          video.current?.pause();
          stopLease();
          setPlayerError('Preview unavailable. Try again.');
          currentIntent.current = 'paused';
          setIntent('paused');
        }
      } finally {
        pending = false;
        const nextProbe = queuedProbe;
        const nextRead = queuedRead;
        queuedProbe = undefined;
        queuedRead = false;
        if (alive && !stopped()) {
          if (nextProbe !== undefined && nextProbe === currentPreview.current?.previewId)
            void read(nextProbe);
          else if (nextRead) void read();
        }
      }
    };
    refresh.current = () => void read();
    recover.current = () => {
      const previewId = currentPreview.current?.previewId;
      if (previewId === undefined) {
        failPlayer();
        return;
      }
      holdPosition();
      void read(previewId);
    };
    release.current = stopLease;
    if (currentIntent.current !== 'stopped') void read();
    return () => {
      alive = false;
      refresh.current = null;
      recover.current = null;
      release.current = null;
      const player = video.current;
      if (player !== null) {
        if (currentIntent.current !== 'stopped' && !positionHeld.current) {
          position.current = Math.round(player.currentTime * 1_000);
        }
        player.pause();
      }
      stopLease();
    };
  }, [channel, foreground, id, mediaClose, mediaOpen]);

  useEffect(() => {
    if (route === undefined) return;
    const previous = lastRoute.current;
    lastRoute.current = route;
    const held = currentPreview.current;
    if (
      held?.previewId !== undefined &&
      previous !== route &&
      (previous !== undefined || (held.engine !== undefined && held.engine !== activeEngine))
    ) {
      refresh.current?.();
    }
  }, [activeEngine, route]);

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
    void player.play().catch((error: unknown) => {
      if (
        currentIntent.current !== 'playing' ||
        video.current !== player ||
        player.getAttribute('src') !== source ||
        !matchesReadyPreview(player, currentPreview.current)
      )
        return;
      if (
        typeof error === 'object' &&
        error !== null &&
        'name' in error &&
        (error.name === 'AbortError' || error.name === 'NotSupportedError')
      ) {
        recover.current?.();
        return;
      }
      currentIntent.current = 'paused';
      setIntent('paused');
      setPlayerError('Preview could not play. Try again.');
    });
  }, [foreground]);

  useEffect(() => {
    if (foreground && preview?.state === 'ready' && preview.videoUrl !== undefined) play();
  }, [foreground, play, preview?.state, preview?.videoUrl]);

  const startPlayback = useCallback((): void => {
    setPlayerError(null);
    currentIntent.current = 'playing';
    setIntent('playing');
    if (duration > 0 && position.current >= duration) {
      position.current = 0;
      setPositionMs(0);
      if (video.current !== null) video.current.currentTime = 0;
    }
    if (currentPreview.current?.state === 'ready') {
      if (video.current?.paused !== false) setBuffering(true);
      play();
    } else refresh.current?.();
  }, [duration, play]);

  const consumedPlayRequest = useRef(playRequest);
  useEffect(() => {
    if (playRequest === undefined || playRequest === consumedPlayRequest.current) return;
    consumedPlayRequest.current = playRequest;
    if (!unsupported.current) startPlayback();
  }, [playRequest, startPlayback]);

  const setPlayback = (): void => {
    if (currentIntent.current === 'playing') {
      setPlayerError(null);
      currentIntent.current = 'paused';
      setIntent('paused');
      video.current?.pause();
    } else startPlayback();
  };

  const stop = (): void => {
    currentIntent.current = 'stopped';
    setIntent('stopped');
    if (video.current !== null) {
      video.current.pause();
      video.current.currentTime = 0;
    }
    position.current = 0;
    positionHeld.current = false;
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

  if (preview?.state === 'unsupported') {
    return <SampledSourceMediaPreview {...props} initialPlayback={intent === 'playing'} />;
  }
  const loading =
    intent === 'playing' &&
    playerError === null &&
    (preview === null ||
      preview.state === 'preparing' ||
      (preview.state === 'ready' && (!showVideo || buffering)));
  let message = '';
  if (intent !== 'stopped') {
    if (playerError !== null) message = playerError;
    else if (preview === null) message = 'Loading preview…';
    else if (preview.state === 'preparing' && intent === 'playing') {
      message = preview.message ?? 'Preparing preview…';
    } else if (preview.state === 'unavailable' || preview.state === 'error') {
      message = preview.message ?? 'Preview unavailable';
    } else if (loading) message = 'Loading…';
  }
  const origin = displayedEngine === undefined ? null : `Server ${displayedEngine}`;

  return (
    <MediaPreviewSurface
      name={name}
      description={origin ?? 'Media preview'}
      inline={inline}
      file
      loading={loading ? message : undefined}
      picture={
        <>
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
                if (!matchesReadyPreview(player, currentPreview.current)) return;
                if (Number.isFinite(player.duration) && player.duration > 0) {
                  setDuration(Math.round(player.duration * 1_000));
                }
                if (position.current > 0) player.currentTime = position.current / 1_000;
                positionHeld.current = false;
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
                setBuffering(true);
              }}
              onWaiting={() => setBuffering(true)}
              onEmptied={() => setVideoOrigin(undefined)}
              onPlaying={(event) => {
                setBuffering(false);
                if (matchesReadyPreview(event.currentTarget, currentPreview.current))
                  setVideoOrigin(currentPreview.current?.engine);
              }}
              onTimeUpdate={(event) => {
                if (
                  positionHeld.current ||
                  currentIntent.current === 'stopped' ||
                  !matchesReadyPreview(event.currentTarget, currentPreview.current)
                )
                  return;
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
                // Even a truncated old stream can report a decode error; only the Bridge's
                // verified handoff hint can authorize a fresh lease after the diagnostic probe.
                recover.current?.();
              }}
            />
          )}
          {posterUrl === undefined ? (
            <span hidden={showVideo || loading}>No picture</span>
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
        </>
      }
    >
      <div className="cg-source-media-preview__transport">
        <div className="cg-source-media-preview__controls">
          <Button
            ref={playbackButton}
            variant="icon"
            className="cg-source-media-preview__play"
            title={intent === 'playing' ? 'Pause preview' : 'Play preview'}
            aria-label={intent === 'playing' ? 'Pause preview' : 'Play preview'}
            disabled={!foreground}
            onClick={setPlayback}
          >
            <Icon icon={intent === 'playing' ? Pause : Play} size={19} />
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
        {!loading && (
          <span className="cg-source-media-preview__status" role="status">
            {message}
          </span>
        )}
      </div>
    </MediaPreviewSurface>
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
  playRequest,
  initialPlayback,
  onPreviewEngineChange,
}: SourceMediaPreviewProps & { initialPlayback?: boolean }): JSX.Element {
  const foreground = useModalForeground();
  const end = Math.min(Math.ceil(durationMs ?? 0) - 1, MAX_MEDIA_PREVIEW_POSITION_MS);
  const enabled = channel !== undefined && end > 0;
  const autoPlay = (initialPlayback ?? (inline || playRequest !== undefined)) && enabled;
  const loadPoster = useMemo(
    () => loadThumbnail ?? createMediaThumbnailLoader(channel),
    [loadThumbnail, channel],
  );
  const [loadedPoster, setLoadedPoster] = useState<{
    id: string;
    load: MediaThumbnailLoader;
    src: string;
  }>();
  const [positionMs, setPositionMs] = useState(0);
  const position = useRef(positionMs);
  position.current = positionMs;
  const [request, setRequest] = useState<PreviewRequest | null>(() =>
    autoPlay ? { positionMs: 0, startedAt: performance.now() } : null,
  );
  const [picture, setPicture] = useState<string | null>(null);
  const [pictureOrigin, setPictureOrigin] = useState<PreviewEngine>();
  const [decodedPicture, setDecodedPicture] = useState<{ src: string; engine?: PreviewEngine }>();
  const sampledImage = useRef<HTMLImageElement>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>(
    autoPlay ? 'loading' : 'idle',
  );
  const playing = request !== null && request.startedAt !== null;
  const currentPoster =
    loadedPoster?.id === id && loadedPoster.load === loadPoster ? loadedPoster.src : undefined;
  const src = picture ?? poster ?? currentPoster ?? null;
  const receivedOrigin =
    picture === null
      ? poster === undefined && currentPoster !== undefined
        ? loadPoster.origin?.(id)
        : undefined
      : pictureOrigin;
  useEffect(() => {
    if (src === null) setDecodedPicture(undefined);
    else if (
      decodedPicture?.src === src &&
      decodedPicture.engine !== receivedOrigin &&
      sampledImage.current?.complete === true &&
      sampledImage.current.naturalWidth > 0
    ) {
      setDecodedPicture({
        src,
        ...(receivedOrigin === undefined ? {} : { engine: receivedOrigin }),
      });
    }
    onPreviewEngineChange?.(src === null ? undefined : decodedPicture?.engine);
  }, [src, decodedPicture, receivedOrigin, onPreviewEngineChange]);
  const playbackButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (inline) playbackButton.current?.focus();
  }, [inline]);

  useEffect(() => {
    if (!foreground || poster !== undefined || currentPoster !== undefined) return;
    let current = true;
    void loadPoster(id).then((src) => {
      if (current && src !== null) setLoadedPoster({ id, load: loadPoster, src });
    });
    return () => {
      current = false;
    };
  }, [id, loadPoster, poster, currentPoster, foreground]);

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
  const consumedPlayRequest = useRef(playRequest);
  useEffect(() => {
    if (playRequest === undefined || playRequest === consumedPlayRequest.current) return;
    consumedPlayRequest.current = playRequest;
    if (!enabled || playing) return;
    setPositionMs(position.current === end ? 0 : position.current);
    setStatus('loading');
    setRequest({
      positionMs: position.current === end ? 0 : position.current,
      startedAt: performance.now(),
    });
  }, [playRequest, enabled, playing, end]);
  const stop = (): void => {
    setRequest(null);
    setPositionMs(0);
    setPicture(null);
    setStatus('idle');
  };
  return (
    <MediaPreviewSurface
      name={name}
      description={enabled ? 'Silent preview · sampled frames' : 'Poster'}
      inline={inline}
      loading={status === 'loading' ? 'Loading frame…' : undefined}
      picture={
        src === null ? (
          <span hidden={status === 'loading'}>No picture</span>
        ) : (
          <img
            src={src}
            ref={sampledImage}
            alt=""
            onLoad={() =>
              setDecodedPicture({
                src,
                ...(receivedOrigin === undefined ? {} : { engine: receivedOrigin }),
              })
            }
            onError={() => setDecodedPicture(undefined)}
          />
        )
      }
    >
      {enabled && (
        <div className="cg-source-media-preview__transport">
          <div className="cg-source-media-preview__controls">
            <Button
              ref={playbackButton}
              variant="icon"
              className="cg-source-media-preview__play"
              title={playing ? 'Pause preview' : 'Play preview'}
              aria-label={playing ? 'Pause preview' : 'Play preview'}
              onClick={() =>
                playing
                  ? start(positionMs, false)
                  : start(positionMs === end ? 0 : positionMs, true)
              }
            >
              <Icon icon={playing ? Pause : Play} size={19} />
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
          {status === 'unavailable' && (
            <span className="cg-source-media-preview__status" role="status">
              Preview unavailable
            </span>
          )}
        </div>
      )}
    </MediaPreviewSurface>
  );
}
