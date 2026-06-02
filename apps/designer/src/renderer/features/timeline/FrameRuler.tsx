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
 * the ruler to scrub. The label stride adapts to how many frames are
 * *visible in the viewport* — not how many frames the scene contains.
 * A 1000-frame scene at 12× zoom shows ~80 frames in the viewport at any
 * time, so the ruler labels at the same density as an 80-frame scene at
 * 1× zoom. Mapping (visible frames → stride):
 *
 *      ≤  44 → every frame
 *     45–90 → every 2 (0, 2, 4, …)
 *    91–200 → every 5
 *   201–500 → every 10
 *      >500 → every 25
 */
export function FrameRuler({ frameIn, frameOut, currentFrame, onScrub }: Props): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  const span = Math.max(1, frameOut - frameIn);
  const [visibleFrames, setVisibleFrames] = useState<number>(span);

  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    // viewport = scrolling ancestor (`topScroll` in TimelineDock); the
    // ruler itself lives inside `zoomInner`, whose width = viewport × zoom,
    // so visibleFrames = span × (viewport / rulerWidth).
    function read(): void {
      const target = ref.current;
      if (target === null) return;
      const rulerWidth = target.clientWidth;
      const viewportWidth = target.parentElement?.parentElement?.clientWidth ?? rulerWidth;
      if (rulerWidth <= 0) {
        setVisibleFrames(span);
        return;
      }
      setVisibleFrames((span * viewportWidth) / rulerWidth);
    }
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    const viewport = el.parentElement?.parentElement ?? null;
    if (viewport !== null) ro.observe(viewport);
    return () => ro.disconnect();
  }, [span]);

  const stride = pickStride(visibleFrames);
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
 * Choose a tick stride based on how many frames fit in the viewport.
 * The 1/2/5/10/25 ladder reads naturally — the operator's eye groups
 * "every 5" without effort, where strides like 3 or 7 would feel
 * arbitrary.
 */
function pickStride(visibleFrames: number): number {
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
