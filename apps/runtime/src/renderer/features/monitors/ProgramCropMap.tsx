import { useRef } from 'react';
import { RotateCcw } from 'lucide-react';
import type { PgmPlateCropTarget } from '@cg/shared-ipc';
import { fitPictureToBox, liveCropFocusAfterShift } from '@cg/shared-schema';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import type { ProgramCropDrag, ProgramCropGesture } from './useProgramCropGesture.js';

/** The return carries the cropped programme. The map shows authoritative geometry only. */
export function ProgramCropMap({
  target,
  draft,
  pending,
  gesture,
  center,
}: {
  target: PgmPlateCropTarget;
  draft: ProgramCropDrag | null;
  pending: boolean;
  gesture: ProgramCropGesture;
  center: () => void;
}): JSX.Element | null {
  const source = useRef<HTMLDivElement>(null);
  const geometry = target.geometry;
  if (geometry === undefined) return null;
  const { box, picture, sourceAspect } = geometry;
  const moving = draft?.token === target.token;
  const current = moving
    ? fitPictureToBox(
        box,
        picture.width / picture.height,
        'cover',
        liveCropFocusAfterShift(box, picture, { x: draft.dx, y: draft.dy }),
      ).picture
    : picture;
  return (
    <section className="cg-pgm-crop-map" aria-label="Programme crop map">
      <div className="cg-pgm-crop-map__heading">
        <bdi>{target.label}</bdi>
        <span>Crop map</span>
      </div>
      <div
        ref={source}
        className="cg-pgm-crop-map__source"
        role="group"
        aria-label="Full source outline and visible crop geometry"
        title="Source geometry only. The programme return provides the cropped picture."
        style={{ aspectRatio: sourceAspect, width: `min(100%, ${5 * sourceAspect}rem)` }}
        data-pgm-crop-map={moving ? 'draft' : 'current'}
      >
        {target.areas.map((area, index) => (
          <div
            key={index}
            className="cg-pgm-crop-map__window"
            data-pgm-crop-window=""
            style={{
              left: `${((area.x - current.x) / current.width) * 100}%`,
              top: `${((area.y - current.y) / current.height) * 100}%`,
              width: `${(area.width / current.width) * 100}%`,
              height: `${(area.height / current.height) * 100}%`,
            }}
          >
            <Button
              variant="ghost"
              className="cg-pgm-crop-map__handle"
              data-crop-axis={
                target.horizontal && target.vertical
                  ? 'both'
                  : target.horizontal
                    ? 'horizontal'
                    : 'vertical'
              }
              aria-label={
                target.areas.length === 1
                  ? `Move crop window for ${target.label}`
                  : `Move crop window ${index + 1} for ${target.label}`
              }
              title="Drag the crop window across the source"
              disabled={pending}
              onPointerDown={(event) => {
                const rect = source.current?.getBoundingClientRect();
                if (rect === undefined || rect.width <= 0 || rect.height <= 0) return;
                // Moving the window right reveals the right of the source, which
                // moves the source picture left under the on-air plate.
                gesture.begin(event, target.token, {
                  x: target.horizontal ? -picture.width / rect.width : 0,
                  y: target.vertical ? -picture.height / rect.height : 0,
                });
              }}
              onPointerMove={gesture.move}
              onPointerCancel={(event) => gesture.cancel(event.pointerId)}
              onLostPointerCapture={(event) => gesture.cancel(event.pointerId)}
              onPointerUp={gesture.finish}
              onKeyDown={(event) =>
                gesture.nudge(event, target.token, {
                  x: target.horizontal ? -picture.width * 0.01 : 0,
                  y: target.vertical ? -picture.height * 0.01 : 0,
                })
              }
            >
              <span aria-hidden="true" />
            </Button>
          </div>
        ))}
      </div>
      <div className="cg-pgm-crop-map__footer">
        <span>{pending ? 'Applying' : moving ? 'Draft' : 'Geometry only'}</span>
        <Button
          variant="secondary"
          aria-label={`Center crop for ${target.label}`}
          title="Center the source picture in this plate"
          disabled={pending}
          onClick={center}
        >
          <Icon icon={RotateCcw} size={12} />
          Center
        </Button>
      </div>
    </section>
  );
}
