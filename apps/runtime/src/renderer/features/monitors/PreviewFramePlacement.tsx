import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { Move } from 'lucide-react';
import type { LiveFramePlacement } from '@cg/shared-schema';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { stageFramePlacement } from '../inspector/draftStore.js';
import type { PlatePlacement } from './livePlateGeometry.js';

const corners = [
  { key: 'nw', name: 'top left', x: -1, y: -1 },
  { key: 'ne', name: 'top right', x: 1, y: -1 },
  { key: 'sw', name: 'bottom left', x: -1, y: 1 },
  { key: 'se', name: 'bottom right', x: 1, y: 1 },
] as const;

type Corner = (typeof corners)[number];
type FrameEdit = NonNullable<PlatePlacement['frameEdit']>;
type Rect = LiveFramePlacement['rect'];

function editRect(
  seed: Rect,
  dx: number,
  dy: number,
  corner: Corner | undefined,
  proportional: boolean,
  centerLocked: boolean,
): Rect {
  if (corner === undefined) return { ...seed, x: seed.x + dx, y: seed.y + dy };
  const sides = centerLocked ? 2 : 1;
  let width = Math.max(1, seed.width + dx * corner.x * sides);
  let height = Math.max(1, seed.height + dy * corner.y * sides);
  if (proportional) {
    const factor = Math.max(
      1 / Math.min(seed.width, seed.height),
      (width * seed.width + height * seed.height) / (seed.width ** 2 + seed.height ** 2),
    );
    width = seed.width * factor;
    height = seed.height * factor;
  }
  return {
    x: seed.x + (seed.width - width) * (centerLocked ? 0.5 : Number(corner.x < 0)),
    y: seed.y + (seed.height - height) * (centerLocked ? 0.5 : Number(corner.y < 0)),
    width,
    height,
  };
}

interface Drag {
  pointerId: number;
  x: number;
  y: number;
  corner: Corner | undefined;
  seed: FrameEdit;
  preserveAspect: boolean;
}

export function PreviewFramePlacement({
  itemId,
  plate,
  frame,
  pixelsPerScenePixel,
  preserveAspect,
  onSelect,
}: {
  itemId: string;
  plate: PlatePlacement;
  frame: FrameEdit;
  pixelsPerScenePixel: number;
  preserveAspect: boolean;
  onSelect: () => void;
}): JSX.Element {
  const drag = useRef<Drag>();
  const name = plate.sourceName ?? plate.plateId;
  const canMove = frame.move !== false;
  const canResize = frame.resize !== 'move-only';
  const keepRatio = frame.resize === 'proportional' || preserveAspect;

  const stage = (seed: FrameEdit, rect: Rect): void => {
    stageFramePlacement(
      itemId,
      { frameKey: seed.frameKey, lookId: seed.lookId, rect },
      seed.baseline,
    );
  };
  const start = (event: PointerEvent<HTMLElement>, corner?: Corner): void => {
    if (
      event.button !== 0 ||
      drag.current !== undefined ||
      pixelsPerScenePixel <= 0 ||
      (corner === undefined ? !canMove : !canResize)
    )
      return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelect();
    drag.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      corner,
      seed: frame,
      preserveAspect: keepRatio,
    };
  };
  const finish = (event: PointerEvent<HTMLElement>, cancelled = false): void => {
    const current = drag.current;
    if (current?.pointerId !== event.pointerId) return;
    drag.current = undefined;
    if (cancelled) stage(current.seed, current.seed.rect);
  };
  const keyboard = (event: KeyboardEvent<HTMLButtonElement>, corner?: Corner): void => {
    const step = event.shiftKey ? 10 : 1;
    const dx = event.code === 'ArrowLeft' ? -step : event.code === 'ArrowRight' ? step : 0;
    const dy = event.code === 'ArrowUp' ? -step : event.code === 'ArrowDown' ? step : 0;
    if (dx === 0 && dy === 0) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect();
    stage(frame, editRect(frame.rect, dx, dy, corner, keepRatio, !canMove));
  };

  return (
    <div
      className="cg-frame-placement"
      data-frame-movable={canMove ? '' : undefined}
      style={{ left: plate.x, top: plate.y, width: plate.width, height: plate.height }}
      onPointerDown={(event) => start(event)}
      onPointerMove={(event) => {
        const current = drag.current;
        if (current?.pointerId !== event.pointerId) return;
        const dx = (event.clientX - current.x) / pixelsPerScenePixel;
        const dy = (event.clientY - current.y) / pixelsPerScenePixel;
        const { seed, corner, preserveAspect } = current;
        stage(seed, editRect(seed.rect, dx, dy, corner, preserveAspect, seed.move === false));
      }}
      onPointerUp={(event) => finish(event)}
      onPointerCancel={(event) => finish(event, true)}
      onLostPointerCapture={(event) => finish(event, true)}
    >
      {canMove && (
        <Button
          variant="neutral"
          className="cg-frame-placement__move"
          aria-label={`Move frame for ${name}`}
          onKeyDown={(event) => keyboard(event)}
        >
          <Icon icon={Move} size={14} />
        </Button>
      )}
      {canResize &&
        corners.map((corner) => (
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
