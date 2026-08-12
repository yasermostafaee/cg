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
 * D-125 PHASE 2 — the composition IN/HOLD/OUT mapping is complete (§D1):
 *
 * | Composition phase | Trigger  | This driver                                 |
 * | ----------------- | -------- | ------------------------------------------- |
 * | IN                | `play()` | `reset()` + `start()` — `[ip → introEnd]`   |
 * | HOLD              | intro end | freeze at `introEnd`, or loop the idle span |
 * | OUT               | `out()` / `stop()` | `playOutro()` — `[outroStart → op]` |
 *
 * The OUT segment is mapped BY PHASE, never rescaled onto the composition's
 * `outPoint`: the element owns its own timing at the authored speed (§D1.1).
 *
 * INVARIANT (§D6.4.1) — **`playOutro()` ALWAYS resolves.** A never-resolving outro
 * would strand the exit and hang the background outro forever (the B-030 failure
 * mode). Every path settles it: a degenerate/absent outro resolves immediately, the
 * final paint is clamped to `op` and then resolves, and `reset()` / `stop()` /
 * `destroy()` settle a still-pending outro (so a superseding `play()` or a hard kill
 * can never leave `out()` awaiting a dead promise).
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
  /**
   * D-125 §D1 — frame where the OUTRO begins; `playOutro()` drives `[outroStart → op]`
   * once. `outroStart >= op` means the element has NO outro (a marker-less clip, or an
   * outro-start authored at the last frame) — a DEGENERATE outro, which `playOutro()`
   * resolves immediately so the exit never strands (§D6.4.1).
   */
  outroStart: number;
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

/**
 * D-135 — WHERE the clip sits at a given elapsed time, resolved through the phase
 * mapping above. The `phase` rides along because the caller's REACTION differs by
 * phase (a freeze hold settles the completion signal; an outro that has reached `op`
 * releases the exit) while the FRAME never does.
 */
type ClipPosition =
  | { frame: number; phase: 'intro' }
  | { frame: number; phase: 'idle-loop' }
  | { frame: number; phase: 'freeze-hold' }
  | { frame: number; phase: 'outro' }
  | { frame: number; phase: 'outro-end' };

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
  /** Which segment `tick()` is driving: the intro/hold mapping or the outro mapping. */
  private mode: 'intro' | 'outro' = 'intro';
  /** Resolver of the in-flight `playOutro()`; null when no outro is pending. */
  private outroResolve: (() => void) | null = null;
  /** Resolver of the current {@link whenComplete} deferred (re-minted by `reset()`). */
  private completeResolve: () => void = () => undefined;
  /** D-125 §D6.3 — the intro-completion signal a `drivesHold` Lottie contributes. */
  private complete: Promise<void>;

  constructor(options: LottieDriverOptions) {
    this.o = options;
    this.raf = options.clock?.raf ?? ((cb) => requestAnimationFrame(cb));
    this.cancel = options.clock?.cancel ?? ((h) => cancelAnimationFrame(h));
    this.now = options.clock?.now ?? ((): number => performance.now());
    this.complete = this.armComplete();
  }

  /**
   * Jump to the in-frame and re-arm for a fresh run (a fresh open/close cycle).
   *
   * B-033 — this RE-MINTS the {@link whenComplete} deferred, so a REPLAY's
   * content-driven hold waits on a PENDING completion instead of the one already
   * resolved last play (which would close the 2nd play instantly). `play()` calls
   * `reset()` before `start()`, so every run gets a fresh signal.
   *
   * It also SETTLES any outro left in flight: a `play()` that supersedes an
   * `out()` mid-outro must not leave that `out()` awaiting forever (§D6.4.1/§D6.4.2).
   */
  reset(): void {
    this.cancelFrame();
    this.settleOutro();
    this.running = false;
    this.settledHold = false;
    this.pausedElapsed = 0;
    this.mode = 'intro';
    this.complete = this.armComplete();
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
    this.mode = 'intro';
    this.paint(this.o.posterFrame ?? this.o.introEnd);
  }

  /** Begin the intro from the in-frame. Idempotent while running or already frozen. */
  start(): void {
    if (this.destroyed || this.running || this.settledHold) return;
    this.mode = 'intro';
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

  /**
   * Halt the rAF (on stop / settle). Leaves the current frame painted.
   *
   * Settles a still-pending outro (§D6.4.1): the driver is being halted, so nothing
   * will ever advance it to `op` — resolving here is what keeps the always-resolve
   * invariant true on the halt path.
   */
  stop(): void {
    this.running = false;
    this.cancelFrame();
    this.settleOutro();
  }

  /** Tear down the lottie-web instance. Idempotent. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stop();
    this.o.handle.destroy();
  }

  /**
   * D-125 §D6.3 — the CONTENT-DRIVEN HOLD signal, kept deliberately separate from
   * {@link playOutro} (the exit seam). The runtime contributes this to the hold
   * aggregation ONLY when the element opts in with `drivesHold === true`.
   *
   * - A **freeze** Lottie resolves when the intro reaches `introEnd` (the hold frame)
   *   — the self-contained-sting case: hold ends at intro-end ⇒ auto-out ⇒ outro plays.
   * - An **idle-loop** Lottie NEVER resolves: it holds until `stop()`, exactly like an
   *   infinite ticker.
   *
   * Re-minted by `reset()` (B-033), so each run's hold waits on that run's completion.
   */
  whenComplete(): Promise<void> {
    return this.complete;
  }

  /**
   * D-125 §D6.2 — THE ELEMENT-OUTRO SEAM. Drive `[outroStart → op]` ONCE off the
   * injected clock, resolving at `op`. Called by the runtime's `out()` / `stop()`
   * BEFORE the background outro, so the background never closes over a Lottie that
   * has not played out (content-first / background-last, as D-105 established).
   *
   * ALWAYS resolves (§D6.4.1) — see the class doc. Independent of `drivesHold`: every
   * `out()`/`stop()` plays the outro whether or not the element gated the hold.
   */
  playOutro(): Promise<void> {
    // Already torn down — nothing to play, and nothing may await a dead driver.
    if (this.destroyed) return Promise.resolve();
    const { outroStart, op } = this.o;
    // DEGENERATE / absent outro (no `phases`, or `outroStart >= op`) — resolve at
    // once so the exit proceeds straight to the background (never a strand).
    if (outroStart >= op) return Promise.resolve();
    // Supersede any outro already in flight, then re-open a frozen hold to drive OUT.
    this.settleOutro();
    this.cancelFrame();
    this.mode = 'outro';
    this.settledHold = false;
    this.running = true;
    this.pausedElapsed = 0;
    this.startedAt = this.now();
    const done = new Promise<void>((res) => {
      this.outroResolve = res;
    });
    // Paint `outroStart` synchronously so the first outro frame lands before the first
    // rAF; `tick()` may finish immediately (a one-frame outro).
    this.tick();
    if (this.running) this.schedule();
    return done;
  }

  private schedule(): void {
    this.handle = this.raf(() => {
      if (!this.running) return;
      this.tick();
      if (this.running) this.schedule();
    });
  }

  /**
   * D-135 — THE frame mapping, and the reason it is a function of its own: the
   * driver's clock (`tick`) and the Designer's PLAYHEAD ({@link positionAt}) resolve
   * the clip frame through THIS call and no other. D-135's acceptance is that scrub
   * and play agree; the cheapest way to guarantee that is for there to be nothing to
   * reconcile — so a second copy of this arithmetic, however faithful, defeats the
   * requirement even while producing identical numbers today.
   *
   * PURE: it reads `this.o` and its arguments, and touches no driver state.
   */
  private clipPositionAt(elapsedMs: number, mode: 'intro' | 'outro'): ClipPosition {
    const { ip, fr, speed, introEnd, holdBehavior, idleIn, idleOut, outroStart, op } = this.o;
    // Derive the frame from ELAPSED TIME (not a tick count), so a dropped / long rAF
    // frame still lands on the right frame — the FrameDriver invariant. A NEGATIVE
    // elapsed (a playhead sitting before the composition's in-point) clamps to the
    // run's start rather than extrapolating backwards past `ip`.
    const advanced = Math.floor((Math.max(0, elapsedMs) / 1000) * fr * speed);
    // OUT phase — [outroStart → op] once (§D1 / §D6.2).
    if (mode === 'outro') {
      const outroFrame = outroStart + advanced;
      // CLAMP the final position to `op` — overshooting would ask lottie-web for a
      // frame that does not exist. `outro-end` is what releases the awaiting exit.
      return outroFrame < op
        ? { frame: outroFrame, phase: 'outro' }
        : { frame: op, phase: 'outro-end' };
    }
    const frame = ip + advanced;
    if (frame < introEnd) return { frame, phase: 'intro' };
    // The intro has played out — HOLD.
    if (holdBehavior === 'idle-loop' && idleOut > idleIn) {
      // Loop the idle segment: keep advancing, wrapping within [idleIn, idleOut).
      const span = idleOut - idleIn;
      const idleFrames = advanced - (introEnd - ip);
      return { frame: idleIn + (idleFrames % span), phase: 'idle-loop' };
    }
    // FREEZE — clamp to the hold frame.
    return { frame: introEnd, phase: 'freeze-hold' };
  }

  private tick(): void {
    const pos = this.clipPositionAt(this.now() - this.startedAt, this.mode);
    this.paint(pos.frame);
    if (pos.phase === 'outro-end') {
      // The FrameDriver.finishOnce pattern: stop ticking, then resolve — resolving
      // here is what releases the awaiting exit.
      this.running = false;
      this.cancelFrame();
      this.settleOutro();
      return;
    }
    if (pos.phase === 'freeze-hold') {
      // Stop ticking (resume() won't reopen it). §D6.3 — the FREEZE hold is the
      // completion point for a `drivesHold` Lottie. The idle-loop phase never reaches
      // here and so never resolves: an idle-loop Lottie holds until stop(), like an
      // infinite ticker.
      this.settledHold = true;
      this.running = false;
      this.cancelFrame();
      this.completeResolve();
    }
  }

  /**
   * D-135 — POSITION the clip at the Designer playhead, through the same mapping the
   * driver's own clock uses ({@link clipPositionAt}). The Designer canvas has no
   * `play()` path at all — its transport advances the store's frame and the canvas
   * posts one `scrub` per change — so SCRUB and PLAY on that surface are the same
   * stream of calls into here, which is precisely why they cannot disagree.
   *
   * `introElapsedMs` is time since the composition's IN (the frame `play()` would have
   * reset+started this clip at). `outroElapsedMs`, when non-null, is time since the
   * composition's OUT-POINT and WINS — the playhead has entered the OUT phase, which
   * on air is `playOutro()`. Both are elapsed TIME, not composition frames: the clip
   * plays at its own authored `fr × speed` and is never rescaled onto the
   * composition's markers (§D1.1).
   *
   * 🔴 A driver that is RUNNING ITS OWN LIFECYCLE — or holding a frame it drove to —
   * OWNS the frame, and this is a no-op for it. The playhead may position a clip that
   * nothing else is driving (the authoring canvas, where every driver sits at its
   * poster); it may never fight a live one, which is what a stray tick reaching a
   * PLAYING host would otherwise do.
   *
   * It does NOT start a clock, mint a completion, or settle an outro: the playhead is
   * the only clock on this path, and a paint is all it is entitled to.
   */
  positionAt(introElapsedMs: number, outroElapsedMs: number | null): void {
    if (this.destroyed || this.running || this.settledHold) return;
    const pos =
      outroElapsedMs === null
        ? this.clipPositionAt(introElapsedMs, 'intro')
        : this.clipPositionAt(outroElapsedMs, 'outro');
    this.paint(pos.frame);
  }

  /** Mint a fresh completion deferred, capturing its resolver (B-033 re-arm). */
  /** Mint a fresh completion deferred, capturing its resolver (B-033 re-arm). */
  private armComplete(): Promise<void> {
    return new Promise<void>((res) => {
      this.completeResolve = res;
    });
  }

  /** Resolve a pending `playOutro()` exactly once. The always-resolve invariant. */
  private settleOutro(): void {
    const res = this.outroResolve;
    if (res === null) return;
    this.outroResolve = null;
    res();
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
