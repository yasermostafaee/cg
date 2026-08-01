/**
 * R-031 — the startup splash's TIMING CONTRACT, as pure arithmetic.
 *
 * The splash itself cannot import this module: it paints before the bundle
 * exists, so its clock lives in the inline `<script>` in `apps/runtime/index.html`
 * (see that file's header for why). What lives HERE is the contract those few
 * inline lines implement — extracted so it can be reasoned about and tested as a
 * function instead of as a tangle of `setTimeout`s.
 *
 * THE DUPLICATION IS REAL AND IT IS CONTAINED, NOT DENIED. `tests/splash.dom.test.ts`
 * extracts the inline script out of the real `index.html`, drives it in jsdom, and
 * asserts (a) its constants equal the ones exported here and (b) it dismisses at the
 * instant `splashDismissAt` says it should. If the two ever disagree, that test is
 * what says so — nothing else can, because the two live in different languages of the
 * same document.
 *
 * The three rules the numbers encode:
 *
 *  1. **The ceiling is absolute.** On an on-air tool a stuck splash means the operator
 *     has no door into the application at all — no banner, no settings, no way to see
 *     WHY. At the ceiling the splash goes regardless of boot state and the app shows
 *     its own DISCONNECTED / error surface, which already exists and is better than a
 *     spinner in every case.
 *  2. **The warm floor stops a flash; it does not pad.** 600 ms is the smallest value
 *     that keeps a fast reload from strobing.
 *  3. **The hold EXTENDS to boot.** A boot slower than the floor is never hidden — the
 *     floor is a minimum, not a schedule.
 */

/** Cold start — no session marker. Long enough to be the product's first frame. */
export const SPLASH_COLD_FLOOR_MS = 5000;

/** Warm reload — the smallest hold that keeps a fast F5 from strobing. */
export const SPLASH_WARM_FLOOR_MS = 600;

/** Absolute, non-negotiable. See rule 1 above. */
export const SPLASH_CEILING_MS = 20_000;

/**
 * The `sessionStorage` key whose ABSENCE means a cold start.
 *
 * `sessionStorage` survives F5 in the same tab and is empty in a new tab or a new
 * browser, so it IS the cold/warm signal — exactly, with no threshold to guess. A
 * stored wall-clock timestamp would have to invent one, and would read a machine
 * that had simply been sitting idle as a cold start.
 */
export const SPLASH_SESSION_KEY = 'CG_RUNTIME_SESSION';

/** How long the fade-out runs before the element is removed from the DOM. */
export const SPLASH_FADE_MS = 450;

/**
 * How long the phase LABEL takes to fade out once boot completes. Opacity only.
 *
 * See `SPLASH_PHASES` for why the label leaves rather than settling on a word.
 */
export const SPLASH_LABEL_FADE_MS = 350;

/**
 * The phase readout, in order. The rail advances by COMPLETED PHASE — entering
 * phase *n* of 3 puts the rail at *n*⁄3 and the readout at `n / 3`.
 *
 * THREE LABELS, THREE WORK STEPS, each naming the work happening NOW — and there is
 * deliberately NO TERMINAL "READY" LABEL. A fast cold boot finishes about a second in
 * while the door stays shut until the 5 s floor, so a READY label would be the thing on
 * screen for MOST of the splash at exactly the moment the operator still cannot use the
 * app: a word that says "go" over a screen that is not letting them. When boot completes
 * the label FADES OUT instead (`SPLASH_LABEL_FADE_MS`) and the readout's left side is
 * simply empty; the counter carries the remaining hold alone.
 *
 * A STEP COUNTER rather than a percentage, deliberately: a percentage claims measured
 * progress, and nothing here measures anything — the bridge probe is a bounded wait, not
 * a quantity.
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
   * Boot-done is defined NARROWLY: bridge selection resolved (`live`,
   * `offline-mock` and `disconnected` ALL count as resolved) plus the first React
   * commit of the app shell. Snapshot pulls (stack / health / lock) are not part of
   * it — they have their own in-app loading states, and on a `disconnected` link
   * they never settle, so gating on them would hold the splash to the ceiling on
   * exactly the installs that most need to reach the UI.
   */
  readonly bootDoneAt?: number | undefined;
  /** No session marker was present at first paint. */
  readonly coldStart: boolean;
}

/** The minimum hold for this boot. */
export function splashFloorMs(coldStart: boolean): number {
  return coldStart ? SPLASH_COLD_FLOOR_MS : SPLASH_WARM_FLOOR_MS;
}

/**
 * The instant the splash dismisses:
 *
 *     dismissAt = min( max(firstPaint + floor, bootDone), firstPaint + ceiling )
 *
 * With boot still incomplete (`bootDoneAt: undefined`) the inner `max` is unbounded,
 * so the ceiling is the answer — which is the ceiling doing its job rather than a
 * special case bolted beside it.
 */
export function splashDismissAt(input: SplashTimingInput): number {
  const { firstPaintAt, bootDoneAt, coldStart } = input;
  const ceilingAt = firstPaintAt + SPLASH_CEILING_MS;
  const floorAt = firstPaintAt + splashFloorMs(coldStart);
  if (bootDoneAt === undefined) return ceilingAt;
  return Math.min(Math.max(floorAt, bootDoneAt), ceilingAt);
}
