import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';
import { broadcastSafeAreas } from '@cg/ui';

/** One stage-sized view aid for empty, loading and rendered previews alike. */
export function FittedSafeAreaGuides({
  width,
  height,
  stage,
}: {
  width: number;
  height: number;
  stage: RefObject<HTMLDivElement>;
}): JSX.Element | null {
  const [scale, setScale] = useState(0);
  useLayoutEffect(() => {
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
