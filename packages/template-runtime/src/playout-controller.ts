import type { FrameRange, Lifecycle, Playout } from '@cg/shared-schema';
import { FrameDriver } from './frame-driver.js';
import type { RuntimeClock } from './types.js';

export interface PlayoutControllerOptions {
  frameRate: number;
  /** The play window (`activeRange ?? frameRange`). */
  active: FrameRange;
  /**
   * The single out-point marker; absent ⇒ an **implicit** out-point at the last
   * active frame (`active.out`), so the whole timeline is the entrance, the hold
   * is the last frame, and the outro is empty.
   */
  lifecycle?: Lifecycle | undefined;
  /** Effective playout (stored defaults already merged with any override). */
  playout: Playout;
  /** Whether the scene has any animated elements (skip the driver if not). */
  hasAnimation: boolean;
  /** Paint every animated element at `frame`. */
  applyFrame: (frame: number) => void;
  /** The final outro is starting — the graphic is going off air. */
  onExitStart: () => void;
  /** Fully settled hidden (outro finished). */
  onSettle: () => void;
  /**
   * D-028 — fired at EVERY hold entry (the intro just finished), before the
   * mode timing (and before `durationHook` on a `content-driven` pass). The
   * runtime starts the scope's ticker treadmills here; they roll continuously
   * across later pass boundaries (start is idempotent).
   */
  onHoldStart?: (() => void) | undefined;
  /**
   * `content-driven` per-pass duration (ms). The ticker supplies the real
   * content→duration computation; recomputed each pass so dynamic content gets
   * a fresh duration. `holdMs` does NOT apply to `content-driven`.
   */
  durationHook?: (() => number) | undefined;
  clock?: RuntimeClock | undefined;
}

type Phase = 'idle' | 'intro' | 'hold' | 'outro';

interface NormalizedClock {
  raf: (cb: (timestamp: number) => void) => number;
  cancel: (handle: number) => void;
  now: () => number;
  setTimeout: (cb: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

/**
 * D-020 — drives a composition's runtime lifecycle and playout timing.
 *
 * The default is **play-once-and-hold**: `play()` runs the full entrance
 * `[active.in → outPoint]` once and holds (frozen) at `outPoint`; `stop()` runs
 * the OUT `[outPoint → active.out]` and settles hidden. An absent `outPoint` is
 * the last active frame, so a composition with no marker plays its whole timeline
 * once and holds the last frame (the outro is empty) — it does **not** loop.
 *
 * `auto-out` runs the OUT automatically after reaching `outPoint` + `holdMs`;
 * `loop-cycle` repeats IN → hold → OUT for `repeat` cycles (or forever when
 * `repeat` is `'infinite'`). `content-driven` runs `repeat` passes (or forever
 * when `'infinite'`), each pass taking its duration from `durationHook` instead
 * of `holdMs`. There is no separate continuous-loop mode — a looping logo is
 * `loop-cycle` with `repeat: 'infinite'` (and `holdMs: 0` to loop the full
 * timeline). `pause()` / `resume()` freeze and continue both the driver and the
 * hold timer.
 */
export class PlayoutController {
  private readonly o: PlayoutControllerOptions;
  private readonly clock: NormalizedClock;

  private driver: FrameDriver | null = null;
  private phase: Phase = 'idle';
  private paused = false;

  // Hold-timer bookkeeping (so pause/resume can freeze the countdown).
  private holdTimer: unknown = null;
  private holdCb: (() => void) | null = null;
  private holdDurationMs = 0;
  private holdStartedAt = 0;
  private holdRemainingMs: number | null = null;

  // Cycles/passes left for `loop-cycle` / `content-driven` (`'infinite'` repeats
  // until stop()).
  private cyclesLeft: number | 'infinite' = 1;
  // Guards `onExitStart` to fire exactly once per exit, before `onSettle`.
  private exitAnnounced = false;
  // D-026 — has this controller finished its lifecycle and settled (its outro ran
  // to the end, or a finite loop-cycle / content-driven completed all its cycles)?
  // A settled controller is DONE: a cascaded `stop()` must NOT replay its exit.
  // Reset by `play()` (via `reset()`); an infinite loop / manual hold / paused
  // scope is NOT settled, so it still exits on stop.
  private settled = false;

  constructor(options: PlayoutControllerOptions) {
    this.o = options;
    const c = options.clock;
    this.clock = {
      raf: c?.raf ?? ((cb): number => requestAnimationFrame(cb)),
      cancel: c?.cancel ?? ((h): void => cancelAnimationFrame(h)),
      now: c?.now ?? ((): number => performance.now()),
      setTimeout: c?.setTimeout ?? ((cb, ms): unknown => setTimeout(cb, ms)),
      clearTimeout:
        c?.clearTimeout ?? ((h): void => clearTimeout(h as ReturnType<typeof setTimeout>)),
    };
  }

  /** Begin playback: play-once-and-hold, or repeat per the cyclic modes. */
  play(): void {
    this.reset();
    this.cyclesLeft = this.cyclic() ? (this.o.playout.repeat ?? 1) : 1;
    this.startIntro();
  }

  /**
   * Take the graphic off air: run the OUT (instant when the outro is empty).
   *
   * D-026 — a SETTLED controller (its lifecycle already finished: auto-out exited,
   * or a finite loop-cycle / content-driven completed its cycles) is a no-op — a
   * cascaded `stop()` from the parent must not replay the exit on a child that's
   * already done. A still-active scope (intro / hold / infinite loop / manual /
   * paused) exits normally.
   */
  stop(): void {
    if (this.settled) return; // already finished — don't replay the exit
    this.clearHold();
    // Force the current cycle to be the last, then play the outro once. An empty
    // outro (`outPoint === active.out`, e.g. no marker) settles instantly.
    this.cyclesLeft = 1;
    if (this.phase === 'outro') return; // already exiting
    this.startOutro();
  }

  /** D-026 — whether this controller has finished its lifecycle and settled. */
  isSettled(): boolean {
    return this.settled;
  }

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.driver?.pause();
    if (this.holdTimer !== null) {
      this.clock.clearTimeout(this.holdTimer);
      this.holdTimer = null;
      this.holdRemainingMs = Math.max(
        0,
        this.holdDurationMs - (this.clock.now() - this.holdStartedAt),
      );
    }
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.driver?.resume();
    if (this.phase === 'hold' && this.holdCb !== null && this.holdRemainingMs !== null) {
      const cb = this.holdCb;
      this.scheduleHold(this.holdRemainingMs, cb);
      this.holdRemainingMs = null;
    }
  }

  /** Hard teardown for `remove()`. */
  destroy(): void {
    this.reset();
  }

  // — internals —————————————————————————————————————————————————————————

  /** The effective out-point: the marker, or the last active frame when absent. */
  private outPoint(): number {
    return this.o.lifecycle?.outPoint ?? this.o.active.out;
  }

  /** Modes that repeat IN → hold → OUT for `repeat` cycles/passes. */
  private cyclic(): boolean {
    const mode = this.o.playout.mode;
    return mode === 'loop-cycle' || mode === 'content-driven';
  }

  private startIntro(): void {
    this.phase = 'intro';
    this.playRange(this.o.active.in, this.outPoint(), () => this.onIntroEnd());
  }

  private onIntroEnd(): void {
    this.phase = 'hold';
    // Frozen hold for v1: the IN played the full `[active.in → outPoint]` and
    // the driver left the graphic painted at `outPoint`; the HOLD simply keeps
    // that frame. (A looping idle while holding is D-021's opt-in, not part of
    // this change.)
    this.stopDriver();
    // D-028 — start (or keep rolling) the scope's tickers before the pass
    // timing is computed, so a content-driven `durationHook` measures a
    // started treadmill.
    this.o.onHoldStart?.();
    const mode = this.o.playout.mode;
    if (mode === 'manual') return; // hold frozen at outPoint until stop()
    // `content-driven`: the pass duration comes from the runtime `durationHook`
    // (the ticker computes content→duration), recomputed each pass; `holdMs`
    // does NOT apply. Every other timed mode holds for `holdMs`.
    const ms =
      mode === 'content-driven' ? (this.o.durationHook?.() ?? 0) : (this.o.playout.holdMs ?? 0);
    this.scheduleHold(ms, () => this.startOutro());
  }

  private startOutro(): void {
    this.clearHold();
    this.phase = 'outro';
    if (this.isFinalOutro()) this.announceExit();
    this.playRange(this.outPoint(), this.o.active.out, () => this.onOutroEnd());
  }

  private onOutroEnd(): void {
    if (this.cyclic()) {
      if (this.cyclesLeft === 'infinite') {
        this.startIntro();
        return;
      }
      this.cyclesLeft -= 1;
      if (this.cyclesLeft >= 1) {
        this.startIntro();
        return;
      }
    }
    this.phase = 'idle';
    this.settled = true;
    this.announceExit();
    this.o.onSettle();
  }

  /** Emit `onExitStart` once per exit (the graphic is going off air). */
  private announceExit(): void {
    if (this.exitAnnounced) return;
    this.exitAnnounced = true;
    this.o.onExitStart();
  }

  /** Whether this outro is the one that ends in settling hidden. */
  private isFinalOutro(): boolean {
    if (!this.cyclic()) return true;
    if (this.cyclesLeft === 'infinite') return false;
    return this.cyclesLeft <= 1;
  }

  /** Play `[inF, outF]` once then call `onEnd`; instant when nothing animates. */
  private playRange(inF: number, outF: number, onEnd: () => void): void {
    this.stopDriver();
    if (!this.o.hasAnimation || outF <= inF) {
      this.o.applyFrame(outF);
      onEnd();
      return;
    }
    this.driver = new FrameDriver({
      frameRate: this.o.frameRate,
      range: { in: inF, out: outF },
      mode: 'once',
      onFrame: this.o.applyFrame,
      onEnd,
      raf: this.clock.raf,
      cancel: this.clock.cancel,
      now: this.clock.now,
    });
    this.driver.start();
  }

  private scheduleHold(ms: number, cb: () => void): void {
    this.holdCb = cb;
    this.holdDurationMs = ms;
    this.holdStartedAt = this.clock.now();
    this.holdTimer = this.clock.setTimeout(() => {
      this.holdTimer = null;
      cb();
    }, ms);
  }

  private clearHold(): void {
    if (this.holdTimer !== null) {
      this.clock.clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
    this.holdCb = null;
    this.holdRemainingMs = null;
  }

  private stopDriver(): void {
    if (this.driver !== null) {
      this.driver.stop();
      this.driver = null;
    }
  }

  private reset(): void {
    this.clearHold();
    this.stopDriver();
    this.phase = 'idle';
    this.paused = false;
    this.exitAnnounced = false;
    this.settled = false;
  }
}
