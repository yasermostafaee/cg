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
  /**
   * D-084 — optional IANA time zone for `wall` mode (e.g. 'Europe/London').
   * Absent ⇒ machine-local time. `countup`/`countdown` ignore it.
   */
  timezone?: string | undefined;
  /**
   * D-103 — when true, the colon separator(s) blink: the formatted time is rendered as
   * segment spans and ONLY the colon spans' opacity toggles (no reflow). Off ⇒ the prior
   * single-`textContent` render. Applies to all modes.
   */
  blinkColon?: boolean | undefined;
  /** D-103 — colon blink half-period in ms (phase = `floor(now / period) % 2`). Absent ⇒ 1000. */
  blinkPeriodMs?: number | undefined;
  clock?: RuntimeClock | undefined;
}

interface NormalizedDriverClock {
  raf: (cb: (timestamp: number) => void) => number;
  cancel: (handle: number) => void;
  now: () => number;
}

/**
 * The text a clock shows BEFORE its run starts — the scene-builder's static
 * render and the driver's `reset()` both compute it with THIS rule, so the
 * authoring canvas and a between-runs stage can't drift in semantics:
 * wall = the time at `nowMs`, countup = zero, countdown = the target
 * remaining at `nowMs`. Note the time-dependent cases are recomputed at each
 * call by design — a wall value or a datetime target's remaining naturally
 * differs between build time and a later `reset()` (the deadline is absolute
 * and keeps approaching); only a duration countdown is a constant.
 */
export function clockInitialText(
  opts: Pick<ClockDriverOptions, 'mode' | 'format' | 'digits' | 'target' | 'timezone'>,
  nowMs: number,
): string {
  if (opts.mode === 'wall')
    return formatWallClock(new Date(nowMs), opts.format, opts.digits, opts.timezone);
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

  /** D-103 — colon-blink state: the current colon spans + the last opacity phase written. */
  private colonSpans: HTMLElement[] = [];
  private lastColonVisible: boolean | null = null;
  /** Whether the node currently holds the blink SEGMENT spans (vs a plain `textContent`). */
  private blinkBuilt = false;

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
    // D-103 — back to a steady single-`textContent` value; the run's first paint re-segments
    // for the blink if `blinkColon` is on.
    this.blinkBuilt = false;
    this.colonSpans = [];
    this.lastColonVisible = null;
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
    if (o.mode === 'wall')
      return formatWallClock(new Date(this.clock.now()), o.format, o.digits, o.timezone);
    if (o.mode === 'countup') {
      return formatCountClock(Math.floor(this.activeElapsedMs() / 1000), o.format, o.digits);
    }
    // Countdown displays ceil(remaining): it shows the full value at start and
    // hits 00:00 exactly when the remaining time does.
    return formatCountClock(Math.ceil(Math.max(0, this.remainingMs()) / 1000), o.format, o.digits);
  }

  /** One step: write the DOM only when the formatted string changed (or the colon phase flips). */
  private paint(): void {
    const next = this.currentText();
    if (this.o.blinkColon === true) {
      this.paintBlink(next);
    } else if (next !== this.lastText) {
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

  /**
   * D-103 — render the time as colon / non-colon segment spans and toggle ONLY the colon
   * spans' OPACITY from the time source. Rebuild the segments when the text changes (the
   * digits tick) or the node isn't segmented yet; flip opacity when the blink phase changes.
   */
  private paintBlink(next: string): void {
    if (!this.blinkBuilt || next !== this.lastText) {
      this.renderColonSegments(next);
      this.lastText = next;
      this.blinkBuilt = true;
      this.lastColonVisible = null; // force the opacity (re)apply below
    }
    const visible = Math.floor(this.clock.now() / (this.o.blinkPeriodMs ?? 1000)) % 2 === 0;
    if (visible !== this.lastColonVisible) {
      for (const span of this.colonSpans) span.style.opacity = visible ? '1' : '0';
      this.lastColonVisible = visible;
    }
  }

  /**
   * Split `text` into runs of `:` (colon spans — the ones that blink) and non-`:` (digit
   * spans), all inside the time node. The colon char is never a mapped digit, so this works
   * for Persian/Arabic-Indic output unchanged. Only the OPACITY of the colon spans toggles, so
   * the digit boxes never reflow.
   */
  private renderColonSegments(text: string): void {
    const node = this.o.node;
    const doc = node.ownerDocument;
    node.textContent = '';
    this.colonSpans = [];
    let i = 0;
    while (i < text.length) {
      const isColon = text[i] === ':';
      let j = i + 1;
      while (j < text.length && (text[j] === ':') === isColon) j += 1;
      const span = doc.createElement('span');
      span.textContent = text.slice(i, j);
      if (isColon) {
        span.dataset['cgClockColon'] = '1';
        this.colonSpans.push(span);
      }
      node.appendChild(span);
      i = j;
    }
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
