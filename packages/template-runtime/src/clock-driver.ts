import {
  afterZeroOf,
  completesAtZero,
  type AfterZero,
  type ClockTarget,
  type CountdownSteps,
} from '@cg/shared-schema';
import { parseIsoInstant, parseTimeOfDay } from '@cg/text-shaping';
import { formatCountClock, formatWallClock, type ClockDigits } from './clock-format.js';
import { displayedRemainingMs, pickStep, stepTokenValue, type StepToken } from './step-css.js';
import type { RuntimeClock } from './types.js';

/**
 * `DELTA-RUN-NEXT-VERSION-01-D` — the sign a countdown counting PAST zero writes before the time
 * since zero: U+2212 MINUS SIGN (`−00:12`), not a hyphen. The time span is LTR and bidi-isolated
 * (scene-builder), so it stays on the left in an RTL layout.
 */
export const PAST_ZERO_SIGN = '−';

/**
 * Why the published step changed: the remaining time (or a rehearsal) moved it — `step` — or the
 * run was RESET and the latch cleared — `reset`. A reset is not a cue: the runtime re-primes every
 * composition instance for the next run itself, so an instance never plays its exit because a run
 * restarted.
 */
export type StepChangeReason = 'step' | 'reset';

/**
 * D-141 — validate an operator-supplied value as a time of day: the CANONICAL Latin
 * `HH:mm[:ss]` when it parses, `undefined` when it does not.
 *
 * `PERSIAN-DIGITS-01` — it lives in `@cg/text-shaping` now, the one reader both apps
 * and this bundle share, and it reads a time in ANY digit set: `۲۰:۳۲`, `٢٠:٣٢` and
 * `20:32` are the same time. The copy that stood here matched `\d` without the `u`
 * flag — ASCII only — so an operator on a Persian keyboard had the correct time
 * reported as unparseable while the OLD target stayed on air.
 *
 * A GDD client is NOT obliged to enforce a field's `pattern`, so a bound value
 * reaching the runtime is untrusted and is validated before it can touch a live
 * countdown. The caller applies NOTHING on `undefined` — the current, possibly
 * on-air target is kept.
 */
export { parseTimeOfDay };

/**
 * `DELTA-RUN-NEXT-VERSION-01-C` — what a `clock-target` binding's value re-aims a countdown at. The
 * VALUE decides, so one field serves both target kinds CG Control offers: `HH:mm[:ss]` is a time of
 * day (the next occurrence), an ISO date and time is that instant. Any digit set. `undefined` for
 * anything else — the caller then applies nothing and keeps the current, possibly on-air target.
 */
export function parseClockTarget(raw: unknown): ClockTarget | undefined {
  const time = parseTimeOfDay(raw);
  if (time !== undefined) return { kind: 'timeofday', time };
  const iso = parseIsoInstant(raw);
  if (iso !== undefined) return { kind: 'datetime', iso };
  return undefined;
}

/**
 * D-027 — the digital-clock driver, on the ticker's self-wire pattern.
 *
 * One driver owns one clock element's time span: an rAF loop (on the
 * injectable {@link RuntimeClock}) recomputes the formatted string each frame
 * and writes the DOM ONLY when it changes — ≈1 write/second.
 *
 * Two time bases, chosen per mode:
 * - RELATIVE (`countup`, `countdown` with a `duration` target): elapsed =
 *   accumulated ACTIVE time. `pause()` freezes the accumulator; `resume()`
 *   continues with no jump.
 * - ABSOLUTE (`wall`, `countdown` with a `datetime` target): every paint
 *   computes from `clock.now()`. `pause()` merely stops painting; `resume()`
 *   shows the TRUE current value — a real deadline is never delayed.
 *
 * A countdown clamps at 0 and resolves {@link whenComplete} exactly once per
 * run when 0 paints; `reset()` mints a fresh promise (cf. TickerDriver), so
 * each loop-cycle hold entry re-runs the full count. A datetime target
 * already in the past paints 0 and resolves immediately on its run start.
 * `wall`/`countup` never resolve — they are not content sources.
 *
 * Unlike the ticker's clock (performance.now-style), `now` here defaults to
 * `Date.now()`: the absolute modes need a real epoch, and the relative modes
 * only ever subtract two readings, which any monotonic-enough ms source
 * satisfies. An injected test clock's timeline doubles as the epoch (datetime
 * targets in tests are ISO strings near 1970).
 */

export type ClockDriverMode = 'wall' | 'countup' | 'countdown';

export interface ClockDriverOptions {
  /** The time span the driver repaints (the scene-builder's inner span). */
  node: HTMLElement;
  mode: ClockDriverMode;
  format: string;
  digits: ClockDigits;
  /** Required for `countdown` (schema-enforced); ignored otherwise. */
  target?: ClockTarget | undefined;
  /**
   * D-084 — optional IANA time zone for `wall` mode (e.g. 'Europe/London').
   * Absent ⇒ machine-local time. `countup`/`countdown` ignore it.
   */
  timezone?: string | undefined;
  /**
   * D-103 — when true, the colon separator(s) blink: the formatted time is rendered as
   * segment spans and ONLY the colon spans' opacity toggles (no reflow). Off ⇒ the prior
   * single-`textContent` render. Applies to all modes.
   */
  blinkColon?: boolean | undefined;
  /** D-103 — colon blink half-period in ms (phase = `floor(now / period) % 2`). Absent ⇒ 1000. */
  blinkPeriodMs?: number | undefined;
  /**
   * `DELTA-RUN-NEXT-VERSION-01-A` — the countdown's STEPS. Honoured ONLY for `mode: 'countdown'`
   * (the schema also refuses them elsewhere — two layers, so a hand-edited package degrades to the
   * authored look rather than misbehaving).
   */
  steps?: CountdownSteps | undefined;
  /**
   * The SCOPE ROOT this driver publishes its active step on: the owning composition's
   * `FieldScope.container` (the root stage, or a nested instance's `.cg-comp-inner`). One attribute on
   * one node restyles any number of elements — the compiled custom properties INHERIT, so the nearest
   * declaration wins. Absent ⇒ the driver publishes nothing.
   */
  stepRoot?: HTMLElement | undefined;
  /** The attribute it publishes on (`data-cg-cd<c>`, `step-css.ts`). */
  stepAttr?: string | undefined;
  /**
   * Called once per step CHANGE, after the attribute is written, with the step entered and the one
   * left — what CSS cannot do (a picture, a composition instance's entrance / exit) hangs here.
   */
  onStep?:
    | ((entered: StepToken | null, left: StepToken | null, reason: StepChangeReason) => void)
    | undefined;
  /** `DELTA-RUN-NEXT-VERSION-01-D` / `-E` — what the countdown does after zero. Absent ⇒ `hold`. */
  afterZero?: AfterZero | undefined;
  clock?: RuntimeClock | undefined;
}

/**
 * D-141 helper 2 (design §1) — resolve `HH:mm` / `HH:mm:ss` to the epoch ms of its
 * NEXT LOCAL occurrence relative to `nowMs`: today's when it is still ahead,
 * otherwise tomorrow's.
 *
 * Local-FIELD construction is the point. `new Date(y, m, d, hh, mm, ss)` builds
 * from local calendar fields, so a DST transition is resolved by the platform
 * rather than by arithmetic on a fixed 86 400 000 ms day; `setDate(+1)` likewise
 * rolls the local calendar day, not 24 hours.
 *
 * An occurrence exactly EQUAL to `nowMs` counts as ARRIVED — it is returned as
 * today's, giving remaining 0, which clamps at 00:00 and completes immediately
 * (the same path a past `datetime` target already takes). It is NOT rolled to
 * tomorrow: a countdown to a time that is happening right now must not read
 * 23:59:59 on air.
 *
 * Separately exported and dependency-free so D-139 resolves a time of day HERE
 * rather than growing a second copy (CLAUDE.md golden rule 6).
 *
 * An unparseable string returns `nowMs` — i.e. "already arrived", the same
 * degradation a past `datetime` target already takes (paints 00:00, completes
 * immediately). This function runs inside the on-air paint path's pin, so it must
 * never throw; the format is guaranteed upstream by `ClockTargetSchema` at author
 * time and by the binding's own parse at playout.
 */
export function resolveTimeOfDay(time: string, nowMs: number): number {
  /*
    Read through the SAME function the binding validates with (`parseTimeOfDay`, re-exported
    below), so a value the runtime accepts and the instant it resolves to can never disagree —
    and a time an author or operator wrote in Persian digits resolves like its Latin twin.
  */
  const canonical = parseTimeOfDay(time);
  if (canonical === undefined) return nowMs;
  const [hh = 0, mm = 0, ss = 0] = canonical.split(':').map(Number);
  const d = new Date(nowMs);
  const candidate = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm, ss, 0);
  if (candidate.getTime() < nowMs) candidate.setDate(candidate.getDate() + 1);
  return candidate.getTime();
}

/**
 * The ABSOLUTE deadline a target resolves to at `nowMs`, or `null` for a RELATIVE
 * one (`duration`, which counts accumulated active time and has no epoch).
 * `datetime` is constant, so pinning it changes nothing; `timeofday` is resolved
 * here exactly once per run (see {@link ClockDriver}).
 */
function absoluteDeadlineMs(target: ClockTarget | undefined, nowMs: number): number | null {
  if (target === undefined) return null;
  if (target.kind === 'datetime') return Date.parse(target.iso);
  if (target.kind === 'timeofday') return resolveTimeOfDay(target.time, nowMs);
  return null;
}

/**
 * D-141 helper 3 (design §1, §5.3) — select the active zone step for a remaining
 * time, over steps whose `atOrBelowMs` thresholds are strictly decreasing (the
 * schema enforces that). Returns `undefined` when the remaining time is above
 * every threshold; the caller then falls back to the `base` zone, or to no zone
 * when `base` is absent.
 *
 * **Compared on the DISPLAYED one-second quantum, not the raw ms.** The countdown
 * paints `ceil(max(0, remaining) / 1000)` seconds, so a raw-ms comparison would
 * flip the colour while the digits still read `60:00` — the colour leading the
 * number by up to a second, on the one frame an operator is looking at. Sharing
 * the driver's own quantum makes the colour change on exactly the frame the digits
 * reach the boundary.
 *
 * **The TIGHTEST covering threshold wins.** Thresholds nest — a remaining time
 * under ten minutes is at-or-below the 10-, 30- AND 60-minute steps — so the
 * selected zone is the one with the SMALLEST `atOrBelowMs` that still covers it,
 * which over a strictly-decreasing list is the LAST match. Taking the first match
 * instead would select the 60-minute zone for every remaining time under an hour,
 * and would contradict this feature's own rule that at and after zero the LOWEST
 * step stays selected.
 *
 * Because the compared value is monotonically decreasing and quantised, the
 * sequence of selected keys is monotone by construction — there is no oscillation
 * at a boundary to debounce.
 */
export function pickByThreshold<S extends { atOrBelowMs: number }>(
  steps: readonly S[],
  remainingMs: number,
): S | undefined {
  // The SIGNED displayed quantum (`step-css.ts`): above zero it is the old `ceil`; past zero it is
  // the whole seconds since zero, which only a step "after zero" (a negative threshold) can reach —
  // every non-negative threshold still covers it, so the lowest step stays selected after zero.
  const displayed = displayedRemainingMs(remainingMs);
  let picked: S | undefined;
  for (const step of steps) {
    if (step.atOrBelowMs >= displayed) picked = step;
  }
  return picked;
}

/**
 * 🔴 `DELTA-RUN-NEXT-VERSION-01-D` — **THE COUNTDOWN'S TEXT, AFTER ZERO TOO.** Above zero it is the
 * remaining time, `ceil`ed to the second (it shows the full value at start and reaches `00:00`
 * exactly when the remaining time does). At and after zero it follows the author's choice:
 *
 * - `hold` / `close` — `00:00` stays;
 * - `count-past` — the whole seconds SINCE zero behind a minus sign (`−00:12`), in the clock's own
 *   digits; the first second past zero still reads `00:00`, so the sign never flashes on a zero;
 * - `hide-digits` — nothing: the element stays, so a step can still show something else there.
 */
export function countdownText(
  remainingMs: number,
  format: string,
  digits: ClockDigits,
  afterZero: AfterZero | undefined,
): string {
  if (remainingMs > 0) return formatCountClock(Math.ceil(remainingMs / 1000), format, digits);
  switch (afterZeroOf(afterZero)) {
    case 'hide-digits':
      return '';
    case 'count-past': {
      const past = Math.floor(-remainingMs / 1000);
      const text = formatCountClock(past, format, digits);
      return past === 0 ? text : `${PAST_ZERO_SIGN}${text}`;
    }
    default:
      return formatCountClock(0, format, digits);
  }
}

/**
 * D-141 helper 1 (design §1) — the ONE source of a countdown's remaining ms.
 * Promoted from the driver's former `private remainingMs()` so nothing outside the
 * driver ever re-derives `deadline − now`: a second local copy is how a name comes
 * to lie about what it tests (CLAUDE.md golden rule 6). D-139's threshold rules
 * read the quantity through here.
 *
 * May be negative; callers clamp (the display does, at zero).
 */
export function remainingMsOf(driver: ClockDriver): number {
  return driver.remainingMs();
}

interface NormalizedDriverClock {
  raf: (cb: (timestamp: number) => void) => number;
  cancel: (handle: number) => void;
  now: () => number;
}

/**
 * The text a clock shows BEFORE its run starts — the scene-builder's static
 * render and the driver's `reset()` both compute it with THIS rule, so the
 * authoring canvas and a between-runs stage can't drift in semantics:
 * wall = the time at `nowMs`, countup = zero, countdown = the target
 * remaining at `nowMs`. Note the time-dependent cases are recomputed at each
 * call by design — a wall value or a datetime target's remaining naturally
 * differs between build time and a later `reset()` (the deadline is absolute
 * and keeps approaching); only a duration countdown is a constant.
 */
export function clockInitialText(
  opts: Pick<
    ClockDriverOptions,
    'mode' | 'format' | 'digits' | 'target' | 'timezone' | 'afterZero'
  >,
  nowMs: number,
): string {
  if (opts.mode === 'wall')
    return formatWallClock(new Date(nowMs), opts.format, opts.digits, opts.timezone);
  if (opts.mode === 'countup') return formatCountClock(0, opts.format, opts.digits);
  const t = opts.target;
  // D-141 — a `timeofday` resolves against `nowMs` here for the same reason a
  // `datetime` recomputes: an absolute deadline keeps approaching, so the static
  // build-time paint and a later `reset()` legitimately differ.
  const remaining =
    t === undefined
      ? 0
      : t.kind === 'duration'
        ? t.ms
        : (absoluteDeadlineMs(t, nowMs) ?? 0) - nowMs;
  // DELTA-RUN-NEXT-VERSION-01-D — a target already past shows the author's after-zero choice from
  // the first paint, not a `00:00` that changes on the run's first frame.
  return countdownText(remaining, opts.format, opts.digits, opts.afterZero);
}

export class ClockDriver {
  private readonly o: ClockDriverOptions;
  private readonly clock: NormalizedDriverClock;

  private running = false;
  private paused = false;
  private destroyed = false;
  private startedAt = 0;
  private pausedAt = 0;
  private pausedAccumMs = 0;
  private rafHandle: number | null = null;

  /** Last text written — the repaint-only-on-change gate. */
  private lastText: string | null = null;

  /** D-103 — colon-blink state: the current colon spans + the last opacity phase written. */
  private colonSpans: HTMLElement[] = [];
  private lastColonVisible: boolean | null = null;
  /** Whether the node currently holds the blink SEGMENT spans (vs a plain `textContent`). */
  private blinkBuilt = false;

  private completed = false;
  private resolveComplete: (() => void) | null = null;
  private completion: Promise<void>;

  /**
   * D-141 — the ABSOLUTE deadline this run counts down to, pinned ONCE per run
   * (`start()` / `reset()`) and on an explicit `retarget()`. `null` for a relative
   * (`duration`) target, and before the first run.
   *
   * The pin is load-bearing for `timeofday`, for two reasons out of the driver's
   * own contract. (1) A per-paint resolve could never reach zero: the moment
   * remaining hits 0 the "next occurrence" becomes tomorrow, so the very next frame
   * would paint 23:59:59 — a countdown jumping from 00:00 to a full day, on air.
   * (2) `whenComplete()` must resolve exactly once per run, and a countdown clamped
   * at zero is what closes a `content-driven` hold; a target that silently re-armed
   * would keep the hold open forever and the graphic would never leave air.
   */
  private pinnedDeadlineMs: number | null = null;

  /** The last step PUBLISHED on the scope root: the write latch (one write per step CHANGE). */
  private lastStep: StepToken | null = null;

  /**
   * A REHEARSAL override (the Designer preview's "show this step"): `undefined` follows the
   * remaining time; a token or `null` is published instead, until cleared. Session-only.
   */
  private forcedStep: StepToken | null | undefined = undefined;

  constructor(options: ClockDriverOptions) {
    // Copied, not aliased: `retarget()` rewrites `target`, and that must not reach
    // back into the object the caller passed in.
    this.o = { ...options };
    this.completion = new Promise<void>((res) => {
      this.resolveComplete = res;
    });
    const c = options.clock;
    this.clock = {
      raf: c?.raf ?? ((cb): number => requestAnimationFrame(cb)),
      cancel: c?.cancel ?? ((h): void => cancelAnimationFrame(h)),
      now: c?.now ?? ((): number => Date.now()),
    };
  }

  /** The element's mode — the runtime filters countdowns as content sources. */
  get mode(): ClockDriverMode {
    return this.o.mode;
  }

  /**
   * Absolute clocks (wall, datetime countdown) track real time, not the hold —
   * the runtime starts them at `play()` so they tick during the intro, while
   * relative counts display their initial value until their hold-entry run.
   */
  get isAbsolute(): boolean {
    return (
      this.o.mode === 'wall' ||
      // D-141 — `timeofday` joins `datetime` on the absolute side: both are real
      // deadlines a pause never delays.
      (this.o.mode === 'countdown' &&
        (this.o.target?.kind === 'datetime' || this.o.target?.kind === 'timeofday'))
    );
  }

  /** The countdown's active target — the value a `retarget()` last installed. */
  get target(): ClockTarget | undefined {
    return this.o.target;
  }

  /**
   * Start a run. The hold entry resets first (`reset()` then `start()`), so
   * every composition cycle re-runs the count; wall/datetime clocks are also
   * started at `play()` so they tick during the intro.
   */
  start(): void {
    if (this.destroyed || this.running) return;
    this.running = true;
    this.paused = false;
    // ONE read of the clock feeds both the relative time base and the absolute pin,
    // so the run's start instant and its deadline can never disagree.
    const now = this.clock.now();
    this.startedAt = now;
    this.pausedAccumMs = 0;
    this.pinnedDeadlineMs = absoluteDeadlineMs(this.o.target, now);
    this.paint();
    this.scheduleFrame();
  }

  /**
   * D-027 — resolves when this run's countdown reaches zero (a past datetime
   * target resolves immediately on run start). Never resolves for
   * `wall`/`countup` — they are not content sources. A fresh promise is
   * minted per run (constructor + `reset()`).
   */
  whenComplete(): Promise<void> {
    return this.completion;
  }

  /** Freeze the displayed time (lockstep with the playout controller). */
  pause(): void {
    if (!this.running || this.paused) return;
    this.paused = true;
    this.pausedAt = this.clock.now();
    this.cancelFrame();
  }

  /**
   * Continue: a relative count picks up with no jump; an absolute clock
   * repaints the true current value immediately.
   */
  resume(): void {
    if (!this.running || !this.paused) return;
    this.pausedAccumMs += this.clock.now() - this.pausedAt;
    this.paused = false;
    this.paint();
    this.scheduleFrame();
  }

  /** Stop ticking, freezing the DOM at the stop moment (scope settled). */
  stop(): void {
    if (this.running && !this.paused) this.paint();
    this.running = false;
    this.paused = false;
    this.cancelFrame();
  }

  /**
   * Full reset for a fresh run: stop, clear the active-time accumulator,
   * mint a fresh completion, and repaint the initial value (countdown = the
   * full target, countup = zero, wall = now).
   */
  reset(): void {
    this.stop();
    this.pausedAccumMs = 0;
    this.completed = false;
    this.completion = new Promise<void>((res) => {
      this.resolveComplete = res;
    });
    // D-141 — one clock read for the pin AND the initial text, so the painted value
    // is the remaining time of the deadline this run will actually count down to.
    const now = this.clock.now();
    this.pinnedDeadlineMs = absoluteDeadlineMs(this.o.target, now);
    const text = clockInitialText(this.o, now);
    this.o.node.textContent = text;
    this.lastText = text;
    // Clear the published step: a fresh run must re-enter at the step its OWN remaining time
    // selects, never inherit the last run's.
    this.clearStep();
    // D-103 — back to a steady single-`textContent` value; the run's first paint re-segments
    // for the blink if `blinkColon` is on.
    this.blinkBuilt = false;
    this.colonSpans = [];
    this.lastColonVisible = null;
  }

  destroy(): void {
    this.reset();
    this.destroyed = true;
  }

  // — internals ————————————————————————————————————————————————————————

  /** Active (unpaused) ms since this run's start — the RELATIVE time base. */
  private activeElapsedMs(): number {
    if (!this.running) return 0;
    const nowMs = this.paused ? this.pausedAt : this.clock.now();
    return nowMs - this.startedAt - this.pausedAccumMs;
  }

  /**
   * Countdown ms left (may be negative; callers clamp). PUBLIC since D-141 —
   * read it through {@link remainingMsOf}, the one exported name, rather than
   * re-deriving `deadline − now` anywhere else.
   *
   * An absolute target reads the run's PINNED deadline; before any run has pinned
   * one (a bare read on a fresh driver) it resolves at the current instant, which
   * for a constant `datetime` is the same number and for a `timeofday` is the next
   * occurrence from now.
   */
  remainingMs(): number {
    const t = this.o.target;
    if (t === undefined) return 0;
    if (t.kind === 'duration') return t.ms - this.activeElapsedMs();
    const now = this.clock.now();
    return (this.pinnedDeadlineMs ?? absoluteDeadlineMs(t, now) ?? 0) - now;
  }

  /**
   * D-141 — re-aim a countdown at a new target WITHOUT touching the run (design
   * §4.3). This is the seam a `clock-target` binding applies through, so a
   * `CG UPDATE` re-targets a LIVE countdown: the operator sees the new value at
   * once, and nothing replays.
   *
   * Re-pins the deadline, forces one repaint, re-evaluates the zone (one attribute
   * write), and re-arms completion when the new deadline is in the future. Leaves
   * `running`/`paused`, the active-time accumulator, the colon-blink phase, the
   * scope's lifecycle and every other driver exactly as they were.
   *
   * **The limit, stated rather than discovered on air:** re-targeting a countdown
   * that ALREADY completed re-arms the DISPLAY but cannot re-open a
   * `content-driven` hold that already closed — the scope awaited the old promise
   * and has moved on, and a resolved gate is not un-resolved by minting a new one.
   * Re-target a live countdown freely; to re-run one that already hit zero, replay.
   */
  retarget(target: ClockTarget): void {
    if (this.destroyed) return;
    const now = this.clock.now();
    const nextPin = absoluteDeadlineMs(target, now);
    // A control app re-sends the same value on every UPDATE; resolving to the same
    // deadline must therefore cost nothing — no repaint, no zone write, no re-arm.
    if (this.o.target?.kind === target.kind && this.isSameDeadline(target, nextPin)) return;

    this.o.target = target;
    this.pinnedDeadlineMs = nextPin;

    if (this.o.mode === 'countdown' && this.remainingMs() > 0) {
      // Re-arm the completion LATCH so the new deadline can fire it. A FRESH
      // promise is minted only when the previous one already RESOLVED: while it is
      // still pending it is the very promise the scope's hold is awaiting
      // (`runtime.ts` registers `() => driver.whenComplete()` and the aggregation
      // holds what it read), so replacing it would strand that hold open forever —
      // the opposite of "leaves the RUN untouched". A pending promise needs no
      // re-arm: its resolver still fires, now at the new deadline.
      if (this.completed) {
        this.completion = new Promise<void>((res) => {
          this.resolveComplete = res;
        });
      }
      this.completed = false;
    }

    // Force the text write even when the formatted string happens to match, so the
    // repaint is unconditional; `paint()` then re-evaluates the zone through the
    // same latch every other frame uses (one write, and only on a real change).
    this.lastText = null;
    this.paint();
  }

  /** Whether `target` resolves to the deadline this driver is already counting to. */
  private isSameDeadline(target: ClockTarget, nextPin: number | null): boolean {
    if (nextPin !== null) return nextPin === this.pinnedDeadlineMs;
    // A relative target has no epoch; it is unchanged when its duration is.
    const current = this.o.target;
    return target.kind === 'duration' && current?.kind === 'duration' && target.ms === current.ms;
  }

  private currentText(): string {
    const o = this.o;
    if (o.mode === 'wall')
      return formatWallClock(new Date(this.clock.now()), o.format, o.digits, o.timezone);
    if (o.mode === 'countup') {
      return formatCountClock(Math.floor(this.activeElapsedMs() / 1000), o.format, o.digits);
    }
    // Countdown displays ceil(remaining): it shows the full value at start and
    // hits 00:00 exactly when the remaining time does — then the author's after-zero choice.
    return countdownText(this.remainingMs(), o.format, o.digits, o.afterZero);
  }

  /**
   * Whether the frame loop must keep running PAST zero: counting past zero repaints every second,
   * and a step "after zero" that has not been reached yet needs the remaining time to keep being
   * read (time still passes while the digits hold). Otherwise the countdown freezes at zero as it
   * always did.
   */
  private runsPastZero(): boolean {
    if (afterZeroOf(this.o.afterZero) === 'count-past') return true;
    const steps = this.o.steps?.steps ?? [];
    const lowest = steps.reduce((min, s) => Math.min(min, s.atMs), 0);
    return lowest < 0 && displayedRemainingMs(this.remainingMs()) > lowest;
  }

  /** One step: write the DOM only when the formatted string changed (or the colon phase flips). */
  private paint(): void {
    const next = this.currentText();
    if (this.o.blinkColon === true) {
      this.paintBlink(next);
    } else if (next !== this.lastText) {
      this.o.node.textContent = next;
      this.lastText = next;
    }
    this.paintStep();
    // Clean end: the run completes when 0 paints — then this driver signals its scope, and freezes
    // unless something past zero still needs the time (`runsPastZero`).
    //
    // Gated on `running` since D-141: `retarget()` repaints OUTSIDE a run (the
    // operator may re-aim a loaded-but-not-played template), and a repaint must
    // never be what completes a countdown that has not started.
    //
    // DELTA-RUN-NEXT-VERSION-01-D — `count-past` NEVER completes: a content-driven hold it drives
    // would otherwise take the graphic off air while it is still counting. Every other choice
    // signals completion at zero exactly as before (`close` is that signal's whole purpose).
    if (this.running && this.o.mode === 'countdown' && this.remainingMs() <= 0) {
      if (!this.completed && completesAtZero(this.o.afterZero)) this.fireComplete();
      if (!this.runsPastZero()) {
        this.running = false;
        this.paused = false;
        this.cancelFrame();
      }
    }
  }

  /**
   * Publish the active step on the scope root, LATCHED: one attribute write per step CHANGE, never
   * one per frame — for a three-step countdown that is the establishing write plus the crossings over
   * its whole life. Selection is arithmetic over `remainingMs()`, which this frame already computed,
   * so the ≈1-DOM-write-per-second text discipline is untouched. One attribute on one node restyles
   * any number of elements — the cascade does the distribution — and `onStep` does what CSS cannot.
   *
   * Countdown-only: `wall`/`countup` have no remaining time.
   */
  private paintStep(): void {
    const steps = this.o.steps;
    if (steps === undefined || this.o.mode !== 'countdown') return;
    const next = this.currentStep;
    if (next === this.lastStep) return;
    const root = this.o.stepRoot;
    const attr = this.o.stepAttr;
    if (root !== undefined && attr !== undefined) {
      if (next === null) root.removeAttribute(attr);
      else root.setAttribute(attr, stepTokenValue(next));
    }
    const left = this.lastStep;
    this.lastStep = next;
    this.o.onStep?.(next, left, 'step');
  }

  /**
   * The step this countdown is in RIGHT NOW (a rehearsal override included), whether or not it has
   * published it — what the runtime reads at Take, before the graphic's entrance, so an instance the
   * current step shows enters WITH the graphic rather than after it.
   */
  get currentStep(): StepToken | null {
    const steps = this.o.steps;
    if (steps === undefined || this.o.mode !== 'countdown') return null;
    return this.forcedStep !== undefined ? this.forcedStep : pickStep(steps, this.remainingMs());
  }

  /** Publish the current step now, outside a run (at Take — the clock itself starts later). */
  syncStep(): void {
    if (this.destroyed) return;
    this.paintStep();
  }

  /** Drop the published step and the latch (a fresh run, or teardown). */
  private clearStep(): void {
    if (this.lastStep === null) return;
    const left = this.lastStep;
    const root = this.o.stepRoot;
    const attr = this.o.stepAttr;
    if (root !== undefined && attr !== undefined) root.removeAttribute(attr);
    this.lastStep = null;
    this.o.onStep?.(null, left, 'reset');
  }

  /** The step this driver last published (`null` — none). */
  get activeStep(): StepToken | null {
    return this.lastStep;
  }

  /**
   * REHEARSAL — show `step` (or no step, `null`) regardless of the remaining time, until called
   * again with `undefined`, which returns to the live step. Applies at once, inside or outside a
   * run, through the same latch and `onStep` the live steps use — a rehearsal exercises the code
   * that runs on air. Session-only: nothing is persisted.
   */
  forceStep(step: StepToken | null | undefined): void {
    if (this.destroyed) return;
    this.forcedStep = step;
    this.paintStep();
  }

  private fireComplete(): void {
    if (this.completed) return;
    this.completed = true;
    this.resolveComplete?.();
  }

  /**
   * D-103 — render the time as colon / non-colon segment spans and toggle ONLY the colon
   * spans' OPACITY from the time source. Rebuild the segments when the text changes (the
   * digits tick) or the node isn't segmented yet; flip opacity when the blink phase changes.
   */
  private paintBlink(next: string): void {
    if (!this.blinkBuilt || next !== this.lastText) {
      this.renderColonSegments(next);
      this.lastText = next;
      this.blinkBuilt = true;
      this.lastColonVisible = null; // force the opacity (re)apply below
    }
    const visible = Math.floor(this.clock.now() / (this.o.blinkPeriodMs ?? 1000)) % 2 === 0;
    if (visible !== this.lastColonVisible) {
      for (const span of this.colonSpans) span.style.opacity = visible ? '1' : '0';
      this.lastColonVisible = visible;
    }
  }

  /**
   * Split `text` into runs of `:` (colon spans — the ones that blink) and non-`:` (digit
   * spans), all inside the time node. The colon char is never a mapped digit, so this works
   * for Persian/Arabic-Indic output unchanged. Only the OPACITY of the colon spans toggles, so
   * the digit boxes never reflow.
   */
  private renderColonSegments(text: string): void {
    const node = this.o.node;
    const doc = node.ownerDocument;
    node.textContent = '';
    this.colonSpans = [];
    let i = 0;
    while (i < text.length) {
      const isColon = text[i] === ':';
      let j = i + 1;
      while (j < text.length && (text[j] === ':') === isColon) j += 1;
      const span = doc.createElement('span');
      span.textContent = text.slice(i, j);
      if (isColon) {
        span.dataset['cgClockColon'] = '1';
        this.colonSpans.push(span);
      }
      node.appendChild(span);
      i = j;
    }
  }

  private scheduleFrame(): void {
    this.rafHandle = this.clock.raf(() => {
      this.rafHandle = null;
      if (!this.running || this.paused) return;
      this.paint();
      this.scheduleFrame();
    });
  }

  private cancelFrame(): void {
    if (this.rafHandle !== null) {
      this.clock.cancel(this.rafHandle);
      this.rafHandle = null;
    }
  }
}
