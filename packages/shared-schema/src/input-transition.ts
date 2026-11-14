import { z } from 'zod';
import { FRAME_TRANSITION_MAX_MS, FRAME_TRANSITION_MIN_MS } from './frame-transition.js';

export const InputTransitionSchema = z.object({
  mode: z.enum(['cut', 'fade']),
  durationMs: z.number().int().min(FRAME_TRANSITION_MIN_MS).max(FRAME_TRANSITION_MAX_MS),
});

export type InputTransition = z.infer<typeof InputTransitionSchema>;
