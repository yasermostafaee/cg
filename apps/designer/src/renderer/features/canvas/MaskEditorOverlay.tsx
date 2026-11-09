import { useRef, useState, type PointerEvent } from 'react';
import type { LiveRevealRect } from '@cg/shared-schema';
import * as s from './CanvasOverlay.css.js';

const CORNERS = [
  { name: 'top left', x: 0, y: 0 },
  { name: 'top right', x: 1, y: 0 },
  { name: 'bottom left', x: 0, y: 1 },
  { name: 'bottom right', x: 1, y: 1 },
] as const;
type Corner = (typeof CORNERS)[number];

interface Props {
  rect: LiveRevealRect;
  box: { x: number; y: number; width: number; height: number };
  scale: number;
  onCommit: (rect: LiveRevealRect) => void;
}

interface Drag extends Props {
  corner: Corner | null;
  pointerId: number;
  clientX: number;
  clientY: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resizeAxis(
  start: number,
  size: number,
  delta: number,
  end: 0 | 1,
  minSize: number,
): [start: number, size: number] {
  if (end === 0) {
    const fixed = start + size;
    const moved = clamp(start + delta, 0, fixed - minSize);
    return [moved, fixed - moved];
  }
  return [start, clamp(size + delta, minSize, 1 - start)];
}

function dragRect(drag: Drag, event: PointerEvent): LiveRevealRect {
  const { rect, box, scale, corner } = drag;
  const dx = (event.clientX - drag.clientX) / (box.width * scale);
  const dy = (event.clientY - drag.clientY) / (box.height * scale);
  if (corner === null) {
    return {
      ...rect,
      x: clamp(rect.x + dx, 0, 1 - rect.width),
      y: clamp(rect.y + dy, 0, 1 - rect.height),
    };
  }
  const [x, width] = resizeAxis(
    rect.x,
    rect.width,
    dx,
    corner.x,
    Math.min(rect.width, 1 / box.width),
  );
  const [y, height] = resizeAxis(
    rect.y,
    rect.height,
    dy,
    corner.y,
    Math.min(rect.height, 1 / box.height),
  );
  return { x, y, width, height };
}

/** A local draft follows the pointer. Only release publishes a single undoable scene edit. */
export function MaskEditorOverlay(props: Props): JSX.Element {
  const { box, scale } = props;
  const drag = useRef<Drag | null>(null);
  const [draft, setDraft] = useState<LiveRevealRect | null>(null);
  const rect = draft ?? props.rect;

  function begin(event: PointerEvent<HTMLDivElement>, corner: Corner | null): void {
    if (event.button !== 0 || drag.current !== null) return;
    event.preventDefault();
    event.stopPropagation();
    const { pointerId, clientX, clientY } = event;
    drag.current = { ...props, corner, pointerId, clientX, clientY };
    event.currentTarget.setPointerCapture(pointerId);
  }

  function finish(event: PointerEvent, commit: boolean): void {
    const active = drag.current;
    if (active === null || active.pointerId !== event.pointerId) return;
    drag.current = null;
    setDraft(null);
    if (!commit || (event.clientX === active.clientX && event.clientY === active.clientY)) return;
    const next = dragRect(active, event);
    const original = active.rect;
    if (
      next.x !== original.x ||
      next.y !== original.y ||
      next.width !== original.width ||
      next.height !== original.height
    ) {
      active.onCommit(next);
    }
  }

  return (
    <div
      className={s.maskEditor}
      data-testid="mask-editor"
      style={{
        left: (box.x + rect.x * box.width) * scale,
        top: (box.y + rect.y * box.height) * scale,
        width: rect.width * box.width * scale,
        height: rect.height * box.height * scale,
      }}
      onPointerDown={(event) => begin(event, null)}
      onPointerMove={(event) => {
        const active = drag.current;
        if (active?.pointerId === event.pointerId) setDraft(dragRect(active, event));
      }}
      onPointerUp={(event) => finish(event, true)}
      onPointerCancel={(event) => finish(event, false)}
      onLostPointerCapture={(event) => finish(event, false)}
    >
      {CORNERS.map((corner) => (
        <div
          key={corner.name}
          className={s.maskEditorHandle}
          data-testid={`mask-resize-${corner.name.replace(' ', '-')}`}
          style={{
            left: `${String(corner.x * 100)}%`,
            top: `${String(corner.y * 100)}%`,
            cursor: corner.x === corner.y ? 'nwse-resize' : 'nesw-resize',
          }}
          onPointerDown={(event) => begin(event, corner)}
        />
      ))}
    </div>
  );
}
