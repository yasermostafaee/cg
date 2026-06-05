import { useRef } from 'react';
import { colors } from '../../theme.js';

interface Props {
  frameIn: number;
  frameOut: number;
  currentFrame: number;
  /**
   * Distance between labelled frames, computed once in TimelineDock
   * from `visibleFrames = span / timelineZoom` and shared with the
   * body gridlines so labels and lines stay aligned. See `pickStride`.
   */
  stride: number;
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
    // Sit above the playhead line so the frame number isn't crossed by it.
    zIndex: 3,
  },
} as const;

/**
 * Frame ruler with tick labels and a draggable playhead. Click anywhere on
 * the ruler to scrub. `stride` is computed by TimelineDock and shared
 * between the ruler labels and the body vertical gridlines.
 */
export function FrameRuler({
  frameIn,
  frameOut,
  currentFrame,
  stride,
  onScrub,
}: Props): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  const span = Math.max(1, frameOut - frameIn);
  const ticks = tickFrames(frameIn, frameOut, stride);
  // Same stride drives the ruler's own background lines so labels sit
  // directly above their gridline rather than landing between two.
  const linePeriodPct = ((stride * 100) / span).toFixed(4);

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
        backgroundImage: `repeating-linear-gradient(to right, #262a3e 0, #262a3e 1px, transparent 1px, transparent ${linePeriodPct}%)`,
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
 * Choose a tick stride based on how many frames fit in the viewport.
 * The 1/2/5/10/25 ladder reads naturally — the operator's eye groups
 * "every 5" without effort, where strides like 3 or 7 would feel
 * arbitrary. Exported so the timeline body's gridlines stay in lockstep
 * with the ruler labels.
 *
 *      ≤  44 → every frame
 *     45–90 → every 2 (0, 2, 4, …)
 *    91–200 → every 5
 *   201–500 → every 10
 *      >500 → every 25
 */
export function pickStride(visibleFrames: number): number {
  if (visibleFrames <= 44) return 1;
  if (visibleFrames <= 90) return 2;
  if (visibleFrames <= 200) return 5;
  if (visibleFrames <= 500) return 10;
  return 25;
}

function tickFrames(lo: number, hi: number, stride: number): readonly number[] {
  if (hi <= lo) return [lo];
  const out: number[] = [];
  for (let f = lo; f <= hi; f += stride) out.push(f);
  return out;
}
