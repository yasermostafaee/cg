import type { ClockTarget } from '@cg/shared-schema';
import { formatCountClock, formatWallClock, type ClockDigits } from './clock-format.js';
import type { RuntimeClock } from './types.js';

/**
 * D-027 — the digital-clock driver, on the ticker's self-wire pattern.
 *
 * One driver owns one clock element's time span: an rAF loop (on the
 * injectable {@link RuntimeClock}) recomputes the formatted string each frame
 * and writes the DOM ONLY when it changes — ≈1 write/second.
 *
 * Two time bases, chosen per mode:
 * - RELATIVE (`countup`, `countdown` with a `duration` target): elapsed =
 *   accumulated ACTIVE time. `pause()` freezes the accumulator; `resume()`
 *   continues with no jump.
 * - ABSOLUTE (`wall`, `countdown` with a `datetime` target): every paint
 *   computes from `clock.now()`. `pause()` merely stops painting; `resume()`
 *   shows the TRUE current value — a real deadline is never delayed.
 *
 * A countdown clamps at 0 and resolves {@link whenComplete} exactly once per
 * run when 0 paints; `reset()` mints a fresh promise (cf. TickerDriver), so
 * each loop-cycle hold entry re-runs the full count. A datetime target
 * already in the past paints 0 and resolves immediately on its run start.
 * `wall`/`countup` never resolve — they are not content sources.
 *
 * Unlike the ticker's clock (performance.now-style), `now` here defaults to
 * `Date.now()`: the absolute modes need a real epoch, and the relative modes
 * only ever subtract two readings, which any monotonic-enough ms source
 * satisfies. An injected test clock's timeline doubles as the epoch (datetime
 * targets in tests are ISO strings near 1970).
 */

export type ClockDriverMode = 'wall' | 'countup' | 'countdown';

export interface ClockDriverOptions {
  /** The time span the driver repaints (the scene-builder's inner span). */
  node: HTMLElement;
  mode: ClockDriverMode;
  format: string;
  digits: ClockDigits;
  /** Required for `countdown` (schema-enforced); ignored otherwise. */
  target?: ClockTarget | undefined;
  clock?: RuntimeClock | undefined;
}

interface NormalizedDriverClock {
  raf: (cb: (timestamp: number) => void) => number;
  cancel: (handle: number) => void;
  now: () => number;
}

/**
 * The text a clock shows BEFORE its run starts (the scene-builder's static
 * render and the driver's `reset()` paint the same value, so the authoring
 * canvas and a between-runs stage can't drift): wall = the time at `nowMs`,
 * countup = zero, countdown = the full target remaining (a past datetime
 * clamps to 0).
 */
export function clockInitialText(
  opts: Pick<ClockDriverOptions, 'mode' | 'format' | 'digits' | 'target'>,
  nowMs: number,
): string {
  if (opts.mode === 'wall') return formatWallClock(new Date(nowMs), opts.format, opts.digits);
  if (opts.mode === 'countup') return formatCountClock(0, opts.format, opts.digits);
  const t = opts.target;
  const remaining = t === undefined ? 0 : t.kind === 'duration' ? t.ms : Date.parse(t.iso) - nowMs;
  return formatCountClock(Math.ceil(Math.max(0, remaining) / 1000), opts.format, opts.digits);
}

export class ClockDriver {
  private readonly o: ClockDriverOptions;
  private readonly clock: NormalizedDriverClock;

  private running = false;
  private paused = false;
  private destroyed = false;
  private startedAt = 0;
  private pausedAt = 0;
  private pausedAccumMs = 0;
  private rafHandle: number | null = null;

  /** Last text written — the repaint-only-on-change gate. */
  private lastText: string | null = null;

  private completed = false;
  private resolveComplete: (() => void) | null = null;
  private completion: Promise<void>;

  constructor(options: ClockDriverOptions) {
    this.o = options;
    this.completion = new Promise<void>((res) => {
      this.resolveComplete = res;
    });
    const c = options.clock;
    this.clock = {
      raf: c?.raf ?? ((cb): number => requestAnimationFrame(cb)),
      cancel: c?.cancel ?? ((h): void => cancelAnimationFrame(h)),
      now: c?.now ?? ((): number => Date.now()),
    };
  }

  /** The element's mode — the runtime filters countdowns as content sources. */
  get mode(): ClockDriverMode {
    return this.o.mode;
  }

  /**
   * Absolute clocks (wall, datetime countdown) track real time, not the hold —
   * the runtime starts them at `play()` so they tick during the intro, while
   * relative counts display their initial value until their hold-entry run.
   */
  get isAbsolute(): boolean {
    return (
      this.o.mode === 'wall' || (this.o.mode === 'countdown' && this.o.target?.kind === 'datetime')
    );
  }

  /**
   * Start a run. The hold entry resets first (`reset()` then `start()`), so
   * every composition cycle re-runs the count; wall/datetime clocks are also
   * started at `play()` so they tick during the intro.
   */
  start(): void {
    if (this.destroyed || this.running) return;
    this.running = true;
    this.paused = false;
    this.startedAt = this.clock.now();
    this.pausedAccumMs = 0;
    this.paint();
    this.scheduleFrame();
  }

  /**
   * D-027 — resolves when this run's countdown reaches zero (a past datetime
   * target resolves immediately on run start). Never resolves for
   * `wall`/`countup` — they are not content sources. A fresh promise is
   * minted per run (constructor + `reset()`).
   */
  whenComplete(): Promise<void> {
    return this.completion;
  }

  /** Freeze the displayed time (lockstep with the playout controller). */
  pause(): void {
    if (!this.running || this.paused) return;
    this.paused = true;
    this.pausedAt = this.clock.now();
    this.cancelFrame();
  }

  /**
   * Continue: a relative count picks up with no jump; an absolute clock
   * repaints the true current value immediately.
   */
  resume(): void {
    if (!this.running || !this.paused) return;
    this.pausedAccumMs += this.clock.now() - this.pausedAt;
    this.paused = false;
    this.paint();
    this.scheduleFrame();
  }

  /** Stop ticking, freezing the DOM at the stop moment (scope settled). */
  stop(): void {
    if (this.running && !this.paused) this.paint();
    this.running = false;
    this.paused = false;
    this.cancelFrame();
  }

  /**
   * Full reset for a fresh run: stop, clear the active-time accumulator,
   * mint a fresh completion, and repaint the initial value (countdown = the
   * full target, countup = zero, wall = now).
   */
  reset(): void {
    this.stop();
    this.pausedAccumMs = 0;
    this.completed = false;
    this.completion = new Promise<void>((res) => {
      this.resolveComplete = res;
    });
    const text = clockInitialText(this.o, this.clock.now());
    this.o.node.textContent = text;
    this.lastText = text;
  }

  destroy(): void {
    this.reset();
    this.destroyed = true;
  }

  // — internals ————————————————————————————————————————————————————————

  /** Active (unpaused) ms since this run's start — the RELATIVE time base. */
  private activeElapsedMs(): number {
    if (!this.running) return 0;
    const nowMs = this.paused ? this.pausedAt : this.clock.now();
    return nowMs - this.startedAt - this.pausedAccumMs;
  }

  /** Countdown ms left (may be negative; callers clamp). */
  private remainingMs(): number {
    const t = this.o.target;
    if (t === undefined) return 0;
    if (t.kind === 'duration') return t.ms - this.activeElapsedMs();
    return Date.parse(t.iso) - this.clock.now();
  }

  private currentText(): string {
    const o = this.o;
    if (o.mode === 'wall') return formatWallClock(new Date(this.clock.now()), o.format, o.digits);
    if (o.mode === 'countup') {
      return formatCountClock(Math.floor(this.activeElapsedMs() / 1000), o.format, o.digits);
    }
    // Countdown displays ceil(remaining): it shows the full value at start and
    // hits 00:00 exactly when the remaining time does.
    return formatCountClock(Math.ceil(Math.max(0, this.remainingMs()) / 1000), o.format, o.digits);
  }

  /** One step: write the DOM only when the formatted string changed. */
  private paint(): void {
    const next = this.currentText();
    if (next !== this.lastText) {
      this.o.node.textContent = next;
      this.lastText = next;
    }
    // Clean end: the run completes when 0 paints — then this driver signals
    // its scope and freezes (the display stays clamped at 00:00).
    if (this.o.mode === 'countdown' && !this.completed && this.remainingMs() <= 0) {
      this.fireComplete();
      this.running = false;
      this.paused = false;
      this.cancelFrame();
    }
  }

  private fireComplete(): void {
    if (this.completed) return;
    this.completed = true;
    this.resolveComplete?.();
  }

  private scheduleFrame(): void {
    this.rafHandle = this.clock.raf(() => {
      this.rafHandle = null;
      if (!this.running || this.paused) return;
      this.paint();
      this.scheduleFrame();
    });
  }

  private cancelFrame(): void {
    if (this.rafHandle !== null) {
      this.clock.cancel(this.rafHandle);
      this.rafHandle = null;
    }
  }
}
