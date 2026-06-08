import type { FrameRange, Lifecycle, Playout } from '@cg/shared-schema';
import { FrameDriver } from './frame-driver.js';
import type { RuntimeClock } from './types.js';

export interface PlayoutControllerOptions {
  frameRate: number;
  /** The play window (`activeRange ?? frameRange`). */
  active: FrameRange;
  /** Phase markers; absent ⇒ legacy behaviour (loop the active range). */
  lifecycle?: Lifecycle | undefined;
  playout: Playout;
  /** Whether the scene has any animated elements (skip the driver if not). */
  hasAnimation: boolean;
  /** Paint every animated element at `frame`. */
  applyFrame: (frame: number) => void;
  /** The final outro is starting — the graphic is going off air. */
  onExitStart: () => void;
  /** Fully settled hidden (outro finished). */
  onSettle: () => void;
  /** `content-driven` hold duration (ms); falls back to `playout.holdMs`. */
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
 * - No `lifecycle`: loops the active range forever (the legacy `FrameDriver`
 *   behaviour), so scenes authored before this change play exactly as before.
 * - With `lifecycle`: `play()` runs the IN once and holds at the intro-end
 *   frame; `stop()` runs the OUT and settles hidden. `auto-out` runs the OUT
 *   automatically after `holdMs`; `loop-cycle` repeats IN → hold → OUT for
 *   `repeat` cycles (or until `stop()`); `content-driven` uses `durationHook`
 *   for the hold. `pause()` / `resume()` freeze and continue both the driver
 *   and the hold timer.
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

  // Cycles left for `loop-cycle` (`'infinite'` loops until stop()).
  private cyclesLeft: number | 'infinite' = 1;
  // Guards `onExitStart` to fire exactly once per exit, before `onSettle`.
  private exitAnnounced = false;

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

  /** Begin playback: legacy loop, or the lifecycle IN → hold. */
  play(): void {
    this.reset();
    if (this.o.lifecycle === undefined) {
      if (this.o.hasAnimation) this.startLoop();
      return;
    }
    this.cyclesLeft = this.o.playout.mode === 'loop-cycle' ? (this.o.playout.repeat ?? 1) : 1;
    this.startIntro();
  }

  /** Take the graphic off air: run the final OUT (or settle instantly). */
  stop(): void {
    this.clearHold();
    if (this.o.lifecycle === undefined) {
      this.stopDriver();
      this.announceExit();
      this.o.onSettle();
      return;
    }
    // Force the current cycle to be the last, then play the outro once.
    this.cyclesLeft = 1;
    if (this.phase === 'outro') return; // already exiting
    this.startOutro();
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

  private startLoop(): void {
    this.stopDriver();
    this.phase = 'hold';
    this.driver = new FrameDriver({
      frameRate: this.o.frameRate,
      range: this.o.active,
      mode: 'loop',
      onFrame: this.o.applyFrame,
      raf: this.clock.raf,
      cancel: this.clock.cancel,
      now: this.clock.now,
    });
    this.driver.start();
  }

  private startIntro(): void {
    const lc = this.o.lifecycle;
    if (lc === undefined) return;
    this.phase = 'intro';
    this.playRange(this.o.active.in, lc.introEndFrame, () => this.onIntroEnd());
  }

  private onIntroEnd(): void {
    this.phase = 'hold';
    // The HOLD plays the idle segment `[introEndFrame, outroStartFrame]` on a
    // loop (a spinning logo, a pulsing dot, …). When the two markers coincide
    // there is no segment, so the graphic simply holds the frozen intro-end
    // frame. Either way the frames between IN and OUT are now visible.
    this.startIdleLoop();
    const mode = this.o.playout.mode;
    if (mode === 'manual') return; // loop the idle segment until stop()
    const ms =
      mode === 'content-driven'
        ? (this.o.durationHook?.() ?? this.o.playout.holdMs ?? 0)
        : (this.o.playout.holdMs ?? 0);
    this.scheduleHold(ms, () => this.startOutro());
  }

  /** Loop the held idle segment during HOLD; freeze when it's empty. */
  private startIdleLoop(): void {
    const lc = this.o.lifecycle;
    if (lc === undefined || !this.o.hasAnimation) return;
    if (lc.outroStartFrame <= lc.introEndFrame) return; // no idle segment — freeze
    this.stopDriver();
    this.driver = new FrameDriver({
      frameRate: this.o.frameRate,
      range: { in: lc.introEndFrame, out: lc.outroStartFrame },
      mode: 'loop',
      onFrame: this.o.applyFrame,
      raf: this.clock.raf,
      cancel: this.clock.cancel,
      now: this.clock.now,
    });
    this.driver.start();
  }

  private startOutro(): void {
    const lc = this.o.lifecycle;
    if (lc === undefined) return;
    this.clearHold();
    this.phase = 'outro';
    if (this.isFinalOutro()) this.announceExit();
    this.playRange(lc.outroStartFrame, this.o.active.out, () => this.onOutroEnd());
  }

  private onOutroEnd(): void {
    if (this.o.playout.mode === 'loop-cycle') {
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
    if (this.o.playout.mode !== 'loop-cycle') return true;
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
  }
}
