import { liveCropWindow, MAX_LIVE_CROP_ZOOM, type LiveCropFocus } from '@cg/shared-schema';

export const PAN_CORNERS = [
  { name: 'top left', x: 0, y: 0 },
  { name: 'top right', x: 1, y: 0 },
  { name: 'bottom left', x: 0, y: 1 },
  { name: 'bottom right', x: 1, y: 1 },
] as const;

export type PanCorner = (typeof PAN_CORNERS)[number];

export function clampCropFraction(value: number, max = 1): number {
  return Math.max(0, Math.min(max, value));
}

/** Project the drag onto the crop's diagonal in screen pixels, anchoring the opposite corner. */
export function resizePanCrop(
  focus: LiveCropFocus,
  plateAspect: number,
  sourceAspect: number,
  corner: PanCorner,
  screen: { width: number; height: number },
  dx: number,
  dy: number,
): LiveCropFocus {
  if (dx === 0 && dy === 0) return focus;
  const widest = liveCropWindow(plateAspect, sourceAspect);
  const initial = liveCropWindow(plateAspect, sourceAspect, focus);
  const diagonalX = widest.width * screen.width * (corner.x === 0 ? -1 : 1);
  const diagonalY = widest.height * screen.height * (corner.y === 0 ? -1 : 1);
  const drag = (dx * diagonalX + dy * diagonalY) / (diagonalX * diagonalX + diagonalY * diagonalY);
  const fraction = Math.max(
    1 / MAX_LIVE_CROP_ZOOM,
    clampCropFraction(1 / (focus.zoom ?? 1) + drag),
  );
  const travelX = Math.max(0, 1 - widest.width * fraction);
  const travelY = Math.max(0, 1 - widest.height * fraction);
  const desiredX = initial.x + (corner.x === 0 ? initial.width - widest.width * fraction : 0);
  const desiredY = initial.y + (corner.y === 0 ? initial.height - widest.height * fraction : 0);
  return {
    x: travelX < 1e-6 ? focus.x : clampCropFraction(desiredX, travelX) / travelX,
    y: travelY < 1e-6 ? focus.y : clampCropFraction(desiredY, travelY) / travelY,
    zoom: 1 / fraction,
  };
}
