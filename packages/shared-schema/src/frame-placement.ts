import { z } from 'zod';
import type { LiveFrameTarget } from './live-fit.js';
import type { LiveSourceRect } from './live-source.js';

/** A frame's edited rectangle in the template's composition pixels. */
export const LiveFramePlacementSchema = z.object({
  frameKey: z.string().min(1),
  lookId: z.string().min(1).optional(),
  rect: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite().positive(),
    height: z.number().finite().positive(),
  }),
});
export type LiveFramePlacement = z.infer<typeof LiveFramePlacementSchema>;

export const LiveFramePlacementsSchema = z.array(LiveFramePlacementSchema);

export function framePlacementFits(
  placement: LiveFramePlacement,
  authored: LiveSourceRect,
  resize: LiveFrameTarget['resize'],
): boolean {
  const { x, y, width, height } = placement.rect;
  if (authored.width <= 0 || authored.height <= 0) return false;
  const scaleX = width / authored.width;
  const scaleY = height / authored.height;
  return (
    Number.isFinite(x + width) &&
    Number.isFinite(y + height) &&
    Number.isFinite(scaleX) &&
    Number.isFinite(scaleY) &&
    (resize === 'free' || Math.abs(scaleX / scaleY - 1) <= 1e-6)
  );
}
