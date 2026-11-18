import type { CSSProperties } from 'react';
import { broadcastSafeAreas } from '@cg/ui';

/** Authoring chrome outside the template iframe: it cannot enter a preview/export page. */
export function SafeAreaGuides({
  width,
  height,
  scale,
  style,
}: {
  width: number;
  height: number;
  scale: number;
  style?: CSSProperties;
}): JSX.Element {
  return (
    <svg
      aria-hidden
      data-safe-area-guides=""
      width={width * scale}
      height={height * scale}
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: 'absolute', pointerEvents: 'none', overflow: 'hidden', ...style }}
    >
      {broadcastSafeAreas(width, height).map((area) => (
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
            stroke={area.kind === 'action' ? '#f5c879' : '#fff'}
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
            fill={area.kind === 'action' ? '#f5c879' : '#fff'}
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
