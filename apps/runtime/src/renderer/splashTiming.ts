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
 * R-035 — the Runtime splash's TIMING CONTRACT: THIS APP'S NUMBERS, over the shared rules.
 *
 * The arithmetic itself lives in `@cg/splash-kit` (`tools/splash-kit`), because the
 * Designer's splash obeys the same contract and two copies of a timing rule is two rules
 * that drift. What is here is what is genuinely this app's: its floors, its session key, its
 * phase labels, and the `declare global` for the control surface its own boot path calls.
 *
 * The splash itself cannot import any of it: it paints before the bundle exists, so its
 * clock lives in the inline `<script>` in `apps/runtime/index.html` (see that file's header
 * for why).
 *
 * THE DUPLICATION IS REAL AND IT IS CONTAINED, NOT DENIED. `tests/splash.dom.test.ts`
 * extracts the inline script out of the real `index.html`, drives it in jsdom, and
 * asserts (a) its constants equal the ones exported here and (b) it dismisses at the
 * instant `splashDismissAt` says it should. If the two ever disagree, that test is
 * what says so — nothing else can, because the two live in different languages of the
 * same document.
 */

/**
 * Cold start — no session marker. Long enough to be the product's first frame.
 *
 * OWNER DECISION, taken knowingly while looking at this splash: both products hold the same
 * eight seconds. A concern was raised and answered rather than overlooked — this is the
 * on-air tool, and a cold start is also a RECOVERY path (a crashed tab, a reopened browser),
 * so the hold is paid at moments that are not always calm. The owner's call stands; if the
 * wait proves costly in practice the agreed answer is an Esc-to-skip door that skips only
 * the REMAINING HOLD and never the load, not a quietly shortened floor.
 */
export const SPLASH_COLD_FLOOR_MS = 8000;

/**
 * Warm reload — a reload in the same tab.
 *
 * Three seconds rather than the 600 ms this started at: the splash is a brand moment on
 * EVERY load, not only the first, and 600 ms cut the entrance off mid-flight (it settles at
 * ~1.6 s). Identical to the Designer's, deliberately — one contract, both products.
 */
export const SPLASH_WARM_FLOOR_MS = 3000;

/** This app's floors, in the shape the shared arithmetic takes. */
const FLOORS: SplashFloors = { cold: SPLASH_COLD_FLOOR_MS, warm: SPLASH_WARM_FLOOR_MS };

/**
 * The `sessionStorage` key whose ABSENCE means a cold start.
 *
 * `sessionStorage` survives F5 in the same tab and is empty in a new tab or a new
 * browser, so it IS the cold/warm signal — exactly, with no threshold to guess. A
 * stored wall-clock timestamp would have to invent one, and would read a machine
 * that had simply been sitting idle as a cold start.
 */
export const SPLASH_SESSION_KEY = 'CG_RUNTIME_SESSION';

/**
 * The phase readout, in order. Each label names the work happening NOW, so the list has
 * exactly one entry per real work step — and a step counts as COMPLETE when the next one
 * begins (the last one completes at `done()`). See `splashProgress`.
 *
 * THREE LABELS, THREE WORK STEPS — and there is deliberately NO TERMINAL "READY" LABEL.
 * A fast cold boot finishes about a second in while the door stays shut until the cold
 * floor, so a READY label would be the thing on screen for MOST of the splash at exactly
 * the moment the operator still cannot use the app: a word that says "go" over a screen
 * that is not letting them. When boot completes the label FADES OUT instead
 * (`SPLASH_LABEL_FADE_MS`) and the readout's left side is simply empty; the percentage
 * carries the remaining hold alone.
 *
 * Every one of these is a step that EXISTS in `main.tsx`'s boot path; none was invented
 * to lengthen the list.
 */
export const SPLASH_PHASES = ['INITIALIZING', 'PROBING BRIDGE', 'STARTING INTERFACE'] as const;

export type SplashPhase = (typeof SPLASH_PHASES)[number];

declare global {
  interface Window {
    /**
     * The splash's own control surface, installed by the inline script in
     * `index.html` — so it is ABSENT whenever the splash is (a build without the
     * element, or a run with the bypass global set). Every call site optional-chains
     * it: the boot path may report to the splash, and may never depend on it.
     */
    __CG_SPLASH__?: {
      /** Advance the readout to a REAL boot step. Unknown keys are ignored. */
      phase(key: SplashPhase): void;
      /** Boot complete — start the minimum-hold countdown. Idempotent. */
      done(): void;
    };
    /**
     * The test-suite door. Set by an init script BEFORE app JS (the Playwright fixture
     * does it for every spec) — deliberately not a URL query parameter, which is a door
     * an operator can reach by bookmark or typo.
     */
    __CG_SPLASH_DISABLED__?: boolean;
  }

  /**
   * The build stamp, injected by `vite.config.ts` — the SAME object the splash's foot
   * is stamped from, so an in-app about/status surface can never disagree with the
   * first frame. Nothing reads it yet; that surface is filed as item 3 in
   * `openspec/changes/runtime-splash-screen/DEBT.md`.
   */
  const __CG_BUILD__: { readonly version: string; readonly sha: string; readonly builtAt: string };
}

export interface SplashTimingInput {
  /** `t0` — the first painted frame, the only honest start for this clock. */
  readonly firstPaintAt: number;
  /**
   * When boot completed, or `undefined` while it is still running.
   *
   * Boot-done is defined NARROWLY: bridge selection resolved (`live`, `offline-mock` and
   * `disconnected` ALL count as resolved) plus the first React commit of the app shell.
   * Snapshot pulls (stack / health / lock) are not part of it — they have their own in-app
   * loading states, and on a `disconnected` link they never settle, so gating on them would
   * hold the splash to the ceiling on exactly the installs that most need to reach the UI.
   */
  readonly bootDoneAt?: number | undefined;
  /** No session marker was present at first paint. */
  readonly coldStart: boolean;
}

/**
 * The minimum hold for this boot — the shared rule, bound to THIS app's floors.
 *
 * The wrapper exists so no call site in this app has to remember to pass the floors, which
 * is precisely how one of them would eventually pass the other product's.
 */
export function splashFloorMs(coldStart: boolean): number {
  return coldStart ? SPLASH_COLD_FLOOR_MS : SPLASH_WARM_FLOOR_MS;
}

/**
 * The instant the splash dismisses:
 *
 *     dismissAt = min( max(firstPaint + floor, bootDone), firstPaint + ceiling )
 *
 * The arithmetic is `@cg/splash-kit`'s; this binds it to the Runtime's floors.
 */
export function splashDismissAt(input: SplashTimingInput): number {
  return sharedDismissAt({ ...input, floors: FLOORS });
}
