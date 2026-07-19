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
  /**
   * B-088 — does any per-frame GATE change value strictly inside the leg `[inF, outF]`?
   *
   * `hasAnimation` used to be the whole answer to "may we collapse this range to one
   * paint?", because keyframes were the only frame-dependent thing. B-029 broke that
   * assumption: the per-element `lifespan` gate is evaluated from the painted frame too,
   * so a scene with NO keyframes but a start-trimmed element still needs a real sweep —
   * otherwise the gate is evaluated exactly once and the element is either never shown or
   * shown immediately, never at its in-point.
   *
   * This is deliberately a PREDICATE over the leg, not a second boolean: it must be true
   * only when a gate boundary actually falls inside the range being played, so a genuinely
   * static leg (no keyframes, no boundary crossed) still collapses to a single paint and
   * keeps the rAF optimisation. Absent ⇒ never forces a sweep.
   */
  needsFrameSweep?: ((inF: number, outF: number) => boolean) | undefined;
  /** Paint every animated element at `frame`. */
  applyFrame: (frame: number) => void;
  /** The final outro is starting — the graphic is going off air. */
  onExitStart: () => void;
  /** Fully settled hidden (outro finished). */
  onSettle: () => void;
  /**
   * D-028 / D-104 follow-up — fired once per cycle the moment the ENTRANCE animation
   * completes (the intro's settle frame — see `holdEntryFrame`), which is the start of
   * the hold. The runtime resets + starts the scope's content drivers (tickers / clocks
   * / sequences) here, so a graphic that enters then holds runs its content through the
   * WHOLE hold — not only in the last instant before the out-point. Each loop-cycle pass
   * re-fires it (a FRESH crawl / count / run per cycle).
   */
  onContentStart?: (() => void) | undefined;
  /**
   * D-104 follow-up — the frame at which the entrance animation has settled (the start
   * of the trailing static region before `outPoint`); content starts there. Absent ⇒
   * `outPoint` (today's behavior: the entrance spans the whole `[in → outPoint]`).
   */
  holdEntryFrame?: number | undefined;
  /**
   * D-028 — content-completion supplier for `holdSource: 'content-driven'`:
   * invoked at each hold entry; the hold lasts until the returned promise
   * resolves (all the scope's finite tickers done). Returning `null` (no
   * content elements in scope) ⇒ a zero-length hold. A promise that never
   * resolves (an infinite ticker) holds until `stop()`. Stale resolutions
   * (after stop / a later cycle) are ignored via a hold token.
   */
  waitForContent?: (() => Promise<void> | null) | undefined;
  /**
   * D-125 §D6.2b — THE ELEMENT-OUTRO GATE (closes the Phase-2 auto-exit hole, tasks 7.6).
   * Called the moment an exit begins — `startOutro()` is where EVERY exit path converges:
   * auto-out expiry, content-driven completion, a zero-length hold, each loop-cycle
   * boundary, and the operator/cascaded `stop()`. The runtime plays this scope SUBTREE's
   * element-owned outros (Lottie `[outroStart → op]`) and resolves when they finish; the
   * background outro leg waits for it, so the background never closes over furniture
   * still animating off — on ANY exit path, not just `out()`/`stop()`.
   *
   * Returns `null` when there is nothing to wait for — no outro owners in the subtree,
   * or they already played for this exit episode (the runtime's `out()`/`stop()` await
   * the full registry BEFORE cascading `stop()` into the controllers). The null path
   * starts the background leg SYNCHRONOUSLY: the pre-D-125 exit, byte for byte, so
   * Lottie-less scenes and the post-await cascade keep their exact ordering.
   *
   * Idempotence lives in the runtime's ONE-SHOT ledger, not here — a second caller in
   * the same episode gets the in-flight promise (awaits, never re-drives) or `null`
   * (already done). Double-play is structurally impossible rather than avoided by
   * call-site discipline.
   *
   * `finalExit` distinguishes reach: a FINAL exit (the graphic is going off air) plays
   * the scope SUBTREE's outros; a NON-final `loop-cycle` boundary plays only the cycling
   * scope's OWN outros — a descendant scope is not exiting (its controller holds
   * independently across the parent's cycles), so its furniture must persist, and the
   * boundary re-arm (`onCycleRestart`) is own-scope for the same reason — the two reaches
   * stay symmetric.
   */
  beforeOutro?: ((finalExit: boolean) => Promise<void> | null) | undefined;
  /**
   * D-125 §D6.2b — fired at each loop-cycle BOUNDARY (between one cycle's outro end and
   * the next cycle's intro), NOT on the first `play()`. The runtime re-arms the scope's
   * Lotties here: `reset()` re-paints `ip` and RE-MINTS `whenComplete` (B-033 — a stale
   * resolved completion would close the next content-driven hold instantly), `start()`
   * replays the intro alongside the background IN, and the outro ledger forgets this
   * scope's drivers so the NEXT cycle's exit plays the outro again — exactly once.
   */
  onCycleRestart?: (() => void) | undefined;
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
  // D-125 §D6.2b — supersede token for the ASYNC element-outro gate: bumped by
  // `reset()` (play() / destroy()), so a gate resolution belonging to a superseded
  // exit can never start a stale background leg (B-031/B-033 territory).
  private exitToken = 0;
  // D-125 §D6.2b — the background outro leg deferred because pause() arrived while
  // the element outro was in flight; resume() plays it (the controller-level mirror
  // of the runtime's `pendingExitOutro` for out()/stop(), D-105 parity).
  private pendingOutroLeg: (() => void) | null = null;

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

  /**
   * D-125 §D6.2b — make the CURRENT cycle the last WITHOUT starting an exit. The
   * runtime cascades this synchronously BEFORE awaiting the outro registry in
   * `stop()`/`out()`: a loop-cycle boundary whose element outro is in flight during
   * that await would otherwise complete first (its gate subscribed to the same ledger
   * promise earlier), re-arm via `onCycleRestart`, and let the cascaded `stop()`
   * re-drive the whole outro — the double-play the ledger exists to forbid. With the
   * cycle finalized, the in-flight boundary resolves as the FINAL exit (settles, no
   * restart, no re-arm) and the operator exit degrades to a clean await.
   */
  markFinalCycle(): void {
    if (this.settled) return;
    this.cyclesLeft = 1;
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
    // D-125 §D6.2b — finish an exit whose background leg was deferred because pause()
    // landed while the element outro was in flight (mirrors the runtime's resume()
    // flushing `pendingExitOutro`). Deferred by a 0 ms timer — the zero-hold defer
    // precedent (see onIntroEnd): a SYNCHRONOUS leg here could collapse and settle the
    // root in the middle of the runtime's resume() cascade, whose later `l.resume()`
    // loop would then restart a just-stopped Lottie rAF on the cleared stage.
    if (this.pendingOutroLeg !== null) {
      const leg = this.pendingOutroLeg;
      this.pendingOutroLeg = null;
      const token = this.exitToken;
      this.clock.setTimeout(() => {
        if (token !== this.exitToken || this.phase !== 'outro') return;
        leg();
      }, 0);
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

  /** D-104 follow-up — the entrance-settle frame (content starts here); the out-point when absent. */
  private holdEntry(): number {
    return this.o.holdEntryFrame ?? this.outPoint();
  }

  /** Modes that repeat IN → hold → OUT for `repeat` cycles. */
  private cyclic(): boolean {
    return this.o.playout.mode === 'loop-cycle';
  }

  private startIntro(): void {
    this.phase = 'intro';
    // D-104 follow-up — split the intro at the entrance-settle frame. Play the entrance
    // `[active.in → holdEntry]`; the moment it completes, START the content (so a graphic
    // that enters then holds runs its content through the WHOLE hold). Then play the
    // static settle `[holdEntry → outPoint]` so the playhead still reaches the out-point
    // — a start-trimmed element still appears and the held frame stays the out-point —
    // before the hold proper begins. When `holdEntry === outPoint` (the entrance animates
    // right up to the out-point, or there is no animation) the settle leg is instant and
    // this collapses to today's single intro.
    const holdEntry = this.holdEntry();
    const outPoint = this.outPoint();
    this.playRange(this.o.active.in, holdEntry, () => {
      this.o.onContentStart?.();
      // Only play the static settle leg when it is non-empty; when the entrance ends AT
      // the out-point (or there is no animation) `holdEntry === outPoint` and we go
      // straight to the hold — no redundant second paint of the out-point frame.
      if (holdEntry < outPoint) {
        this.playRange(holdEntry, outPoint, () => this.onIntroEnd());
      } else {
        this.onIntroEnd();
      }
    });
  }

  private onIntroEnd(): void {
    this.phase = 'hold';
    // The intro played `[active.in → outPoint]` (entrance + static settle) and the driver
    // left the graphic painted at `outPoint`; the HOLD simply keeps that frame. Content
    // already started at the entrance-settle frame (onContentStart) — here we only start
    // the hold TIMING. (A looping idle while holding is D-021's opt-in, not this change.)
    this.stopDriver();
    // D-114 — `manual` and `static` both hold the out-point frozen until `stop()`; `static`
    // additionally has no outro (a no-out-point composition — it cuts on stop, see `startOutro`).
    if (this.o.playout.mode === 'manual' || this.o.playout.mode === 'static') return;
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
    const finalExit = this.isFinalOutro();
    if (finalExit) this.announceExit();
    // D-114 — `static` has NO outro: cut cleanly (an empty range) regardless of any out-point, so a
    // stored `static` with a stray out-point still hard-cuts. Other modes play `[outPoint→end]`
    // (empty when there is no marker, today's behavior).
    const from = this.o.playout.mode === 'static' ? this.o.active.out : this.outPoint();
    const playLeg = (): void => {
      this.playRange(from, this.o.active.out, () => this.onOutroEnd());
    };
    // D-125 §D6.2b — element outros BEFORE the background leg, on EVERY exit path (this
    // is the single convergence point — see PlayoutControllerOptions.beforeOutro). A
    // null gate (no owners / already played this episode) keeps the leg SYNCHRONOUS.
    const gate = this.o.beforeOutro?.(finalExit) ?? null;
    if (gate === null) {
      playLeg();
      return;
    }
    const token = this.exitToken;
    void gate.then(() => {
      // Superseded while the element outro played — play() reset this controller
      // (B-031/B-033: the new run owns the scene) or the phase moved on. A stale
      // resolution must NOT start a background leg.
      if (token !== this.exitToken || this.phase !== 'outro') return;
      if (this.paused) {
        // D-105 parity — paused mid-element-outro: hold the half-played frame and
        // defer the background leg to resume(), so the graphic never closes while
        // paused. DEFENSIVE: the runtime's pause cascade freezes the Lottie rAF, so
        // in practice the gate cannot resolve while paused — this guard exists so the
        // invariant ("never close while paused") holds by construction, not by the
        // pause cascade's ordering.
        this.pendingOutroLeg = playLeg;
        return;
      }
      playLeg();
    });
  }

  private onOutroEnd(): void {
    if (this.cyclic()) {
      // D-125 §D6.2b — each loop-cycle boundary re-arms per-cycle element state
      // (Lottie intro + completion + outro ledger) BEFORE the next intro leg, so
      // cycle N+1 replays the furniture's intro and its exit plays the outro again.
      if (this.cyclesLeft === 'infinite') {
        this.o.onCycleRestart?.();
        this.startIntro();
        return;
      }
      this.cyclesLeft -= 1;
      if (this.cyclesLeft >= 1) {
        this.o.onCycleRestart?.();
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

  /**
   * Play `[inF, outF]` once then call `onEnd`; instant when NOTHING in the leg is
   * frame-dependent.
   *
   * B-088 — the collapse is an optimisation, not a semantic: it is only sound when every
   * frame in the leg would paint identically to `outF`. Keyframes are one reason that can
   * be false; a `lifespan` gate boundary crossing the leg is another (see
   * {@link PlayoutControllerOptions.needsFrameSweep}). Collapsing a leg that crosses a
   * boundary evaluates the gate exactly once, which is what made a start-trimmed element
   * appear at play instead of at its in-point.
   *
   * Every leg routes through here — both intro legs (entrance + static settle) and the
   * outro — so the predicate covers all three without each caller repeating it.
   */
  private playRange(inF: number, outF: number, onEnd: () => void): void {
    this.stopDriver();
    const frameDependent = this.o.hasAnimation || (this.o.needsFrameSweep?.(inF, outF) ?? false);
    if (!frameDependent || outF <= inF) {
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
    // D-125 §D6.2b — invalidate any in-flight element-outro gate and drop a deferred
    // background leg: after a reset (play()/destroy()) the old exit no longer owns
    // the scene, and its stale resolution must be inert.
    this.exitToken += 1;
    this.pendingOutroLeg = null;
  }
}
