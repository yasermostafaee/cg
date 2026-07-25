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
 *  - pause() → `video.pause()` and capture the elapsed active time;
 *  - resume() → re-anchor to the clock, RE-SEEK to the clock-derived clip-time
 *    (never trust where a paused/stalled element left its head), then play;
 *  - each tick compares the element's `currentTime` against the clock-derived
 *    EXPECTED clip-time and re-seeks ONLY when the error exceeds a threshold
 *    (bounded correction, never per-tick — no visible stutter); loop wrap is
 *    driver-commanded (seek to the loop start), never `<video loop>`.
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
}

export interface VideoDriverOptions {
  /** The `<video>` wrapper this driver commands. */
  handle: VideoHandle;
  /** Clip duration in ms (the schema's `durationMs`). */
  durationMs: number;
  /** End of the intro / the hold point (ms). Absent phases ⇒ `durationMs`. */
  introEndMs: number;
  /** Start of the outro (ms). `>= durationMs` ⇒ NO outro (degenerate). */
  outroStartMs: number;
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
   * seek at our current ~5 s keyframe interval means decoding seconds of video in one
   * burst. Firing drift corrections during that ramp is self-amplifying: each corrective
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

/** Backstop margin past the outro's own duration before the wall-clock timer force-settles it. */
const OUTRO_BACKSTOP_MARGIN_MS = 2000;

export class VideoDriver implements ElementOutroDriver {
  private readonly o: {
    durationMs: number;
    introEndMs: number;
    outroStartMs: number;
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
  /** Elapsed active ms captured at `pause()`, replayed by `resume()`. */
  private pausedElapsed = 0;
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
      introEndMs: options.introEndMs,
      outroStartMs: options.outroStartMs,
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
    this.running = false;
    this.settledHold = false;
    this.pausedElapsed = 0;
    this.mode = 'intro';
    this.complete = this.armComplete();
    this.handle.pause();
    this.handle.seek(0);
  }

  /** Begin the intro from the start. Idempotent while running or already frozen. */
  start(): void {
    if (this.destroyed || this.running || this.settledHold) return;
    this.mode = 'intro';
    this.running = true;
    this.startedAt = this.now();
    this.lastTickNow = this.now();
    this.handle.seek(0);
    this.handle.play();
    this.tick();
    if (this.running) this.schedule();
  }

  /** Freeze the element in lockstep (no-op if not running). */
  pause(): void {
    if (!this.running) return;
    this.pausedElapsed = this.now() - this.startedAt;
    this.running = false;
    this.cancelFrame();
    this.handle.pause();
  }

  /**
   * Continue from where `pause()` froze. RE-SEEK to the clock-derived clip-time
   * (the anti-drift step — a real element can drift or stall while paused) then
   * play. A settled freeze hold stays frozen. `lastTickNow` is reset so the paused
   * interval is NOT counted as a throttle gap on the first resumed tick, and the
   * seek-in-flight guard keeps the resume-decode latency from overshooting forward.
   */
  resume(): void {
    if (this.destroyed || this.running || this.settledHold) return;
    this.running = true;
    this.startedAt = this.now() - this.pausedElapsed;
    this.lastTickNow = this.now();
    this.correctionGraceUntil = this.now() + this.o.resumeGraceMs;
    this.seekMs(this.expectedClipMs(this.pausedElapsed));
    this.handle.play();
    this.tick();
    if (this.running) this.schedule();
  }

  /** Halt (on stop / settle): pause the element, leave its frame, settle a pending outro. */
  stop(): void {
    this.running = false;
    this.cancelFrame();
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
    if (this.o.outroStartMs >= this.o.durationMs) return Promise.resolve();
    this.settleOutro();
    this.cancelFrame();
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
    const outroMs = Math.max(0, this.o.durationMs - this.o.outroStartMs);
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
   * Intro is `[0, introEnd]`; a `freeze` hold clamps to `introEnd`; a `loop`
   * hold wraps within `[loopStart, loopEnd]`; the outro is `[outroStart → end]`.
   */
  private expectedClipMs(elapsedMs: number): number {
    if (this.mode === 'outro') {
      return Math.min(this.o.outroStartMs + elapsedMs, this.o.durationMs);
    }
    if (elapsedMs < this.o.introEndMs) return elapsedMs;
    if (this.o.holdBehavior === 'freeze') return this.o.introEndMs;
    const span = this.o.loopEndMs - this.o.loopStartMs;
    if (span <= 0) return this.o.loopStartMs;
    return this.o.loopStartMs + ((elapsedMs - this.o.introEndMs) % span);
  }

  private tick(): void {
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
      if (this.o.outroStartMs + elapsedMs >= this.o.durationMs) {
        this.seekMs(this.o.durationMs); // clamp the final paint to the clip end
        this.handle.pause();
        this.running = false;
        this.cancelFrame();
        this.settleOutro();
        return;
      }
      this.reconcile(this.expectedClipMs(elapsedMs));
      return;
    }
    if (elapsedMs < this.o.introEndMs) {
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
      this.seekAndPlay(expected); // drift correction — suppressed during the resume grace
    }
  }

  /**
   * Bounded drift correction — re-seek only past the threshold, never while a seek is in
   * flight, and never during the post-resume grace (let the decoder ramp up unmolested).
   */
  private reconcile(expectedMs: number): void {
    if (this.handle.seeking()) return; // a seek is settling — don't stack another (the seek-storm)
    if (this.now() < this.correctionGraceUntil) return; // resume grace — let the decoder ramp
    const actualMs = this.handle.currentTime() * 1000;
    if (Math.abs(actualMs - expectedMs) > this.o.driftThresholdMs) this.seekAndPlay(expectedMs);
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
    if (this.mode === 'outro') return Math.max(0, actualMs - this.o.outroStartMs);
    if (actualMs < this.o.introEndMs) return Math.max(0, actualMs);
    if (this.o.holdBehavior === 'freeze') return this.o.introEndMs;
    const span = this.o.loopEndMs - this.o.loopStartMs;
    if (span <= 0) return this.o.introEndMs;
    // First-cycle phase that matches the media; the loop simply continues from there.
    const within = Math.min(Math.max(0, actualMs - this.o.loopStartMs), span);
    return this.o.introEndMs + within;
  }

  private armComplete(): Promise<void> {
    return new Promise<void>((res) => {
      this.completeResolve = res;
    });
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
