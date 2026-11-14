import { z } from 'zod';
import { LiveFramePlacementSchema } from './frame-placement.js';

export const FRAME_TRANSITION_MIN_MS = 100;
export const FRAME_TRANSITION_MAX_MS = 1_000;
export const FRAME_TRANSITION_DEFAULT_MS = 400;

export const FrameTransitionSchema = z.object({
  motion: z.enum(['cut', 'linear', 'ease-in', 'ease-out', 'ease-in-out']),
  fade: z.boolean(),
  durationMs: z.number().int().min(FRAME_TRANSITION_MIN_MS).max(FRAME_TRANSITION_MAX_MS),
});
export type FrameTransition = z.infer<typeof FrameTransitionSchema>;

const EasingSchema = z.enum(['linear', 'easeinquad', 'easeoutquad', 'easeinoutquad']);
type Easing = z.infer<typeof EasingSchema>;

export const FrameTransitionPhaseSchema = z.object({
  durationMs: z.number().finite().min(0).max(2_000),
  delayMs: z.number().finite().min(0).max(250).optional(),
  easing: EasingSchema,
  frames: z
    .array(
      LiveFramePlacementSchema.omit({ rect: true }).extend({
        from: LiveFramePlacementSchema.shape.rect,
        to: LiveFramePlacementSchema.shape.rect,
        fromOpacity: z.number().min(0).max(1),
        toOpacity: z.number().min(0).max(1),
      }),
    )
    .min(1)
    .max(128),
  hideFallbackPlateIds: z.array(z.string().min(1)).max(128).optional(),
});
export type FrameTransitionPhase = z.infer<typeof FrameTransitionPhaseSchema>;

export function frameTransitionProgress(easing: Easing, elapsedFraction: number): number {
  const t = Math.min(1, Math.max(0, elapsedFraction));
  switch (easing) {
    case 'linear':
      return t;
    case 'easeinquad':
      return t * t;
    case 'easeoutquad':
      return 1 - (1 - t) * (1 - t);
    case 'easeinoutquad':
      return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
  }
}

interface FrameTransitionStep {
  frames: number;
  easing: Easing;
  progress: number;
  opacity: number;
}

const easingByMotion = {
  linear: 'linear',
  'ease-in': 'easeinquad',
  'ease-out': 'easeoutquad',
  'ease-in-out': 'easeinoutquad',
} satisfies Record<Exclude<FrameTransition['motion'], 'cut'>, Easing>;

// Split motion into two equal-length native tweens when opacity needs a midpoint.
// These progress values give both segments the same velocity at their join.
const fadeMotion = {
  linear: { midpoint: 0.5, first: 'linear', second: 'linear' },
  'ease-in': { midpoint: 1 / 3, first: 'easeinquad', second: 'linear' },
  'ease-out': { midpoint: 2 / 3, first: 'linear', second: 'easeoutquad' },
  'ease-in-out': { midpoint: 0.5, first: 'easeinquad', second: 'easeoutquad' },
} satisfies Record<
  Exclude<FrameTransition['motion'], 'cut'>,
  { midpoint: number; first: Easing; second: Easing }
>;

/** Phase endpoints in the channel's frame clock. Opacity is multiplied by the seat's applied opacity. */
export function frameTransitionPhases(
  { motion, fade }: FrameTransition,
  frameCount: number,
): FrameTransitionStep[] {
  if (!fade) {
    return motion === 'cut'
      ? []
      : [
          {
            frames: Math.max(1, frameCount),
            easing: easingByMotion[motion],
            progress: 1,
            opacity: 1,
          },
        ];
  }
  const half = Math.max(1, Math.round(frameCount / 2));
  if (motion === 'cut') {
    return [
      { frames: half, easing: 'linear', progress: 0, opacity: 0 },
      { frames: 0, easing: 'linear', progress: 1, opacity: 0 },
      { frames: half, easing: 'linear', progress: 1, opacity: 1 },
    ];
  }
  const { midpoint, first, second } = fadeMotion[motion];
  return [
    { frames: half, easing: first, progress: midpoint, opacity: 0 },
    { frames: half, easing: second, progress: 1, opacity: 1 },
  ];
}
