import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PgmEngine, PgmMeterReading } from '@cg/shared-ipc';
import {
  PGM_AUDIO_SAMPLE_RATE,
  PgmAudioPlayer,
  type PcmOut,
  type PgmAudioState,
} from '../features/monitors/pgmAudioPlayer.js';
import { MeterStore } from '../features/monitors/meterStore.js';
import { useLink } from './useLink.js';

/**
 * 🔴 `PLAYOUT-FEATURES-01` E (`R-076`) — **THE PROGRAMME SOUND'S SPEAKER TOGGLE: off by default, per console,
 * remembered.**
 *
 * - OFF until the operator turns it on at THIS console — a browser will not start sound without a press,
 *   and a console that spoke by itself at boot would be a console the operator has to hunt for.
 * - REMEMBERED per browser profile (`cg.runtime.pgm-audio.v1`, like the shell layout): a fact about the
 *   person at this console, not about the station. After a reload the preference is ON but the browser
 *   still wants a gesture, so the sound starts at the first press or key anywhere on the page (`waiting`
 *   until then).
 * - The authenticated Programme stream has one reader while the speaker or its local stereo meter
 *   needs it. The speaker creates an AudioContext only after it is enabled.
 */

const STORAGE_KEY = 'cg.runtime.pgm-audio.v1';

/** What the toggle can say: off, waiting for a gesture, connecting, or playing. */
export type PgmAudioStatus = 'off' | 'waiting' | PgmAudioState;

export interface PgmAudio {
  readonly on: boolean;
  readonly status: PgmAudioStatus;
  readonly volume: number;
  readonly watchPeaks?: MeterStore['watchAudio'];
  toggle(): void;
  setVolume(value: number): void;
}

function readPreference(): { on: boolean; volume: number } {
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) ?? '{}') as {
      on?: unknown;
      volume?: unknown;
    };
    const volume = value.volume;
    return {
      on: value.on === true,
      volume: typeof volume === 'number' && volume >= 0 && volume <= 100 ? volume : 100,
    };
  } catch {
    return { on: false, volume: 100 };
  }
}

function writePreference(on: boolean, volume: number): void {
  try {
    globalThis.localStorage?.setItem(
      STORAGE_KEY,
      JSON.stringify(volume === 100 ? { on } : { on, volume }),
    );
  } catch {
    // A browser that will not store it still plays; it simply forgets at the next reload.
  }
}

type AudioContextCtor = new (options?: AudioContextOptions) => AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  const g = globalThis as { AudioContext?: AudioContextCtor };
  return g.AudioContext ?? null;
}

function localPcmMeter() {
  let receive: ((reading: PgmMeterReading) => void) | undefined;
  const store = new MeterStore({
    subscribe: (write) => {
      receive = write;
      return () => {
        receive = undefined;
      };
    },
  });
  return {
    watch: store.watchAudio.bind(store),
    publish: (channel: number, engine: PgmEngine, dbfs: readonly [number, number]) =>
      receive?.({ kind: 'audio', channel, engine, dbfs: [...dbfs] }),
  };
}

function programmeAudioUrl(
  channel: number,
  engine: PgmEngine,
  resourceKey?: string,
): Promise<string | null> {
  return resourceKey === undefined
    ? window.cg.pgmReturn.audioUrl(channel, engine)
    : window.cg.pgmReturn.audioUrl(channel, engine, resourceKey);
}

/** Read stereo peaks without creating a speaker or borrowing the selected audio path. */
export function usePgmMeterPeaks(
  channel: number | null,
  engine: PgmEngine,
  resourceKey?: string,
): MeterStore['watchAudio'] {
  const live = useLink() === 'live';
  const [meter] = useState(localPcmMeter);
  useEffect(() => {
    if (!live || channel === null) return undefined;
    const player = new PgmAudioPlayer({
      url: () => programmeAudioUrl(channel, engine, resourceKey),
    });
    player.setPeakWriter((dbfs) => meter.publish(channel, engine, dbfs));
    player.start();
    return () => player.stop();
  }, [channel, engine, live, meter, resourceKey]);
  return meter.watch;
}

export function usePgmAudio(
  channel: number | null,
  engine: PgmEngine = 'A',
  resourceKey?: string,
  meterWanted = false,
): PgmAudio {
  const live = useLink() === 'live';
  const [preference, setPreference] = useState(readPreference);
  const { on, volume } = preference;
  const [state, setState] = useState<PgmAudioState>('stopped');
  const [running, setRunning] = useState(false);
  const [meter] = useState(localPcmMeter);
  const context = useRef<AudioContext | null>(null);
  const gain = useRef<GainNode | null>(null);
  const player = useMemo(
    () =>
      channel === null
        ? null
        : new PgmAudioPlayer({
            url: () => programmeAudioUrl(channel, engine, resourceKey),
            onState: setState,
          }),
    [channel, engine, resourceKey],
  );
  const audible = on && running;
  const demand = live && (audible || meterWanted);

  /** The one context, created on demand — inside the press when there is one. */
  const ensureContext = useCallback((): AudioContext | null => {
    if (context.current === null) {
      const Ctor = audioContextCtor();
      if (Ctor === null) return null;
      context.current = new Ctor({ sampleRate: PGM_AUDIO_SAMPLE_RATE, latencyHint: 'interactive' });
      if (typeof context.current.createGain === 'function') {
        gain.current = context.current.createGain();
        gain.current.gain.value = volume / 100;
        gain.current.connect(context.current.destination);
      }
      context.current.onstatechange = () => {
        setRunning(context.current?.state === 'running');
      };
    }
    const ctx = context.current;
    void ctx.resume().then(
      () => {
        setRunning(ctx.state === 'running');
      },
      () => undefined,
    );
    return ctx;
  }, [volume]);

  const toggle = useCallback(() => {
    const next = !on;
    writePreference(next, volume);
    // The press IS the gesture: the context is made (or resumed) inside it.
    if (next) ensureContext();
    setPreference({ on: next, volume });
  }, [on, volume, ensureContext]);

  const setVolume = (value: number): void => {
    if (!Number.isFinite(value)) return;
    const next = Math.min(100, Math.max(0, value));
    if (gain.current !== null) gain.current.gain.value = next / 100;
    writePreference(on, next);
    setPreference({ on, volume: next });
  };

  /*
    Remembered ON after a reload: the browser starts sound only after a press on the page. If the page has
    had one already (showing the monitors is one), start now; otherwise at the first press or key anywhere.
  */
  useEffect(() => {
    if (!on || running) return undefined;
    const activation = (navigator as { userActivation?: { hasBeenActive: boolean } })
      .userActivation;
    if (activation?.hasBeenActive === true) ensureContext();
    const unlock = (): void => {
      ensureContext();
    };
    document.addEventListener('pointerdown', unlock, { capture: true });
    document.addEventListener('keydown', unlock, { capture: true });
    return () => {
      document.removeEventListener('pointerdown', unlock, { capture: true });
      document.removeEventListener('keydown', unlock, { capture: true });
    };
  }, [on, running, ensureContext]);

  useEffect(() => {
    if (!meterWanted || player === null || channel === null) return undefined;
    player.setPeakWriter((dbfs) => meter.publish(channel, engine, dbfs));
    return () => player.setPeakWriter();
  }, [channel, engine, meter, meterWanted, player]);

  useEffect(() => {
    if (!audible || !live || player === null) return undefined;
    const ctx = context.current;
    if (ctx === null) return undefined;
    // Disconnect queued samples from the old source before switching the decoder.
    const streamGain = gain.current === null ? null : ctx.createGain();
    if (streamGain !== null && gain.current !== null) streamGain.connect(gain.current);
    player.setSpeaker(ctx as unknown as PcmOut, streamGain ?? gain.current);
    return () => {
      streamGain?.disconnect();
      player.setSpeaker(null);
    };
  }, [audible, live, player]);

  useEffect(() => {
    if (!demand || player === null) return undefined;
    player.start();
    return () => player.stop();
  }, [demand, player]);

  useEffect(
    () => () => {
      void context.current?.close();
      context.current = null;
      gain.current = null;
    },
    [],
  );

  const status: PgmAudioStatus = !on
    ? 'off'
    : !running
      ? 'waiting'
      : !live || channel === null
        ? 'stopped'
        : state;
  return { on, status, volume, toggle, setVolume, watchPeaks: meter.watch };
}
