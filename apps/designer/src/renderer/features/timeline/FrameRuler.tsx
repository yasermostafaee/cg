import { useEffect, useRef } from 'react';
import { designerStore, useDesignerSelector } from '../../state/store.js';
import * as s from './FrameRuler.css.js';
import { frameFromClientX, frameToPct, stridePeriodPct, tickFrames } from './timeline-geometry.js';

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
  const ticks = tickFrames(frameIn, frameOut, stride);
  // Same stride drives the ruler's own background lines so labels sit
  // directly above their gridline rather than landing between two.
  const linePeriodPct = stridePeriodPct(stride, frameIn, frameOut).toFixed(4);

  function frameAt(clientX: number): number {
    const el = ref.current;
    if (el === null) return designerStore.get().currentFrame;
    const rect = el.getBoundingClientRect();
    return frameFromClientX(clientX, rect.left, rect.width, frameIn, frameOut);
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
          style={{ left: `${frameToPct(f, frameIn, frameOut).toFixed(3)}%` }}
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
  const pct = frameToPct(currentFrame, frameIn, frameOut).toFixed(3);
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
