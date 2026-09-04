import type { RuntimeClock } from './types.js';

/**
 * D-128 Phase 4 — the video-element lifecycle driver. Joins the SAME duck-typed
 * content-driver contract as the D-125 {@link LottieDriver}
 * (`reset`/`start`/`pause`/`resume`/`stop`/`destroy`/`whenComplete` + the
 * element-outro seam member `playOutro()`), so the runtime drives, holds, and
 * exits a `<video>` exactly as it does a Lottie — one hold aggregation, one
 * outro ledger, two driver kinds.
 *
 * THE ONE ARCHITECTURAL DIFFERENCE (archived Lottie design §D3, and D-128
 * decision (e)): a Lottie is a driven-frame RENDERER — its driver computes the
 * frame each tick and pushes `goToAndStop`, so the injected clock is the only
 * clock. A `<video>` is the opposite: it ADVANCES ITSELF on the media element's
 * own `currentTime`, which the page cannot tick. So this driver does NOT paint a
 * frame per rAF; it lets the element play and, off the SAME injected clock, keeps
 * it in lockstep:
 *
 *  - pause() → `video.pause()` — the element freezes where it freezes;
 *  - resume() → SEEK-FREE: re-anchor the driver clock to the media's actual
 *    position (the media is authoritative — the large-gap principle) and play.
 *    The old clock-derived re-seek was a fragile-alpha-seek trigger on
 *    pre-alignment assets (pause/resume speckle + freeze) and bought nothing;
 *  - each tick compares the element's `currentTime` against the clock-derived
 *    EXPECTED clip-time; past the threshold the drift handling is SIGNED
 *    (`correctDrift`): a LAGGING media re-bases the clock (seek-free — the
 *    tab-return fix), only an externally-moved (ahead) media is seeked; loop
 *    wrap is driver-commanded (seek to the loop start), never `<video loop>`.
 *
 * ROBUSTNESS (the sync-lifecycle fix, 2026-07-23) — the injected clock in the
 * Designer Preview is `performance.now()` (a WALL clock), while the `<video>`
 * advances on its own media clock and the browser can throttle/pause both it and
 * `requestAnimationFrame` in a background tab. Three defences keep the two from
 * decoupling into a permanent jump/freeze:
 *
 *  1. LARGE-GAP RE-BASE (§ policy in design.md). A per-tick WALL delta far larger
 *     than a frame means rAF was starved (backgrounded tab) or the element stalled
 *     while `now()` ran on. That interval is NOT accrued as clip-time (which the old
 *     one-directional slave paid off by seeking the video FORWARD to a wall position
 *     it never reached — the jump-ahead). Instead the driver RE-BASES its clock to
 *     the media's ACTUAL position: the element continues from where it is.
 *  2. SEEK-IN-FLIGHT GUARD. A corrective/wrap seek is NEVER stacked on top of a seek
 *     the element is still settling (`handle.seeking()`). This kills the per-frame
 *     seek-storm that used to hammer the decoder into a wedge (and painted the
 *     half-decoded frames that read as a fringe), and the resume-decode overshoot.
 *  3. BOUNDED OUTRO. `playOutro()` also arms a wall-clock BACKSTOP timer, so it
 *     ALWAYS resolves even if the rAF is throttled or the driver is paused mid-outro
 *     — else the shared outro ledger's `await` would wedge the whole exit forever.
 *  4. RESUME GRACE. For a short window after a resume / re-base, drift correction is
 *     SUPPRESSED so the `<video>` decoder can RAMP UP without being hammered. A seek at
 *     our ~5 s keyframe interval decodes seconds of video in one burst; firing
 *     corrections mid-ramp is self-amplifying (burst → more stall → more drift → more
 *     bursts) and, with two videos, is the "very slow for a few seconds then recovers"
 *     the owner saw. The WRAP and the always-recoverable paths are never suppressed.
 *
 *     ⚠ STALE NUMBER, KEPT FOR ITS HISTORY (annotated 2026-08-12). The "~5 s keyframe
 *     interval" above describes the assets of its own era and is NOT this project's
 *     conversion output any more: since converter revision `2026-07-24.3` every imported
 *     video is encoded with `-g 25 -keyint_min 25` — a FIXED 1-SECOND GOP at 25 fps (and
 *     since `2026-07-25.5` the colour and alpha streams keyframe TOGETHER). See
 *     `apps/designer/src/renderer/features/assets/video-convert-args.ts`, whose own
 *     comment reads "every seek decodes ≤1s instead of ≤5s". A seek therefore decodes
 *     ≤25 frames, not ~125. The grace window is still correct — a ramping decoder should
 *     not be hammered — but do NOT re-derive a cost estimate from the 5 s figure: a
 *     design (`openspec/changes/timeline-drives-loop-and-media/design.md` §9.3) did
 *     exactly that and was overstated by 5×. Pre-`.3` assets in an existing library are
 *     the reason the number is annotated rather than simply replaced.
 *
 * PHASE MAPPING (clip's own ms time space; decisions (a)–(d)):
 *
 * | Composition phase | This driver                                              |
 * | ----------------- | -------------------------------------------------------- |
 * | IN                | `reset()`+`start()` → play `[0 → introEnd]`               |
 * | HOLD              | `loop` (default): loop `[loopStart → loopEnd]`; `freeze`: |
 * |                   | pause at `introEnd`                                       |
 * | OUT               | `playOutro()` → play `[outroStart → duration]` ONCE       |
 *
 * ABSENT phases (decision (b)): the WHOLE clip is the intro, the hold LOOPS the
 * whole clip, and there is NO outro — the runtime encodes this as
 * `introEnd = duration`, `loop = [0, duration]`, `outroStart = duration`
 * (a degenerate outro that resolves immediately).
 *
 * INVARIANT (§D6.4.1) — `playOutro()` ALWAYS resolves: a degenerate/absent outro,
 * a destroyed driver, a superseding `reset()`/`stop()`, OR the wall-clock backstop
 * all settle it, so an exit can never strand on a video (the B-030 failure mode).
 */
export interface VideoHandle {
  /** Begin (or continue) playback. Errors (no src / autoplay policy) are swallowed. */
  play(): void;
  /** Freeze at the current frame. */
  pause(): void;
  /** Jump the playhead to `seconds`. */
  seek(seconds: number): void;
  /** The element's current playhead, in seconds. */
  currentTime(): number;
  /**
   * True while a seek is in flight (`media.seeking`). A corrective seek must NEVER
   * be stacked on top of one the element is still resolving — that is the seek-storm
   * that wedges the decoder and paints half-decoded frames.
   */
  seeking(): boolean;
  /**
   * True when the media hit a TERMINAL error (`media.error !== null`). On VP8+alpha
   * assets encoded before the keyframe-alignment fix (converter revision < 2026-07-25.5),
   * a seek into a GOP whose alpha side-stream frame is inter-coded at the governing main
   * keyframe is exactly such an error — the element goes permanently dead (black speckle,
   * then freeze): no seek or play on it ever paints again.
   */
  dead(): boolean;
  /**
   * Rebuild the dead media element IN PLACE (fresh node, same src/attributes, restored
   * position, playing again if it was). The driver calls this — rate-limited — whenever
   * {@link dead} reports true, so a terminal decode error degrades to a sub-second
   * hiccup instead of a permanent freeze. NEVER invoked for transforms or any healthy
   * state: `media.error` is the only trigger, which keeps the Phase-3
   * no-remount-on-drag guarantee intact.
   */
  recover(): void;
}

export interface VideoDriverOptions {
  /** The `<video>` wrapper this driver commands. */
  handle: VideoHandle;
  /** Clip duration in ms (the schema's `durationMs`). */
  durationMs: number;
  /**
   * media-phases-follow-composition — where the INTRO WINDOW begins (ms). Defaults to `0`
   * (the shipped behaviour for every manual/absent-phases clip). A FOLLOW-source clip's
   * window is anchored at the hold time `H`: the intro is `[H − entranceSpan → H]`, skipping
   * as much of the clip's head as the composition's entrance cannot fit. Honoured inside
   * {@link expectedClipMs} / `elapsedForActual` (the one mapping and its inverse) and the
   * `start()`/`reset()` seek — never a branch beside them.
   */
  introStartMs?: number | undefined;
  /**
   * Session Y — comp-side WAIT (ms of active time) before the intro starts. Non-zero only for
   * a follow clip whose AUTHORED intro is shorter than the composition's entrance: the element
   * parks on the intro's first frame, then plays [introStart → introEnd] so it FINISHES at the
   * content start. Honoured inside {@link expectedClipMs} and its inverse — never beside them.
   */
  introDelayMs?: number | undefined;
  /** End of the intro / the hold point (ms). Absent phases ⇒ `durationMs`. */
  introEndMs: number;
  /** Start of the outro (ms). `>= outroEnd` ⇒ NO outro (degenerate). */
  outroStartMs: number;
  /**
   * media-phases-follow-composition — where the OUTRO WINDOW ends (ms). Defaults to
   * `durationMs` (the shipped behaviour). A FOLLOW-source clip's outro is
   * `[H → min(H + outSpan, clipEnd)]` — continuous from the held frame and sized to the
   * composition's OUT segment, so `playOutro()` resolves at `outroEnd`, never playing a clip
   * tail the OUT segment has no time for.
   */
  outroEndMs?: number | undefined;
  /** Hold-loop start (ms): `introEnd` with phases, `0` (whole clip) without, or `idle.start`. */
  loopStartMs: number;
  /** Hold-loop end (ms): `outroStart` with phases, `durationMs` without, or `idle.end`. */
  loopEndMs: number;
  /** HOLD behaviour after the intro (decision (a) — default `loop`). */
  holdBehavior: 'loop' | 'freeze';
  /**
   * Re-seek only when |video.currentTime − expected| exceeds this (ms). Decision
   * (e): the Phase-1 spike measured max |drift| 26.6 ms over a 60 s hold loop and
   * ZERO corrections at 80 ms, so 80 ms corrects only a genuine hiccup, never
   * per-tick — no visible stutter. The runtime passes this; default 80.
   */
  driftThresholdMs?: number | undefined;
  /**
   * A per-tick WALL gap (ms) beyond this marks a THROTTLE/STALL, not jitter (a
   * backgrounded tab starves rAF while `performance.now()` runs on; a heavy decode
   * stalls the element). Past it the driver RE-BASES its clock to the media's actual
   * position — the element continues from where it is — instead of seeking it forward
   * to a wall-clock position it never reached. The 80 ms drift threshold was measured
   * on a FOREGROUND tab and says nothing about a multi-second gap; this is the
   * separate large-gap knob. Default 400.
   */
  resyncThresholdMs?: number | undefined;
  /**
   * After a resume (or a large-gap re-base) the `<video>` decoder must RAMP UP — and a
   * seek at a multi-second keyframe interval means decoding seconds of video in one
   * burst. (⚠ The "~5 s" this comment used to name is STALE — this project's converter
   * has emitted a fixed 1-second GOP since `2026-07-24.3`; see the annotation on RESUME
   * GRACE in this file's header.) Firing drift corrections during that ramp is
   * self-amplifying: each corrective
   * seek is another keyframe burst that stalls the decoder more, accruing more drift and
   * more seeks (very slow for a few seconds, then it self-heals — the owner's report,
   * doubled with two videos). For this window (ms) drift correction is SUPPRESSED so the
   * decoder ramps unmolested; the loop WRAP and the always-recoverable paths are NOT
   * suppressed. Default 750.
   */
  resumeGraceMs?: number | undefined;
  /** Injected clock for deterministic tests; defaults to the platform rAF/now/timer. */
  clock?: RuntimeClock | undefined;
}

/** The one member the element-outro ledger keys on — shared with {@link LottieDriver}. */
export interface ElementOutroDriver {
  playOutro(): Promise<void>;
}

/**
 * Backstop margin past the outro's own duration before the wall-clock timer force-settles
 * it. Exported because it bounds the {@link ElementOutroDriver} CONTRACT, not this class:
 * the Lottie driver arms the same backstop from the same number (session Z — it had none,
 * so §D6.4.1's "playOutro() ALWAYS resolves" was true of one implementer and merely
 * intended of the other).
 */
export const OUTRO_BACKSTOP_MARGIN_MS = 2000;

export class VideoDriver implements ElementOutroDriver {
  private readonly o: {
    durationMs: number;
    introStartMs: number;
    introDelayMs: number;
    introEndMs: number;
    outroStartMs: number;
    outroEndMs: number;
    loopStartMs: number;
    loopEndMs: number;
    holdBehavior: 'loop' | 'freeze';
    driftThresholdMs: number;
    resyncThresholdMs: number;
    resumeGraceMs: number;
  };
  private readonly handle: VideoHandle;
  private readonly raf: (cb: (t: number) => void) => number;
  private readonly cancel: (h: number) => void;
  private readonly now: () => number;
  private readonly setTimer: (cb: () => void, ms: number) => unknown;
  private readonly clearTimer: (h: unknown) => void;

  private frame: number | null = null;
  private running = false;
  private startedAt = 0;
  /** `now()` at the previous tick — a large delta signals an rAF-throttle / stall gap. */
  private lastTickNow = 0;
  /** Until this `now()`, drift correction is suppressed so a resuming decoder can ramp up. */
  private correctionGraceUntil = 0;
  /** `now()` of the last dead-media rebuild — recovery is rate-limited, never a storm. */
  private lastRecoverAt = Number.NEGATIVE_INFINITY;
  /** True once a FREEZE hold is reached — `resume()` must NOT reopen it. */
  private settledHold = false;
  private destroyed = false;
  private mode: 'intro' | 'outro' = 'intro';
  private outroResolve: (() => void) | null = null;
  /** The wall-clock backstop timer that force-settles a stalled/paused outro. */
  private outroBackstop: unknown = null;
  private completeResolve: () => void = () => undefined;
  private complete: Promise<void>;

  constructor(options: VideoDriverOptions) {
    this.handle = options.handle;
    this.o = {
      durationMs: options.durationMs,
      // The window bounds default to the clip's own ([0, durationMs]) — every
      // manual/absent-phases clip maps exactly as it always has (follow passes a window).
      introStartMs: options.introStartMs ?? 0,
      introDelayMs: options.introDelayMs ?? 0,
      introEndMs: options.introEndMs,
      outroStartMs: options.outroStartMs,
      outroEndMs: options.outroEndMs ?? options.durationMs,
      loopStartMs: options.loopStartMs,
      loopEndMs: options.loopEndMs,
      holdBehavior: options.holdBehavior,
      driftThresholdMs: options.driftThresholdMs ?? 80,
      resyncThresholdMs: options.resyncThresholdMs ?? 400,
      resumeGraceMs: options.resumeGraceMs ?? 750,
    };
    this.raf = options.clock?.raf ?? ((cb) => requestAnimationFrame(cb));
    this.cancel = options.clock?.cancel ?? ((h) => cancelAnimationFrame(h));
    this.now = options.clock?.now ?? ((): number => performance.now());
    this.setTimer = options.clock?.setTimeout ?? ((cb, ms): unknown => setTimeout(cb, ms));
    this.clearTimer =
      options.clock?.clearTimeout ??
      ((h): void => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.complete = this.armComplete();
  }

  /**
   * Re-arm for a fresh open/close cycle and park at the intro start, paused.
   * Re-mints {@link whenComplete} (B-033) so a REPLAY's hold waits on this run's
   * completion, and settles any in-flight outro so a `reset()` that supersedes an
   * `out()` never leaves it awaiting forever (§D6.4.1). A FULL reset from ANY
   * state — the always-recoverable guarantee Stop/Out/Play rely on.
   */
  reset(): void {
    this.cancelFrame();
    this.settleOutro();
    // A dead element must be REBUILT here or the next take plays into a corpse
    // (the owner's "stop did not recover" freeze): seek(0)+play() on a node with
    // a terminal `media.error` never paints again.
    this.recoverIfDead(true);
    this.running = false;
    this.settledHold = false;
    this.mode = 'intro';
    this.complete = this.armComplete();
    this.handle.pause();
    // Park at the WINDOW start — 0 unless a follow window offsets the intro (the clip's
    // head is then deliberately outside the window and never played).
    this.handle.seek(this.o.introStartMs / 1000);
  }

  /** Begin the intro from the window start. Idempotent while running or already frozen. */
  start(): void {
    if (this.destroyed || this.running || this.settledHold) return;
    this.mode = 'intro';
    this.running = true;
    this.startedAt = this.now();
    this.lastTickNow = this.now();
    this.handle.seek(this.o.introStartMs / 1000);
    this.handle.play();
    this.tick();
    if (this.running) this.schedule();
  }

  /** Freeze the element in lockstep (no-op if not running). */
  pause(): void {
    if (!this.running) return;
    this.running = false;
    this.cancelFrame();
    this.handle.pause();
  }

  /**
   * `B-217` — whether this driver is advancing the clip right now. The look park asks BEFORE
   * it pauses, because `resume()` below STARTS a driver that was never running (it is a
   * continue-or-start, deliberately — see its header) and a park must not turn a hidden,
   * never-started editor `<video>` into a playing one on the way back.
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Continue from where `pause()` froze — SEEK-FREE (2026-07-25). `pause()` froze
   * the element where it froze, so the MEDIA is authoritative (the same principle
   * as the large-gap re-base): re-anchor the driver clock to the media's actual
   * position and just `play()`. The old clock-derived RE-SEEK was a fragile-alpha
   * seek trigger on pre-alignment assets (the owner's pause/resume black-speckle
   * + freeze repro) and bought nothing — a paused element hasn't moved, so clock
   * and media already agree within the drift threshold, and bounded correction
   * handles any residual. A settled freeze hold stays frozen. `lastTickNow` is
   * reset so the paused interval is NOT counted as a throttle gap.
   */
  resume(): void {
    if (this.destroyed || this.running || this.settledHold) return;
    this.recoverIfDead(true);
    this.running = true;
    const actualMs = this.handle.currentTime() * 1000;
    this.startedAt = this.now() - this.elapsedForActual(actualMs);
    this.lastTickNow = this.now();
    this.correctionGraceUntil = this.now() + this.o.resumeGraceMs;
    this.handle.play();
    this.tick();
    if (this.running) this.schedule();
  }

  /** Halt (on stop / settle): pause the element, leave its frame, settle a pending outro. */
  stop(): void {
    this.running = false;
    this.cancelFrame();
    // Recovery must be REAL from a stop too: a dead element left in the cleared
    // state would show its corrupted last frame wherever the stage keeps content
    // visible, and the next take depends on a healthy node either way.
    if (!this.destroyed) this.recoverIfDead(true);
    this.handle.pause();
    this.settleOutro();
  }

  /** Tear down: stop ticking + pause the element. The runtime removes the DOM. Idempotent. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stop();
  }

  /**
   * The CONTENT-DRIVEN HOLD signal, separate from {@link playOutro}. Contributed
   * to the hold aggregation ONLY when the element opts in (`drivesHold === true`).
   * A `freeze` video resolves at the hold point (`introEnd`); a `loop` video NEVER
   * resolves — it holds until `stop()`, exactly like an infinite ticker.
   */
  whenComplete(): Promise<void> {
    return this.complete;
  }

  /**
   * THE ELEMENT-OUTRO SEAM. Play `[outroStart → duration]` ONCE and resolve at the
   * end. ALWAYS resolves (§D6.4.1): a destroyed driver or a degenerate/absent
   * outro (`outroStart >= duration`) resolves immediately; `reset()`/`stop()`
   * settle a still-pending outro; and a wall-clock BACKSTOP settles it even if the
   * rAF is throttled or the driver is paused mid-outro (never wedges the exit).
   * Independent of `drivesHold`.
   */
  playOutro(): Promise<void> {
    if (this.destroyed) return Promise.resolve();
    // Degenerate/absent outro — the window has no length (`outroEnd` is `durationMs`
    // unless a follow window bounds it, so this is the shipped `>= durationMs` check
    // for every manual/absent-phases clip).
    if (this.o.outroStartMs >= this.o.outroEndMs) return Promise.resolve();
    this.settleOutro();
    this.cancelFrame();
    this.recoverIfDead(true); // the outro seek below must land on a LIVE element
    this.mode = 'outro';
    this.settledHold = false;
    this.running = true;
    this.startedAt = this.now();
    this.lastTickNow = this.now();
    this.handle.seek(this.o.outroStartMs / 1000);
    this.handle.play();
    const done = new Promise<void>((res) => {
      this.outroResolve = res;
    });
    // BOUND (never-strand): the shared outro ledger `await`s this promise, and the
    // controller's stop() no-ops once it is exiting — so a `playOutro()` that never
    // resolves wedges the whole exit permanently (the freeze). The wall-clock backstop
    // guarantees resolution even if the rAF is throttled/paused mid-outro. Generous
    // (the outro's own length + a margin), so a normal outro finishes on its own first.
    const outroMs = Math.max(0, this.o.outroEndMs - this.o.outroStartMs);
    this.outroBackstop = this.setTimer(
      () => this.settleOutro(),
      outroMs + OUTRO_BACKSTOP_MARGIN_MS,
    );
    this.tick();
    if (this.running) this.schedule();
    return done;
  }

  private schedule(): void {
    this.frame = this.raf(() => {
      if (!this.running) return;
      this.tick();
      if (this.running) this.schedule();
    });
  }

  /**
   * Clip-time (ms) the injected clock expects at `elapsedMs` of active time.
   * Intro is `[introStart, introEnd]` (introStart 0 unless a follow window offsets it);
   * a `freeze` hold clamps to `introEnd`; a `loop` hold wraps within
   * `[loopStart, loopEnd]`; the outro is `[outroStart → outroEnd]`.
   *
   * THE ONE MAPPING (D-135 §5 / §9.5 (a)) — the driver's own clock (`tick`) and the
   * Designer's playhead ({@link positionAt}) both resolve the clip time HERE. `mode`
   * defaults to the driver's own lifecycle mode for the clock path; the playhead path
   * passes it explicitly, because the playhead's phase comes from the composition's
   * frame, not from this driver's state. Negative elapsed clamps to the window start
   * (the playhead can sit before the composition's active-in) — never extrapolated back.
   */
  private expectedClipMs(rawElapsedMs: number, mode: 'intro' | 'outro' = this.mode): number {
    const elapsedMs = Math.max(0, rawElapsedMs);
    if (mode === 'outro') {
      return Math.min(this.o.outroStartMs + elapsedMs, this.o.outroEndMs);
    }
    // Session Y — an AUTHORED follow intro can be shorter than the composition's entrance:
    // the element PARKS on the intro's first frame for `introDelayMs`, then plays, so the
    // intro FINISHES at the content start. Zero for every other configuration.
    const active = elapsedMs - this.o.introDelayMs;
    if (active < 0) return this.o.introStartMs;
    const introSpanMs = this.o.introEndMs - this.o.introStartMs;
    if (active < introSpanMs) return this.o.introStartMs + active;
    if (this.o.holdBehavior === 'freeze') return this.o.introEndMs;
    const span = this.o.loopEndMs - this.o.loopStartMs;
    if (span <= 0) return this.o.loopStartMs;
    return this.o.loopStartMs + ((active - introSpanMs) % span);
  }

  /**
   * D-135 §5 — POSITION the element at the Designer playhead, through the same mapping
   * the driver's own clock reconciles against ({@link expectedClipMs}). The Designer
   * canvas has no `play()` path at all — its transport advances the store's frame and
   * the canvas posts one `scrub` per change — so SCRUB and PLAY on that surface are the
   * same stream of calls into here, which is why they cannot disagree (§9.5 (a): ONE
   * mechanism for all four transport modes; the forward-1× hybrid was REJECTED).
   *
   * `introElapsedMs` is time since the composition's IN; `outroElapsedMs`, when
   * non-null, is time since the composition's OUT-POINT and WINS. A DEGENERATE outro
   * (`outroStart >= outroEnd` — a clip with no OUT phase) takes the INTRO mapping past
   * the out-point, exactly the Lottie's rule: the mapping then freezes (or idles) on
   * the held look, which is what a degenerate `playOutro()` leaves painted on air —
   * never a clamp to the clip's end frame.
   *
   * PAUSED, ALWAYS: this never calls `play()` — it seeks a paused element, and a seek
   * that finds one still in flight SKIPS, never queues (the same `seeking()` guard the
   * clock path uses): the canvas shows the NEAREST DECODABLE frame, which is the
   * measured, specified contract (§5.2–§5.3), not a defect. The seek goes through the
   * handle, whose members resolve the node via `live()` on EVERY access — B-137's
   * constraint (§1.8/§5.5): the canvas reparents nodes across `scene-replace`.
   *
   * 🔴 A driver RUNNING its own lifecycle — or holding a frame it drove to — OWNS the
   * element, and this is a no-op for it: the playhead may position what nothing else is
   * driving; it may never fight a live one.
   */
  positionAt(introElapsedMs: number, outroElapsedMs: number | null): void {
    if (this.destroyed || this.running || this.settledHold) return;
    if (this.handle.seeking()) return; // skip, never queue — the seek-storm guard
    const hasOutro = this.o.outroStartMs < this.o.outroEndMs;
    const ms =
      outroElapsedMs === null || !hasOutro
        ? this.expectedClipMs(introElapsedMs, 'intro')
        : this.expectedClipMs(outroElapsedMs, 'outro');
    this.handle.seek(ms / 1000);
  }

  private tick(): void {
    // DEAD-MEDIA DETECTION first: after a terminal decode error (the fragile-alpha
    // seek class on pre-alignment assets) NOTHING else in this tick can work — the
    // element never paints again. Rebuild (rate-limited) and give the fresh node
    // this frame to reload; the grace window keeps corrections off its ramp.
    if (this.recoverIfDead()) return;
    // GAP DETECTION → large-gap re-base. A per-tick WALL delta far larger than a frame
    // means rAF was starved (backgrounded tab) or the element stalled while `now()` ran
    // on. Do NOT let that interval become phantom clip-time (a forward seek): re-anchor
    // the driver clock to the media's ACTUAL position so playback continues from where
    // the element is — never a jump forward to a wall position it never reached.
    const nowMs = this.now();
    const gap = nowMs - this.lastTickNow;
    this.lastTickNow = nowMs;
    if (gap > this.o.resyncThresholdMs) this.rebaseToMedia();

    const elapsedMs = this.now() - this.startedAt;
    if (this.mode === 'outro') {
      if (this.o.outroStartMs + elapsedMs >= this.o.outroEndMs) {
        this.seekMs(this.o.outroEndMs); // clamp the final paint to the window end
        this.handle.pause();
        this.running = false;
        this.cancelFrame();
        this.settleOutro();
        return;
      }
      this.reconcile(this.expectedClipMs(elapsedMs));
      return;
    }
    if (elapsedMs < this.o.introDelayMs + (this.o.introEndMs - this.o.introStartMs)) {
      this.reconcile(this.expectedClipMs(elapsedMs)); // intro
      return;
    }
    // Hold reached.
    if (this.o.holdBehavior === 'freeze') {
      this.seekMs(this.o.introEndMs);
      this.handle.pause();
      this.settledHold = true;
      this.running = false;
      this.cancelFrame();
      this.completeResolve(); // §D6.3 — the freeze hold is the completion point
      return;
    }
    // Loop hold: driver-commanded wrap + bounded within-loop drift correction.
    if (this.handle.seeking()) return; // a seek is settling — never stack another on top
    const expected = this.expectedClipMs(elapsedMs);
    const actualMs = this.handle.currentTime() * 1000;
    if (actualMs >= this.o.loopEndMs) {
      this.seekAndPlay(expected); // the WRAP is always issued (never run off the end), even in grace
    } else if (
      this.now() >= this.correctionGraceUntil &&
      Math.abs(actualMs - expected) > this.o.driftThresholdMs
    ) {
      this.correctDrift(actualMs, expected); // signed drift policy — see correctDrift
    }
  }

  /**
   * SIGNED DRIFT POLICY (2026-07-25 — the tab-return freeze): media BEHIND the
   * clock is decode pressure / a stall — the common case, and the one the
   * owner's HEAVY clips hit after a tab return while the light clip kept up and
   * survived. Seeking the media FORWARD to the clock is both the fragile alpha
   * seek (terminal on pre-alignment assets) and the jump-ahead the large-gap
   * policy already rejects at bigger scale — so for media-behind the driver
   * YIELDS: re-base the clock to the media (seek-free) and keep playing. Media
   * AHEAD of the clock cannot arise from normal playback (the element advances
   * at 1× of the same wall time); it means the position was moved externally —
   * only then is a corrective seek issued (and the dead-media recovery backs it).
   */
  private correctDrift(actualMs: number, expectedMs: number): void {
    if (actualMs < expectedMs) {
      this.rebaseToMedia();
      return;
    }
    this.seekAndPlay(expectedMs);
  }

  /**
   * Bounded drift handling — only past the threshold, never while a seek is in
   * flight, never during the post-resume grace, and SIGNED (see correctDrift):
   * a lagging decoder re-bases the clock instead of being seeked forward.
   */
  private reconcile(expectedMs: number): void {
    if (this.handle.seeking()) return; // a seek is settling — don't stack another (the seek-storm)
    if (this.now() < this.correctionGraceUntil) return; // resume grace — let the decoder ramp
    const actualMs = this.handle.currentTime() * 1000;
    if (Math.abs(actualMs - expectedMs) > this.o.driftThresholdMs) {
      this.correctDrift(actualMs, expectedMs);
    }
  }

  /**
   * THE LARGE-GAP POLICY (design.md): after a throttle/stall the MEDIA is authoritative.
   * Re-anchor the driver clock so `expectedClipMs(now − startedAt)` equals the element's
   * ACTUAL playhead — the video CONTINUES from where it is; we never seek it forward to a
   * wall-clock position it never reached (the jump-ahead), and never fold a multi-second
   * gap into the loop modulo (the "further ahead than where it stopped" wrap). Playback is
   * (re-)started from that position, never seeked while a seek is still settling.
   */
  private rebaseToMedia(): void {
    if (this.destroyed) return;
    const actualMs = this.handle.currentTime() * 1000;
    this.startedAt = this.now() - this.elapsedForActual(actualMs);
    // A re-base is a resume-like event — the element (re-)starts playing and its decoder
    // ramps, so extend the grace so we don't hammer it with corrections during that ramp.
    this.correctionGraceUntil = this.now() + this.o.resumeGraceMs;
    if (!this.handle.seeking()) this.handle.play();
  }

  /** The active-elapsed that maps (via {@link expectedClipMs}) back to the media's actual clip-ms. */
  private elapsedForActual(actualMs: number): number {
    const delay = this.o.introDelayMs;
    const introSpanMs = this.o.introEndMs - this.o.introStartMs;
    if (this.mode === 'outro') return Math.max(0, actualMs - this.o.outroStartMs);
    // Media parked at/behind the intro start reads as delay CONSUMED (never re-parking a
    // clip that already started), which keeps a rebase during the park benign.
    if (actualMs < this.o.introEndMs) return delay + Math.max(0, actualMs - this.o.introStartMs);
    if (this.o.holdBehavior === 'freeze') return delay + introSpanMs;
    const span = this.o.loopEndMs - this.o.loopStartMs;
    if (span <= 0) return delay + introSpanMs;
    // First-cycle phase that matches the media; the loop simply continues from there.
    const within = Math.min(Math.max(0, actualMs - this.o.loopStartMs), span);
    return delay + introSpanMs + within;
  }

  private armComplete(): Promise<void> {
    return new Promise<void>((res) => {
      this.completeResolve = res;
    });
  }

  /**
   * Rebuild a dead media element. The per-TICK path is RATE-LIMITED to one
   * rebuild per second so a genuinely undecodable asset degrades to a quiet
   * retry cadence, never a rebuild storm; lifecycle ENTRY points (reset /
   * resume / stop / playOutro) pass `force` — they are discrete user-visible
   * moments whose following seek/play must land on a LIVE node. Returns true
   * while the media is dead / freshly rebuilt — the tick skips position work
   * for that frame; the resume-grace window keeps drift corrections off the
   * rebuilt element's reload ramp.
   */
  private recoverIfDead(force = false): boolean {
    if (this.destroyed || !this.handle.dead()) return false;
    if (!force && this.now() - this.lastRecoverAt < 1000) return true;
    this.lastRecoverAt = this.now();
    this.handle.recover();
    this.correctionGraceUntil = this.now() + this.o.resumeGraceMs;
    return true;
  }

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

  private seekMs(ms: number): void {
    if (this.destroyed) return;
    this.handle.seek(ms / 1000);
  }

  /**
   * A corrective / wrap seek that KEEPS THE ELEMENT PLAYING. Because the loop is
   * driver-commanded (never `<video loop>`), a real `<video>` that reaches the
   * media's natural end — the absent-phases default, where `loopEnd === duration`
   * — fires `ended` and PAUSES. Seeking clears `ended` but leaves it paused, so a
   * bare `seekMs` on wrap would freeze the hold after a single pass. Re-issuing
   * `play()` (idempotent when already playing) is what makes the loop loop.
   */
  private seekAndPlay(ms: number): void {
    if (this.destroyed) return;
    this.handle.seek(ms / 1000);
    this.handle.play();
  }

  private cancelFrame(): void {
    if (this.frame !== null) {
      this.cancel(this.frame);
      this.frame = null;
    }
  }
}
