import { useUiText } from '../../i18n/locale.js';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  LoaderCircle,
  Maximize2,
  Pause,
  Play,
  RotateCcw,
  Square,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
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
  plate?:
    | {
        name: string;
        hasAudio?: boolean | undefined;
        showPicture: (
          element: HTMLVideoElement | HTMLImageElement | null,
          engine?: PreviewEngine,
        ) => void;
      }
    | undefined;
}

interface PreviewRequest {
  positionMs: number;
  /** A null clock requests one silent frame at the selected position. */
  startedAt: number | null;
}

interface PreviewTransport {
  positionMs: number;
  durationMs: number;
  seekEndMs: number;
  seekDisabled?: boolean;
  onSeek: (positionMs: number) => void;
  onTogglePlayback?: (() => void) | undefined;
  controls: ReactNode;
  message?: string;
}

interface PlateTransport {
  name: string;
  playing: boolean;
  reset?: (() => void) | undefined;
  audible?: boolean | undefined;
  toggleAudio?: (() => void) | undefined;
}

function MediaPreviewSurface({
  name,
  description,
  inline,
  file,
  picture,
  loading,
  transport,
  plate,
}: {
  name: string;
  description: string;
  inline: boolean;
  file?: boolean;
  picture: ReactNode;
  loading: string | undefined;
  transport?: PreviewTransport | undefined;
  plate?: PlateTransport | undefined;
}): JSX.Element {
  const localizeUi = useUiText();
  const surface = useRef<HTMLElement>(null);
  const fullscreenButton = useRef<HTMLButtonElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [fullscreenError, setFullscreenError] = useState(false);
  const togglePlayback = plate === undefined ? transport?.onTogglePlayback : undefined;

  useEffect(() => {
    if (togglePlayback === undefined) return;
    const space = (event: KeyboardEvent): void => {
      if (
        event.key !== ' ' ||
        event.defaultPrevented ||
        event.isComposing ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      ) {
        return;
      }
      const element = surface.current;
      if (element === null) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest('input:not([type="range"]), textarea, select, [role="textbox"]') !==
            null ||
          (!element.contains(target) &&
            target.closest('button, a[href], [role="button"]') !== null))
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) togglePlayback();
    };
    window.addEventListener('keydown', space, true);
    return () => window.removeEventListener('keydown', space, true);
  }, [togglePlayback]);

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

  if (plate !== undefined) {
    const action = plate.playing ? 'Pause preview' : 'Play preview';
    const audio = plate.audible ? 'Mute preview' : 'Listen to preview';
    const toggle = transport?.onTogglePlayback;
    const status = loading ?? transport?.message;
    return (
      <div className="cg-pvw-media-transport" data-pvw-media-transport="">
        <div hidden>{picture}</div>
        <Button
          variant="icon"
          aria-label={localizeUi(
            plate.playing ? 'Pause preview in {name}' : 'Play preview in {name}',
            { name: plate.name },
          )}
          title={localizeUi(action)}
          disabled={toggle === undefined}
          onClick={toggle}
        >
          <Icon icon={plate.playing ? Pause : Play} size={16} />
        </Button>
        {plate.reset !== undefined && (
          <Button
            variant="icon"
            aria-label={localizeUi('Reset preview in {name}', { name: plate.name })}
            title={localizeUi('Reset preview')}
            onClick={plate.reset}
          >
            <Icon icon={RotateCcw} size={16} />
          </Button>
        )}
        {plate.toggleAudio !== undefined && (
          <Button
            variant="icon"
            aria-label={audio + ' in ' + plate.name}
            title={audio}
            aria-pressed={plate.audible}
            onClick={plate.toggleAudio}
          >
            <Icon icon={plate.audible ? Volume2 : VolumeX} size={16} />
          </Button>
        )}
        {status !== undefined && <span role="status">{status}</span>}
      </div>
    );
  }

  const fullscreenLabel = expanded ? 'Close fullscreen preview' : 'Fullscreen preview';
  const fullscreenToggle = document.fullscreenEnabled && (
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
      <Icon icon={expanded ? X : Maximize2} size={16} />
    </Button>
  );
  return (
    <section
      ref={surface}
      className={
        inline ? 'cg-source-media-preview cg-source-media-preview--tile' : 'cg-source-media-preview'
      }
      aria-label={localizeUi('Media preview')}
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
        {transport === undefined && fullscreenToggle}
        {fullscreenError && (
          <span className="cg-source-media-preview__fullscreen-error" role="status">
            {localizeUi('Fullscreen is unavailable.')}
          </span>
        )}
      </div>
      {transport !== undefined && (
        <MediaPreviewTransport {...transport} fullscreenToggle={fullscreenToggle} />
      )}
    </section>
  );
}

function MediaPreviewTransport({
  positionMs,
  durationMs,
  seekEndMs,
  seekDisabled,
  onSeek,
  controls,
  message,
  fullscreenToggle,
}: PreviewTransport & { fullscreenToggle: ReactNode }): JSX.Element {
  const localizeUi = useUiText();
  const elapsed = formatMediaDuration(Math.floor(positionMs / 1_000) * 1_000);
  const total = durationMs > 0 ? formatMediaDuration(durationMs) : '–:––';
  const played = seekEndMs > 0 ? Math.min(100, Math.max(0, (positionMs / seekEndMs) * 100)) : 0;
  return (
    <div className="cg-source-media-preview__transport" dir="ltr">
      <RangeInput
        className="cg-source-media-preview__seek"
        style={{ '--preview-played': `${played}%` } as CSSProperties}
        aria-label={localizeUi('Preview position')}
        aria-valuetext={elapsed}
        min={0}
        max={Math.max(0, seekEndMs)}
        step={1}
        value={positionMs}
        disabled={seekDisabled}
        onChange={(event) => onSeek(event.currentTarget.valueAsNumber)}
      />
      <div className="cg-source-media-preview__toolbar">
        <div className="cg-source-media-preview__controls">{controls}</div>
        <span className="cg-source-media-preview__time">
          <span>{elapsed}</span> <span>/ {total}</span>
        </span>
        {fullscreenToggle}
      </div>
      {message && (
        <span className="cg-source-media-preview__status" role="status">
          {message}
        </span>
      )}
    </div>
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
const ORIGINAL_ATTEMPT_STARTUP_MS = 8_000;
const PROXY_PREPARATION_BUDGET_MS = {
  // An earlier proxy can use the encoder for 20 minutes before this clip gets a turn.
  'waiting-for-capacity': 25 * 60_000,
  encoding: 20 * 60_000,
};

function isOriginalAttempt(mode: MediaPlaybackPreview['playbackMode']): boolean {
  return mode === 'local-original' || mode === 'network-original';
}

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
  const localizeUi = useUiText();
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
    plate,
  } = props;
  const foreground = useModalForeground();
  const topology = useProgramTopology(foreground ? (channel ?? null) : null);
  const route = sourcePreviewRoute(topology);
  const activeEngine = topology?.active;
  const lastRoute = useRef<string>();
  const video = useRef<HTMLVideoElement | null>(null);
  const platePlayer = plate !== undefined;
  const setVideo = useCallback(
    (player: HTMLVideoElement | null) => {
      if (platePlayer && player === null) video.current?.pause();
      video.current = player;
    },
    [platePlayer],
  );
  const playbackButton = useRef<HTMLButtonElement>(null);
  const [preview, setPreview] = useState<MediaPlaybackPreview | null>(null);
  const currentPreview = useRef<MediaPlaybackPreview | null>(null);
  const playedOriginalAttemptUrl = useRef<string>();
  const [positionMs, setPositionMs] = useState(0);
  const position = useRef(0);
  const positionHeld = useRef(false);
  const [duration, setDuration] = useState(durationMs ?? 0);
  const [intent, setIntent] = useState<'playing' | 'paused' | 'stopped'>(
    plate !== undefined ? 'stopped' : inline || playRequest !== undefined ? 'playing' : 'paused',
  );
  const currentIntent = useRef(intent);
  const [muted, setMuted] = useState(true);
  const [decodedAudioUrl, setDecodedAudioUrl] = useState<string>();
  const [volume, setVolume] = useState(100);
  const [videoVisible, setVideoVisible] = useState(false);
  const [plateStarted, setPlateStarted] = useState(false);
  const [videoOrigin, setVideoOrigin] = useState<PreviewEngine>();
  const [posterOrigin, setPosterOrigin] = useState<PreviewEngine>();
  const [buffering, setBuffering] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const refresh = useRef<(() => void) | null>(null);
  const recover = useRef<(() => void) | null>(null);
  const release = useRef<(() => void) | null>(null);
  const unsupported = useRef(false);

  useEffect(() => {
    if (inline || playRequest !== undefined) playbackButton.current?.focus({ preventScroll: true });
  }, [inline, playRequest]);

  useEffect(() => {
    if (!foreground || channel === undefined || unsupported.current) return;
    let alive = true;
    let pending = false;
    let generation = 0;
    let queuedRead = false;
    let queuedProbe: string | undefined;
    let originalAttemptRejected = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let preparationStartedAt: Partial<Record<keyof typeof PROXY_PREPARATION_BUDGET_MS, number>> =
      {};
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
      preparationStartedAt = {};
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
          tryLocalOriginal: !originalAttemptRejected,
          tryNetworkOriginal: !originalAttemptRejected,
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
            tryLocalOriginal: !originalAttemptRejected,
            tryNetworkOriginal: !originalAttemptRejected,
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
        if (isOriginalAttempt(result.playbackMode) && originalAttemptRejected) return;
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
        if (result.state === 'preparing' && currentIntent.current === 'playing' && !playQueued()) {
          const phase = result.preparationPhase ?? 'encoding';
          const now = performance.now();
          const started = (preparationStartedAt[phase] ??= now);
          const remaining = PROXY_PREPARATION_BUDGET_MS[phase] - (now - started);
          if (remaining <= 0) {
            stopLease();
            setPlayerError(
              phase === 'waiting-for-capacity'
                ? 'Timed out waiting for proxy capacity. Try again.'
                : 'Preview preparation timed out. Try again.',
            );
            currentIntent.current = 'paused';
            setIntent('paused');
            return;
          }
          timer = setTimeout(() => void read(), Math.min(pollDelay, remaining));
          pollDelay = Math.min(5_000, pollDelay * 2);
        } else if (result.previewId !== undefined) {
          preparationStartedAt = {};
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
      if (isOriginalAttempt(currentPreview.current?.playbackMode)) {
        if (!originalAttemptRejected) {
          originalAttemptRejected = true;
          holdPosition();
          void read();
        }
        return;
      }
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

  // Network originals can be large. Keep the poster until the operator starts playback.
  const videoUrl =
    preview?.playbackMode === 'network-original' && intent !== 'playing' && !videoVisible
      ? undefined
      : preview?.videoUrl;
  useLayoutEffect(() => {
    if (video.current !== null) video.current.volume = volume / 100;
  }, [videoUrl, volume]);
  useEffect(() => {
    if (foreground && preview?.state === 'ready' && videoUrl !== undefined) play();
  }, [foreground, play, preview?.state, videoUrl]);

  const originalAttemptUrl = isOriginalAttempt(preview?.playbackMode) ? videoUrl : undefined;
  useEffect(() => {
    if (!foreground || intent !== 'playing' || originalAttemptUrl === undefined) return;
    const timeout = setTimeout(() => {
      if (
        playedOriginalAttemptUrl.current !== originalAttemptUrl &&
        currentPreview.current?.videoUrl === originalAttemptUrl
      ) {
        recover.current?.();
      }
    }, ORIGINAL_ATTEMPT_STARTUP_MS);
    return () => clearTimeout(timeout);
  }, [foreground, intent, originalAttemptUrl]);

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

  const togglePlayback = useCallback((): void => {
    if (currentIntent.current === 'playing') {
      setPlayerError(null);
      currentIntent.current = 'paused';
      setIntent('paused');
      video.current?.pause();
    } else startPlayback();
  }, [startPlayback]);

  const rewind = (): void => {
    if (video.current !== null) {
      video.current.pause();
      video.current.currentTime = 0;
    }
    position.current = 0;
    positionHeld.current = false;
    setPositionMs(0);
  };
  const reset = (): void => {
    currentIntent.current = 'paused';
    setIntent('paused');
    rewind();
    setBuffering(false);
    setPlayerError(null);
  };
  const stop = (): void => {
    currentIntent.current = 'stopped';
    setIntent('stopped');
    rewind();
    setPlateStarted(false);
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
  useLayoutEffect(() => {
    plate?.showPicture(showVideo ? video.current : null, videoOrigin);
  }, [plate, showVideo, videoOrigin, videoUrl]);
  useLayoutEffect(() => () => plate?.showPicture(null), [plate]);
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
      message =
        preview.message ??
        (preview.preparationPhase === 'waiting-for-capacity'
          ? 'Waiting for proxy capacity…'
          : 'Preparing preview…');
    } else if (preview.state === 'unavailable' || preview.state === 'error') {
      message = preview.message ?? 'Preview unavailable';
    } else if (loading) message = 'Loading…';
  }
  let playbackOrigin = '';
  if (showVideo && preview?.playbackMode === 'local-original') {
    playbackOrigin = ' · Local original file';
  } else if (showVideo && preview?.playbackMode === 'network-original') {
    playbackOrigin = ' · Original file over network';
  }
  const origin =
    displayedEngine === undefined ? null : `Server ${displayedEngine}${playbackOrigin}`;
  const plateAudio =
    showVideo &&
    (plate?.hasAudio === true || (plate?.hasAudio !== false && decodedAudioUrl === videoUrl));

  return (
    <MediaPreviewSurface
      name={name}
      description={origin ?? 'Media preview'}
      inline={inline}
      file
      plate={
        plate === undefined
          ? undefined
          : {
              name: plate.name,
              playing: intent === 'playing',
              ...(plateStarted && foreground && { reset }),
              ...(plateAudio && {
                audible: !muted,
                toggleAudio: () => setMuted((value) => !value),
              }),
            }
      }
      loading={loading ? message : undefined}
      picture={
        <>
          {videoUrl !== undefined && (
            // Library preview manifests do not include caption assets.
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video
              ref={setVideo}
              src={videoUrl}
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
                if (matchesReadyPreview(event.currentTarget, currentPreview.current)) {
                  if (platePlayer && currentIntent.current === 'playing') setPlateStarted(true);
                  if (isOriginalAttempt(currentPreview.current?.playbackMode)) {
                    playedOriginalAttemptUrl.current = currentPreview.current?.videoUrl;
                  }
                  setVideoOrigin(currentPreview.current?.engine);
                }
              }}
              onTimeUpdate={(event) => {
                if (
                  positionHeld.current ||
                  currentIntent.current === 'stopped' ||
                  !matchesReadyPreview(event.currentTarget, currentPreview.current)
                )
                  return;
                if (plate !== undefined && plate.hasAudio === undefined) {
                  const player = event.currentTarget as HTMLVideoElement & {
                    webkitAudioDecodedByteCount?: number;
                  };
                  if ((player.webkitAudioDecodedByteCount ?? 0) > 0)
                    setDecodedAudioUrl(player.getAttribute('src') ?? undefined);
                }
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
            <span hidden={showVideo || loading}>{localizeUi('No picture')}</span>
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
      transport={{
        positionMs,
        durationMs: duration,
        seekEndMs: duration,
        seekDisabled: !foreground || duration <= 0,
        onTogglePlayback: foreground ? togglePlayback : undefined,
        onSeek: (nextPosition) => {
          position.current = nextPosition;
          setPositionMs(nextPosition);
          if (video.current !== null) video.current.currentTime = nextPosition / 1_000;
        },
        ...(!loading && { message }),
        controls: (
          <>
            <Button
              ref={playbackButton}
              variant="icon"
              title={intent === 'playing' ? 'Pause preview' : 'Play preview'}
              aria-label={localizeUi(intent === 'playing' ? 'Pause preview' : 'Play preview')}
              aria-keyshortcuts="Space"
              disabled={!foreground}
              onClick={togglePlayback}
            >
              <Icon icon={intent === 'playing' ? Pause : Play} size={16} />
            </Button>
            <Button
              variant="icon"
              title={localizeUi('Stop preview')}
              aria-label={localizeUi('Stop preview')}
              onClick={stop}
              disabled={intent === 'stopped'}
            >
              <Icon icon={Square} size={16} />
            </Button>
            <Button
              variant="icon"
              title={muted ? 'Listen to preview' : 'Mute preview'}
              aria-label={localizeUi(muted ? 'Listen to preview' : 'Mute preview')}
              aria-pressed={!muted}
              disabled={!foreground}
              onClick={() => setMuted((value) => !value)}
            >
              <Icon icon={muted ? VolumeX : Volume2} size={16} />
            </Button>
            <RangeInput
              className="cg-source-media-preview__volume"
              aria-label={localizeUi('Preview volume')}
              aria-valuetext={`${volume}%`}
              title={`Preview volume · ${volume}%`}
              min={0}
              max={100}
              step={1}
              value={volume}
              disabled={!foreground}
              onChange={(event) => setVolume(event.currentTarget.valueAsNumber)}
            />
          </>
        ),
      }}
    />
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
  plate,
}: SourceMediaPreviewProps & { initialPlayback?: boolean }): JSX.Element {
  const localizeUi = useUiText();
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
    if (inline || playRequest !== undefined) playbackButton.current?.focus({ preventScroll: true });
  }, [inline, playRequest]);

  useEffect(() => {
    if (plate !== undefined || !foreground || poster !== undefined || currentPoster !== undefined)
      return;
    let current = true;
    void loadPoster(id).then((src) => {
      if (current && src !== null) setLoadedPoster({ id, load: loadPoster, src });
    });
    return () => {
      current = false;
    };
  }, [id, loadPoster, poster, currentPoster, foreground, plate]);

  useLayoutEffect(() => {
    if (plate === undefined) return;
    if (picture === null) plate.showPicture(null);
    else if (decodedPicture?.src === picture)
      plate.showPicture(sampledImage.current, decodedPicture.engine);
  }, [plate, picture, decodedPicture]);
  useLayoutEffect(() => () => plate?.showPicture(null), [plate]);

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

  const start = useCallback((nextPosition: number, play: boolean): void => {
    setPositionMs(nextPosition);
    setStatus('loading');
    setRequest({ positionMs: nextPosition, startedAt: play ? performance.now() : null });
  }, []);
  const togglePlayback = useCallback((): void => {
    const at = position.current;
    start(!playing && at === end ? 0 : at, !playing);
  }, [end, playing, start]);
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
      plate={
        plate === undefined
          ? undefined
          : {
              name: plate.name,
              playing,
              ...(enabled &&
                foreground &&
                decodedPicture !== undefined && { reset: () => start(0, false) }),
            }
      }
      loading={status === 'loading' ? 'Loading frame…' : undefined}
      picture={
        src === null ? (
          <span hidden={status === 'loading'}>{localizeUi('No picture')}</span>
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
      transport={
        enabled
          ? {
              positionMs,
              durationMs: end + 1,
              seekEndMs: end,
              onTogglePlayback: foreground ? togglePlayback : undefined,
              onSeek: (nextPosition) => start(nextPosition, playing),
              ...(status === 'unavailable' && { message: 'Preview unavailable' }),
              ...(plate !== undefined && status === 'ready' && { message: 'Silent preview' }),
              controls: (
                <>
                  <Button
                    ref={playbackButton}
                    variant="icon"
                    title={playing ? 'Pause preview' : 'Play preview'}
                    aria-label={localizeUi(playing ? 'Pause preview' : 'Play preview')}
                    aria-keyshortcuts="Space"
                    onClick={togglePlayback}
                  >
                    <Icon icon={playing ? Pause : Play} size={16} />
                  </Button>
                  <Button
                    variant="icon"
                    title={localizeUi('Stop preview')}
                    aria-label={localizeUi('Stop preview')}
                    onClick={stop}
                    disabled={status === 'idle'}
                  >
                    <Icon icon={Square} size={16} />
                  </Button>
                </>
              ),
            }
          : undefined
      }
    />
  );
}
