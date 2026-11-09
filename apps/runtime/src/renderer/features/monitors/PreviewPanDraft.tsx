import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Move, RotateCcw } from 'lucide-react';
import {
  DEFAULT_LIVE_CROP_FOCUS,
  fitPictureToBox,
  type LiveCropFocus,
  type StackItemState,
} from '@cg/shared-schema';
import type { PreviewPlateCropTarget } from '@cg/shared-ipc';
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

const PRACTICE_SOURCE_ASPECT = 16 / 9;

interface PreviewPanPlacement extends PlatePlacement {
  catalogAspect: number | null;
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
  plates,
  fit,
}: {
  itemId: string;
  scope: string;
  lookId: string | undefined;
  appliedCrops: StackItemState['previewPlateCrops'];
  plates: readonly PreviewPanPlacement[];
  fit: number;
}): JSX.Element {
  const hasSource = plates.some((plate) => plate.sourceId !== null);
  const [targets, setTargets] = useState<readonly PreviewPlateCropTarget[] | null>(
    hasSource ? null : [],
  );
  const [cropMessage, setCropMessage] = useState<string>();
  useSyncExternalStore(subscribeDrafts, draftsVersion, draftsVersion);

  useEffect(() => {
    let current = true;
    if (hasSource) {
      void (async () => {
        try {
          const result = await window.cg.stack.previewPlateCrop({ itemId });
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
  }, [hasSource, itemId]);

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
              key={key}
              plateId={plate.plateId}
              width={plate.width}
              height={plate.height}
              sourceAspect={target?.sourceAspect ?? plate.catalogAspect ?? PRACTICE_SOURCE_ASPECT}
              state={state}
              blocked={targets === null}
              cropMessage={cropMessage}
              guide={target !== undefined}
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

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

interface PointerOrigin {
  pointerId: number;
  x: number;
  y: number;
  focus: LiveCropFocus;
  travelX: number;
  travelY: number;
}

function pointerFocus(origin: PointerOrigin, x: number, y: number): LiveCropFocus {
  return {
    x:
      origin.travelX === 0
        ? origin.focus.x
        : clamp(origin.focus.x + (x - origin.x) / origin.travelX),
    y:
      origin.travelY === 0
        ? origin.focus.y
        : clamp(origin.focus.y + (y - origin.y) / origin.travelY),
  };
}

/** Draw the full guide or practice source, keeping movement local until release. */
function PreviewPanDraft({
  plateId,
  width,
  height,
  sourceAspect,
  state,
  blocked,
  cropMessage,
  guide,
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
  compactCenter: boolean;
  stagedFocus: LiveCropFocus;
  onFocusChange: (focus: LiveCropFocus) => void;
}): JSX.Element {
  const [dragFocus, setDragFocus] = useState<LiveCropFocus | null>(null);
  const focus = dragFocus ?? stagedFocus;
  const commitFocus = (next: LiveCropFocus): void => {
    if (!blocked && (next.x !== stagedFocus.x || next.y !== stagedFocus.y)) onFocusChange(next);
  };
  const source = useRef<HTMLSpanElement>(null);
  const start = useRef<PointerOrigin | null>(null);
  const cancelDrag = (pointerId: number): void => {
    if (start.current?.pointerId !== pointerId) return;
    start.current = null;
    setDragFocus(null);
  };
  const picture = fitPictureToBox({ x: 0, y: 0, width, height }, sourceAspect, 'contain').picture;
  const crop = fitPictureToBox(picture, width / height, 'contain').picture;
  const cropWidth = crop.width / picture.width;
  const cropHeight = crop.height / picture.height;
  const travelX = Math.max(0, 1 - cropWidth);
  const travelY = Math.max(0, 1 - cropHeight);
  const horizontal = travelX > 1e-6;
  const vertical = travelY > 1e-6;
  const instructions = horizontal
    ? 'Drag or use the left and right arrows.'
    : vertical
      ? 'Drag or use the up and down arrows.'
      : 'The image fits this plate.';
  const description = guide
    ? `${instructions} The guide uses bars. Press Update to save this crop for Take.`
    : `${instructions} Press Update to keep this practice crop in this console. ${cropMessage ?? 'Practice changes stay in Preview.'}`;
  return (
    <div className="cg-pan-draft" data-pan-crop-state={state}>
      <Button
        variant="ghost"
        className="cg-pan-draft__handle"
        aria-label={`Pan ${guide ? 'crop guide' : 'practice image'} in ${plateId}`}
        aria-disabled={blocked || (!horizontal && !vertical)}
        data-pan-practice-axis={horizontal ? 'horizontal' : vertical ? 'vertical' : undefined}
        disabled={!horizontal && !vertical}
        title={description}
        onPointerDown={(event) => {
          if (blocked || event.button !== 0 || start.current !== null) return;
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
          setDragFocus(pointerFocus(origin, event.clientX, event.clientY));
        }}
        onPointerUp={(event) => {
          const origin = start.current;
          if (origin?.pointerId !== event.pointerId) return;
          start.current = null;
          setDragFocus(null);
          commitFocus(pointerFocus(origin, event.clientX, event.clientY));
        }}
        onPointerCancel={(event) => cancelDrag(event.pointerId)}
        onLostPointerCapture={(event) => cancelDrag(event.pointerId)}
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
            commitFocus({ x: clamp(focus.x + dx), y: clamp(focus.y + dy) });
          }
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
      </Button>
      <span className="cg-pan-draft__label">
        <Icon icon={Move} size={13} />
        <span role="status">{CROP_LABEL[state]}</span>
        <bdi>{plateId}</bdi>
      </span>
      <Button
        variant="secondary"
        className="cg-pan-draft__center"
        aria-label="Center preview crop"
        title="Center crop"
        aria-disabled={blocked || (!horizontal && !vertical)}
        disabled={!horizontal && !vertical}
        onClick={() => commitFocus(DEFAULT_LIVE_CROP_FOCUS)}
      >
        <Icon icon={RotateCcw} size={14} />
        {!compactCenter && 'Center'}
      </Button>
    </div>
  );
}
