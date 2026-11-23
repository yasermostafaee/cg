import { useUiText } from '../../i18n/locale.js';
import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { Move } from 'lucide-react';
import { sameLiveMaskRect, type LiveRevealRect } from '@cg/shared-schema';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import './live-layout-rect-overlay.css';

const HANDLES = [
  { id: 'nw', name: 'top left', x: -1, y: -1 },
  { id: 'n', name: 'top', x: 0, y: -1 },
  { id: 'ne', name: 'top right', x: 1, y: -1 },
  { id: 'e', name: 'right', x: 1, y: 0 },
  { id: 'se', name: 'bottom right', x: 1, y: 1 },
  { id: 's', name: 'bottom', x: 0, y: 1 },
  { id: 'sw', name: 'bottom left', x: -1, y: 1 },
  { id: 'w', name: 'left', x: -1, y: 0 },
] as const;
type Handle = (typeof HANDLES)[number];

interface Drag {
  index: number;
  pointerId: number;
  x: number;
  y: number;
  bounds: DOMRect;
  seed: LiveRevealRect;
  handle: Handle | undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function editAxis(
  start: number,
  size: number,
  delta: number,
  edge: number | undefined,
  pixels: number,
): [number, number] {
  if (edge === 0 || delta === 0) return [start, size];
  if (edge === undefined) return [clamp(start + delta / pixels, 0, 1 - size), size];
  const end = Math.min(1, start + size);
  const minimum = Math.min(size, Math.max(0.001, 1 / pixels));
  if (edge < 0) {
    const nextStart = clamp(start + delta / pixels, 0, end - minimum);
    return [nextStart, Math.min(end - nextStart, 1 - nextStart)];
  }
  return [start, clamp(size + delta / pixels, minimum, 1 - start)];
}

function editRect(
  rect: LiveRevealRect,
  dx: number,
  dy: number,
  bounds: DOMRect,
  handle: Handle | undefined,
): LiveRevealRect {
  const [x, width] = editAxis(rect.x, rect.width, dx, handle?.x, bounds.width);
  const [y, height] = editAxis(rect.y, rect.height, dy, handle?.y, bounds.height);
  return { x, y, width, height };
}

export function LiveLayoutEditorRectOverlay({
  kind,
  rects,
  selectedIndex,
  onSelect,
  onChange,
  labels,
}: {
  kind: 'mask' | 'graphic' | 'plate';
  rects: readonly LiveRevealRect[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onChange: (index: number, rect: LiveRevealRect) => void;
  labels?: readonly string[];
}): JSX.Element {
  const localizeUi = useUiText();
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag>();

  function start(
    event: PointerEvent<HTMLElement>,
    index: number,
    rect: LiveRevealRect,
    handle?: Handle,
  ): void {
    const bounds = frame.current?.getBoundingClientRect();
    if (event.button !== 0 || drag.current !== undefined || !bounds?.width || !bounds.height)
      return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelect(index);
    drag.current = {
      index,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      bounds,
      seed: rect,
      handle,
    };
  }

  function move(event: PointerEvent<HTMLElement>): void {
    const active = drag.current;
    if (active?.pointerId !== event.pointerId) return;
    onChange(
      active.index,
      editRect(
        active.seed,
        event.clientX - active.x,
        event.clientY - active.y,
        active.bounds,
        active.handle,
      ),
    );
  }

  function finish(event: PointerEvent<HTMLElement>, cancelled = false): void {
    const active = drag.current;
    if (active?.pointerId !== event.pointerId) return;
    if (cancelled) onChange(active.index, active.seed);
    else move(event);
    drag.current = undefined;
  }

  function nudge(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
    rect: LiveRevealRect,
    handle?: Handle,
  ): void {
    const step = event.shiftKey ? 10 : 1;
    const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
    const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
    const bounds = frame.current?.getBoundingClientRect();
    if ((!dx && !dy) || !bounds?.width || !bounds.height) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect(index);
    const next = editRect(rect, dx, dy, bounds, handle);
    if (!sameLiveMaskRect(rect, next)) onChange(index, next);
  }

  return (
    <div
      ref={frame}
      className="cg-live-layout-rect-overlay"
      role="group"
      aria-label={localizeUi(
        kind === 'mask'
          ? 'Preview mask'
          : kind === 'graphic'
            ? 'Preview graphic'
            : 'Plate placement',
      )}
    >
      {rects.map((rect, index) => {
        const selected = selectedIndex === index;
        const name =
          kind === 'mask'
            ? localizeUi('mask window {number}', { number: index + 1 })
            : kind === 'graphic'
              ? localizeUi('plate graphic')
              : (labels?.[index] ?? localizeUi('plate {number}', { number: index + 1 }));
        return (
          <div
            key={index}
            className="cg-live-layout-rect-box"
            data-layout-mask-window={kind === 'mask' ? index + 1 : undefined}
            data-layout-graphic-placement={kind === 'graphic' ? '' : undefined}
            data-layout-plate-placement={kind === 'plate' ? '' : undefined}
            data-selected={selected ? '' : undefined}
            style={{
              left: `${rect.x * 100}%`,
              top: `${rect.y * 100}%`,
              width: `${rect.width * 100}%`,
              height: `${rect.height * 100}%`,
            }}
            onPointerDown={(event) => start(event, index, rect)}
            onPointerMove={move}
            onPointerUp={(event) => finish(event)}
            onPointerCancel={(event) => finish(event, true)}
            onLostPointerCapture={(event) => finish(event, true)}
          >
            <Button
              variant="secondary"
              className="cg-live-layout-rect-move"
              aria-label={localizeUi('Move {name}', { name })}
              onClick={() => onSelect(index)}
              onKeyDown={(event) => nudge(event, index, rect)}
            >
              <Icon icon={Move} size={14} />
            </Button>
            {selected &&
              HANDLES.map((handle) => (
                <Button
                  key={handle.id}
                  className="cg-live-layout-rect-handle"
                  data-mask-handle={handle.id}
                  aria-label={localizeUi('Resize {name} from {handle}', {
                    name,
                    handle: localizeUi(handle.name),
                  })}
                  onPointerDown={(event) => start(event, index, rect, handle)}
                  onKeyDown={(event) => nudge(event, index, rect, handle)}
                  children={null}
                />
              ))}
          </div>
        );
      })}
    </div>
  );
}
