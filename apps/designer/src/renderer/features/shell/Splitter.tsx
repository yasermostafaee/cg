import { useState } from 'react';
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
 */
export function Splitter({ axis, onResize, ariaLabel }: Props): JSX.Element {
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const vertical = axis === 'x';
  const active = hovered || dragging;
  const thickness = active ? LINE_ACTIVE : LINE;

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    e.preventDefault();
    setDragging(true);
    let last = vertical ? e.clientX : e.clientY;
    const onMove = (ev: PointerEvent): void => {
      const cur = vertical ? ev.clientX : ev.clientY;
      const delta = cur - last;
      if (delta === 0) return;
      onResize(delta);
      last = cur;
    };
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.userSelect = '';
      setDragging(false);
    };
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  return (
    <div
      role="separator"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      aria-label={ariaLabel ?? 'Resize'}
      onPointerDown={onPointerDown}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      className={s.handle}
      style={
        vertical ? { width: HIT, cursor: 'col-resize' } : { height: HIT, cursor: 'row-resize' }
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
