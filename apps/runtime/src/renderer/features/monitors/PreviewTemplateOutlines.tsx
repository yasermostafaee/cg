import { useEffect, useRef, type CSSProperties, type HTMLAttributes } from 'react';
import { Move } from 'lucide-react';
import type { ChannelRaster } from '@cg/shared-ipc';
import {
  outputLetterbox,
  outputScale,
  outputTranslate,
  type FitRect,
  type Position,
} from '@cg/shared-schema';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import {
  clearPositionDraftMatching,
  positionDraftOf,
  stagePosition,
  type PositionDraft,
} from '../inspector/draftStore.js';
import type { RehearsalFrameBounds } from './RehearsalFrame.js';
import { frameBox, type RehearsalSubject } from './rehearsalFrames.js';

export interface PreviewOutline {
  subject: RehearsalSubject;
  bounds: RehearsalFrameBounds;
  templateName: string | null;
}

const LABEL_HEIGHT = 23;
const LABEL_WIDTH = 176;
const LABEL_GAP = 3;

function displayRect(rect: FitRect, fit: number): FitRect {
  return { x: rect.x * fit, y: rect.y * fit, width: rect.width * fit, height: rect.height * fit };
}

function intersects(a: FitRect, b: FitRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function labelBounds(
  rect: FitRect,
  width: number,
  height: number,
  placed: readonly FitRect[],
  artwork: readonly FitRect[],
): FitRect {
  const labelWidth = Math.min(width, LABEL_WIDTH);
  const step = LABEL_HEIGHT + LABEL_GAP;
  const maxY = Math.max(0, height - LABEL_HEIGHT);
  const x = Math.max(0, Math.min(width - labelWidth, rect.x + LABEL_GAP));
  const y = Math.max(0, Math.min(maxY, rect.y + LABEL_GAP));
  const label = { x, y, width: labelWidth, height: LABEL_HEIGHT };
  for (const outsideY of [rect.y - step, rect.y + rect.height + LABEL_GAP]) {
    if (outsideY < 0 || outsideY > maxY) continue;
    const outside = { ...label, y: outsideY };
    if (
      !artwork.some((content) => intersects(outside, content)) &&
      !placed.some((existing) => intersects(outside, existing))
    )
      return outside;
  }
  // Coincident and overlapping outlines still need individually reachable labels.
  for (let offset = 0; offset <= Math.ceil(height / step); offset += 1) {
    for (const candidateY of offset === 0 ? [y] : [y + offset * step, y - offset * step]) {
      if (candidateY < 0 || candidateY > maxY) continue;
      const candidate = { ...label, y: candidateY };
      if (!placed.some((existing) => intersects(candidate, existing))) return candidate;
    }
  }
  return label;
}

function boxStyle(box: FitRect): CSSProperties {
  return { left: box.x, top: box.y, width: box.width, height: box.height };
}

function startPosition(subject: RehearsalSubject, stage: FitRect, raster: ChannelRaster): Position {
  if (subject.position !== undefined) return subject.position;
  // The retained HTML may have an authored default that this browser never imported.
  // Reconstruct the current translation before the first drag so the graphic does not jump.
  const scale = outputScale(raster);
  const pad = outputLetterbox(raster);
  const anchor = subject.positionAnchor ?? 'center';
  const atAnchor = outputTranslate(
    { resolution: { width: stage.width / scale, height: stage.height / scale } },
    { anchor, offset: { x: 0, y: 0 } },
  );
  const round = (n: number): number => Math.round(n * 1000) / 1000;
  return {
    anchor,
    offset: {
      x: round((stage.x - pad.x) / scale - atAnchor.x),
      y: round((stage.y - pad.y) / scale - atAnchor.y),
    },
  };
}

interface Drag {
  pointerId: number;
  startX: number;
  startY: number;
  pixelsPerOffset: number;
  seed: Position;
  prior: PositionDraft | undefined;
  last: PositionDraft | undefined;
}

type PointerHandlers = Pick<
  HTMLAttributes<HTMLElement>,
  'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel' | 'onLostPointerCapture'
>;

function outlineDraft(seed: Position, dx: number, dy: number): PositionDraft {
  return {
    anchor: seed.anchor,
    x: String(seed.offset.x + dx),
    y: String(seed.offset.y + dy),
  };
}

function restorePrior(itemId: string, drag: Drag): void {
  if (drag.last === undefined || positionDraftOf(itemId) !== drag.last) return;
  if (drag.prior === undefined) clearPositionDraftMatching(itemId, drag.last);
  else stagePosition(itemId, drag.prior);
}

function TemplateOutline({
  outline: { subject, bounds, templateName },
  rect,
  label,
  concealLabel,
  raster,
  fit,
  interactive,
  onSelectItem,
}: {
  outline: PreviewOutline;
  rect: FitRect;
  label: FitRect;
  concealLabel: boolean;
  raster: ChannelRaster;
  fit: number;
  interactive: boolean;
  onSelectItem?: ((itemId: string) => void) | undefined;
}): JSX.Element {
  const { itemId, rowName } = subject;
  const moveable = interactive && subject.canEditPosition === true && bounds.canPosition;
  const drag = useRef<Drag>();
  useEffect(() => {
    if (!moveable && drag.current !== undefined) {
      restorePrior(itemId, drag.current);
      drag.current = undefined;
    }
  }, [itemId, moveable]);

  const select = (): void => onSelectItem?.(itemId);
  const end = (pointerId: number, cancelled = false): void => {
    const current = drag.current;
    if (current?.pointerId !== pointerId) return;
    drag.current = undefined;
    if (cancelled) restorePrior(itemId, current);
  };
  const gesture: PointerHandlers = moveable
    ? {
        onPointerDown: (event) => {
          if (event.button !== 0 || drag.current !== undefined) return;
          select();
          const seed = startPosition(subject, bounds.stage, raster);
          drag.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            pixelsPerOffset: fit * outputScale(raster),
            seed,
            prior: positionDraftOf(itemId),
            last: undefined,
          };
          event.currentTarget.setPointerCapture?.(event.pointerId);
        },
        onPointerMove: (event) => {
          const current = drag.current;
          if (current?.pointerId !== event.pointerId) return;
          const dx = Math.round((event.clientX - current.startX) / current.pixelsPerOffset);
          const dy = Math.round((event.clientY - current.startY) / current.pixelsPerOffset);
          if (dx === 0 && dy === 0) {
            restorePrior(itemId, current);
            current.last = undefined;
            return;
          }
          const draft = outlineDraft(current.seed, dx, dy);
          if (
            current.last !== undefined &&
            draft.x === current.last.x &&
            draft.y === current.last.y
          )
            return;
          current.last = draft;
          stagePosition(itemId, draft);
        },
        onPointerUp: (event) => end(event.pointerId),
        onPointerCancel: (event) => end(event.pointerId, true),
        onLostPointerCapture: (event) => end(event.pointerId, true),
      }
    : {};
  const name =
    templateName === null || templateName === rowName ? rowName : `${rowName} (${templateName})`;
  const labelText = (
    <>
      <bdi>{rowName}</bdi>
      {templateName !== null && templateName !== rowName && (
        <>
          {' '}
          · <bdi>{templateName}</bdi>
        </>
      )}
    </>
  );

  return (
    <>
      <div
        className="cg-pvw-template-outline"
        data-pvw-template-outline={itemId}
        data-pvw-position-editable={moveable ? 'true' : undefined}
        style={boxStyle(rect)}
        aria-hidden
        {...gesture}
      />
      <div
        className="cg-pvw-template-label"
        data-pvw-label-over-picture={concealLabel ? '' : undefined}
        style={boxStyle(label)}
      >
        {moveable ? (
          <Button
            variant="neutral"
            className="cg-pvw-template-grip"
            data-pvw-template-grip={itemId}
            aria-label={`Move ${name} in Preview`}
            title={`Move ${name} in Preview`}
            onClick={select}
            onKeyDown={(event) => {
              const step = event.shiftKey ? 10 : 1;
              const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
              const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
              if (dx === 0 && dy === 0) return;
              event.preventDefault();
              select();
              stagePosition(
                itemId,
                outlineDraft(startPosition(subject, bounds.stage, raster), dx, dy),
              );
            }}
            {...gesture}
          >
            <Icon icon={Move} size={13} />
            <span>{labelText}</span>
          </Button>
        ) : (
          <span className="cg-pvw-template-fact" title={name} data-pvw-template-grip={itemId}>
            {labelText}
          </span>
        )}
      </div>
    </>
  );
}

export function PreviewTemplateOutlines({
  outlines,
  raster,
  fit,
  zIndex,
  interactive,
  onSelectItem,
}: {
  outlines: readonly PreviewOutline[];
  raster: ChannelRaster;
  fit: number;
  zIndex: number;
  interactive: boolean;
  onSelectItem?: ((itemId: string) => void) | undefined;
}): JSX.Element | null {
  if (outlines.length === 0 || fit <= 0) return null;
  const width = raster.width * fit;
  const height = raster.height * fit;
  const labels: FitRect[] = [];
  const boxes = outlines.map((outline) => ({
    outline,
    rect: displayRect(outline.bounds.content, fit),
  }));
  const artwork = boxes.map(({ rect }) => rect);
  return (
    <div className="cg-pvw-template-outlines" style={{ ...frameBox({ width, height }, 1), zIndex }}>
      {boxes.map(({ outline, rect }) => {
        const label = labelBounds(rect, width, height, labels, artwork);
        labels.push(label);
        return (
          <TemplateOutline
            key={outline.subject.itemId}
            outline={outline}
            rect={rect}
            label={label}
            concealLabel={artwork.some((content) => intersects(label, content))}
            raster={raster}
            fit={fit}
            interactive={interactive}
            onSelectItem={onSelectItem}
          />
        );
      })}
    </div>
  );
}
