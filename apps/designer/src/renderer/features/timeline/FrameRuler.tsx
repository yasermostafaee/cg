import { useEffect, useRef } from 'react';
import { designerStore, useDesignerSelector } from '../../state/store.js';
import * as s from './FrameRuler.css.js';
import { frameFromClientX, frameToPct } from './timeline-geometry.js';

interface Props {
  frameIn: number;
  frameOut: number;
  ticks: readonly number[];
  onScrub: (frame: number) => void;
}

/**
 * Frame ruler with tick labels and a draggable playhead. Click anywhere on
 * the ruler to scrub. Each numbered tick lines up with the matching stroke in the lanes.
 */
export function FrameRuler({ frameIn, frameOut, ticks, onScrub }: Props): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  // A held button is not enough to mean "scrub": an unrelated drag can start over the
  // canvas/Inspector and then cross this ruler. Only the pointer whose press STARTED here may
  // move the playhead.
  const scrubPointerRef = useRef<number | null>(null);
  function frameAt(clientX: number): number {
    const el = ref.current;
    if (el === null) return designerStore.get().currentFrame;
    const rect = el.getBoundingClientRect();
    return frameFromClientX(clientX, rect.left, rect.width, frameIn, frameOut);
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    if (e.button !== 0) return;
    scrubPointerRef.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    onScrub(frameAt(e.clientX));
  }
  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    if (scrubPointerRef.current !== e.pointerId) return;
    if (e.buttons === 0) {
      scrubPointerRef.current = null;
      return;
    }
    onScrub(frameAt(e.clientX));
  }
  function finishScrub(e: React.PointerEvent<HTMLDivElement>): void {
    if (scrubPointerRef.current === e.pointerId) scrubPointerRef.current = null;
  }

  return (
    <div
      ref={ref}
      className={s.outer}
      role="slider"
      aria-label="Frame ruler"
      aria-valuemin={frameIn}
      aria-valuemax={frameOut}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishScrub}
      onPointerCancel={finishScrub}
      onLostPointerCapture={finishScrub}
    >
      {ticks.map((f) => (
        <span
          key={f}
          className={s.tick}
          data-timeline-tick={f}
          style={{ left: `min(calc(100% - 1px), ${String(frameToPct(f, frameIn, frameOut))}%)` }}
        >
          <span
            className={
              f === frameIn ? s.startTickLabel : f === frameOut ? s.endTickLabel : s.tickLabel
            }
          >
            {f}
          </span>
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
