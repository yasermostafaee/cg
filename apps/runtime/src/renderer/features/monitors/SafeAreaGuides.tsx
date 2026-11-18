import { useEffect, useState, type CSSProperties, type RefObject } from 'react';
import {
  broadcastGuideRectangles,
  layoutBroadcastGuideLabels,
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
  const frame = broadcastGuideFrame(width, height, profile.aspect, profile.customAspect);
  const custom = broadcastCustomGuideLines(width, height, profile);
  const rectangles = broadcastGuideRectangles(width, height, profile);
  return (
    <svg
      aria-hidden
      data-safe-area-guides=""
      width={width * scale}
      height={height * scale}
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: 'absolute', pointerEvents: 'none', overflow: 'hidden', ...style }}
    >
      {rectangles.map((area) => (
        <g key={`${area.frameId}/${String(area.percent)}`}>
          <rect
            {...{ x: area.x, y: area.y, width: area.width, height: area.height }}
            fill="none"
            stroke={previewGuideColors.halo}
            strokeWidth="3"
            vectorEffect="non-scaling-stroke"
            opacity="0.7"
          />
          <rect
            data-safe-area={
              area.percent === 93
                ? 'action'
                : area.percent === 90
                  ? 'graphics'
                  : area.percent === 80
                    ? 'additional'
                    : undefined
            }
            data-guide-reference={area.percent === 100 ? area.aspect : undefined}
            data-guide-frame-id={area.frameId}
            data-guide-percent={area.percent}
            {...{ x: area.x, y: area.y, width: area.width, height: area.height }}
            fill="none"
            stroke={area.stroke}
            strokeWidth="1"
            strokeDasharray={
              area.percent === 93
                ? '6 4'
                : area.percent === 100
                  ? '3 3'
                  : area.percent === 80
                    ? '2 3'
                    : undefined
            }
            vectorEffect="non-scaling-stroke"
          />
        </g>
      ))}
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
        </g>
      ))}
      {/* Paint every outline before any label, so adjacent borders cannot cover text. */}
      {layoutBroadcastGuideLabels(rectangles, scale).map(
        ({ key, label, labelX, baseline, leftAligned, stroke }) => (
          <text
            key={`label-${key}`}
            data-safe-area-label=""
            x={labelX}
            y={baseline}
            textAnchor={leftAligned ? 'start' : 'end'}
            fontSize={10 / scale}
            fontFamily="sans-serif"
            fill={stroke}
            stroke={previewGuideColors.halo}
            strokeWidth={4 / scale}
            paintOrder="stroke"
            strokeLinejoin="round"
          >
            {label}
          </text>
        ),
      )}
      {custom
        .filter((line) => line.name !== '')
        .map((line) => (
          <text
            key={`label-${line.id}`}
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
        ))}
    </svg>
  );
}
