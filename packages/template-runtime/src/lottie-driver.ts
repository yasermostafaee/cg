import type { LottiePlayerHandle } from '@cg/lottie-bridge';
import type { RuntimeClock } from './types.js';
import { OUTRO_BACKSTOP_MARGIN_MS } from './video-driver.js';

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
  /**
   * media-phases-follow-composition — where the INTRO WINDOW begins. Defaults to `ip` (the
   * shipped behaviour for every markers/manual clip). A FOLLOW-source clip's window is anchored
   * at the hold time `H`: the intro is `[H − entranceSpan → H]`, skipping as much of the clip's
   * head as the composition's entrance cannot fit — so the clip reaches its hold look EXACTLY
   * at the effective content start. Honoured inside {@link clipPositionAt} (and `reset()`'s
   * park frame) ONLY — the one mapping, never a branch beside it.
   */
  introStart?: number | undefined;
  /**
   * Session Y — comp-side WAIT (ms of active time) before the intro starts: a follow clip
   * whose AUTHORED intro is shorter than the entrance parks on the intro start frame, then
   * plays so the intro FINISHES at the content start. Honoured inside {@link clipPositionAt}
   * only — the one mapping, never beside it. Default 0.
   */
  introDelayMs?: number | undefined;
  /** Frame where the intro ends and the hold begins (`ip ≤ introEnd ≤ op`). */
  introEnd: number;
  /**
   * D-125 §D1 — frame where the OUTRO begins; `playOutro()` drives `[outroStart → op]`
   * once. `outroStart >= op` means the element has NO outro (a marker-less clip, or an
   * outro-start authored at the last frame) — a DEGENERATE outro, which `playOutro()`
   * resolves immediately so the exit never strands (§D6.4.1).
   */
  outroStart: number;
  /**
   * media-phases-follow-composition — where the OUTRO WINDOW ends. Defaults to `op` (the
   * shipped behaviour). A FOLLOW-source clip's outro is `[H → min(H + outSpan, clipEnd)]` —
   * CONTINUOUS from the held frame (no hold→outro pop by construction) and sized to the
   * composition's OUT segment, so `playOutro()` resolves at `outroEnd`, never driving on to a
   * clip tail the OUT segment has no time for. Honoured inside {@link clipPositionAt} only.
   */
  outroEnd?: number | undefined;
  /**
   * Does this clip HAVE an outro — i.e. is `outroStart < op`? Passed in rather than
   * re-derived, because the runtime already computes it (`hasOutro`, beside the
   * `outroStart` fallback) to decide the `cgOutro` guard and the scope's outro ledger,
   * and one rule spelled three ways is how the three come to disagree (golden rule 6).
   *
   * FALSE is the DEGENERATE outro: a marker-less clip, or an outro-start authored at the
   * last frame. The element then has no exit of its own — `playOutro()` resolves
   * immediately (§D6.4.1) and the composition's own exit animates it off — so the frame
   * it holds is the HOLD frame, never `op`.
   */
  hasOutro: boolean;
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
  private readonly setTimer: (cb: () => void, ms: number) => unknown;
  private readonly clearTimer: (h: unknown) => void;

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
  /**
   * Session Z — the wall-clock BACKSTOP that force-settles a stalled outro, mirroring
   * the video driver's. This driver paints frame-by-frame off rAF, so a throttled tab
   * or a `pause()` landing mid-outro stops `tick()` before it can ever reach `outro-end`
   * — and `outro-end` is the ONLY thing that resolved `playOutro()`. The runtime's exit
   * `await`s that promise through the shared ledger, so an unresolved one strands the
   * whole exit (and the lifecycle machine with it: `stop()`/`out()` guard on
   * on-air/playing and would refuse from then on). §D6.4.1 asserts playOutro ALWAYS
   * resolves; before this it held for the video driver only.
   */
  private outroBackstop: unknown = null;
  /** Resolver of the current {@link whenComplete} deferred (re-minted by `reset()`). */
  private completeResolve: () => void = () => undefined;
  /** D-125 §D6.3 — the intro-completion signal a `drivesHold` Lottie contributes. */
  private complete: Promise<void>;

  constructor(options: LottieDriverOptions) {
    this.o = options;
    this.raf = options.clock?.raf ?? ((cb) => requestAnimationFrame(cb));
    this.cancel = options.clock?.cancel ?? ((h) => cancelAnimationFrame(h));
    this.now = options.clock?.now ?? ((): number => performance.now());
    this.setTimer =
      options.clock?.setTimeout ?? ((cb: () => void, ms: number): unknown => setTimeout(cb, ms));
    this.clearTimer =
      options.clock?.clearTimeout ?? ((h: unknown): void => clearTimeout(h as never));
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
    // The park frame is the WINDOW start — `ip` for every markers/manual clip; the derived
    // intro start for a follow clip (whose head is deliberately outside the window).
    this.paint(this.o.introStart ?? this.o.ip);
  }

  /**
   * D-125 — paint a REPRESENTATIVE, VISIBLE static frame. The runtime supplies
   * {@link LottieDriverOptions.posterFrame} — the marked hold-start (`introEnd`) when the
   * clip has phase markers, else the clip MIDPOINT (in the held/visible region), NEVER
   * `op`. Absent an explicit poster frame this falls back to `introEnd`. The play() path
   * calls {@link reset} (→ `ip`), so the intro still plays from the start when played.
   *
   * ⚠ D-135 CHANGED WHAT THIS IS FOR. The original rationale had two halves, and they
   * did not age the same way — annotated here rather than deleted, so the reasoning is
   * not re-litigated from the conclusion alone:
   *
   *  - _"a design surface that never plays"_ — **DEAD.** The playhead drives the canvas
   *    now: `tick(frame)` positions every Lottie, under scrub and under PLAY alike. This
   *    is no longer a surface that parks.
   *  - _"both ends of a furniture clip are commonly blank"_ — **still TRUE as an
   *    observation, and UNACTIONABLE as a rule.** Acting on it needs an "at rest"
   *    exception, and the canvas cannot know parked-from-playing: it receives ONE
   *    `scrub` stream and nothing else (design §1.3). A frame-based approximation —
   *    "the in-point is at rest" — flashes the poster for one frame on every PLAY from
   *    the top, and makes the in-point lie about the clip while every other frame tells
   *    the truth. That was implemented, observed on the real canvas, and reverted.
   *
   * What survives: this is the PRE-TICK paint. On the canvas the first `tick` overwrites
   * it immediately (`preview.ts` ticks after `applyScene`), so it is a transient rather
   * than a resting state; on the broadcast surfaces the stage is blank (`cg-pending`)
   * until `play()`, so it is never seen there at all. It is kept because a host that
   * builds a runtime and never ticks still needs a defined first frame — not because
   * the canvas needs a poster.
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

  /**
   * `B-217` — whether this driver is ticking right now. The look park asks BEFORE it pauses:
   * `resume()` below starts a never-running driver (continue-or-start, like the video's), so
   * a park that promised a resume to an idle editor Lottie would set it animating on the
   * way back.
   */
  isRunning(): boolean {
    return this.running;
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
    // DEGENERATE / absent outro (a marker-less clip, or an outro-start authored at the
    // last frame) — resolve at once so the exit proceeds straight to the background (never
    // a strand). `hasOutro` is the runtime's single derivation, not a second comparison here.
    if (!this.o.hasOutro) return Promise.resolve();
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
    // BOUND (never-strand, session Z): the outro's OWN length plus a margin, so a normal
    // outro always finishes on its own first and a stalled one still releases the exit.
    // Speed 0 (or a zero-length window) leaves only the margin — a clip that can never
    // reach its end must not be what decides whether the graphic can come off air.
    const framesPerMs = (this.o.fr * this.o.speed) / 1000;
    const outroEnd = this.o.outroEnd ?? this.o.op;
    const outroMs = framesPerMs > 0 ? Math.max(0, (outroEnd - this.o.outroStart) / framesPerMs) : 0;
    this.outroBackstop = this.setTimer(
      () => this.settleOutro(),
      outroMs + OUTRO_BACKSTOP_MARGIN_MS,
    );
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
    // media-phases-follow-composition — the WINDOW bounds. Both default to the clip's own
    // (`ip` / `op`), so every markers/manual clip maps exactly as it always has; a FOLLOW
    // clip's runtime passes the derived window and the same mapping plays it.
    const introStart = this.o.introStart ?? ip;
    const outroEnd = this.o.outroEnd ?? op;
    // Derive the frame from ELAPSED TIME (not a tick count), so a dropped / long rAF
    // frame still lands on the right frame — the FrameDriver invariant. A NEGATIVE
    // elapsed (a playhead sitting before the composition's in-point) clamps to the
    // run's start rather than extrapolating backwards past the window start.
    // Session Y — an AUTHORED follow intro shorter than the entrance PARKS for
    // `introDelayMs` before playing (zero everywhere else). Outro elapsed is anchored at
    // the composition's out-point and never delayed.
    const delayed =
      mode === 'intro'
        ? Math.max(0, elapsedMs) - (this.o.introDelayMs ?? 0)
        : Math.max(0, elapsedMs);
    const advanced = Math.floor((Math.max(0, delayed) / 1000) * fr * speed);
    // OUT phase — [outroStart → outroEnd] once (§D1 / §D6.2; outroEnd is `op` unless a
    // follow window bounds it).
    if (mode === 'outro') {
      const outroFrame = outroStart + advanced;
      // CLAMP the final position to the window end — overshooting would ask lottie-web for
      // a frame that does not exist (or, under follow, drive on into a clip tail the OUT
      // segment has no time for). `outro-end` is what releases the awaiting exit.
      return outroFrame < outroEnd
        ? { frame: outroFrame, phase: 'outro' }
        : { frame: outroEnd, phase: 'outro-end' };
    }
    const frame = introStart + advanced;
    if (frame < introEnd) return { frame, phase: 'intro' };
    // The intro has played out — HOLD.
    if (holdBehavior === 'idle-loop' && idleOut > idleIn) {
      // Loop the idle segment: keep advancing, wrapping within [idleIn, idleOut).
      const span = idleOut - idleIn;
      const idleFrames = advanced - (introEnd - introStart);
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
   * 🔴 THE IN-POINT IS NOT A SPECIAL CASE, and this method must never make it one. A
   * revision of this code returned {@link LottieDriverOptions.posterFrame} at zero
   * elapsed, to keep a build-on clip from resting blank on the design surface. The
   * result was that the composition's in-point became the ONE frame on the canvas that
   * did not show the clip — deterministically, so scrubbing away and back never healed
   * it — while every other frame was right. The mapping wins at EVERY frame; see
   * {@link poster} for what is left of the poster's rationale.
   *
   * It does NOT start a clock, mint a completion, or settle an outro: the playhead is
   * the only clock on this path, and a paint is all it is entitled to.
   */
  positionAt(introElapsedMs: number, outroElapsedMs: number | null): void {
    if (this.destroyed || this.running || this.settledHold) return;
    // 🔴 A DEGENERATE outro takes the INTRO mapping past the out-point, and this is a
    // choice about WHICH mapping applies — the same kind of choice as the intro/outro
    // selection itself, which is why it belongs here and never inside `clipPositionAt`
    // (whose singularity is a tested requirement).
    //
    // Without it, every frame at or past the composition's out-point asked for the OUT
    // phase of a clip that HAS no out phase: `outroStart` is `op`, so the mapping
    // clamped to `op` — the frame a furniture clip has animated OFF to — and the element
    // vanished from the canvas from the out-point onward. That contradicted air in the
    // one phase this feature exists to stop it contradicting air in: on air a degenerate
    // `playOutro()` resolves immediately (§D6.4.1), leaving the HOLD frame painted while
    // the composition's own exit animates the element off.
    //
    // With the intro mapping, elapsed keeps growing past the out-point and
    // `clipPositionAt` returns `freeze-hold` (or keeps cycling an idle-loop) — the
    // correct picture, falling out of the shipped mapping rather than special-cased into
    // it.
    const pos =
      outroElapsedMs === null || !this.o.hasOutro
        ? this.clipPositionAt(introElapsedMs, 'intro')
        : this.clipPositionAt(outroElapsedMs, 'outro');
    this.paint(pos.frame);
  }

  /** Mint a fresh completion deferred, capturing its resolver (B-033 re-arm). */
  private armComplete(): Promise<void> {
    return new Promise<void>((res) => {
      this.completeResolve = res;
    });
  }

  /** Resolve a pending `playOutro()` exactly once. The always-resolve invariant. */
  private settleOutro(): void {
    if (this.outroBackstop !== null) {
      this.clearTimer(this.outroBackstop);
      this.outroBackstop = null;
    }
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
