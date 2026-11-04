import type { FrameRange } from '@cg/shared-schema';

export interface FrameDriverOptions {
  frameRate: number;
  range: FrameRange;
  onFrame: (frame: number) => void;
  /**
   * `'loop'` (default, legacy) replays `[range.in, range.out)` forever — the
   * behaviour scenes without a lifecycle keep. `'once'` plays `[range.in,
   * range.out]` a single time, holds at `range.out`, and calls `onEnd` — the
   * building block for the IN→hold and OUT phases (D-020).
   */
  mode?: 'loop' | 'once';
  /** Called once when a `'once'` range reaches its end. Ignored for `'loop'`. */
  onEnd?: () => void;
  /** Inject `requestAnimationFrame`/`cancelAnimationFrame` + `now` for tests. */
  raf?: (cb: (timestamp: number) => void) => number;
  cancel?: (handle: number) => void;
  now?: () => number;
}

interface NormalizedOptions {
  frameRate: number;
  range: FrameRange;
  onFrame: (frame: number) => void;
  mode: 'loop' | 'once';
  onEnd: () => void;
  raf: (cb: (timestamp: number) => void) => number;
  cancel: (handle: number) => void;
  now: () => number;
}

/**
 * rAF-driven playhead. On `start()`, ticks every animation frame; on each tick
 * computes the current frame index from elapsed wall time and the scene's
 * `frameRate`. In `'loop'` mode it wraps back to `range.in` at `range.out`; in
 * `'once'` mode it stops at `range.out`, holds, and fires `onEnd`. `pause()`
 * freezes the playhead at its current frame and `resume()` continues from there.
 * The runtime (via the PlayoutController) owns the FrameDriver and tears it down.
 */
export class FrameDriver {
  private readonly opts: NormalizedOptions;
  private handle: number | null = null;
  private startedAt = 0;
  /** Elapsed ms captured at `pause()`, replayed by `resume()`. */
  private elapsedAtPause = 0;
  private running = false;
  private ended = false;
  /**
   * A graceful-exit request for a looping range. The target is expressed in elapsed
   * frames (rather than a wall-clock timestamp) so Pause/Resume keeps the remaining
   * part of the current pass intact.
   */
  private finishLoopAtElapsedFrame: number | null = null;
  private finishLoopCb: (() => void) | null = null;

  constructor(opts: FrameDriverOptions) {
    this.opts = {
      frameRate: opts.frameRate,
      range: opts.range,
      onFrame: opts.onFrame,
      mode: opts.mode ?? 'loop',
      onEnd: opts.onEnd ?? ((): void => undefined),
      raf: opts.raf ?? ((cb) => requestAnimationFrame(cb)),
      cancel: opts.cancel ?? ((h) => cancelAnimationFrame(h)),
      now: opts.now ?? (() => performance.now()),
    };
  }

  start(): void {
    if (this.running || this.ended) return;
    this.running = true;
    this.startedAt = this.opts.now();
    // Emit the in-frame synchronously so initial paint matches the
    // playhead before the first rAF tick lands.
    this.opts.onFrame(this.opts.range.in);
    // A zero-or-negative `'once'` span has nothing to play — end immediately.
    if (this.opts.mode === 'once' && this.opts.range.out <= this.opts.range.in) {
      this.finishOnce();
      return;
    }
    this.schedule();
  }

  stop(): void {
    this.running = false;
    if (this.handle !== null) {
      this.opts.cancel(this.handle);
      this.handle = null;
    }
  }

  /**
   * Finish the loop pass that is currently on screen, paint `range.out`, then stop.
   *
   * This is deliberately a request on the existing clock rather than a new `once`
   * driver: the current pass keeps its elapsed position, dropped-frame correction and
   * Pause/Resume bookkeeping. Returns `false` when this is not a non-empty loop.
   */
  finishCurrentLoop(onEnd: () => void): boolean {
    const span = this.opts.range.out - this.opts.range.in;
    if (this.opts.mode !== 'loop' || span <= 0 || this.ended) return false;
    // Idempotent: the first request owns this pass boundary. Replacing the callback
    // could make two independent exit paths race at the seam.
    if (this.finishLoopAtElapsedFrame !== null) return true;
    const elapsedMs = this.running ? this.opts.now() - this.startedAt : this.elapsedAtPause;
    const elapsedFrames = Math.max(0, Math.floor((elapsedMs / 1000) * this.opts.frameRate));
    this.finishLoopAtElapsedFrame = (Math.floor(elapsedFrames / span) + 1) * span;
    this.finishLoopCb = onEnd;
    return true;
  }

  /** Freeze the playhead at the current frame (no-op if not running). */
  pause(): void {
    if (!this.running) return;
    this.elapsedAtPause = this.opts.now() - this.startedAt;
    this.running = false;
    if (this.handle !== null) {
      this.opts.cancel(this.handle);
      this.handle = null;
    }
  }

  /** Continue from the frame captured by `pause()`. */
  resume(): void {
    if (this.running || this.ended) return;
    this.running = true;
    this.startedAt = this.opts.now() - this.elapsedAtPause;
    this.schedule();
  }

  private schedule(): void {
    this.handle = this.opts.raf(() => {
      if (!this.running) return;
      this.tick();
      if (this.running) this.schedule();
    });
  }

  private tick(): void {
    // Derive the frame from ELAPSED WALL-TIME, not a tick count: a dropped/long
    // rAF frame still lands on the right frame index, so playback can't desync.
    const elapsedMs = this.opts.now() - this.startedAt;
    const totalFrames = Math.floor((elapsedMs / 1000) * this.opts.frameRate);
    const { in: rin, out: rout } = this.opts.range;
    if (this.opts.mode === 'once') {
      const frame = rin + totalFrames;
      if (frame >= rout) {
        // Clamp the final paint to `out` (don't overshoot) then settle.
        this.opts.onFrame(rout);
        this.finishOnce();
        return;
      }
      this.opts.onFrame(frame);
      return;
    }
    // Loop: wrap the elapsed frame count back into [in, out) via modulo. A
    // zero-or-negative span has no room to advance, so hold at `in` (also avoids
    // a modulo-by-zero).
    const span = rout - rin;
    if (this.finishLoopAtElapsedFrame !== null && totalFrames >= this.finishLoopAtElapsedFrame) {
      // Unlike an ordinary loop seam, a graceful exit exposes the authored end frame
      // and leaves it painted for the Outro to continue from. Never emit `rin` first.
      this.opts.onFrame(rout);
      this.finishRequestedLoop();
      return;
    }
    const frame = span <= 0 ? rin : rin + (totalFrames % span);
    this.opts.onFrame(frame);
  }

  private finishRequestedLoop(): void {
    this.ended = true;
    this.running = false;
    if (this.handle !== null) {
      this.opts.cancel(this.handle);
      this.handle = null;
    }
    const cb = this.finishLoopCb;
    this.finishLoopCb = null;
    this.finishLoopAtElapsedFrame = null;
    cb?.();
  }

  private finishOnce(): void {
    this.ended = true;
    this.running = false;
    if (this.handle !== null) {
      this.opts.cancel(this.handle);
      this.handle = null;
    }
    this.opts.onEnd();
  }
}
