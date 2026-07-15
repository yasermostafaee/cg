import type { LottiePlayerHandle } from '@cg/lottie-bridge';
import type { RuntimeClock } from './types.js';

/**
 * D-125 §D3 — the driven-frame Lottie driver. The Lottie is a RENDERER, never an
 * autonomous player: this driver advances it with `goToAndStop(frame)` once per
 * tick, computing the frame from ELAPSED ACTIVE TIME × `fr` × `speed` off the
 * injected {@link RuntimeClock} — exactly how {@link FrameDriver} and the
 * ticker/clock/sequence drivers derive their state. So pause/resume freezes and
 * continues in lockstep with the rest of the scene (no wall-clock drift), and the
 * whole thing is deterministic under a fake clock.
 *
 * On `start()` the intro plays `[ip, introEnd]` ONCE; then the element HOLDS —
 * FREEZING at `introEnd` (default) or LOOPING the idle segment `[idleIn, idleOut]`.
 *
 * D-125 PHASE 1 scope: render + pause/resume/reset only. The composition
 * IN/HOLD/OUT integration — `playOutro()` (the element-outro seam) and the
 * content-driven-hold `whenComplete()` contribution — lands in Phase 2. This
 * driver therefore has no outro and does not gate any hold.
 */
export interface LottieDriverOptions {
  /** The mounted `lottie_light` player this driver drives frame-by-frame. */
  handle: LottiePlayerHandle;
  /** Animation frame rate (from the JSON `fr`). */
  fr: number;
  /** Animation in-point (`ip`) — where the intro starts. */
  ip: number;
  /** Animation out-point (`op`) — the last frame. */
  op: number;
  /** Playback speed multiplier. */
  speed: number;
  /** Frame where the intro ends and the hold begins (`ip ≤ introEnd ≤ op`). */
  introEnd: number;
  /** Idle-loop range start (only used for `holdBehavior: 'idle-loop'`). */
  idleIn: number;
  /** Idle-loop range end. */
  idleOut: number;
  /** HOLD behaviour after the intro: freeze at `introEnd`, or loop the idle segment. */
  holdBehavior: 'freeze' | 'idle-loop';
  /**
   * D-125 — the frame the STATIC editor canvas parks on (a design surface that never
   * plays). Defaults to {@link introEnd}. The runtime passes the clip MIDPOINT for a
   * MARKER-LESS clip, whose {@link introEnd} falls back to `op` (the LAST frame) — often
   * the outro-END, where a real AE "furniture" clip has animated the graphic OFF
   * (invisible). Parking there shows an empty box; the midpoint sits in the visible held
   * region. See {@link LottieDriver.poster}.
   */
  posterFrame?: number | undefined;
  /** Injected rAF/timer clock for deterministic tests; defaults to the platform. */
  clock?: RuntimeClock | undefined;
}

export class LottieDriver {
  private readonly o: LottieDriverOptions;
  private readonly raf: (cb: (t: number) => void) => number;
  private readonly cancel: (h: number) => void;
  private readonly now: () => number;

  private handle: number | null = null;
  private running = false;
  private startedAt = 0;
  /** Elapsed ms captured at `pause()`, replayed by `resume()`. */
  private pausedElapsed = 0;
  /** True once a FREEZE hold is reached — resume() must NOT un-freeze it. */
  private settledHold = false;
  private destroyed = false;

  constructor(options: LottieDriverOptions) {
    this.o = options;
    this.raf = options.clock?.raf ?? ((cb) => requestAnimationFrame(cb));
    this.cancel = options.clock?.cancel ?? ((h) => cancelAnimationFrame(h));
    this.now = options.clock?.now ?? ((): number => performance.now());
  }

  /** Jump to the in-frame and re-arm for a fresh run (a fresh open/close cycle). */
  reset(): void {
    this.cancelFrame();
    this.running = false;
    this.settledHold = false;
    this.pausedElapsed = 0;
    this.paint(this.o.ip);
  }

  /**
   * D-125 — paint a REPRESENTATIVE, VISIBLE static frame for a design surface that never
   * plays (the editor canvas). Both ENDS of a furniture clip are commonly blank: `ip` is
   * the intro-START (animated ON from nothing) and `op` is the outro-END (animated OFF to
   * nothing), so parking at either shows an empty box. The runtime supplies
   * {@link LottieDriverOptions.posterFrame} — the marked hold-start (`introEnd`) when the
   * clip has phase markers, else the clip MIDPOINT (in the held/visible region), NEVER
   * `op`. Absent an explicit poster frame this falls back to `introEnd`. The play() path
   * calls {@link reset} (→ `ip`), so the intro still plays from the start when played.
   */
  poster(): void {
    this.cancelFrame();
    this.running = false;
    this.settledHold = false;
    this.pausedElapsed = 0;
    this.paint(this.o.posterFrame ?? this.o.introEnd);
  }

  /** Begin the intro from the in-frame. Idempotent while running or already frozen. */
  start(): void {
    if (this.destroyed || this.running || this.settledHold) return;
    this.running = true;
    this.startedAt = this.now();
    // Paint the in-frame synchronously so the first frame matches before the first
    // rAF lands; `tick()` may settle immediately (a zero-length intro).
    this.tick();
    if (this.running) this.schedule();
  }

  /** Freeze at the current frame (no-op if not running — e.g. already frozen). */
  pause(): void {
    if (!this.running) return;
    this.pausedElapsed = this.now() - this.startedAt;
    this.running = false;
    this.cancelFrame();
  }

  /** Continue from the frame captured by `pause()`; a freeze hold stays frozen. */
  resume(): void {
    if (this.destroyed || this.running || this.settledHold) return;
    this.running = true;
    this.startedAt = this.now() - this.pausedElapsed;
    this.schedule();
  }

  /** Halt the rAF (on stop / settle). Leaves the current frame painted. */
  stop(): void {
    this.running = false;
    this.cancelFrame();
  }

  /** Tear down the lottie-web instance. Idempotent. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stop();
    this.o.handle.destroy();
  }

  private schedule(): void {
    this.handle = this.raf(() => {
      if (!this.running) return;
      this.tick();
      if (this.running) this.schedule();
    });
  }

  private tick(): void {
    // Derive the frame from ELAPSED WALL-TIME (not a tick count), so a dropped /
    // long rAF frame still lands on the right frame — the FrameDriver invariant.
    const elapsedMs = this.now() - this.startedAt;
    const { ip, fr, speed, introEnd, holdBehavior, idleIn, idleOut } = this.o;
    const advanced = Math.floor((elapsedMs / 1000) * fr * speed);
    const frame = ip + advanced;
    if (frame < introEnd) {
      this.paint(frame);
      return;
    }
    // The intro has played out — HOLD.
    if (holdBehavior === 'idle-loop' && idleOut > idleIn) {
      // Loop the idle segment: keep advancing, wrapping within [idleIn, idleOut).
      const span = idleOut - idleIn;
      const idleFrames = advanced - (introEnd - ip);
      this.paint(idleIn + (idleFrames % span));
      return;
    }
    // FREEZE — clamp to the hold frame and stop ticking (resume() won't reopen it).
    this.paint(introEnd);
    this.settledHold = true;
    this.running = false;
    this.cancelFrame();
  }

  private paint(frame: number): void {
    if (this.destroyed) return;
    this.o.handle.goToFrame(frame);
  }

  private cancelFrame(): void {
    if (this.handle !== null) {
      this.cancel(this.handle);
      this.handle = null;
    }
  }
}
