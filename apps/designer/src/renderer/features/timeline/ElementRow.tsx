import { useRef } from 'react';
import type { Element, FrameRange, ShapeElement } from '@cg/shared-schema';
import { designerStore } from '../../state/store.js';
import { cx } from '../../cx.js';
import * as s from './ElementRow.css.js';

export { ELEMENT_ROW_HEIGHT } from './metrics.js';

interface Props {
  element: Element;
  expanded: boolean;
  onToggleExpand: () => void;
  isSelected: boolean;
  frameRange: FrameRange;
  /** Deterministic per-element bar color so each element has its own color. */
  lifespanColor: string;
  /** Which half of the row to render. */
  part: 'label' | 'lane';
  /** Open the layer right-click menu for this element at the given point. */
  onContextMenu?: (elementId: string, x: number, y: number) => void;
}

/**
 * Per-element header row in the timeline tree:
 *
 *   [ ▾ ] [name (clickable, selects element)] [ 👁 ] [ 🔒 ] │ [────── lifespan bar ──────]
 *
 * Clicking the chevron expands / collapses the 8 property TrackRows
 * underneath; clicking the name selects the element in the canvas store
 * so the right Inspector follows.
 */
export function ElementRow(props: Props): JSX.Element {
  if (props.part === 'label') return <ElementRowLabel {...props} />;
  return <ElementRowLane {...props} />;
}

function ElementRowLabel(props: Props): JSX.Element {
  const { element, expanded, onToggleExpand, isSelected, onContextMenu } = props;
  return (
    <div
      className={cx(
        'cg-tl-row',
        isSelected && 'cg-tl-selected',
        s.labelCell,
        isSelected && s.rowSelected,
        isSelected && s.labelSelectedAccent,
      )}
      data-element-id={element.id}
      onClick={(e) => {
        if ((e.target as HTMLElement).dataset.role === 'chevron') return;
        designerStore.setSelection([element.id]);
      }}
      onContextMenu={
        onContextMenu === undefined
          ? undefined
          : (e) => {
              e.preventDefault();
              e.stopPropagation();
              designerStore.setSelection([element.id]);
              onContextMenu(element.id, e.clientX, e.clientY);
            }
      }
    >
      <button
        type="button"
        className={s.chevron}
        data-role="chevron"
        onClick={(e) => {
          e.stopPropagation();
          onToggleExpand();
        }}
        aria-expanded={expanded}
        aria-label={`Toggle ${element.name} tracks`}
      >
        {expanded ? '▾' : '▸'}
      </button>
      <span className={s.typeIcon}>
        <LayerTypeIcon
          element={element}
          color={element.timelineColor ?? lifespanColorFor(element)}
        />
      </span>
      <span className={cx(s.name, isSelected && s.nameSelected)}>{element.name}</span>
      <button
        type="button"
        className={cx('cg-tl-toggle', s.toggleButton, element.visible && s.toggleButtonActive)}
        title={element.visible ? 'Hide element' : 'Show element'}
        aria-label={element.visible ? 'Hide element' : 'Show element'}
        aria-pressed={!element.visible}
        onClick={(e) => {
          e.stopPropagation();
          designerStore.updateElement(element.id, {
            visible: !element.visible,
          } as Partial<Element>);
        }}
      >
        {element.visible ? <EyeOpenIcon /> : <EyeClosedIcon />}
      </button>
      <button
        type="button"
        className={cx('cg-tl-toggle', s.toggleButton, element.locked && s.lockLocked)}
        title={element.locked ? 'Unlock element' : 'Lock element'}
        aria-label={element.locked ? 'Unlock element' : 'Lock element'}
        aria-pressed={element.locked}
        onClick={(e) => {
          e.stopPropagation();
          designerStore.updateElement(element.id, {
            locked: !element.locked,
          } as Partial<Element>);
        }}
      >
        {element.locked ? <LockClosedIcon /> : <LockOpenIcon />}
      </button>
    </div>
  );
}

/**
 * Tiny per-kind glyph shown before the layer name, tinted with the layer's
 * timeline color: a square for rectangles, a circle for ellipses, an "A" for
 * text, a picture for images, a play triangle for video/lottie, etc.
 */
function LayerTypeIcon({ element, color }: { element: Element; color: string }): JSX.Element {
  const svg = {
    width: 12,
    height: 12,
    viewBox: '0 0 16 16',
    style: { color, display: 'block' } as React.CSSProperties,
    'aria-hidden': true,
  };
  const stroke = {
    stroke: 'currentColor',
    strokeWidth: 1.6,
    fill: 'none',
    strokeLinejoin: 'round' as const,
    strokeLinecap: 'round' as const,
  };
  if (element.type === 'text') {
    return (
      <svg {...svg}>
        <text
          x="8"
          y="13"
          textAnchor="middle"
          fontSize="14"
          fontWeight={700}
          fontFamily="sans-serif"
          fill="currentColor"
        >
          A
        </text>
      </svg>
    );
  }
  if (element.type === 'image') {
    return (
      <svg {...svg}>
        <rect x="2.5" y="3.5" width="11" height="9" rx="1.5" {...stroke} />
        <circle cx="6" cy="6.5" r="1.1" fill="currentColor" stroke="none" />
        <path d="M3 12 l3.5-3 2.2 1.8 2.3-2.6 2.5 2.8" {...stroke} />
      </svg>
    );
  }
  if (element.type === 'lottie' || element.type === 'video-placeholder') {
    return (
      <svg {...svg}>
        <polygon points="5,3.5 13,8 5,12.5" {...stroke} />
      </svg>
    );
  }
  if (element.type === 'container') {
    return (
      <svg {...svg}>
        <path d="M2.5 5 h3.4 l1.2 1.4 h6.4 v6 h-11 z" {...stroke} />
      </svg>
    );
  }
  if (element.type === 'composition') {
    // Stacked frames — a nested-composition instance.
    return (
      <svg {...svg}>
        <rect x="2" y="4.5" width="8" height="7" rx="1" {...stroke} />
        <rect x="6" y="2.5" width="8" height="7" rx="1" {...stroke} />
      </svg>
    );
  }
  // shape kinds
  switch (element.shape) {
    case 'ellipse':
      return (
        <svg {...svg}>
          <circle cx="8" cy="8" r="5.2" {...stroke} />
        </svg>
      );
    case 'polygon':
      return (
        <svg {...svg}>
          <polygon points="8,3 13,13 3,13" {...stroke} />
        </svg>
      );
    case 'path':
      return (
        <svg {...svg}>
          <path d="M3 11 C 6 3.5, 10 12.5, 13 5" {...stroke} />
        </svg>
      );
    case 'rounded-rect':
      return (
        <svg {...svg}>
          <rect x="3" y="4" width="10" height="8" rx="3" {...stroke} />
        </svg>
      );
    default:
      return (
        <svg {...svg}>
          <rect x="3" y="4" width="10" height="8" rx="1" {...stroke} />
        </svg>
      );
  }
}

function EyeOpenIcon(): JSX.Element {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M1.5 8c2-3 4-5 6.5-5s4.5 2 6.5 5c-2 3-4 5-6.5 5s-4.5-2-6.5-5z" />
      <circle cx="8" cy="8" r="2" />
    </svg>
  );
}

function EyeClosedIcon(): JSX.Element {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2.5 4.5c1.5 2 3.4 4 5.5 4s4-2 5.5-4" />
      <path d="M2 11l1.5-2" />
      <path d="M14 11l-1.5-2" />
      <path d="M6 12.5l.7-2" />
      <path d="M10 12.5l-.7-2" />
    </svg>
  );
}

function LockClosedIcon(): JSX.Element {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3.5" y="7.5" width="9" height="6.5" rx="1" fill="currentColor" stroke="none" />
      <path d="M5.5 7.5V5a2.5 2.5 0 015 0v2.5" />
    </svg>
  );
}

function LockOpenIcon(): JSX.Element {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3.5" y="7.5" width="9" height="6.5" rx="1" />
      <path d="M5.5 7.5V5a2.5 2.5 0 014.7-1" />
    </svg>
  );
}

function ElementRowLane(props: Props): JSX.Element {
  const { element, isSelected, frameRange, lifespanColor, onContextMenu } = props;
  const span = Math.max(1, frameRange.out - frameRange.in);
  const lifespan = element.lifespan ?? frameRange;
  const leftPct = ((lifespan.in - frameRange.in) / span) * 100;
  const widthPct = ((lifespan.out - lifespan.in) / span) * 100;
  const cellRef = useRef<HTMLDivElement>(null);

  // Drag handlers — `mode` is 'move' for the bar body, 'resize-left' /
  // 'resize-right' for the edge grippers. The whole gesture is
  // constrained to the row (the bar uses position:absolute inside the
  // laneCell, so it visually can't leave the lane), and both ends are
  // clamped to the scene frameRange so the operator can't push the
  // element off the timeline.
  function startDrag(mode: 'move' | 'resize-left' | 'resize-right', e: React.PointerEvent): void {
    e.stopPropagation();
    // Prevent the browser from starting a native text/drag selection — without
    // this, dragging the bar repeatedly leaves a stuck selection that swallows
    // the next pointerdown until the operator clicks elsewhere to clear it.
    e.preventDefault();
    const cell = cellRef.current;
    if (cell === null) return;
    const rect = cell.getBoundingClientRect();
    if (rect.width <= 0) return;
    const handle = e.currentTarget;
    const pointerId = e.pointerId;
    try {
      handle.setPointerCapture(pointerId);
    } catch {
      /* capture is best-effort */
    }
    const startX = e.clientX;
    const startIn = lifespan.in;
    const startOut = lifespan.out;
    const pxPerFrame = rect.width / span;

    function onMove(ev: PointerEvent): void {
      const dxFrames = (ev.clientX - startX) / pxPerFrame;
      let nextIn = startIn;
      let nextOut = startOut;
      if (mode === 'move') {
        let shift = dxFrames;
        if (startIn + shift < frameRange.in) shift = frameRange.in - startIn;
        if (startOut + shift > frameRange.out) shift = frameRange.out - startOut;
        nextIn = startIn + shift;
        nextOut = startOut + shift;
      } else if (mode === 'resize-left') {
        nextIn = Math.max(frameRange.in, Math.min(startOut - 1, startIn + dxFrames));
      } else {
        nextOut = Math.max(startIn + 1, Math.min(frameRange.out, startOut + dxFrames));
      }
      designerStore.updateElementLifespan(element.id, { in: nextIn, out: nextOut });
    }
    function onUp(): void {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      try {
        handle.releasePointerCapture(pointerId);
      } catch {
        /* already released */
      }
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  return (
    <div
      ref={cellRef}
      className={cx(s.laneCell, isSelected && s.rowSelected)}
      onClick={() => designerStore.setSelection([element.id])}
      onContextMenu={
        onContextMenu === undefined
          ? undefined
          : (e) => {
              e.preventDefault();
              e.stopPropagation();
              designerStore.setSelection([element.id]);
              onContextMenu(element.id, e.clientX, e.clientY);
            }
      }
    >
      <div
        className={cx(s.lifespan, isSelected && s.lifespanSelected)}
        style={{
          left: `${leftPct.toFixed(3)}%`,
          width: `${widthPct.toFixed(3)}%`,
          background: lifespanColor,
        }}
        onPointerDown={(e) => startDrag('move', e)}
      >
        <div
          className={s.resizeHandle}
          style={{ left: 0 }}
          onPointerDown={(e) => startDrag('resize-left', e)}
          aria-hidden
        />
        <div
          className={s.resizeHandle}
          style={{ right: 0 }}
          onPointerDown={(e) => startDrag('resize-right', e)}
          aria-hidden
        />
      </div>
    </div>
  );
}

/**
 * Default lifespan-bar color by element kind — rectangles green, ellipses
 * blue, text amber, etc. — so every kind reads consistently in the timeline.
 * Overridden per element by `timelineColor` (the layer Color menu).
 */
const SHAPE_COLORS: Record<ShapeElement['shape'], string> = {
  rect: '#22C55E', // green — rectangle
  'rounded-rect': '#22C55E',
  ellipse: '#3B82F6', // blue — ellipse
  polygon: '#A855F7', // purple
  path: '#14B8A6', // teal
};

const TYPE_COLORS: Record<Exclude<Element['type'], 'shape'>, string> = {
  text: '#F59E0B', // amber
  image: '#EC4899', // pink
  lottie: '#A78BFA', // violet
  'video-placeholder': '#EF4444', // red
  container: '#F97316', // orange
  composition: '#6366F1', // indigo — composition instance
};

const FALLBACK_COLOR = '#38BDF8';

export function lifespanColorFor(element: Element): string {
  if (element.type === 'shape') return SHAPE_COLORS[element.shape] ?? FALLBACK_COLOR;
  return TYPE_COLORS[element.type] ?? FALLBACK_COLOR;
}
