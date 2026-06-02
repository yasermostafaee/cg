import { useEffect, useRef, useState } from 'react';
import { colors } from '../../theme.js';

interface Props {
  frameIn: number;
  frameOut: number;
  currentFrame: number;
  onScrub: (frame: number) => void;
}

const styles = {
  outer: {
    position: 'relative' as const,
    height: 26,
    backgroundColor: '#1c1f2d',
    borderBottom: `1px solid ${colors.border}`,
    userSelect: 'none' as const,
    cursor: 'col-resize',
  },
  tick: {
    position: 'absolute' as const,
    top: 0,
    bottom: 0,
    borderLeft: `1px solid ${colors.border}`,
    color: colors.textMuted,
    fontSize: '0.66rem',
    paddingLeft: 3,
    lineHeight: '26px',
  },
  playhead: {
    position: 'absolute' as const,
    top: 0,
    bottom: 0,
    width: 0,
    borderLeft: `1.5px solid ${colors.accent}`,
    pointerEvents: 'none' as const,
    zIndex: 2,
  },
  playheadCap: {
    position: 'absolute' as const,
    top: 2,
    transform: 'translateX(-50%)',
    background: colors.accent,
    color: '#000',
    fontSize: '0.66rem',
    fontWeight: 700,
    padding: '0 4px',
    borderRadius: 3,
    lineHeight: '16px',
    pointerEvents: 'none' as const,
  },
} as const;

/**
 * Frame ruler with tick labels and a draggable playhead. Click anywhere on
 * the ruler to scrub. The label stride adapts to the rendered width per
 * frame (which already reflects the timeline zoom): cramped rulers label
 * every 5th frame, mid-zoom every 2nd, and only when each frame is wide
 * enough to read does it label every single one.
 */
export function FrameRuler({ frameIn, frameOut, currentFrame, onScrub }: Props): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState<number>(0);

  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => {
      setWidth(el.clientWidth);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const span = Math.max(1, frameOut - frameIn);
  const stride = pickStride(span, width);
  const ticks = tickFrames(frameIn, frameOut, stride);

  function frameAt(clientX: number): number {
    const el = ref.current;
    if (el === null) return currentFrame;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    return Math.round(frameIn + ratio * span);
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    e.currentTarget.setPointerCapture(e.pointerId);
    onScrub(frameAt(e.clientX));
  }
  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    if (e.buttons === 0) return;
    onScrub(frameAt(e.clientX));
  }

  const playheadPct = ((currentFrame - frameIn) / span) * 100;

  return (
    <div
      ref={ref}
      style={{
        ...styles.outer,
        backgroundImage: `repeating-linear-gradient(to right, #262a3e 0, #262a3e 1px, transparent 1px, transparent calc(100% / ${String(span)}))`,
      }}
      role="slider"
      aria-label="Frame ruler"
      aria-valuemin={frameIn}
      aria-valuemax={frameOut}
      aria-valuenow={currentFrame}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
    >
      {ticks.map((f) => (
        <span
          key={f}
          style={{
            ...styles.tick,
            left: `${(((f - frameIn) / span) * 100).toFixed(3)}%`,
          }}
        >
          {f}
        </span>
      ))}
      <div style={{ ...styles.playhead, left: `${playheadPct.toFixed(3)}%` }} />
      <div style={{ ...styles.playheadCap, left: `${playheadPct.toFixed(3)}%` }}>
        {currentFrame}
      </div>
    </div>
  );
}

/**
 * Choose a tick stride based on how many pixels each frame is allotted
 * in the rendered ruler. The ladder is 1/2/5/10/25 — values the eye
 * groups easily ("every 5") instead of arbitrary numbers like 3 or 7.
 *
 *   >= 22px / frame → every frame      (operator zoomed in close)
 *   >= 10px / frame → every 2 frames   (mid zoom)
 *   >=  5px / frame → every 5 frames   (default for long scenes)
 *   >=  2px / frame → every 10 frames  (very long span)
 *   else           → every 25 frames  (huge spans, label sparsely)
 */
function pickStride(span: number, widthPx: number): number {
  if (widthPx <= 0) return 1;
  const pxPerFrame = widthPx / span;
  if (pxPerFrame >= 22) return 1;
  if (pxPerFrame >= 10) return 2;
  if (pxPerFrame >= 5) return 5;
  if (pxPerFrame >= 2) return 10;
  return 25;
}

function tickFrames(lo: number, hi: number, stride: number): readonly number[] {
  if (hi <= lo) return [lo];
  const out: number[] = [];
  for (let f = lo; f <= hi; f += stride) out.push(f);
  return out;
}
