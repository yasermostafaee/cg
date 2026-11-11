import { useEffect, useRef, useState, useSyncExternalStore, type ComponentProps } from 'react';
import { Move, RotateCcw } from 'lucide-react';
import {
  DEFAULT_LIVE_CROP_FOCUS,
  fitPictureToBox,
  liveCropWindow,
  sameLiveCropFocus,
  type LiveCropFocus,
  type StackItemState,
} from '@cg/shared-schema';
import type { PreviewPlateCropTarget, SourcePreviewFrame } from '@cg/shared-ipc';
import { smpteBarsGradient } from '@cg/template-runtime/scene-builder';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import {
  appliedPracticeCropOf,
  draftsVersion,
  previewCropDraftOf,
  stagePreviewCrop,
  subscribeDrafts,
} from '../inspector/draftStore.js';
import type { PlatePlacement } from './livePlateGeometry.js';
import { PAN_CORNERS, clampCropFraction, resizePanCrop, type PanCorner } from './previewPanCrop.js';
import { fullJpegRect } from './pvwPlatePictures.js';

const PRACTICE_SOURCE_ASPECT = 16 / 9;

interface PreviewPanPlacement extends PlatePlacement {
  catalogAspect: number | null;
}

interface SourcePicture {
  jpegBase64: string;
  aspect: number;
  geometry: SourcePreviewFrame['geometry'];
}

function previewPicture(
  frame: SourcePreviewFrame | undefined,
  sourceId: string | null,
): SourcePicture | undefined {
  if (frame?.jpegBase64 === undefined || frame.sourceId !== sourceId) return undefined;
  const aspect = frame.geometry?.sourceAspect ?? (frame.width ?? 0) / (frame.height ?? 0);
  if (!Number.isFinite(aspect) || aspect <= 0) return undefined;
  return { jpegBase64: frame.jpegBase64, aspect, geometry: frame.geometry };
}

type CropState =
  | 'practice'
  | 'practice-draft'
  | 'practice-saved'
  | 'loading'
  | 'ready'
  | 'draft'
  | 'saved';

const CROP_LABEL = {
  practice: 'Practice image',
  'practice-draft': 'Practice draft',
  'practice-saved': 'Practice saved',
  loading: 'Checking crop…',
  ready: 'Crop guide',
  draft: 'Crop draft',
  saved: 'Saved for Take',
} as const satisfies Record<CropState, string>;

/** One request per rehearsing row. The stage remounts this row when its crop context changes. */
export function PreviewPanRow({
  itemId,
  scope,
  lookId,
  appliedCrops,
  onAir = false,
  pending = false,
  plates,
  sourceFrames,
  fit,
}: {
  itemId: string;
  scope: string;
  lookId: string | undefined;
  appliedCrops: StackItemState['previewPlateCrops'];
  onAir?: boolean;
  pending?: boolean;
  plates: readonly PreviewPanPlacement[];
  sourceFrames: ReadonlyMap<string, SourcePreviewFrame>;
  fit: number;
}): JSX.Element {
  const hasSource = plates.some((plate) => plate.sourceId !== null);
  const canCheck = hasSource && !pending;
  const [targets, setTargets] = useState<readonly PreviewPlateCropTarget[] | null>(
    hasSource ? null : [],
  );
  const [cropMessage, setCropMessage] = useState<string>();
  useSyncExternalStore(subscribeDrafts, draftsVersion, draftsVersion);

  useEffect(() => {
    let current = true;
    if (canCheck) {
      void (async () => {
        try {
          const result = await window.cg.stack.previewPlateCrop({
            itemId,
            ...(onAir && { allowOnAir: true }),
          });
          if (current) {
            setTargets(result.ok ? result.targets : []);
            setCropMessage(result.ok ? undefined : result.message);
          }
        } catch {
          // An older Bridge or unavailable channel still supports local practice.
          if (current) setTargets([]);
        }
      })();
    }
    return () => {
      current = false;
    };
  }, [canCheck, itemId, onAir]);

  return (
    <>
      {plates.map((plate) => {
        const target =
          plate.sourceId === null
            ? undefined
            : targets?.find(
                (entry) =>
                  entry.plateId === plate.plateId &&
                  (entry.sourceId === undefined || entry.sourceId === plate.sourceId) &&
                  (plate.catalogAspect === null ||
                    Math.abs(entry.sourceAspect / plate.catalogAspect - 1) < 1e-6),
              );
        const key =
          target?.token ??
          JSON.stringify([
            scope,
            plate.plateId,
            plate.sourceId,
            plate.catalogAspect,
            plate.width,
            plate.height,
          ]);
        const draft = previewCropDraftOf(itemId, key);
        const frame = sourceFrames.get(plate.sourceId ?? '');
        const sourcePicture = previewPicture(frame, plate.sourceId);
        const saved =
          target === undefined
            ? appliedPracticeCropOf(itemId, key)
            : appliedCrops?.find((crop) => crop.token === target.token)?.focus;
        const appliedFocus = saved ?? target?.focus ?? DEFAULT_LIVE_CROP_FOCUS;
        let state: CropState = targets === null ? 'loading' : 'practice';
        if (target !== undefined)
          state = saved !== undefined || target.staged === true ? 'saved' : 'ready';
        else if (saved !== undefined) state = 'practice-saved';
        if (draft !== undefined) state = target === undefined ? 'practice-draft' : 'draft';
        return (
          <div
            key={plate.elementId}
            style={{
              position: 'absolute',
              left: plate.x,
              top: plate.y,
              width: plate.width,
              height: plate.height,
            }}
          >
            <PreviewPanDraft
              // JPEG refreshes preserve the current gesture. New producer geometry does not.
              key={JSON.stringify([key, sourcePicture?.geometry?.revision, sourcePicture?.aspect])}
              plateId={plate.plateId}
              width={plate.width}
              height={plate.height}
              sourceAspect={
                target?.sourceAspect ??
                sourcePicture?.aspect ??
                plate.catalogAspect ??
                PRACTICE_SOURCE_ASPECT
              }
              state={state}
              blocked={targets === null}
              cropMessage={cropMessage}
              guide={target !== undefined}
              onAir={onAir}
              resizable={target === undefined || target.resizable === true}
              sourcePicture={sourcePicture}
              compactCenter={
                plate.width * fit < 80 || (plate.width * fit < 144 && plate.height * fit < 56)
              }
              stagedFocus={draft?.focus ?? appliedFocus}
              onFocusChange={(focus) =>
                stagePreviewCrop(
                  itemId,
                  target === undefined
                    ? { kind: 'practice', key, focus }
                    : {
                        kind: 'guide',
                        key,
                        token: target.token,
                        focus,
                        ...(lookId !== undefined && { lookId }),
                      },
                  appliedFocus,
                )
              }
            />
          </div>
        );
      })}
    </>
  );
}

interface PointerOrigin {
  pointerId: number;
  x: number;
  y: number;
  focus: LiveCropFocus;
  travelX: number;
  travelY: number;
  screen: { width: number; height: number };
  corner: PanCorner | undefined;
}

/** Draw the full guide or practice source, keeping movement and resizing local until release. */
function PreviewPanDraft({
  plateId,
  width,
  height,
  sourceAspect,
  state,
  blocked,
  cropMessage,
  guide,
  onAir,
  resizable,
  sourcePicture,
  compactCenter,
  stagedFocus,
  onFocusChange,
}: {
  plateId: string;
  width: number;
  height: number;
  sourceAspect: number;
  state: CropState;
  blocked: boolean;
  cropMessage: string | undefined;
  guide: boolean;
  onAir: boolean;
  resizable: boolean;
  sourcePicture: SourcePicture | undefined;
  compactCenter: boolean;
  stagedFocus: LiveCropFocus;
  onFocusChange: (focus: LiveCropFocus) => void;
}): JSX.Element {
  const [dragFocus, setDragFocus] = useState<LiveCropFocus | null>(null);
  const focus = dragFocus ?? stagedFocus;
  const commitFocus = (next: LiveCropFocus): void => {
    if (!blocked && !sameLiveCropFocus(next, stagedFocus)) onFocusChange(next);
  };
  const source = useRef<HTMLSpanElement>(null);
  const start = useRef<PointerOrigin | null>(null);
  const cancelDrag = (pointerId: number): void => {
    if (start.current?.pointerId !== pointerId) return;
    start.current = null;
    setDragFocus(null);
  };
  const picture = fitPictureToBox({ x: 0, y: 0, width, height }, sourceAspect, 'contain').picture;
  const preview =
    sourcePicture === undefined
      ? undefined
      : fitPictureToBox({ ...picture, x: 0, y: 0 }, sourcePicture.aspect, 'contain').picture;
  const activeRect = sourcePicture?.geometry?.activeRect;
  const jpeg =
    preview === undefined || activeRect === undefined
      ? preview && { ...preview, x: 0, y: 0 }
      : fullJpegRect({ ...preview, x: 0, y: 0 }, activeRect);
  const plateAspect = width / height;
  const crop = liveCropWindow(plateAspect, sourceAspect, focus);
  const cropLeft = `${crop.x * 100}%`;
  const cropTop = `${crop.y * 100}%`;
  const cropRight = `${(crop.x + crop.width) * 100}%`;
  const cropBottom = `${(crop.y + crop.height) * 100}%`;
  const travelX = Math.max(0, 1 - crop.width);
  const travelY = Math.max(0, 1 - crop.height);
  const horizontal = travelX > 1e-6;
  const vertical = travelY > 1e-6;
  const instructions =
    horizontal && vertical
      ? 'Drag or use the arrow keys.'
      : horizontal
        ? 'Drag or use the left and right arrows.'
        : vertical
          ? 'Drag or use the up and down arrows.'
          : 'The image fits this plate.';
  const resizeHint = resizable ? ' Drag a corner to resize.' : '';
  const updateHint = onAir
    ? 'Press Update on air to apply this crop.'
    : 'Press Update to save this crop for Take.';
  const label = state === 'saved' && onAir ? 'Crop applied' : CROP_LABEL[state];
  const measured =
    sourcePicture?.geometry !== undefined &&
    Math.abs(sourcePicture.aspect / sourceAspect - 1) < 1e-6;
  const pictureHint =
    sourcePicture === undefined
      ? 'The guide uses bars.'
      : measured
        ? 'This is the measured source picture.'
        : 'This is the available preview picture.';
  const description = guide
    ? `${instructions}${resizeHint} ${pictureHint} ${updateHint}`
    : `${instructions}${resizeHint} Press Update to keep this practice crop in this console. ${cropMessage ?? 'Practice changes stay in Preview.'}`;

  function pointerFocus(origin: PointerOrigin, x: number, y: number): LiveCropFocus {
    const dx = x - origin.x;
    const dy = y - origin.y;
    if (origin.corner !== undefined)
      return resizePanCrop(
        origin.focus,
        plateAspect,
        sourceAspect,
        origin.corner,
        origin.screen,
        dx,
        dy,
      );
    return {
      ...origin.focus,
      x:
        origin.travelX === 0
          ? origin.focus.x
          : clampCropFraction(origin.focus.x + dx / origin.travelX),
      y:
        origin.travelY === 0
          ? origin.focus.y
          : clampCropFraction(origin.focus.y + dy / origin.travelY),
    };
  }

  function gestureProps(
    corner?: PanCorner,
  ): Pick<
    ComponentProps<typeof Button>,
    'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel' | 'onLostPointerCapture'
  > {
    return {
      onPointerDown: (event) => {
        if (blocked || event.button !== 0 || start.current !== null) return;
        if (corner === undefined && !horizontal && !vertical) return;
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
          screen: { width: rect.width, height: rect.height },
          corner,
        };
      },
      onPointerMove: (event) => {
        const origin = start.current;
        if (origin?.pointerId !== event.pointerId) return;
        if (dragFocus === null && event.clientX === origin.x && event.clientY === origin.y) return;
        setDragFocus(pointerFocus(origin, event.clientX, event.clientY));
      },
      onPointerUp: (event) => {
        const origin = start.current;
        if (origin?.pointerId !== event.pointerId) return;
        start.current = null;
        setDragFocus(null);
        commitFocus(pointerFocus(origin, event.clientX, event.clientY));
      },
      onPointerCancel: (event) => cancelDrag(event.pointerId),
      onLostPointerCapture: (event) => cancelDrag(event.pointerId),
    };
  }
  return (
    <div
      className="cg-pan-draft"
      data-pan-crop-state={state}
      data-pan-adjusting={dragFocus === null ? undefined : ''}
    >
      <Button
        variant="ghost"
        className="cg-pan-draft__handle"
        aria-label={`Pan ${sourcePicture !== undefined ? 'source picture' : guide ? 'crop guide' : 'practice image'} in ${plateId}`}
        aria-disabled={blocked || (!horizontal && !vertical)}
        data-pan-practice-axis={
          horizontal && vertical
            ? 'both'
            : horizontal
              ? 'horizontal'
              : vertical
                ? 'vertical'
                : undefined
        }
        disabled={!horizontal && !vertical && !resizable}
        title={description}
        {...gestureProps()}
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
          if (start.current === null) {
            commitFocus({
              ...focus,
              x: clampCropFraction(focus.x + dx),
              y: clampCropFraction(focus.y + dy),
            });
          }
        }}
      >
        <span
          ref={source}
          aria-hidden="true"
          className="cg-pan-draft__picture"
          data-pan-practice-picture=""
          data-pan-source-revision={sourcePicture?.geometry?.revision}
          style={{
            left: `${(picture.x / width) * 100}%`,
            top: `${(picture.y / height) * 100}%`,
            width: `${(picture.width / width) * 100}%`,
            height: `${(picture.height / height) * 100}%`,
          }}
        >
          <span
            className="cg-pan-draft__source"
            style={{
              ...(jpeg === undefined || preview === undefined || sourcePicture === undefined
                ? { inset: 0, backgroundImage: smpteBarsGradient() }
                : {
                    left: preview.x,
                    top: preview.y,
                    width: preview.width,
                    height: preview.height,
                    backgroundImage: `url(data:image/jpeg;base64,${sourcePicture.jpegBase64})`,
                    backgroundSize: `${jpeg.width}px ${jpeg.height}px`,
                    backgroundPosition: `${jpeg.x}px ${jpeg.y}px`,
                  }),
            }}
          />
          <span
            className="cg-pan-draft__matte"
            style={{
              clipPath: `polygon(evenodd,
                0 0, 100% 0, 100% 100%, 0 100%, 0 0,
                ${cropLeft} ${cropTop}, ${cropRight} ${cropTop}, ${cropRight} ${cropBottom},
                ${cropLeft} ${cropBottom}, ${cropLeft} ${cropTop})`,
            }}
          />
          <span
            className="cg-pan-draft__crop"
            data-pan-practice-crop=""
            style={{
              left: cropLeft,
              top: cropTop,
              width: `${crop.width * 100}%`,
              height: `${crop.height * 100}%`,
            }}
          />
        </span>
      </Button>
      {resizable &&
        !blocked &&
        PAN_CORNERS.map((corner) => (
          <span
            key={corner.name}
            className="cg-pan-draft__corner"
            style={{
              left: `${((picture.x + picture.width * (crop.x + crop.width * corner.x)) / width) * 100}%`,
              top: `${((picture.y + picture.height * (crop.y + crop.height * corner.y)) / height) * 100}%`,
            }}
          >
            <Button
              variant="ghost"
              className="cg-pan-draft__resize"
              data-pan-resize-corner={corner.name}
              aria-label={`Resize ${corner.name} crop corner in ${plateId}`}
              title="Resize crop"
              {...gestureProps(corner)}
              onKeyDown={(event) => {
                const rect = source.current?.getBoundingClientRect();
                if (rect === undefined || start.current !== null) return;
                const dx =
                  event.key === 'ArrowLeft' ? -0.05 : event.key === 'ArrowRight' ? 0.05 : 0;
                const dy = event.key === 'ArrowUp' ? -0.05 : event.key === 'ArrowDown' ? 0.05 : 0;
                if (dx === 0 && dy === 0) return;
                event.preventDefault();
                commitFocus(
                  resizePanCrop(
                    focus,
                    plateAspect,
                    sourceAspect,
                    corner,
                    rect,
                    dx * rect.width,
                    dy * rect.height,
                  ),
                );
              }}
            >
              {null}
            </Button>
          </span>
        ))}
      <span className="cg-pan-draft__label">
        <Icon icon={Move} size={13} />
        <span role="status">
          {sourcePicture !== undefined && state === 'ready'
            ? measured
              ? 'Source picture'
              : 'Preview picture'
            : label}
        </span>
        <bdi>{plateId}</bdi>
      </span>
      <Button
        variant="secondary"
        className="cg-pan-draft__center"
        aria-label="Center preview crop"
        title="Center crop"
        aria-disabled={blocked || (!horizontal && !vertical)}
        disabled={!horizontal && !vertical}
        onClick={() => commitFocus({ ...focus, ...DEFAULT_LIVE_CROP_FOCUS })}
      >
        <Icon icon={RotateCcw} size={14} />
        {!compactCenter && 'Center'}
      </Button>
    </div>
  );
}
