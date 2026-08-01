/**
 * THE STARTUP SPLASH'S TIMING CONTRACT — the arithmetic, shared by both apps.
 *
 * Neither splash can import this at runtime: each paints before its bundle exists, so its
 * clock lives in an inline `<script>` in that app's `index.html` and MIRRORS these rules in
 * a few lines of ES5. What lives here is the contract those lines implement, extracted so
 * it can be reasoned about and tested as a function instead of as a tangle of
 * `setTimeout`s — and shared, so the two products cannot come to obey different rules.
 *
 * Each app's `tests/splash.dom.test.ts` drives its real inline script in jsdom and asserts
 * it against these functions. That is what contains the duplication rather than denying it.
 *
 * WHAT IS PARAMETERISED AND WHY: the FLOORS. The Runtime holds a warm reload for 600 ms
 * because it only has to stop a flash; the Designer holds it for 3000 ms because the owner
 * wants the brand moment on every load. Those are real product decisions and they belong to
 * the apps. Everything else here — the ceiling, the fades, the tick, and every line of the
 * arithmetic — is the same in both, and is therefore fixed here.
 *
 * The three rules the numbers encode:
 *
 *  1. **The ceiling is absolute.** On an on-air tool a stuck splash means the operator has
 *     no door into the application at all — no banner, no settings, no way to see WHY. At
 *     the ceiling the splash goes regardless of boot state and the app shows its own error
 *     surface, which already exists and is better than a spinner in every case.
 *  2. **The warm floor stops a flash; it does not pad.**
 *  3. **The hold EXTENDS to boot.** A boot slower than the floor is never hidden — the
 *     floor is a minimum, not a schedule.
 */

/** Absolute, non-negotiable, and the same for both apps. See rule 1 above. */
export const SPLASH_CEILING_MS = 20_000;

/** How long the fade-out runs before the element is removed from the DOM. */
export const SPLASH_FADE_MS = 450;

/**
 * How long the phase LABEL takes to fade out once boot completes. Opacity only.
 *
 * The label LEAVES rather than settling on a terminal word. A fast cold boot finishes about
 * a second in while the door stays shut until the floor, so a "READY" label would be the
 * thing on screen for most of the splash at exactly the moment the operator still cannot
 * use the app: a word that says "go" over a screen that is not letting them.
 */
export const SPLASH_LABEL_FADE_MS = 350;

/**
 * How often the readout recomputes `splashProgress`.
 *
 * A timer rather than `requestAnimationFrame`, and that is the point: this screen runs
 * WHILE the bundle parses and React makes its first commit, so per-frame script work would
 * be taken from the very boot it exists to cover. A percentage renders whole numbers
 * anyway — ten updates a second reads as continuous and costs almost nothing, and the
 * rail's own CSS `transition` does the smoothing between ticks.
 */
export const SPLASH_TICK_MS = 100;

/** One app's minimum holds. */
export interface SplashFloors {
  /** No session marker at first paint — long enough to be the product's first frame. */
  readonly cold: number;
  /** A reload in the same tab. */
  readonly warm: number;
}

/** The minimum hold for this boot. */
export function splashFloorMs(coldStart: boolean, floors: SplashFloors): number {
  return coldStart ? floors.cold : floors.warm;
}

export interface SplashTimingInput {
  /** `t0` — the first painted frame, the only honest start for this clock. */
  readonly firstPaintAt: number;
  /**
   * When boot completed, or `undefined` while it is still running.
   *
   * Boot-done is defined NARROWLY in both apps: the platform layer having RESOLVED (an
   * error is an answer and counts) plus the first React commit of the app shell. Content
   * loads — snapshot pulls, project indexes, asset lists — are deliberately not part of it:
   * they have their own in-app loading states, and on a broken link they never settle, so
   * gating on them would pin the splash to its ceiling on exactly the installs that most
   * need to reach the UI.
   */
  readonly bootDoneAt?: number | undefined;
  /** No session marker was present at first paint. */
  readonly coldStart: boolean;
  /** This app's floors. */
  readonly floors: SplashFloors;
}

/**
 * The instant the splash dismisses:
 *
 *     dismissAt = min( max(firstPaint + floor, bootDone), firstPaint + ceiling )
 *
 * With boot still incomplete (`bootDoneAt: undefined`) the inner `max` is unbounded, so the
 * ceiling is the answer — which is the ceiling doing its job rather than a special case
 * bolted beside it.
 */
export function splashDismissAt(input: SplashTimingInput): number {
  const { firstPaintAt, bootDoneAt, coldStart, floors } = input;
  const ceilingAt = firstPaintAt + SPLASH_CEILING_MS;
  const floorAt = firstPaintAt + splashFloorMs(coldStart, floors);
  if (bootDoneAt === undefined) return ceilingAt;
  return Math.min(Math.max(floorAt, bootDoneAt), ceilingAt);
}

export interface SplashProgressInput {
  /** `now − firstPaintAt`. */
  readonly elapsedMs: number;
  /** This boot's minimum hold — `splashFloorMs(coldStart, floors)`. */
  readonly floorMs: number;
  /**
   * Steps FINISHED, not steps entered. A label names the work happening NOW, so it is not
   * complete while it is on screen: entering phase *n* (0-based *i*) means *i* steps are
   * behind it, and the last step completes at `done()` — which is why 1 is reachable only
   * once boot is genuinely finished.
   */
  readonly completedSteps: number;
  /** The number of phase labels this app has. */
  readonly totalSteps: number;
  /** The last value returned, so the reading can never go backwards. */
  readonly previous?: number | undefined;
}

/**
 * The ONE definition of progress on these screens — the rail's width and the percentage
 * beside it are the same number, so they can never tell two stories.
 *
 *     progress = monotone-max of  min( elapsed / floor ,  completed / total )
 *
 * It measures **progress toward the door opening**, which is the thing the operator is
 * actually waiting on, and it is honest in three specific ways:
 *
 *  - **Never ahead of real boot.** The `min` gates the clock against work that has genuinely
 *    finished, so a slow storage open visibly PARKS the number on the step that is slow
 *    instead of sweeping past it. It cannot claim measured progress through a step that has
 *    not returned.
 *  - **Never backwards.** Both terms are non-decreasing, and `previous` clamps it anyway — a
 *    reading that retreats reads as a fault even when it is arithmetic.
 *  - **100 means exactly one thing:** the floor has elapsed AND boot is done, which is
 *    precisely when the splash may dismiss. Not "almost" — the render floors rather than
 *    rounds, so 100 cannot appear a moment early.
 *
 * At the ceiling the splash goes regardless, and this may honestly read below 100 at that
 * instant. That is the ceiling telling the truth, not a bug to paper over.
 *
 * @returns 0…1.
 */
export function splashProgress(input: SplashProgressInput): number {
  const { elapsedMs, floorMs, completedSteps, totalSteps, previous } = input;
  const byTime = floorMs > 0 ? elapsedMs / floorMs : 1;
  const bySteps = totalSteps > 0 ? completedSteps / totalSteps : 1;
  const gated = Math.min(byTime, bySteps);
  return Math.max(previous ?? 0, Math.min(1, Math.max(0, gated)));
}

/**
 * `splashProgress` as the integer the readout prints.
 *
 * FLOOR, not round: 99.6 % is not 100 %, and a screen that says 100 while the door is still
 * shut is the same false claim as a terminal `READY` label. It reaches 100 on the tick where
 * progress is exactly 1.
 */
export function splashProgressPercent(progress: number): number {
  return Math.floor(progress * 100);
}
