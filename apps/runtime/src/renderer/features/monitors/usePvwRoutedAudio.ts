import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { canCheckLiveInput, type LivePreviewStatus, type SourceDefinition } from '@cg/shared-ipc';
import { useSourcePreviewRoute } from '../../hooks/useProgramTopology.js';
import { useInputCheckSurface, useLiveInputCheck } from './liveInputCheckContext.js';
import { PgmAudioPlayer, PGM_AUDIO_SAMPLE_RATE, type PcmOut } from './pgmAudioPlayer.js';

const CONNECT_TIMEOUT_MS = 8_000;
const PCM_TIMEOUT_MS = 2_500;
const SOUND_UNAVAILABLE = 'Input preview sound is unavailable.';
const PICTURE_UNAVAILABLE = 'No current input picture.';

interface Audition {
  readonly context: AudioContext;
  readonly resumed: Promise<boolean>;
  player?: PgmAudioPlayer;
  deadline?: ReturnType<typeof setTimeout>;
}

interface PreviewRequest {
  readonly sourceId: string;
  showPicture: boolean;
  previewId?: string;
  ready?: true;
  deadline?: ReturnType<typeof setTimeout>;
  audio?: Audition;
}

interface PreviewState {
  readonly sourceId?: string;
  readonly pictureSourceId?: string;
  readonly audible: boolean;
  readonly pending: boolean;
  readonly failure?: string;
}

const SILENT: PreviewState = { audible: false, pending: false };

function closeAudio(request: PreviewRequest): void {
  const audio = request.audio;
  if (audio === undefined) return;
  delete request.audio;
  clearTimeout(audio.deadline);
  audio.player?.stop();
  void audio.context.close().catch(() => undefined);
}

/** One foreground Playout input lease. Picture and locally heard sound can be toggled separately. */
export function usePvwRoutedAudio(
  channel: number | undefined,
  enabled: boolean,
): PreviewState & {
  readonly available: boolean;
  readonly pictureAvailable: boolean;
  readonly picture?: LivePreviewStatus;
  start(source: SourceDefinition): void;
  startPicture(source: SourceDefinition): void;
  mute(): void;
  stop(): void;
  stall(previewId: string): void;
} {
  const route = useSourcePreviewRoute(enabled ? channel : undefined);
  const control = useLiveInputCheck();
  const { surface, inputCheck } = useInputCheckSurface(channel, enabled, route);
  const pictureAvailable = inputCheck !== undefined;
  const available = pictureAvailable && typeof AudioContext !== 'undefined';
  const stopCheck = control?.stop;
  const stallCheck = control?.stall;
  const current = useRef<PreviewRequest | null>(null);
  const [state, setState] = useState<PreviewState>(SILENT);

  const release = useCallback((): void => {
    const request = current.current;
    if (request === null) return;
    current.current = null;
    clearTimeout(request.deadline);
    closeAudio(request);
    stopCheck?.(surface, request.previewId);
  }, [stopCheck, surface]);

  const stop = useCallback((): void => {
    release();
    setState(SILENT);
  }, [release]);

  const mute = useCallback((): void => {
    const request = current.current;
    if (request?.showPicture !== true) {
      stop();
      return;
    }
    closeAudio(request);
    setState({ ...SILENT, sourceId: request.sourceId, pictureSourceId: request.sourceId });
  }, [stop]);

  const failRequest = useCallback(
    (request: PreviewRequest, failure: string): void => {
      if (current.current !== request) return;
      release();
      setState({ ...SILENT, sourceId: request.sourceId, failure });
    },
    [release],
  );

  const failAudio = useCallback(
    (request: PreviewRequest, audio: Audition, failure: string): void => {
      if (current.current !== request || request.audio !== audio) return;
      if (!request.showPicture) {
        failRequest(request, failure);
        return;
      }
      closeAudio(request);
      setState({
        ...SILENT,
        sourceId: request.sourceId,
        pictureSourceId: request.sourceId,
        failure,
      });
    },
    [failRequest],
  );

  useLayoutEffect(() => {
    setState(SILENT);
    return release;
  }, [pictureAvailable, channel, route, release]);

  const check = control?.check;
  const view =
    check?.surface === surface &&
    check.sourceId === state.sourceId &&
    check.view.channel === channel
      ? check.view
      : undefined;
  const stall = useCallback(
    (previewId: string): void => {
      if (current.current?.previewId === previewId) stallCheck?.(previewId);
    },
    [stallCheck],
  );

  useLayoutEffect(() => {
    const request = current.current;
    if (request === null || !pictureAvailable) return;
    if (
      view === undefined ||
      (request.previewId !== undefined && view.previewId !== request.previewId)
    ) {
      if (request.previewId !== undefined) failRequest(request, 'The input preview ended.');
      return;
    }
    request.previewId = view.previewId;
    if (view.state !== 'ready' && view.state !== 'connecting') {
      failRequest(
        request,
        view.message ?? (request.showPicture ? PICTURE_UNAVAILABLE : SOUND_UNAVAILABLE),
      );
      return;
    }
    if (view.state !== 'ready') {
      if (request.ready === true) failRequest(request, 'The input preview lost its connection.');
      return;
    }
    request.ready = true;
    clearTimeout(request.deadline);
    const audition = request.audio;
    if (audition === undefined || audition.player !== undefined) return;

    const handle = { channel: view.channel, previewId: view.previewId };
    const isCurrent = (): boolean => current.current === request && request.audio === audition;
    const player = new PgmAudioPlayer({
      url: () => window.cg.livePreview.url(handle, 'audio'),
      out: audition.context as unknown as PcmOut,
      retry: false,
      retryWhileBusy: true,
      onState: (next) => {
        if (!isCurrent()) return;
        if (next === 'stopped') failAudio(request, audition, SOUND_UNAVAILABLE);
        if (next === 'playing')
          setState((previous) => ({ ...previous, pending: false, audible: true }));
      },
    });
    player.setPeakWriter(() => {
      if (!isCurrent()) return;
      clearTimeout(audition.deadline);
      audition.deadline = setTimeout(
        () => failAudio(request, audition, 'The input preview stopped delivering sound.'),
        PCM_TIMEOUT_MS,
      );
    });
    audition.player = player;
    void audition.resumed.then((resumed) => {
      if (resumed && isCurrent()) player.start();
    });
  }, [pictureAvailable, view, state.pending, failAudio, failRequest]);

  function open(request: PreviewRequest, source: SourceDefinition): void {
    request.deadline = setTimeout(
      () => failRequest(request, request.showPicture ? PICTURE_UNAVAILABLE : SOUND_UNAVAILABLE),
      CONNECT_TIMEOUT_MS,
    );
    inputCheck?.start(source);
  }

  function startPicture(source: SourceDefinition): void {
    if (inputCheck === undefined || !canCheckLiveInput(source, inputCheck.channel)) {
      if (current.current === null) setState({ ...SILENT, failure: PICTURE_UNAVAILABLE });
      return;
    }
    const existing = current.current;
    if (existing?.sourceId === source.id) {
      existing.showPicture = true;
      setState((previous) => ({ ...previous, pictureSourceId: source.id }));
      return;
    }
    release();
    const request: PreviewRequest = { sourceId: source.id, showPicture: true };
    current.current = request;
    setState({ ...SILENT, sourceId: source.id, pictureSourceId: source.id });
    open(request, source);
  }

  function start(source: SourceDefinition): void {
    const existing = current.current?.sourceId === source.id ? current.current : null;
    if (existing?.audio !== undefined) return;
    if (existing === null) release();

    const rejectAudio = (): void => {
      setState({
        ...SILENT,
        sourceId: source.id,
        ...(existing?.showPicture === true && { pictureSourceId: source.id }),
        failure: SOUND_UNAVAILABLE,
      });
    };
    if (!available || inputCheck === undefined || !canCheckLiveInput(source, inputCheck.channel)) {
      rejectAudio();
      return;
    }
    let context: AudioContext;
    try {
      context = new AudioContext({ sampleRate: PGM_AUDIO_SAMPLE_RATE, latencyHint: 'interactive' });
    } catch {
      rejectAudio();
      return;
    }

    const resumed = context.resume().then(
      () => true,
      () => false,
    );
    const request: PreviewRequest = existing ?? { sourceId: source.id, showPicture: false };
    const audition: Audition = { context, resumed };
    request.audio = audition;
    current.current = request;
    setState({
      sourceId: source.id,
      ...(request.showPicture && { pictureSourceId: source.id }),
      pending: true,
      audible: false,
    });
    if (existing === null) open(request, source);
    audition.deadline = setTimeout(
      () => failAudio(request, audition, SOUND_UNAVAILABLE),
      CONNECT_TIMEOUT_MS,
    );
    void resumed.then((ready) => {
      if (!ready) failAudio(request, audition, SOUND_UNAVAILABLE);
    });
  }

  const picture = view?.state === 'ready' || view?.state === 'connecting' ? view : undefined;
  return {
    ...state,
    available,
    pictureAvailable,
    ...(state.pictureSourceId !== undefined && picture !== undefined && { picture }),
    start,
    startPicture,
    mute,
    stop,
    stall,
  };
}
