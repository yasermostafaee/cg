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
   * hold timing starts. The runtime resets + starts the scope's ticker
   * treadmills here — each composition cycle gets a FRESH crawl run.
   */
  onHoldStart?: (() => void) | undefined;
  /**
   * D-028 — content-completion supplier for `holdSource: 'content-driven'`:
   * invoked at each hold entry; the hold lasts until the returned promise
   * resolves (all the scope's finite tickers done). Returning `null` (no
   * content elements in scope) ⇒ a zero-length hold. A promise that never
   * resolves (an infinite ticker) holds until `stop()`. Stale resolutions
   * (after stop / a later cycle) are ignored via a hold token.
   */
  waitForContent?: (() => Promise<void> | null) | undefined;
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
 * D-020/D-028 — drives a composition's runtime lifecycle and playout timing.
 *
 * The default is **play-once-and-hold**: `play()` runs the full entrance
 * `[active.in → outPoint]` once and holds (frozen) at `outPoint`; `stop()` runs
 * the OUT `[outPoint → active.out]` and settles hidden. An absent `outPoint` is
 * the last active frame, so a composition with no marker plays its whole timeline
 * once and holds the last frame (the outro is empty) — it does **not** loop.
 *
 * Two orthogonal axes (D-028): `mode` counts open/close cycles — `auto-out` runs
 * the OUT automatically after one hold; `loop-cycle` repeats IN → hold → OUT for
 * `repeat` cycles (or forever when `'infinite'`). `holdSource` decides what ends
 * each hold — `timed` holds for `holdMs`; `content-driven` holds until
 * `waitForContent`'s promise resolves (the scope's tickers complete; an infinite
 * ticker never resolves, holding until `stop()`; no content ⇒ a zero-length
 * hold). There is no separate continuous-loop mode — a looping logo is
 * `loop-cycle` with `repeat: 'infinite'` (and `holdMs: 0` to loop the full
 * timeline). `pause()` / `resume()` freeze and continue both the driver and the
 * hold timer (a content hold needs no freeze bookkeeping — pausing the runtime
 * pauses the tickers, so completion simply arrives later).
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

  // Cycles left for `loop-cycle` (`'infinite'` repeats until stop()).
  private cyclesLeft: number | 'infinite' = 1;
  // D-028 — identifies the CURRENT content hold; bumped by stop()/reset()/
  // startOutro() so a stale `waitForContent` resolution (after stop, or from a
  // previous cycle) can never trigger a second outro.
  private holdToken = 0;
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

  /** Modes that repeat IN → hold → OUT for `repeat` cycles. */
  private cyclic(): boolean {
    return this.o.playout.mode === 'loop-cycle';
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
    // D-028 — every hold entry gets a FRESH content run (the runtime resets +
    // starts the scope's tickers here), so each loop-cycle pass replays the
    // crawl from its entering edge.
    this.o.onHoldStart?.();
    if (this.o.playout.mode === 'manual') return; // hold frozen until stop()
    if (this.o.playout.holdSource === 'content-driven') {
      // The hold lasts until the scope's content completes. A token guards
      // against stale resolutions (stop()/a later cycle); a null wait (no
      // content elements) is a zero-length hold.
      const token = ++this.holdToken;
      const wait = this.o.waitForContent?.() ?? null;
      if (wait === null) {
        // Zero-length hold — but DEFER the outro (a 0ms timer, exactly like a
        // timed hold of 0): a synchronous outro would let a zero-hold ROOT
        // settle — and cascade stop() — before its children even received the
        // play() cascade.
        this.scheduleHold(0, () => this.startOutro());
        return;
      }
      void wait.then(() => {
        if (token === this.holdToken && this.phase === 'hold') this.startOutro();
      });
      return;
    }
    this.scheduleHold(this.o.playout.holdMs ?? 0, () => this.startOutro());
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
    // Invalidate any pending content-completion resolution along with the
    // timer — clearHold runs on stop(), outro start, and reset(), which are
    // exactly the moments a stale `waitForContent` promise must be ignored.
    this.holdToken += 1;
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
