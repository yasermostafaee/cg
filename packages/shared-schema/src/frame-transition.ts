import { z } from 'zod';
import { LiveFramePlacementSchema } from './frame-placement.js';

export const FRAME_TRANSITION_MIN_MS = 100;
export const FRAME_TRANSITION_MAX_MS = 1_000;
export const FRAME_TRANSITION_DEFAULT_MS = 400;

export const FrameTransitionSchema = z.object({
  motion: z.enum(['cut', 'linear', 'ease-in', 'ease-out', 'ease-in-out', 'bounce', 'elastic']),
  fade: z.boolean(),
  durationMs: z.number().int().min(FRAME_TRANSITION_MIN_MS).max(FRAME_TRANSITION_MAX_MS),
});
export type FrameTransition = z.infer<typeof FrameTransitionSchema>;

/** The authored plate and artwork retained between two preset instances. */
export const PresetTransitionFrameSchema = z.object({
  frameKey: z.string().min(1),
  elementId: z.string().min(1),
  artworkId: z.string().min(1),
});
export type PresetTransitionFrame = z.infer<typeof PresetTransitionFrameSchema>;

interface PresetTransitionStages {
  readonly exit: boolean;
  readonly move: boolean;
  readonly enter: boolean;
}

/** Divide a transition between the stages present on this particular route. */
export function presetTransitionDurations(
  ticks: number,
  stages: PresetTransitionStages,
): Record<keyof PresetTransitionStages, number> {
  const keys = ['exit', 'move', 'enter'] as const;
  let remaining = keys.filter((key) => stages[key]).length;
  let budget = Math.max(remaining, Math.round(ticks));
  const result = { exit: 0, move: 0, enter: 0 };
  for (const key of keys) {
    if (!stages[key]) continue;
    result[key] = Math.round(budget / remaining);
    budget -= result[key];
    remaining -= 1;
  }
  return result;
}

const EasingSchema = z.enum(['linear', 'easeinquad', 'easeoutquad', 'easeinoutquad']);
type Easing = z.infer<typeof EasingSchema>;

export const FrameTransitionPhaseSchema = z
  .object({
    authoredPreset: z.literal(true).optional(),
    destinationLookId: z.string().min(1).optional(),
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
      .max(128),
    opacityArtwork: z
      .array(
        z.object({
          key: z.string().min(1),
          lookId: z.string().min(1),
          fromOpacity: z.number().min(0).max(1),
          toOpacity: z.number().min(0).max(1),
        }),
      )
      .min(1)
      .max(128)
      .optional(),
    hideFallbackPlateIds: z.array(z.string().min(1)).max(128).optional(),
    /** Exact authored instance paths of outgoing artwork held hidden during a preset switch. */
    hidePresetArtworkKeys: z.array(z.string().min(1)).max(128).optional(),
  })
  .refine(
    ({ authoredPreset, destinationLookId, frames, opacityArtwork, hidePresetArtworkKeys }) =>
      (frames.length > 0 ||
        opacityArtwork !== undefined ||
        (hidePresetArtworkKeys?.length ?? 0) > 0) &&
      ((opacityArtwork === undefined && destinationLookId === undefined) ||
        authoredPreset === true),
  );
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

type ReboundMotion = 'bounce' | 'elastic';
type BasicMotion = Exclude<FrameTransition['motion'], 'cut' | ReboundMotion>;

const easingByMotion = {
  linear: 'linear',
  'ease-in': 'easeinquad',
  'ease-out': 'easeoutquad',
  'ease-in-out': 'easeinoutquad',
} satisfies Record<BasicMotion, Easing>;

// Split motion into two equal-length native tweens when opacity needs a midpoint.
// These progress values give both segments the same velocity at their join.
const fadeMotion = {
  linear: { midpoint: 0.5, first: 'linear', second: 'linear' },
  'ease-in': { midpoint: 1 / 3, first: 'easeinquad', second: 'linear' },
  'ease-out': { midpoint: 2 / 3, first: 'linear', second: 'easeoutquad' },
  'ease-in-out': { midpoint: 0.5, first: 'easeinquad', second: 'easeoutquad' },
} satisfies Record<BasicMotion, { midpoint: number; first: Easing; second: Easing }>;

const reboundMotion = {
  bounce: [
    { time: 0.55, progress: 1, easing: 'easeinquad' },
    { time: 0.76, progress: 0.88, easing: 'easeoutquad' },
    { time: 1, progress: 1, easing: 'easeinquad' },
  ],
  elastic: [
    { time: 0.5, progress: 1, easing: 'easeoutquad' },
    { time: 0.66, progress: 0.82, easing: 'easeinoutquad' },
    { time: 0.81, progress: 1, easing: 'easeinoutquad' },
    { time: 0.9, progress: 0.96, easing: 'easeinoutquad' },
    { time: 1, progress: 1, easing: 'easeoutquad' },
  ],
} as const;

/** Rebound inside the geometry's swept range so every CLIP and FILL has positive dimensions. */
function reboundPhases(
  motion: ReboundMotion,
  fade: boolean,
  frameCount: number,
): FrameTransitionStep[] {
  const total = Math.max(fade ? 2 : 1, frameCount);
  const stops = reboundMotion[motion];
  if (total < stops.length) {
    if (!fade) return [{ frames: total, progress: 1, easing: 'easeoutquad', opacity: 1 }];
    const first = Math.floor(total / 2);
    return [
      { frames: first, progress: 2 / 3, easing: 'linear', opacity: 0 },
      { frames: total - first, progress: 1, easing: 'easeoutquad', opacity: 1 },
    ];
  }
  let previousEnd = 0;
  let fadeBottom = 0;
  return stops.map(({ time, progress, easing }, index) => {
    const remaining = stops.length - index - 1;
    const end = Math.min(total - remaining, Math.max(previousEnd + 1, Math.round(total * time)));
    const frames = end - previousEnd;
    previousEnd = end;
    if (index === 0) fadeBottom = end;
    return {
      frames,
      easing,
      progress,
      opacity: fade ? (end - fadeBottom) / (total - fadeBottom) : 1,
    };
  });
}

/** Phase endpoints in the channel's frame clock. Opacity is multiplied by the seat's applied opacity. */
export function frameTransitionPhases(
  { motion, fade }: FrameTransition,
  frameCount: number,
): FrameTransitionStep[] {
  if (motion === 'bounce' || motion === 'elastic') return reboundPhases(motion, fade, frameCount);
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
