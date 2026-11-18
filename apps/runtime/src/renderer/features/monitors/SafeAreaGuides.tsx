import { useEffect, useState, type CSSProperties, type RefObject } from 'react';
import {
  broadcastSafeAreas,
  broadcastGuideFrame,
  broadcastCustomGuideLines,
  broadcastGuideColor,
  DEFAULT_BROADCAST_GUIDE_PROFILE,
  type BroadcastGuideProfile,
} from '@cg/ui';
import { previewGuideColors } from '../../theme.js';

/** One stage-sized view aid for empty, loading and rendered previews alike. */
export function FittedSafeAreaGuides({
  width,
  height,
  stage,
  profile,
}: {
  width: number;
  height: number;
  stage: RefObject<HTMLDivElement>;
  profile?: BroadcastGuideProfile;
}): JSX.Element | null {
  const [scale, setScale] = useState(0);
  // This guide can mount inside the stage whose ref it consumes. Child layout effects run
  // before an ancestor DOM ref attaches; observing after commit also covers stage remounts.
  useEffect(() => {
    const node = stage.current;
    if (node === null) return;
    const measure = (): void => {
      if (node.clientWidth > 0 && node.clientHeight > 0)
        setScale(Math.min(node.clientWidth / width, node.clientHeight / height));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [stage, width, height]);
  return scale <= 0 ? null : (
    <SafeAreaGuides
      width={width}
      height={height}
      scale={scale}
      profile={profile}
      style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)', zIndex: 1000 }}
    />
  );
}

/** Preview chrome outside all retained template frames and programme-return consumers. */
export function SafeAreaGuides({
  width,
  height,
  scale,
  style,
  profile = DEFAULT_BROADCAST_GUIDE_PROFILE,
}: {
  width: number;
  height: number;
  scale: number;
  style?: CSSProperties;
  profile?: BroadcastGuideProfile | undefined;
}): JSX.Element {
  const frame = broadcastGuideFrame(width, height, profile.aspect);
  const custom = broadcastCustomGuideLines(width, height, profile);
  return (
    <svg
      aria-hidden
      data-safe-area-guides=""
      width={width * scale}
      height={height * scale}
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: 'absolute', pointerEvents: 'none', overflow: 'hidden', ...style }}
    >
      {profile.aspect !== 'auto' && frame !== null && (
        <rect
          data-guide-reference={profile.aspect}
          {...frame}
          fill="none"
          stroke={profile.color}
          strokeWidth="1"
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {(profile.standardVisible ? broadcastSafeAreas(width, height, profile.aspect) : []).map(
        (area) => (
          <g key={area.kind}>
            <rect
              {...{ x: area.x, y: area.y, width: area.width, height: area.height }}
              fill="none"
              stroke={previewGuideColors.halo}
              strokeWidth="3"
              vectorEffect="non-scaling-stroke"
              opacity="0.7"
            />
            <rect
              data-safe-area={area.kind}
              {...{ x: area.x, y: area.y, width: area.width, height: area.height }}
              fill="none"
              stroke={profile.color}
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
              fill={profile.color}
              stroke={previewGuideColors.halo}
              strokeWidth={3 / scale}
              paintOrder="stroke"
              strokeLinejoin="round"
            >
              {area.label}
            </text>
          </g>
        ),
      )}
      {custom.map((line) => (
        <g key={line.id}>
          <line
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke={previewGuideColors.halo}
            strokeWidth="3"
            opacity="0.65"
            vectorEffect="non-scaling-stroke"
          />
          <line
            data-custom-guide={line.id}
            data-guide-axis={line.axis}
            data-guide-position={line.position}
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
                line.axis === 'y' && frame !== null && line.y1 + 12 / scale > frame.y + frame.height
                  ? line.y1 - 4 / scale
                  : line.y1 + 12 / scale
              }
              fontSize={10 / scale}
              fontFamily="Vazirmatn, sans-serif"
              fill={broadcastGuideColor(profile, line)}
              stroke={previewGuideColors.halo}
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
