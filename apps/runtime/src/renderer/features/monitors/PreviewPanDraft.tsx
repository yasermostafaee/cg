import { useRef, useState } from 'react';
import { MoveHorizontal } from 'lucide-react';
import { smpteBarsGradient } from '@cg/template-runtime/scene-builder';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** A deliberately oversized test picture. Its local drag cannot be staged or applied. */
export function PreviewPanDraft({ plateId }: { plateId?: string }): JSX.Element {
  const [focus, setFocus] = useState(0.5);
  const start = useRef<{ pointerId: number; x: number; focus: number; width: number } | null>(null);
  return (
    <div className={plateId === undefined ? 'cg-pan-draft cg-pan-draft--sample' : 'cg-pan-draft'}>
      <Button
        variant="ghost"
        className="cg-pan-draft__handle"
        aria-label={
          plateId === undefined ? 'Pan practice image' : `Pan practice image in ${plateId}`
        }
        title="Drag or use the left and right arrows"
        onPointerDown={(event) => {
          if (event.button !== 0 || start.current !== null) return;
          const { width } = event.currentTarget.getBoundingClientRect();
          if (width <= 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          start.current = { pointerId: event.pointerId, x: event.clientX, focus, width };
        }}
        onPointerMove={(event) => {
          const origin = start.current;
          if (origin?.pointerId !== event.pointerId) return;
          setFocus(clamp(origin.focus + (origin.x - event.clientX) / origin.width));
        }}
        onLostPointerCapture={(event) => {
          if (start.current?.pointerId === event.pointerId) start.current = null;
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          setFocus((current) => clamp(current + (event.key === 'ArrowLeft' ? 0.08 : -0.08)));
        }}
      >
        <span
          aria-hidden="true"
          className="cg-pan-draft__picture"
          data-pan-practice-picture=""
          style={{ backgroundImage: smpteBarsGradient(), backgroundPositionX: `${focus * 100}%` }}
        />
        <span className="cg-pan-draft__label">
          <Icon icon={MoveHorizontal} size={13} />
          <span>Practice image</span>
          {plateId !== undefined && <bdi>{plateId}</bdi>}
        </span>
      </Button>
    </div>
  );
}
