import type { CSSProperties } from 'react';
import {
  broadcastGuideRectangles,
  DEFAULT_BROADCAST_GUIDE_PROFILE,
  type BroadcastGuideProfile,
  type BroadcastGuideRectangle,
} from '@cg/ui';

function layoutGuideLabels(areas: readonly BroadcastGuideRectangle[], scale: number) {
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

/** Authoring chrome outside the template iframe: it cannot enter a preview/export page. */
export function SafeAreaGuides({
  width,
  height,
  scale,
  style,
  compositionFrame,
  profile = DEFAULT_BROADCAST_GUIDE_PROFILE,
}: {
  width: number;
  height: number;
  scale: number;
  style?: CSSProperties;
  compositionFrame?: { x: number; y: number; width: number; height: number };
  profile?: BroadcastGuideProfile;
}): JSX.Element {
  const safeAreas = broadcastGuideRectangles(width, height, profile);
  return (
    <svg
      aria-hidden
      data-safe-area-guides=""
      width={width * scale}
      height={height * scale}
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: 'absolute', pointerEvents: 'none', overflow: 'hidden', ...style }}
    >
      {compositionFrame !== undefined && (
        <>
          <rect
            data-project-output-frame=""
            x={0}
            y={0}
            width={width}
            height={height}
            fill="none"
            stroke="#d2d7e3"
            strokeWidth="2"
            opacity="0.45"
            vectorEffect="non-scaling-stroke"
          />
          <rect
            data-composition-output-frame=""
            {...compositionFrame}
            fill="none"
            stroke="#d2d7e3"
            strokeWidth="1"
            strokeDasharray="4 4"
            opacity="0.7"
            vectorEffect="non-scaling-stroke"
          />
        </>
      )}
      {safeAreas.map(({ x, y, width: w, height: h, percent, aspect, stroke, frameId }) => (
        <g key={`${frameId}:${percent}`}>
          <rect
            {...{ x, y, width: w, height: h }}
            fill="none"
            stroke="#000"
            strokeWidth="3"
            vectorEffect="non-scaling-stroke"
            opacity="0.55"
          />
          <rect
            data-guide-frame={frameId}
            data-guide-aspect={aspect}
            data-guide-percent={percent}
            data-guide-reference={percent === 100 ? aspect : undefined}
            data-safe-area={percent === 93 ? 'action' : percent === 90 ? 'graphics' : undefined}
            {...{ x, y, width: w, height: h }}
            fill="none"
            stroke={stroke}
            strokeWidth="1"
            strokeDasharray={percent === 93 ? '6 4' : percent === 80 ? '2 3' : undefined}
            vectorEffect="non-scaling-stroke"
          />
        </g>
      ))}
      <g data-safe-guide-labels="">
        {layoutGuideLabels(safeAreas, scale).map(
          ({ key, label, labelX, baseline, leftAligned, stroke }) => (
            <text
              key={key}
              x={labelX}
              y={baseline}
              textAnchor={leftAligned ? 'start' : 'end'}
              fontSize={10 / scale}
              fontFamily="sans-serif"
              fill={stroke}
              stroke="#11151d"
              strokeWidth={4 / scale}
              paintOrder="stroke"
              strokeLinejoin="round"
            >
              {label}
            </text>
          ),
        )}
      </g>
    </svg>
  );
}
