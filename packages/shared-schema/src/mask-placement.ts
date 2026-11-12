import { z } from 'zod';
import { LIVE_REVEAL_MAX_RECTS, LiveRevealRectSchema, type LiveRevealRect } from './elements.js';

/** One authored window's edited rectangle in plate-relative coordinates. */
export const LiveMaskPlacementSchema = z.object({
  lookId: z.string().min(1).optional(),
  plateId: z.string().min(1),
  kind: z.enum(['mask', 'reveal']),
  index: z
    .number()
    .int()
    .nonnegative()
    .max(LIVE_REVEAL_MAX_RECTS - 1),
  authored: LiveRevealRectSchema,
  rect: LiveRevealRectSchema,
});
export type LiveMaskPlacement = z.infer<typeof LiveMaskPlacementSchema>;

export const LiveMaskPlacementsSchema = z.array(LiveMaskPlacementSchema);

type MaskWindow = Pick<LiveMaskPlacement, 'lookId' | 'plateId' | 'kind' | 'index'>;
type MaskScope = Omit<MaskWindow, 'index'>;

export function liveMaskPlacementKey({ lookId, plateId, kind, index }: MaskWindow): string {
  return JSON.stringify([lookId, plateId, kind, index]);
}

export function sameLiveMaskRect(left: LiveRevealRect, right: LiveRevealRect): boolean {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}

/** Replace existing windows in this exact scope without changing their number or order. */
export function maskRectsWithPlacements(
  rects: readonly LiveRevealRect[],
  placements: readonly LiveMaskPlacement[],
  { lookId, plateId, kind }: MaskScope,
): LiveRevealRect[] {
  const edits = new Map(
    placements
      .filter((entry) => {
        const authored = rects[entry.index];
        return (
          entry.lookId === lookId &&
          entry.plateId === plateId &&
          entry.kind === kind &&
          authored !== undefined &&
          sameLiveMaskRect(authored, entry.authored)
        );
      })
      .map(({ index, rect }) => [index, rect]),
  );
  return rects.map((rect, index) => edits.get(index) ?? rect);
}
