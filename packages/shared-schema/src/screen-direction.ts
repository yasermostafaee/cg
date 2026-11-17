import { z } from 'zod';

export const ScreenDirectionSchema = z.enum(['left', 'right', 'up', 'down']);
export type ScreenDirection = z.infer<typeof ScreenDirectionSchema>;

export function screenDirectionVector(
  direction: ScreenDirection,
): Readonly<{ x: number; y: number }> {
  return {
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
  }[direction];
}
