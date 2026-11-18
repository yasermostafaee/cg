import type { CSSProperties } from 'react';
import {
  broadcastSafeAreas,
  broadcastGuideFrame,
  broadcastGuideColor,
  DEFAULT_BROADCAST_GUIDE_PROFILE,
  type BroadcastGuideProfile,
} from '@cg/ui';

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
  const reference = broadcastGuideFrame(width, height, profile.aspect, profile.customAspect);
  const safeAreas = profile.standardVisible
    ? broadcastSafeAreas(width, height, profile.aspect, profile.customAspect)
    : [];
  const commonColor = broadcastGuideColor(profile);
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
            stroke={commonColor}
            strokeWidth="2"
            opacity="0.45"
            vectorEffect="non-scaling-stroke"
          />
          <rect
            data-composition-output-frame=""
            {...compositionFrame}
            fill="none"
            stroke={commonColor}
            strokeWidth="1"
            strokeDasharray="4 4"
            opacity="0.7"
            vectorEffect="non-scaling-stroke"
          />
        </>
      )}
      {profile.aspect !== 'auto' && reference !== null && (
        <rect
          data-guide-reference={profile.aspect}
          {...reference}
          fill="none"
          stroke={commonColor}
          strokeWidth="1"
          strokeDasharray="2 4"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {safeAreas.map((area) => (
        <g key={area.kind}>
          <rect
            {...{ x: area.x, y: area.y, width: area.width, height: area.height }}
            fill="none"
            stroke="#000"
            strokeWidth="3"
            vectorEffect="non-scaling-stroke"
            opacity="0.7"
          />
          <rect
            data-safe-area={area.kind}
            {...{ x: area.x, y: area.y, width: area.width, height: area.height }}
            fill="none"
            stroke={commonColor}
            strokeWidth="1"
            strokeDasharray={area.kind === 'action' ? '6 4' : undefined}
            vectorEffect="non-scaling-stroke"
          />
          <text
            x={width / 2}
            y={area.kind === 'action' ? area.y + 12 / scale : area.y + area.height - 4 / scale}
            textAnchor="middle"
            fontSize={10 / scale}
            fontFamily="sans-serif"
            fill={commonColor}
            stroke="#000"
            strokeWidth={3 / scale}
            paintOrder="stroke"
            strokeLinejoin="round"
          >
            {area.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
