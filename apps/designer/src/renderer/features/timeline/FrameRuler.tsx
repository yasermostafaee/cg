import { useEffect, useRef } from 'react';
import { designerStore, useDesignerSelector } from '../../state/store.js';
import * as s from './FrameRuler.css.js';

interface Props {
  frameIn: number;
  frameOut: number;
  /**
   * Distance between labelled frames, computed once in TimelineDock
   * from `visibleFrames = span / timelineZoom` and shared with the
   * body gridlines so labels and lines stay aligned. See `pickStride`.
   */
  stride: number;
  onScrub: (frame: number) => void;
}

/**
 * Frame ruler with tick labels and a draggable playhead. Click anywhere on
 * the ruler to scrub. `stride` is computed by TimelineDock and shared
 * between the ruler labels and the body vertical gridlines.
 */
export function FrameRuler({ frameIn, frameOut, stride, onScrub }: Props): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  const span = Math.max(1, frameOut - frameIn);
  const ticks = tickFrames(frameIn, frameOut, stride);
  // Same stride drives the ruler's own background lines so labels sit
  // directly above their gridline rather than landing between two.
  const linePeriodPct = ((stride * 100) / span).toFixed(4);

  function frameAt(clientX: number): number {
    const el = ref.current;
    if (el === null) return designerStore.get().currentFrame;
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

  return (
    <div
      ref={ref}
      className={s.outer}
      style={{
        backgroundImage: `repeating-linear-gradient(to right, rgb(72, 74, 88) 0, rgb(72, 74, 88) 1px, transparent 1px, transparent ${linePeriodPct}%)`,
      }}
      role="slider"
      aria-label="Frame ruler"
      aria-valuemin={frameIn}
      aria-valuemax={frameOut}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
    >
      {ticks.map((f) => (
        <span
          key={f}
          className={s.tick}
          style={{ left: `${(((f - frameIn) / span) * 100).toFixed(3)}%` }}
        >
          {f}
        </span>
      ))}
      <RulerPlayhead frameIn={frameIn} frameOut={frameOut} sliderRef={ref} />
    </div>
  );
}

/**
 * The ruler's playhead line + frame-number cap. Split out as its own
 * subscriber so the frame tick during playback re-renders just this moving
 * marker, not the whole ruler (its tick labels are frame-independent).
 */
function RulerPlayhead({
  frameIn,
  frameOut,
  sliderRef,
}: {
  frameIn: number;
  frameOut: number;
  sliderRef: React.RefObject<HTMLDivElement | null>;
}): JSX.Element {
  const currentFrame = useDesignerSelector((s) => s.currentFrame);
  const span = Math.max(1, frameOut - frameIn);
  const pct = (((currentFrame - frameIn) / span) * 100).toFixed(3);
  // Keep the slider's a11y value live without re-rendering the ruler itself.
  useEffect(() => {
    sliderRef.current?.setAttribute('aria-valuenow', String(currentFrame));
  }, [currentFrame, sliderRef]);
  return (
    <>
      <div className={s.playhead} style={{ left: `${pct}%` }} />
      <div className={s.playheadCap} style={{ left: `${pct}%` }}>
        {currentFrame}
      </div>
    </>
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
