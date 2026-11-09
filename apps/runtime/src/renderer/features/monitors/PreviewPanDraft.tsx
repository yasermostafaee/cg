import { useEffect, useRef, useState } from 'react';
import { Move, RotateCcw } from 'lucide-react';
import { DEFAULT_LIVE_CROP_FOCUS, fitPictureToBox, type LiveCropFocus } from '@cg/shared-schema';
import type { PreviewPlateCropTarget } from '@cg/shared-ipc';
import { smpteBarsGradient } from '@cg/template-runtime/scene-builder';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import type { PlatePlacement } from './livePlateGeometry.js';

const PRACTICE_SOURCE_ASPECT = 16 / 9;

interface PreviewPanPlacement extends PlatePlacement {
  catalogAspect: number | null;
}

interface CropSave {
  plateId: string;
  phase: 'saving' | 'saved' | 'error';
  focus: LiveCropFocus;
}

type CropState = 'practice' | 'loading' | 'ready' | CropSave['phase'];

const CROP_LABEL = {
  practice: 'Practice image',
  loading: 'Checking crop…',
  ready: 'Crop guide',
  saving: 'Saving crop…',
  saved: 'Saved for Take',
  error: 'Crop not saved',
} as const satisfies Record<CropState, string>;

/** One request per rehearsing row. The stage remounts this row when its crop context changes. */
export function PreviewPanRow({
  itemId,
  plates,
}: {
  itemId: string;
  plates: readonly PreviewPanPlacement[];
}): JSX.Element {
  const hasSource = plates.some((plate) => plate.sourceId !== null);
  const [targets, setTargets] = useState<readonly PreviewPlateCropTarget[] | null>(
    hasSource ? null : [],
  );
  const [cropMessage, setCropMessage] = useState<string>();
  const [save, setSave] = useState<CropSave | null>(null);
  const pending = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
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
      mounted.current = false;
    };
  }, [hasSource, itemId]);

  const saveFocus = async (target: PreviewPlateCropTarget, focus: LiveCropFocus): Promise<void> => {
    if (pending.current) return;
    pending.current = true;
    setSave({ plateId: target.plateId, phase: 'saving', focus });
    try {
      const result = await window.cg.stack.previewPlateCrop({
        itemId,
        edit: { token: target.token, focus },
      });
      if (!mounted.current) return;
      if (result.ok && result.targets.some((entry) => entry.token === target.token)) {
        setTargets(result.targets);
        setSave({ plateId: target.plateId, phase: 'saved', focus });
        return;
      }
    } catch {
      if (!mounted.current) return;
    } finally {
      pending.current = false;
    }
    // A refusal can mean the crop plan has changed. Reopen Pan to inspect it again.
    setTargets([]);
    setSave({ plateId: target.plateId, phase: 'error', focus });
  };

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
        const plateSave = save?.plateId === plate.plateId ? save : null;
        let state: CropState = targets === null ? 'loading' : 'practice';
        if (target !== undefined) state = target.staged === true ? 'saved' : 'ready';
        if (plateSave !== null) state = plateSave.phase;
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
              key={target?.token ?? 'practice'}
              plateId={plate.plateId}
              width={plate.width}
              height={plate.height}
              practiceAspect={plate.catalogAspect ?? PRACTICE_SOURCE_ASPECT}
              state={state}
              blocked={targets === null || save?.phase === 'saving'}
              cropMessage={cropMessage}
              guide={
                target === undefined
                  ? undefined
                  : {
                      aspect: target.sourceAspect,
                      focus: plateSave?.phase === 'saving' ? plateSave.focus : target.focus,
                      save: (focus) => void saveFocus(target, focus),
                    }
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
  practiceAspect,
  state,
  blocked,
  cropMessage,
  guide,
}: {
  plateId: string;
  width: number;
  height: number;
  practiceAspect: number;
  state: CropState;
  blocked: boolean;
  cropMessage: string | undefined;
  guide: { aspect: number; focus: LiveCropFocus; save: (focus: LiveCropFocus) => void } | undefined;
}): JSX.Element {
  const [practiceFocus, setPracticeFocus] = useState(DEFAULT_LIVE_CROP_FOCUS);
  const [dragFocus, setDragFocus] = useState<LiveCropFocus | null>(null);
  const appliedFocus = guide?.focus ?? practiceFocus;
  const focus = dragFocus ?? appliedFocus;
  const commitFocus = (next: LiveCropFocus): void => {
    if (blocked || (next.x === appliedFocus.x && next.y === appliedFocus.y)) return;
    if (guide === undefined) setPracticeFocus(next);
    else guide.save(next);
  };
  const source = useRef<HTMLSpanElement>(null);
  const start = useRef<PointerOrigin | null>(null);
  const cancelDrag = (pointerId: number): void => {
    if (start.current?.pointerId !== pointerId) return;
    start.current = null;
    setDragFocus(null);
  };
  const picture = fitPictureToBox(
    { x: 0, y: 0, width, height },
    guide?.aspect ?? practiceAspect,
    'contain',
  ).picture;
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
  const description =
    state === 'error'
      ? 'Could not save the crop. Reopen Pan to check the assigned input again.'
      : guide
        ? `${instructions} The guide uses bars. Changes are saved for Take.`
        : `${instructions} ${cropMessage ?? 'Practice changes stay in Preview.'}`;
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
        Center
      </Button>
    </div>
  );
}
