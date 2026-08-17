import { useState } from 'react';
import { useDragGesture } from '@cg/gesture';
import { colors } from '../../theme.js';
import * as s from './Splitter.css.js';

interface Props {
  axis: 'x' | 'y';
  onResize: (delta: number) => void;
  /** Optional aria label. Defaults to a generic separator label. */
  ariaLabel?: string;
}

/** Pointer-grab area (generous, so the thin line is easy to catch). */
const HIT = 10;
/** Visible line at rest, and when hovered / dragging. */
const LINE = 2;
const LINE_ACTIVE = 4;

/**
 * Draggable bar that turns its own pointer drag into an `onResize` callback in
 * pixels along its axis. A wide invisible hit area surrounds a thin line that
 * lights up (accent) on hover and stays lit for the whole drag until release.
 *
 *   axis="x"  →  vertical bar, drag left/right, delta = +right / -left
 *   axis="y"  →  horizontal bar, drag up/down,  delta = +down  / -up
 *
 * ── B-140 — THE GESTURE IS NOT OWNED HERE ANY MORE, AND THIS WAS THE WORSE ONE ─
 *
 * This component already used Pointer Events, which made it look the healthier of
 * the two dividers. It was not. It added `pointermove` / `pointerup` listeners
 * INSIDE `onPointerDown` and removed them only in its own `onUp`, so a release the
 * parent never saw left them attached **permanently** — and `onMove` then resized
 * the panel on every later pointer move, with no button held. The Runtime's
 * version leaked a stuck cursor; this one leaked a panel that followed the mouse.
 *
 * A release the parent never sees is the ordinary case here, not an edge: the
 * Designer renders the live preview in a same-origin `<iframe>`
 * (`features/canvas/CanvasArea.tsx`), and `PreviewModal` renders another.
 *
 * `@cg/gesture`'s `useDragGesture` now owns the whole gesture — a full-window
 * shield above every iframe, capture, and ONE teardown fed by an exhaustive
 * terminator set, installed once rather than per gesture. It also no longer
 * writes `user-select` onto `document.body`; the shield carries that itself and
 * disappears with the drag.
 *
 * ⚠ **The hit/visual split here is the PRECEDENT the Runtime adopted**, not an
 * accident: `HIT` is the touch target and `LINE` is what the operator sees. Keep
 * them separate.
 */
export function Splitter({ axis, onResize, ariaLabel }: Props): JSX.Element {
  const [hovered, setHovered] = useState(false);
  const vertical = axis === 'x';

  /*
    The Designer's `onResize` takes an INCREMENTAL delta ("move by this much"),
    while the gesture reports a delta from the drag's ORIGIN. Converting here
    rather than changing either contract: the shared hook must not learn one app's
    accumulation convention, and the panels' reducer must not be rewritten for a
    gesture change.
  */
  const [last, setLast] = useState(0);

  const { dragging, handleProps } = useDragGesture({
    axis,
    cursor: vertical ? 'col-resize' : 'row-resize',
    onStart: () => setLast(0),
    onMove: (fromOrigin) => {
      const step = fromOrigin - last;
      if (step === 0) return;
      setLast(fromOrigin);
      onResize(step);
    },
  });

  const active = hovered || dragging;
  const thickness = active ? LINE_ACTIVE : LINE;

  return (
    <div
      role="separator"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      aria-label={ariaLabel ?? 'Resize'}
      onPointerDown={handleProps.onPointerDown}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      className={s.handle}
      style={
        vertical
          ? { width: HIT, cursor: 'col-resize', ...handleProps.style }
          : { height: HIT, cursor: 'row-resize', ...handleProps.style }
      }
    >
      <div
        className={s.line}
        style={{
          background: active ? colors.accent : colors.border,
          ...(vertical
            ? { top: 0, bottom: 0, left: (HIT - thickness) / 2, width: thickness }
            : { left: 0, right: 0, top: (HIT - thickness) / 2, height: thickness }),
        }}
      />
    </div>
  );
}
