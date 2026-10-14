import { AUDIO_VOLUME_DB_MAX, AUDIO_VOLUME_DB_MIN, type AudioStart } from '@cg/shared-schema';
import type { RuntimeClock } from './types.js';

/**
 * 🔴 `D-165` — **THE AUDIO ELEMENT'S DRIVER: WHEN a sound starts, never how it sounds.**
 *
 * A sound effect authored in the template — a whoosh as the graphic enters, a hit as it leaves.
 * It plays ONCE per occurrence and never loops: a hold does not repeat it. It joins the same
 * lifecycle calls every content driver answers (`reset` / `start` / `pause` / `resume` / `stop` /
 * `destroy` / `playOutro`), and it NEVER drives a hold — a sound is not content the graphic waits
 * for, so it is in no hold array and `whenComplete` is not part of it.
 *
 * | start         | plays                                                                      |
 * | ------------- | -------------------------------------------------------------------------- |
 * | `entrance`    | at `start()` — the graphic's entrance (a `CG PLAY` / take)                 |
 * | `time`, `ms`  | `ms` after `start()`, on the injected clock; a pause holds the countdown    |
 * | `exit`        | at `playOutro()` — the graphic's exit (`CG STOP`, an auto-exit)            |
 *
 * 🔴 **A hard Clear plays nothing.** Removing the page without an exit never calls `playOutro()`
 * — the page is destroyed (`destroy()`), which silences everything. No exit is no exit sound.
 *
 * ⭐ **An exit sound is never cut by the exit it accompanies.** The runtime awaits every element
 * outro BEFORE the template's own exit animation, so `playOutro()` starts the sound and resolves at
 * once — holding it would delay the visual exit by the sound's length. The root then settles and
 * calls `stop()` on every driver; that `stop()` silences an entrance or timed sound still playing,
 * but lets the exit sound play to its end, because cutting it at the end of the picture's exit
 * would clip every tail longer than the animation. Only a new play (`reset()`), a pause and the
 * page going away (`destroy()`) stop it.
 *
 * A timed sound whose moment has not come when the exit begins does not start at all.
 */

/**
 * What the driver commands: ONE element's sound, from its first sample. The page's
 * implementation (`audio-graph.ts`) applies the volume and the fades; tests pass a fake.
 */
export interface AudioHandle {
  /** Play from the beginning. */
  play(): void;
  /** Pause where it is; `resume()` carries on from there. */
  pause(): void;
  resume(): void;
  /** Silence and rewind. */
  halt(): void;
  /** True while a started sound has not ended, been halted or been paused. */
  playing(): boolean;
}

type State =
  | { readonly kind: 'idle' }
  | { readonly kind: 'armed'; readonly armedAt: number; readonly remaining: number; timer: unknown }
  | { readonly kind: 'armed-paused'; readonly remaining: number }
  | { readonly kind: 'sounding'; readonly exit: boolean; paused: boolean };

export class AudioDriver {
  readonly #handle: AudioHandle;
  readonly #start: AudioStart;
  readonly #now: () => number;
  readonly #setTimeout: (cb: () => void, ms: number) => unknown;
  readonly #clearTimeout: (handle: unknown) => void;
  #state: State = { kind: 'idle' };
  #destroyed = false;

  constructor(opts: { handle: AudioHandle; start: AudioStart; clock?: RuntimeClock | undefined }) {
    this.#handle = opts.handle;
    this.#start = opts.start;
    this.#now = opts.clock?.now ?? (() => performance.now());
    this.#setTimeout = opts.clock?.setTimeout ?? ((cb, ms) => setTimeout(cb, ms));
    this.#clearTimeout =
      opts.clock?.clearTimeout ??
      ((h) => {
        clearTimeout(h as ReturnType<typeof setTimeout>);
      });
  }

  /** A new run: whatever played before — an exit sound included — is silenced. */
  reset(): void {
    this.#cancelArmed();
    if (this.#state.kind === 'sounding') this.#handle.halt();
    this.#state = { kind: 'idle' };
  }

  /** The entrance: an `entrance` sound starts now, a `time` sound is armed for its moment. */
  start(): void {
    if (this.#destroyed) return;
    this.reset();
    if (this.#start.at === 'entrance') this.#sound(false);
    else if (this.#start.at === 'time') this.#arm(Math.max(0, this.#start.ms));
  }

  /** The exit: an `exit` sound starts, and nothing holds the exit — it resolves at once. */
  playOutro(): Promise<void> {
    if (this.#destroyed) return Promise.resolve();
    // A timed sound not yet reached does not start once the graphic is leaving.
    this.#cancelArmed();
    if (this.#state.kind === 'armed' || this.#state.kind === 'armed-paused') {
      this.#state = { kind: 'idle' };
    }
    if (this.#start.at === 'exit') this.#sound(true);
    return Promise.resolve();
  }

  pause(): void {
    const s = this.#state;
    if (s.kind === 'armed') {
      this.#clearTimeout(s.timer);
      const elapsed = this.#now() - s.armedAt;
      this.#state = { kind: 'armed-paused', remaining: Math.max(0, s.remaining - elapsed) };
    } else if (s.kind === 'sounding' && !s.paused) {
      this.#handle.pause();
      s.paused = true;
    }
  }

  resume(): void {
    if (this.#destroyed) return;
    const s = this.#state;
    if (s.kind === 'armed-paused') this.#arm(s.remaining);
    else if (s.kind === 'sounding' && s.paused) {
      this.#handle.resume();
      s.paused = false;
    }
  }

  /**
   * The settle after an exit (and any halt of the scope's content): an entrance or timed sound
   * still playing is silenced; an EXIT sound plays on to its end (see the module header).
   */
  stop(): void {
    this.#cancelArmed();
    const s = this.#state;
    if (s.kind === 'armed' || s.kind === 'armed-paused') {
      this.#state = { kind: 'idle' };
    } else if (s.kind === 'sounding' && !s.exit) {
      this.#handle.halt();
      this.#state = { kind: 'idle' };
    }
  }

  /** The page is going away: silence everything, for good. */
  destroy(): void {
    this.reset();
    this.#destroyed = true;
  }

  /** For the look park: true while something is counting down or sounding. */
  isRunning(): boolean {
    const s = this.#state;
    if (s.kind === 'armed') return true;
    return s.kind === 'sounding' && !s.paused && this.#handle.playing();
  }

  #sound(exit: boolean): void {
    this.#handle.play();
    this.#state = { kind: 'sounding', exit, paused: false };
  }

  #arm(ms: number): void {
    const timer = this.#setTimeout(() => {
      if (this.#state.kind === 'armed') this.#sound(false);
    }, ms);
    this.#state = { kind: 'armed', armedAt: this.#now(), remaining: ms, timer };
  }

  #cancelArmed(): void {
    if (this.#state.kind === 'armed') this.#clearTimeout(this.#state.timer);
  }
}

/** `volumeDb` → a linear gain, clamped to the schema's −60…+6 dB (0.001…≈2.0). Not a number reads as 0 dB. */
export function gainOfDb(db: number): number {
  const v = Number.isFinite(db) ? db : 0;
  const clamped = Math.min(AUDIO_VOLUME_DB_MAX, Math.max(AUDIO_VOLUME_DB_MIN, v));
  return 10 ** (clamped / 20);
}
