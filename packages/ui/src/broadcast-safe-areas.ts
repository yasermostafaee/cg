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
  customAspect?: BroadcastGuideCustomAspect,
): readonly BroadcastSafeArea[] {
  const frame = broadcastGuideFrame(width, height, aspect, customAspect);
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
import {
  broadcastGuideFrameSettings,
  normalizeBroadcastGuideCustomAspect,
  type BroadcastGuideAspect,
  type BroadcastGuideCustomAspect,
  type BroadcastGuideLine,
  type BroadcastGuideProfile,
  type BroadcastGuidePercent,
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
  customAspect?: BroadcastGuideCustomAspect,
): BroadcastGuideFrame | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const custom = normalizeBroadcastGuideCustomAspect(customAspect);
  const ratio =
    aspect === '16:9'
      ? 16 / 9
      : aspect === '4:3'
        ? 4 / 3
        : aspect === 'custom' && custom !== null
          ? custom.width / custom.height
          : width / height;
  const frameWidth = Math.min(width, height * ratio);
  const frameHeight = Math.min(height, width / ratio);
  return {
    x: (width - frameWidth) / 2,
    y: (height - frameHeight) / 2,
    width: frameWidth,
    height: frameHeight,
  };
}

export interface BroadcastGuideRectangle extends BroadcastGuideFrame {
  frameId: string;
  customAspect?: BroadcastGuideCustomAspect;
  aspect: BroadcastGuideAspect;
  percent: BroadcastGuidePercent;
  stroke: string;
}

export function broadcastGuideRectangles(
  width: number,
  height: number,
  profile: BroadcastGuideProfile,
): readonly BroadcastGuideRectangle[] {
  return broadcastGuideFrameSettings(profile).flatMap(
    ({ id, aspect, customAspect, visible, color, borders }) => {
      if (!visible) return [];
      const frame = broadcastGuideFrame(width, height, aspect, customAspect);
      if (frame === null || (aspect === 'custom' && customAspect === undefined)) return [];
      return borders.flatMap((border) => {
        if (!border.visible) return [];
        const frameWidth = Math.min(
          frame.width,
          Math.max(1, Math.round((frame.width * border.percent) / 100)),
        );
        const frameHeight = Math.min(
          frame.height,
          Math.max(1, Math.round((frame.height * border.percent) / 100)),
        );
        return [
          {
            frameId: id,
            aspect,
            ...(customAspect === undefined ? {} : { customAspect }),
            percent: border.percent,
            stroke: border.color ?? color,
            width: border.percent === 100 ? frame.width : frameWidth,
            height: border.percent === 100 ? frame.height : frameHeight,
            x: frame.x + (border.percent === 100 ? 0 : (frame.width - frameWidth) / 2),
            y: frame.y + (border.percent === 100 ? 0 : (frame.height - frameHeight) / 2),
          },
        ];
      });
    },
  );
}

export function layoutBroadcastGuideLabels(
  areas: readonly BroadcastGuideRectangle[],
  scale: number,
) {
  const occupied: { left: number; right: number; baseline: number }[] = [];
  const lineHeight = 20 / scale;
  return areas.map(({ x, y, width, height, percent, aspect, stroke, frameId, customAspect }) => {
    const ratio =
      aspect === 'auto'
        ? 'Auto'
        : customAspect === undefined
          ? aspect
          : `${customAspect.width}:${customAspect.height}`;
    const label =
      aspect === 'auto' && percent === 93
        ? 'Action 93%'
        : aspect === 'auto' && percent === 90
          ? 'Graphics 90%'
          : `${ratio} · ${percent}%`;
    const leftAligned = percent === 100 || percent === 80;
    const fromTop = percent >= 93;
    const labelX = leftAligned ? x + 5 / scale : x + width - 5 / scale;
    const labelWidth = (6 * label.length + 4) / scale;
    const left = leftAligned ? labelX - 2 / scale : labelX - labelWidth;
    const right = leftAligned ? labelX + labelWidth : labelX + 2 / scale;
    let baseline = fromTop ? y + 12 / scale : y + height - 4 / scale;
    const step = fromTop ? lineHeight : -lineHeight;
    // Keep captions for nested guides together, while giving neighboring captions their own row.
    while (
      occupied.some(
        (box) =>
          left < box.right && right > box.left && Math.abs(baseline - box.baseline) < lineHeight,
      ) &&
      baseline + step >= y + lineHeight &&
      baseline + step <= y + height - 4 / scale
    ) {
      baseline += step;
    }
    occupied.push({ left, right, baseline });
    return { key: `${frameId}:${percent}`, label, labelX, baseline, leftAligned, stroke };
  });
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
  const frame = broadcastGuideFrame(width, height, profile.aspect, profile.customAspect);
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
