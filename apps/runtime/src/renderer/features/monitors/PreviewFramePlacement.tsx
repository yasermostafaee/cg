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
): Rect {
  if (corner === undefined) return { ...seed, x: seed.x + dx, y: seed.y + dy };
  let width = Math.max(1, seed.width + dx * corner.x);
  let height = Math.max(1, seed.height + dy * corner.y);
  if (proportional) {
    const factor = Math.max(
      1 / Math.min(seed.width, seed.height),
      (width * seed.width + height * seed.height) / (seed.width ** 2 + seed.height ** 2),
    );
    width = seed.width * factor;
    height = seed.height * factor;
  }
  return {
    x: corner.x < 0 ? seed.x + seed.width - width : seed.x,
    y: corner.y < 0 ? seed.y + seed.height - height : seed.y,
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
}

export function PreviewFramePlacement({
  itemId,
  plate,
  frame,
  pixelsPerScenePixel,
  onSelect,
}: {
  itemId: string;
  plate: PlatePlacement;
  frame: FrameEdit;
  pixelsPerScenePixel: number;
  onSelect: () => void;
}): JSX.Element {
  const drag = useRef<Drag>();
  const name = plate.sourceName ?? plate.plateId;

  const stage = (seed: FrameEdit, rect: Rect): void => {
    stageFramePlacement(
      itemId,
      { frameKey: seed.frameKey, lookId: seed.lookId, rect },
      seed.baseline,
    );
  };
  const start = (event: PointerEvent<HTMLElement>, corner?: Corner): void => {
    if (event.button !== 0 || drag.current !== undefined || pixelsPerScenePixel <= 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelect();
    drag.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      corner,
      seed: frame,
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
    stage(frame, editRect(frame.rect, dx, dy, corner, frame.resize === 'proportional'));
  };

  return (
    <div
      className="cg-frame-placement"
      style={{ left: plate.x, top: plate.y, width: plate.width, height: plate.height }}
      onPointerDown={(event) => start(event)}
      onPointerMove={(event) => {
        const current = drag.current;
        if (current?.pointerId !== event.pointerId) return;
        const dx = (event.clientX - current.x) / pixelsPerScenePixel;
        const dy = (event.clientY - current.y) / pixelsPerScenePixel;
        const { seed, corner } = current;
        stage(seed, editRect(seed.rect, dx, dy, corner, seed.resize === 'proportional'));
      }}
      onPointerUp={(event) => finish(event)}
      onPointerCancel={(event) => finish(event, true)}
      onLostPointerCapture={(event) => finish(event, true)}
    >
      <Button
        variant="neutral"
        className="cg-frame-placement__move"
        aria-label={`Move frame for ${name}`}
        onKeyDown={(event) => keyboard(event)}
      >
        <Icon icon={Move} size={14} />
      </Button>
      {corners.map((corner) => (
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
