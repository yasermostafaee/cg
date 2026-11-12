import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { Move } from 'lucide-react';
import type { LiveRevealRect } from '@cg/shared-schema';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { stageMaskPlacement } from '../inspector/draftStore.js';
import type { MaskEdit, PlatePlacement } from './livePlateGeometry.js';
import { placementCorners } from './PreviewFramePlacement.js';

type Corner = (typeof placementCorners)[number];

interface MaskDrag {
  pointerId: number;
  x: number;
  y: number;
  width: number;
  height: number;
  corner: Corner | undefined;
  seed: MaskEdit;
}

function clamp(value: number, lower: number, upper: number): number {
  return Math.min(upper, Math.max(lower, value));
}

function editAxis(
  origin: number,
  length: number,
  delta: number,
  edge: number | undefined,
  minimum: number,
): [origin: number, length: number] {
  if (delta === 0) return [origin, length];
  if (edge === undefined) return [clamp(origin + delta, 0, 1 - length), length];
  const end = origin + length;
  const size = Math.min(minimum, length);
  if (edge < 0) {
    const nextOrigin = clamp(origin + delta, 0, end - size);
    return [nextOrigin, end - nextOrigin];
  }
  return [origin, clamp(end + delta, origin + size, 1) - origin];
}

export function PreviewMaskPlacement({
  itemId,
  plate,
  mask,
  fit,
  onSelect,
}: {
  itemId: string;
  plate: PlatePlacement;
  mask: MaskEdit;
  fit: number;
  onSelect: () => void;
}): JSX.Element {
  const drag = useRef<MaskDrag>();
  const { placement } = mask;
  const { rect, kind, index } = placement;
  const name = `${kind} ${index + 1} for ${plate.sourceName ?? plate.plateId}`;
  const stage = (seed: MaskEdit, nextRect: LiveRevealRect): void => {
    stageMaskPlacement(itemId, { ...seed.placement, rect: nextRect }, seed.baseline);
  };
  const edit = (
    seed: MaskEdit,
    dx: number,
    dy: number,
    width: number,
    height: number,
    corner?: Corner,
  ): void => {
    const original = seed.placement.rect;
    const [x, w] = editAxis(original.x, original.width, dx / width, corner?.x, 1 / plate.width);
    const [y, h] = editAxis(original.y, original.height, dy / height, corner?.y, 1 / plate.height);
    stage(seed, { x, y, width: w, height: h });
  };
  const start = (event: PointerEvent<HTMLElement>, corner?: Corner): void => {
    if (event.button !== 0 || drag.current !== undefined || fit <= 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelect();
    drag.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      width: fit * plate.width,
      height: fit * plate.height,
      corner,
      seed: mask,
    };
  };
  const finish = (event: PointerEvent<HTMLElement>, cancelled = false): void => {
    const current = drag.current;
    if (current?.pointerId !== event.pointerId) return;
    drag.current = undefined;
    if (cancelled) stage(current.seed, current.seed.placement.rect);
  };
  const keyboard = (event: KeyboardEvent<HTMLButtonElement>, corner?: Corner): void => {
    const step = event.shiftKey ? 10 : 1;
    const dx = event.code === 'ArrowLeft' ? -step : event.code === 'ArrowRight' ? step : 0;
    const dy = event.code === 'ArrowUp' ? -step : event.code === 'ArrowDown' ? step : 0;
    if (fit <= 0 || (dx === 0 && dy === 0)) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect();
    edit(mask, dx, dy, fit * plate.width, fit * plate.height, corner);
  };

  return (
    <div
      className="cg-frame-placement"
      data-frame-movable=""
      data-mask-placement={kind}
      data-mask-plate={plate.plateId}
      data-mask-index={index}
      style={{
        left: plate.x + rect.x * plate.width,
        top: plate.y + rect.y * plate.height,
        width: rect.width * plate.width,
        height: rect.height * plate.height,
      }}
      onPointerDown={(event) => start(event)}
      onPointerMove={(event) => {
        const current = drag.current;
        if (current?.pointerId !== event.pointerId) return;
        edit(
          current.seed,
          event.clientX - current.x,
          event.clientY - current.y,
          current.width,
          current.height,
          current.corner,
        );
      }}
      onPointerUp={(event) => finish(event)}
      onPointerCancel={(event) => finish(event, true)}
      onLostPointerCapture={(event) => finish(event, true)}
    >
      <Button
        variant="neutral"
        className="cg-frame-placement__move"
        aria-label={`Move ${name}`}
        title={`Move ${name}`}
        onKeyDown={(event) => keyboard(event)}
      >
        <Icon icon={Move} size={14} />
      </Button>
      {placementCorners.map((corner) => (
        <Button
          key={corner.key}
          variant="neutral"
          className="cg-frame-placement__corner"
          data-corner={corner.key}
          aria-label={`Resize ${name} from ${corner.name}`}
          onPointerDown={(event) => start(event, corner)}
          onKeyDown={(event) => keyboard(event, corner)}
          children={null}
        />
      ))}
    </div>
  );
}
