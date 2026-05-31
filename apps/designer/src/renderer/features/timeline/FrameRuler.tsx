import { useRef } from 'react';
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
    background: colors.panelMuted,
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
    bottom: -1000, // bleed into track rows below
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
 * the ruler to scrub. Tick density adapts so we always show ~10–20 labels
 * regardless of frame range.
 */
export function FrameRuler({ frameIn, frameOut, currentFrame, onScrub }: Props): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  const span = Math.max(1, frameOut - frameIn);
  const ticks = tickFrames(frameIn, frameOut);

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
      style={styles.outer}
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

function tickFrames(lo: number, hi: number): readonly number[] {
  const span = hi - lo;
  if (span <= 0) return [lo];
  const targetCount = 14;
  const rawStep = span / targetCount;
  const niceSteps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000];
  const step = niceSteps.find((s) => s >= rawStep) ?? Math.ceil(rawStep);
  const out: number[] = [];
  const first = Math.ceil(lo / step) * step;
  for (let f = first; f <= hi; f += step) out.push(f);
  return out;
}
