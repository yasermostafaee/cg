import { useRef, useState } from 'react';
import { Move, RotateCcw } from 'lucide-react';
import { DEFAULT_LIVE_CROP_FOCUS, fitPictureToBox, type LiveCropFocus } from '@cg/shared-schema';
import { smpteBarsGradient } from '@cg/template-runtime/scene-builder';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';

const PRACTICE_SOURCE_ASPECT = 16 / 9;

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Show the whole practice source and move the crop window locally. */
export function PreviewPanDraft({
  plateId,
  width,
  height,
}: {
  plateId: string;
  width: number;
  height: number;
}): JSX.Element {
  const [focus, setFocus] = useState(DEFAULT_LIVE_CROP_FOCUS);
  const source = useRef<HTMLSpanElement>(null);
  const start = useRef<{
    pointerId: number;
    x: number;
    y: number;
    focus: LiveCropFocus;
    travelX: number;
    travelY: number;
  } | null>(null);
  const picture = fitPictureToBox(
    { x: 0, y: 0, width, height },
    PRACTICE_SOURCE_ASPECT,
    'contain',
  ).picture;
  const crop = fitPictureToBox(picture, width / height, 'contain').picture;
  const cropWidth = crop.width / picture.width;
  const cropHeight = crop.height / picture.height;
  const travelX = Math.max(0, 1 - cropWidth);
  const travelY = Math.max(0, 1 - cropHeight);
  const horizontal = travelX > 1e-6;
  const vertical = travelY > 1e-6;
  return (
    <div className="cg-pan-draft">
      <Button
        variant="ghost"
        className="cg-pan-draft__handle"
        aria-label={`Pan practice image in ${plateId}`}
        data-pan-practice-axis={horizontal ? 'horizontal' : vertical ? 'vertical' : undefined}
        disabled={!horizontal && !vertical}
        title={
          horizontal
            ? 'Drag or use the left and right arrows'
            : vertical
              ? 'Drag or use the up and down arrows'
              : 'The practice image fits this plate'
        }
        onPointerDown={(event) => {
          if (event.button !== 0 || start.current !== null) return;
          const rect = source.current?.getBoundingClientRect();
          if (rect === undefined || rect.width <= 0 || rect.height <= 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          start.current = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            focus,
            travelX: horizontal ? travelX * rect.width : 0,
            travelY: vertical ? travelY * rect.height : 0,
          };
        }}
        onPointerMove={(event) => {
          const origin = start.current;
          if (origin?.pointerId !== event.pointerId) return;
          setFocus({
            x:
              origin.travelX === 0
                ? origin.focus.x
                : clamp(origin.focus.x + (event.clientX - origin.x) / origin.travelX),
            y:
              origin.travelY === 0
                ? origin.focus.y
                : clamp(origin.focus.y + (event.clientY - origin.y) / origin.travelY),
          });
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
          const dx = horizontal
            ? event.key === 'ArrowLeft'
              ? -0.08
              : event.key === 'ArrowRight'
                ? 0.08
                : 0
            : 0;
          const dy = vertical
            ? event.key === 'ArrowUp'
              ? -0.08
              : event.key === 'ArrowDown'
                ? 0.08
                : 0
            : 0;
          if (dx === 0 && dy === 0) return;
          event.preventDefault();
          setFocus((current) => ({ x: clamp(current.x + dx), y: clamp(current.y + dy) }));
        }}
      >
        <span
          ref={source}
          aria-hidden="true"
          className="cg-pan-draft__picture"
          data-pan-practice-picture=""
          style={{
            backgroundImage: smpteBarsGradient(),
            left: `${(picture.x / width) * 100}%`,
            top: `${(picture.y / height) * 100}%`,
            width: `${(picture.width / width) * 100}%`,
            height: `${(picture.height / height) * 100}%`,
          }}
        >
          <span
            className="cg-pan-draft__crop"
            data-pan-practice-crop=""
            style={{
              left: `${travelX * focus.x * 100}%`,
              top: `${travelY * focus.y * 100}%`,
              width: `${cropWidth * 100}%`,
              height: `${cropHeight * 100}%`,
            }}
          />
        </span>
        <span className="cg-pan-draft__label">
          <Icon icon={Move} size={13} />
          <span>Practice image</span>
          <bdi>{plateId}</bdi>
        </span>
      </Button>
      <Button
        variant="secondary"
        className="cg-pan-draft__center"
        aria-label="Center preview crop"
        title="Center crop"
        disabled={!horizontal && !vertical}
        onClick={() => setFocus(DEFAULT_LIVE_CROP_FOCUS)}
      >
        <Icon icon={RotateCcw} size={14} />
        Center
      </Button>
    </div>
  );
}
