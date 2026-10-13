import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PGM_AUDIO_SAMPLE_RATE,
  PgmAudioPlayer,
  type PcmOut,
  type PgmAudioState,
} from '../features/monitors/pgmAudioPlayer.js';
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
 * - It reads only while ON, while the link to CG Bridge is live and while a channel is on screen; turning
 *   it off stops the stream at once, so CG Bridge releases the core's reader.
 */

const STORAGE_KEY = 'cg.runtime.pgm-audio.v1';

/** What the toggle can say: off, waiting for a gesture, connecting, or playing. */
export type PgmAudioStatus = 'off' | 'waiting' | PgmAudioState;

export interface PgmAudio {
  readonly on: boolean;
  readonly status: PgmAudioStatus;
  toggle(): void;
}

function readOn(): boolean {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw === null || raw === undefined) return false;
    return (JSON.parse(raw) as { on?: unknown }).on === true;
  } catch {
    // An unreadable value reads as absent: OFF, the quiet side.
    return false;
  }
}

function writeOn(on: boolean): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify({ on }));
  } catch {
    // A browser that will not store it still plays; it simply forgets at the next reload.
  }
}

type AudioContextCtor = new (options?: AudioContextOptions) => AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  const g = globalThis as { AudioContext?: AudioContextCtor };
  return g.AudioContext ?? null;
}

export function usePgmAudio(channel: number | null): PgmAudio {
  const live = useLink() === 'live';
  const [on, setOn] = useState(readOn);
  const [state, setState] = useState<PgmAudioState>('stopped');
  const [running, setRunning] = useState(false);
  const context = useRef<AudioContext | null>(null);

  /** The one context, created on demand — inside the press when there is one. */
  const ensureContext = useCallback((): AudioContext | null => {
    if (context.current === null) {
      const Ctor = audioContextCtor();
      if (Ctor === null) return null;
      context.current = new Ctor({ sampleRate: PGM_AUDIO_SAMPLE_RATE, latencyHint: 'interactive' });
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
  }, []);

  const toggle = useCallback(() => {
    const next = !on;
    writeOn(next);
    // The press IS the gesture: the context is made (or resumed) inside it.
    if (next) ensureContext();
    setOn(next);
  }, [on, ensureContext]);

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
    if (!on || !running || !live || channel === null) return undefined;
    const ctx = context.current;
    if (ctx === null) return undefined;
    const player = new PgmAudioPlayer({
      url: () => window.cg.pgmReturn.audioUrl(channel),
      out: ctx as unknown as PcmOut,
      onState: setState,
    });
    player.start();
    return () => {
      player.stop();
    };
  }, [on, running, live, channel]);

  useEffect(
    () => () => {
      void context.current?.close();
      context.current = null;
    },
    [],
  );

  const status: PgmAudioStatus = !on ? 'off' : !running ? 'waiting' : state;
  return { on, status, toggle };
}
