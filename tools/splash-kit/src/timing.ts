/** Timing mirrored by the pre-bundle inline splash scripts in both apps. */
export const SPLASH_CEILING_MS = 20_000;
export const SPLASH_FADE_MS = 180;
export const SPLASH_LABEL_FADE_MS = 140;

export interface SplashTimingInput {
  readonly firstPaintAt: number;
  /** Platform boot resolved and the application's first shell committed. */
  readonly bootDoneAt?: number | undefined;
}

/** Dismiss as soon as boot finishes or the backstop expires. */
export function splashDismissAt({ firstPaintAt, bootDoneAt }: SplashTimingInput): number {
  const ceilingAt = firstPaintAt + SPLASH_CEILING_MS;
  return Math.min(bootDoneAt ?? ceilingAt, ceilingAt);
}

export interface SplashProgressInput {
  readonly completedSteps: number;
  readonly totalSteps: number;
  readonly previous?: number | undefined;
}

/** The progress rail and number both reflect completed phases. */
export function splashProgress({
  completedSteps,
  totalSteps,
  previous = 0,
}: SplashProgressInput): number {
  const phaseFraction = totalSteps > 0 ? completedSteps / totalSteps : 1;
  return Math.min(1, Math.max(0, previous, phaseFraction));
}

/** Floor so the final percentage belongs only to completed work. */
export function splashProgressPercent(progress: number): number {
  return Math.floor(progress * 100);
}
