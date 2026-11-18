/** EBU R95 v1.1 note 5; HD percentages also match SMPTE ST 2046-1:2009 §5. */
export const BROADCAST_SAFE_AREA_TITLE =
  'Action 93% · Graphics 90% · EBU R95 for 16:9; proportional guides for other ratios · Preview only';

export interface BroadcastSafeArea {
  kind: 'action' | 'graphics';
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Concentric guides in active-picture pixels, never in the surrounding letterbox. */
export function broadcastSafeAreas(
  width: number,
  height: number,
  aspect: BroadcastGuideAspect = 'auto',
): readonly BroadcastSafeArea[] {
  const frame = broadcastGuideFrame(width, height, aspect);
  if (frame === null) return [];
  return (
    [
      ['action', 93, 'Action 93%'],
      ['graphics', 90, 'Graphics 90%'],
    ] as const
  ).map(([kind, percent, label]) => {
    // ST 2046-1 §5 rounds the protected width/height to whole raster samples.
    const protectedWidth = Math.min(
      frame.width,
      Math.max(1, Math.round((frame.width * percent) / 100)),
    );
    const protectedHeight = Math.min(
      frame.height,
      Math.max(1, Math.round((frame.height * percent) / 100)),
    );
    return {
      kind,
      label,
      x: frame.x + (frame.width - protectedWidth) / 2,
      y: frame.y + (frame.height - protectedHeight) / 2,
      width: protectedWidth,
      height: protectedHeight,
    };
  });
}
import type {
  BroadcastGuideAspect,
  BroadcastGuideLine,
  BroadcastGuideProfile,
} from './broadcast-guide-preferences.js';

export interface BroadcastGuideFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A selected composition reference is contained inside the active picture, never its bars. */
export function broadcastGuideFrame(
  width: number,
  height: number,
  aspect: BroadcastGuideAspect = 'auto',
): BroadcastGuideFrame | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const ratio = aspect === '16:9' ? 16 / 9 : aspect === '4:3' ? 4 / 3 : width / height;
  const frameWidth = Math.min(width, height * ratio);
  const frameHeight = Math.min(height, width / ratio);
  return {
    x: (width - frameWidth) / 2,
    y: (height - frameHeight) / 2,
    width: frameWidth,
    height: frameHeight,
  };
}

export interface BroadcastCustomGuideLine extends BroadcastGuideLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function broadcastCustomGuideLines(
  width: number,
  height: number,
  profile: BroadcastGuideProfile,
): readonly BroadcastCustomGuideLine[] {
  const frame = broadcastGuideFrame(width, height, profile.aspect);
  if (frame === null) return [];
  return profile.lines
    .filter((line) => line.visible)
    .map((line) => {
      const x = frame.x + (frame.width * line.position) / 100;
      const y = frame.y + (frame.height * line.position) / 100;
      return line.axis === 'x'
        ? { ...line, x1: x, y1: frame.y, x2: x, y2: frame.y + frame.height }
        : { ...line, x1: frame.x, y1: y, x2: frame.x + frame.width, y2: y };
    });
}
