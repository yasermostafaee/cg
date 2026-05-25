import type { FrameRange } from '@cg/shared-schema';

export interface FrameDriverOptions {
  frameRate: number;
  range: FrameRange;
  onFrame: (frame: number) => void;
  /** Inject `requestAnimationFrame`/`cancelAnimationFrame` + `now` for tests. */
  raf?: (cb: (timestamp: number) => void) => number;
  cancel?: (handle: number) => void;
  now?: () => number;
}

/**
 * rAF-driven playhead. On `start()`, ticks every animation frame; on each
 * tick computes the current frame index from elapsed wall time and the
 * scene's `frameRate`, looping back to `range.in` when the playhead
 * reaches `range.out`. The runtime owns the FrameDriver and tears it down
 * in `stop()`/`remove()`.
 */
export class FrameDriver {
  private readonly opts: Required<FrameDriverOptions>;
  private handle: number | null = null;
  private startedAt = 0;
  private running = false;

  constructor(opts: FrameDriverOptions) {
    this.opts = {
      ...opts,
      raf: opts.raf ?? ((cb) => requestAnimationFrame(cb)),
      cancel: opts.cancel ?? ((h) => cancelAnimationFrame(h)),
      now: opts.now ?? (() => performance.now()),
    };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.startedAt = this.opts.now();
    // Emit the in-frame synchronously so initial paint matches the
    // playhead before the first rAF tick lands.
    this.opts.onFrame(this.opts.range.in);
    this.schedule();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.handle !== null) {
      this.opts.cancel(this.handle);
      this.handle = null;
    }
  }

  private schedule(): void {
    this.handle = this.opts.raf(() => {
      if (!this.running) return;
      this.tick();
      this.schedule();
    });
  }

  private tick(): void {
    const elapsedMs = this.opts.now() - this.startedAt;
    const totalFrames = (elapsedMs / 1000) * this.opts.frameRate;
    const span = this.opts.range.out - this.opts.range.in;
    const frame =
      span <= 0 ? this.opts.range.in : this.opts.range.in + (Math.floor(totalFrames) % span);
    this.opts.onFrame(frame);
  }
}
