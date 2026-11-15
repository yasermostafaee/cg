import { z } from 'zod';
import { FRAME_TRANSITION_MAX_MS, FRAME_TRANSITION_MIN_MS } from './frame-transition.js';

export const InputTransitionDirectionSchema = z.enum(['left', 'right', 'up', 'down']);

export const InputTransitionSchema = z.object({
  mode: z.enum(['cut', 'fade', 'push', 'slide-over']),
  durationMs: z.number().int().min(FRAME_TRANSITION_MIN_MS).max(FRAME_TRANSITION_MAX_MS),
  direction: InputTransitionDirectionSchema.optional(),
});

export type InputTransition = z.infer<typeof InputTransitionSchema>;
export type InputTransitionDirection = z.infer<typeof InputTransitionDirectionSchema>;

export const DEFAULT_INPUT_SLIDE_DIRECTION: InputTransitionDirection = 'left';

export function isInputSlideMode(mode: InputTransition['mode']): mode is 'push' | 'slide-over' {
  return mode === 'push' || mode === 'slide-over';
}

/** Side the new picture enters from, in screen coordinates. */
export function inputSlideVector(
  direction = DEFAULT_INPUT_SLIDE_DIRECTION,
): Readonly<{ x: number; y: number }> {
  return {
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
  }[direction];
}
