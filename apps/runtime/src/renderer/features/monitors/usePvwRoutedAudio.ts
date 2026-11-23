import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { canCheckLiveInput, type SourceDefinition } from '@cg/shared-ipc';
import { useSourcePreviewRoute } from '../../hooks/useProgramTopology.js';
import { useInputCheckSurface, useLiveInputCheck } from './liveInputCheckContext.js';
import { PgmAudioPlayer, PGM_AUDIO_SAMPLE_RATE, type PcmOut } from './pgmAudioPlayer.js';

const CONNECT_TIMEOUT_MS = 8_000;
const PCM_TIMEOUT_MS = 2_500;
const UNAVAILABLE = 'Input preview sound is unavailable.';

interface Audition {
  readonly sourceId: string;
  readonly context: AudioContext;
  readonly resumed: Promise<boolean>;
  previewId?: string;
  player?: PgmAudioPlayer;
  deadline?: ReturnType<typeof setTimeout>;
}

interface AudioState {
  readonly sourceId?: string;
  readonly audible: boolean;
  readonly pending: boolean;
  readonly failure?: string;
}

const SILENT: AudioState = { audible: false, pending: false };

/** One explicit, foreground Playout live-input audition. No graphic or programme control. */
export function usePvwRoutedAudio(
  channel: number | undefined,
  enabled: boolean,
): AudioState & {
  readonly available: boolean;
  start(source: SourceDefinition): void;
  stop(): void;
} {
  const route = useSourcePreviewRoute(enabled ? channel : undefined);
  const control = useLiveInputCheck();
  const { surface, inputCheck } = useInputCheckSurface(channel, enabled, route);
  const available = inputCheck !== undefined && typeof AudioContext !== 'undefined';
  const stopCheck = control?.stop;
  const current = useRef<Audition | null>(null);
  const [state, setState] = useState<AudioState>(SILENT);

  const release = useCallback((): void => {
    const audition = current.current;
    if (audition === null) return;
    current.current = null;
    clearTimeout(audition.deadline);
    audition.player?.stop();
    void audition.context.close().catch(() => undefined);
    stopCheck?.(surface);
  }, [stopCheck, surface]);

  const stop = useCallback((): void => {
    release();
    setState(SILENT);
  }, [release]);

  const fail = useCallback(
    (audition: Audition, failure: string): void => {
      if (current.current !== audition) return;
      release();
      setState({ ...SILENT, sourceId: audition.sourceId, failure });
    },
    [release],
  );

  useLayoutEffect(() => {
    setState(SILENT);
    return release;
  }, [available, channel, route, release]);

  const check = control?.check;
  useLayoutEffect(() => {
    const audition = current.current;
    if (audition === null || !available) return;
    if (
      check?.surface !== surface ||
      check.sourceId !== audition.sourceId ||
      check.view.channel !== channel ||
      (audition.previewId !== undefined && check.view.previewId !== audition.previewId)
    ) {
      if (audition.previewId !== undefined) fail(audition, 'The input preview ended.');
      return;
    }
    const { view } = check;
    audition.previewId = view.previewId;
    if (view.state !== 'ready' && view.state !== 'connecting') {
      fail(audition, view.message ?? UNAVAILABLE);
      return;
    }
    if (view.state !== 'ready') {
      if (audition.player !== undefined) fail(audition, 'The input preview lost its connection.');
      return;
    }
    if (audition.player !== undefined) return;

    const handle = { channel: view.channel, previewId: view.previewId };
    const player = new PgmAudioPlayer({
      url: () => window.cg.livePreview.url(handle, 'audio'),
      out: audition.context as unknown as PcmOut,
      retry: false,
      onState: (next) => {
        if (current.current !== audition) return;
        if (next === 'stopped') fail(audition, UNAVAILABLE);
        if (next === 'playing')
          setState({ sourceId: audition.sourceId, pending: false, audible: true });
      },
    });
    player.setPeakWriter(() => {
      if (current.current !== audition) return;
      clearTimeout(audition.deadline);
      audition.deadline = setTimeout(
        () => fail(audition, 'The input preview stopped delivering sound.'),
        PCM_TIMEOUT_MS,
      );
    });
    audition.player = player;
    void audition.resumed.then((resumed) => {
      if (resumed && current.current === audition) player.start();
    });
  }, [available, channel, check, fail, surface]);

  function start(source: SourceDefinition): void {
    if (current.current?.sourceId === source.id) return;
    release();
    if (!available || inputCheck === undefined || !canCheckLiveInput(source, inputCheck.channel)) {
      setState({ ...SILENT, sourceId: source.id, failure: UNAVAILABLE });
      return;
    }
    let context: AudioContext;
    try {
      context = new AudioContext({ sampleRate: PGM_AUDIO_SAMPLE_RATE, latencyHint: 'interactive' });
    } catch {
      setState({ ...SILENT, sourceId: source.id, failure: UNAVAILABLE });
      return;
    }

    const resumed = context.resume().then(
      () => true,
      () => false,
    );
    const audition: Audition = { sourceId: source.id, context, resumed };
    current.current = audition;
    setState({ sourceId: source.id, pending: true, audible: false });
    audition.deadline = setTimeout(() => fail(audition, UNAVAILABLE), CONNECT_TIMEOUT_MS);
    void resumed.then((ready) => {
      if (!ready) fail(audition, UNAVAILABLE);
    });
    inputCheck.start(source);
  }

  return { ...state, available, start, stop };
}
