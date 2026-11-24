import { z } from 'zod';

export const FLOATING_PANEL_IDS = ['layers', 'inspector', 'pgm', 'pvw'] as const;
export type FloatingPanelId = (typeof FLOATING_PANEL_IDS)[number];

const MAX_WINDOW_COORDINATE = 2 ** 31 - 1;
const coordinate = z
  .number()
  .int()
  .min(-(2 ** 31))
  .max(MAX_WINDOW_COORDINATE);
const dimension = z.number().int().positive().max(MAX_WINDOW_COORDINATE);

/** Physical desktop coordinates and restore bounds, including for a maximized panel. */
export const FloatingPanelPlacementSchema = z.object({
  left: coordinate,
  top: coordinate,
  width: dimension,
  height: dimension,
  displayId: z.string().optional(),
  maximized: z.boolean().optional(),
});

export type FloatingPanelPlacement = z.infer<typeof FloatingPanelPlacementSchema>;
export type FloatingPanelPlacements = Partial<Record<FloatingPanelId, FloatingPanelPlacement>>;

export function sameFloatingPanelPlacement(
  current: FloatingPanelPlacement | undefined,
  next: FloatingPanelPlacement,
): boolean {
  return (
    current?.left === next.left &&
    current.top === next.top &&
    current.width === next.width &&
    current.height === next.height &&
    current.displayId === next.displayId &&
    current.maximized === next.maximized
  );
}

/** Restore the valid panel placements even when another entry is obsolete or corrupt. */
export function readFloatingPanelPlacements(value: unknown): FloatingPanelPlacements {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
  const entries = value as Record<string, unknown>;
  const placements: FloatingPanelPlacements = {};
  for (const panel of FLOATING_PANEL_IDS) {
    const placement = FloatingPanelPlacementSchema.safeParse(entries[panel]);
    if (placement.success) placements[panel] = placement.data;
  }
  return placements;
}
