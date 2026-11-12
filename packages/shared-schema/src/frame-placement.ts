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
  moveAllowed = true,
): boolean {
  const { x, y, width, height } = placement.rect;
  if (authored.width <= 0 || authored.height <= 0) return false;
  const scaleX = width / authored.width;
  const scaleY = height / authored.height;
  if (
    !Number.isFinite(x + width) ||
    !Number.isFinite(y + height) ||
    !Number.isFinite(scaleX) ||
    !Number.isFinite(scaleY) ||
    scaleX <= 0 ||
    scaleY <= 0
  )
    return false;
  const epsilon = 1e-6;
  if (
    !moveAllowed &&
    (Math.abs(x - authored.x + (width - authored.width) / 2) > epsilon ||
      Math.abs(y - authored.y + (height - authored.height) / 2) > epsilon)
  )
    return false;
  if (resize === 'move-only') {
    return Math.abs(scaleX - 1) <= epsilon && Math.abs(scaleY - 1) <= epsilon;
  }
  return resize === 'free' || Math.abs(scaleX / scaleY - 1) <= epsilon;
}
