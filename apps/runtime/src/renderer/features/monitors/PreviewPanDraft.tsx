import { useRef, useState } from 'react';
import { MoveHorizontal, RotateCcw } from 'lucide-react';
import { smpteBarsGradient } from '@cg/template-runtime/scene-builder';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';

const CROP_WIDTH = 0.5;
const CENTER = 0.5;

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Show the whole practice source and move the crop window locally. */
export function PreviewPanDraft({ plateId }: { plateId?: string }): JSX.Element {
  const [focus, setFocus] = useState(CENTER);
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
          const travel = origin.width * (1 - CROP_WIDTH);
          setFocus(clamp(origin.focus + (event.clientX - origin.x) / travel));
        }}
        onPointerCancel={(event) => {
          const origin = start.current;
          if (origin?.pointerId !== event.pointerId) return;
          start.current = null;
          setFocus(origin.focus);
        }}
        onLostPointerCapture={(event) => {
          if (start.current?.pointerId === event.pointerId) start.current = null;
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          setFocus((current) => clamp(current + (event.key === 'ArrowLeft' ? -0.08 : 0.08)));
        }}
      >
        <span
          aria-hidden="true"
          className="cg-pan-draft__picture"
          data-pan-practice-picture=""
          style={{ backgroundImage: smpteBarsGradient() }}
        />
        <span
          aria-hidden="true"
          className="cg-pan-draft__crop"
          data-pan-practice-crop=""
          style={{
            width: `${CROP_WIDTH * 100}%`,
            transform: `translateX(${((1 - CROP_WIDTH) / CROP_WIDTH) * focus * 100}%)`,
          }}
        />
        <span className="cg-pan-draft__label">
          <Icon icon={MoveHorizontal} size={13} />
          <span>Practice image</span>
          {plateId !== undefined && <bdi>{plateId}</bdi>}
        </span>
      </Button>
      <Button
        variant="secondary"
        className="cg-pan-draft__center"
        aria-label="Center preview crop"
        title="Center crop"
        onClick={() => setFocus(CENTER)}
      >
        <Icon icon={RotateCcw} size={14} />
        Center
      </Button>
    </div>
  );
}
