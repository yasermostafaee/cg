import type { CSSProperties } from 'react';
import {
  broadcastSafeAreas,
  broadcastGuideFrame,
  broadcastCustomGuideLines,
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
      {broadcastCustomGuideLines(width, height, profile).map((line) => (
        <g key={line.id}>
          <line
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke="#000"
            strokeWidth="3"
            opacity="0.7"
            vectorEffect="non-scaling-stroke"
          />
          <line
            data-custom-guide={line.id}
            data-guide-axis={line.axis}
            data-guide-percent={line.position}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke={broadcastGuideColor(profile, line)}
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
          {line.name !== '' && (
            <text
              x={line.x1 + (line.axis === 'x' && line.position > 50 ? -4 : 4) / scale}
              textAnchor={line.axis === 'x' && line.position > 50 ? 'end' : 'start'}
              y={
                line.axis === 'y' &&
                reference !== null &&
                line.y1 + 12 / scale > reference.y + reference.height
                  ? line.y1 - 4 / scale
                  : line.y1 + 12 / scale
              }
              fontSize={10 / scale}
              fontFamily="Vazirmatn, sans-serif"
              fill={broadcastGuideColor(profile, line)}
              stroke="#000"
              strokeWidth={3 / scale}
              paintOrder="stroke"
              strokeLinejoin="round"
            >
              {line.name}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
