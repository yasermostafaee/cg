import { splashDismissAt as sharedDismissAt, type SplashFloors } from '@cg/splash-kit';

export {
  SPLASH_CEILING_MS,
  SPLASH_FADE_MS,
  SPLASH_LABEL_FADE_MS,
  SPLASH_TICK_MS,
  splashProgress,
  splashProgressPercent,
  type SplashProgressInput,
} from '@cg/splash-kit';

/**
 * The Designer splash's TIMING CONTRACT: THIS APP'S NUMBERS, over the shared rules.
 *
 * The arithmetic itself lives in `@cg/splash-kit` (`tools/splash-kit`), because the Runtime's
 * splash obeys the same contract and two copies of a timing rule is two rules that drift.
 * What is here is what is genuinely this app's: its floors, its session key, its phase
 * labels, and the `declare global` for the control surface its own boot path calls.
 *
 * The splash itself cannot import any of it: it paints before the bundle exists, so its clock
 * lives in the inline `<script>` in `apps/designer/index.html` (see that file's header for
 * why). `tests/splash.dom.test.ts` drives that real script in jsdom and asserts its mirrored
 * constants against these — which is what contains the duplication rather than denying it.
 */

/** Cold start — no session marker. Long enough to be the product's first frame. */
export const SPLASH_COLD_FLOOR_MS = 8000;

/**
 * Warm reload — and DELIBERATELY LONGER THAN THE RUNTIME'S 600 ms, by owner decision.
 *
 * The Runtime is the on-air tool: an operator reloading it is usually reloading it in a
 * hurry, so its warm floor is the smallest value that stops a flash and nothing more. Nobody
 * reloads the Designer under that kind of pressure, so here the splash is a brand moment on
 * EVERY load rather than only the first.
 *
 * It also removes a tension the Runtime still carries: the entrance settles at ~1.6 s, so a
 * shorter floor cuts the composition off mid-flight on a reload. At 3000 ms every load, warm
 * or cold, shows the entrance complete.
 */
export const SPLASH_WARM_FLOOR_MS = 3000;

/** This app's floors, in the shape the shared arithmetic takes. */
const FLOORS: SplashFloors = { cold: SPLASH_COLD_FLOOR_MS, warm: SPLASH_WARM_FLOOR_MS };

/**
 * The `sessionStorage` key whose ABSENCE means a cold start.
 *
 * `sessionStorage` survives F5 in the same tab and is empty in a new tab or a new browser, so
 * it IS the cold/warm signal — exactly, with no threshold to guess. A stored wall-clock
 * timestamp would have to invent one, and would read a machine that had simply been sitting
 * idle as a cold start.
 *
 * Its own key, not the Runtime's: the two apps can be open in the same browser at the same
 * time, and sharing the marker would make opening one of them decide the other's floor.
 */
export const SPLASH_SESSION_KEY = 'CG_DESIGNER_SESSION';

/**
 * The phase readout, in order. Each label names the work happening NOW, so the list has
 * exactly one entry per real work step — and a step counts as COMPLETE when the next one
 * begins (the last one completes at `done()`). See `splashProgress`.
 *
 * THREE LABELS, THREE WORK STEPS, and there is deliberately NO TERMINAL "READY" LABEL. A
 * fast cold boot finishes about a second in while the door stays shut until the 8 s floor, so
 * a READY label would be the thing on screen for MOST of the splash at exactly the moment the
 * operator still cannot use the app: a word that says "go" over a screen that is not letting
 * them. When boot completes the label FADES OUT instead (`SPLASH_LABEL_FADE_MS`) and the
 * readout's left side is simply empty; the percentage carries the remaining hold alone.
 *
 * WHAT IS NOT HERE, AND WHY: `LOADING PROJECTS`. The project index is read by the landing
 * screen AFTER React mounts, not by `bootstrap()`, so there is no boot step to name — and
 * gating on it would be wrong anyway, since a project list that fails to settle would pin the
 * splash to its ceiling. `STARTING INTERFACE` replaces it because that step genuinely exists:
 * it is the gap between the platform resolving and `createRoot().render()`.
 */
export const SPLASH_PHASES = ['INITIALIZING', 'OPENING STORAGE', 'STARTING INTERFACE'] as const;

export type SplashPhase = (typeof SPLASH_PHASES)[number];

declare global {
  interface Window {
    /**
     * The splash's own control surface, installed by the inline script in `index.html` — so
     * it is ABSENT whenever the splash is (a build without the element, or a run with the
     * bypass global set). Every call site optional-chains it: the boot path may report to
     * the splash, and may never depend on it.
     */
    __CG_SPLASH__?: {
      /** Advance the readout to a REAL boot step. Unknown keys are ignored. */
      phase(key: SplashPhase): void;
      /** Boot complete — start the minimum-hold countdown. Idempotent. */
      done(): void;
    };
    /**
     * The test-suite door. Set by an init script BEFORE app JS (the Playwright fixture does
     * it for every spec) — deliberately not a URL query parameter, which is a door an
     * operator can reach by bookmark or typo.
     */
    __CG_SPLASH_DISABLED__?: boolean;
  }

  /**
   * The build stamp, injected by `vite.config.ts` from `@cg/splash-kit` — the SAME object the
   * splash's foot is stamped from, so an in-app about/status surface can never disagree with
   * the first frame. Nothing reads it yet; that surface is filed in the repo-root `DEBT.md`.
   */
  const __CG_BUILD__: { readonly version: string; readonly sha: string; readonly builtAt: string };
}

export interface SplashTimingInput {
  /** `t0` — the first painted frame, the only honest start for this clock. */
  readonly firstPaintAt: number;
  /**
   * When boot completed, or `undefined` while it is still running.
   *
   * Boot-done is defined NARROWLY: the platform/storage layer having RESOLVED plus the first
   * React commit of the app shell. Project and asset loads are not part of it — they have
   * their own in-app loading states, and gating on them risks a splash that never lifts.
   */
  readonly bootDoneAt?: number | undefined;
  /** No session marker was present at first paint. */
  readonly coldStart: boolean;
}

/**
 * The minimum hold for this boot — the shared rule, bound to THIS app's floors.
 *
 * The wrapper exists so no call site in this app has to remember to pass the floors, which is
 * precisely how one of them would eventually pass the other product's.
 */
export function splashFloorMs(coldStart: boolean): number {
  return coldStart ? SPLASH_COLD_FLOOR_MS : SPLASH_WARM_FLOOR_MS;
}

/**
 * The instant the splash dismisses:
 *
 *     dismissAt = min( max(firstPaint + floor, bootDone), firstPaint + ceiling )
 *
 * The arithmetic is `@cg/splash-kit`'s; this binds it to the Designer's floors.
 */
export function splashDismissAt(input: SplashTimingInput): number {
  return sharedDismissAt({ ...input, floors: FLOORS });
}
