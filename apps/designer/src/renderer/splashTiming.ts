export {
  SPLASH_CEILING_MS,
  SPLASH_FADE_MS,
  SPLASH_LABEL_FADE_MS,
  splashDismissAt,
  splashProgress,
  splashProgressPercent,
  type SplashProgressInput,
  type SplashTimingInput,
} from '@cg/splash-kit';

/** The real startup phases reported to the pre-bundle splash. */
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
      /** Boot complete. Start dismissal immediately. */
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
