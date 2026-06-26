import { useRef } from 'react';
import {
  ArrowDownUp,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  Component,
  Film,
  Group,
  Image,
  Key,
  MoveHorizontal,
  Rows3,
  Spline,
  Square,
  Stamp,
  Triangle,
  Type,
  type LucideIcon,
} from 'lucide-react';
import type { Element, FrameRange, ShapeElement } from '@cg/shared-schema';
import { designerStore, useDesignerSelector } from '../../state/store.js';
import { activeFieldData } from '../../state/scene-doc.js';
import { cx } from '../../cx.js';
import { Control } from '../../ui/Control.js';
import { Icon } from '../../ui/Icon.js';
import * as s from './ElementRow.css.js';

export { ELEMENT_ROW_HEIGHT } from './metrics.js';

/**
 * Select an element from a timeline row. D-041 — shift / ctrl(+meta) toggle the
 * element in/out of the shared multi-selection (the same modifiers as the
 * canvas, one selection set); a plain click still replaces with just this
 * element. Used by both the label and lane click handlers (the lifespan-bar
 * click bubbles to the lane handler), so canvas and layers stay in sync.
 */
function selectFromRow(e: React.MouseEvent, elementId: string): void {
  if (e.shiftKey || e.ctrlKey || e.metaKey) designerStore.toggleInSelection(elementId);
  else designerStore.setSelection([elementId]);
}

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
  /**
   * D-047 — start a reorder drag from the row's name region (label part only).
   * The handler applies the click/drag threshold; below it the click→select stands.
   */
  onReorderPointerDown?: (elementId: string, e: React.PointerEvent) => void;
  /** D-047 — true while THIS row is the one being dragged (dims it). */
  isReordering?: boolean;
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
  const { element, expanded, onToggleExpand, isSelected, onContextMenu, onReorderPointerDown } =
    props;
  // D-098 — a layer bound to data (a field binding in the active composition targets it) gets a
  // small key icon before its name. Stable boolean → no per-frame re-render.
  const bound = useDesignerSelector(
    (st) =>
      st.scene !== null &&
      activeFieldData(st.scene).bindings.some((b) => {
        const t = b.target;
        return t.kind !== 'scene-background' && t.elementId === element.id;
      }),
  );
  return (
    <div
      className={cx(
        'cg-tl-row',
        isSelected && 'cg-tl-selected',
        s.labelCell,
        isSelected && s.rowSelected,
        isSelected && s.labelSelectedAccent,
        props.isReordering === true && s.rowReordering,
      )}
      data-element-id={element.id}
      // D-047 — pointer-drag the row to reorder it. Skip the interactive controls
      // (chevron + visibility/lock toggles render as <button>s) so their clicks
      // still work; the handler applies the move threshold before it grabs.
      onPointerDown={(e) => {
        if (onReorderPointerDown === undefined) return;
        if (e.button !== 0) return;
        if ((e.target as HTMLElement).closest('button') !== null) return;
        onReorderPointerDown(element.id, e);
      }}
      onClick={(e) => {
        if ((e.target as HTMLElement).dataset.role === 'chevron') return;
        selectFromRow(e, element.id);
      }}
      onContextMenu={
        onContextMenu === undefined
          ? undefined
          : (e) => {
              e.preventDefault();
              e.stopPropagation();
              // D-076 — standard-editor target normalization: right-clicking a row that is
              // already part of the multi-selection keeps the WHOLE selection (so the menu
              // acts on all); right-clicking one outside it retargets to just that row.
              if (!designerStore.get().selection.has(element.id)) {
                designerStore.setSelection([element.id]);
              }
              onContextMenu(element.id, e.clientX, e.clientY);
            }
      }
    >
      <Control
        variant="bare"
        className={s.chevron}
        data-role="chevron"
        onClick={(e) => {
          e.stopPropagation();
          onToggleExpand();
        }}
        aria-expanded={expanded}
        aria-label={`Toggle ${element.name} tracks`}
      >
        {expanded ? (
          <Icon icon={ChevronDown} size={14} />
        ) : (
          <Icon icon={ChevronRight} size={14} flipRtl />
        )}
      </Control>
      <span className={s.typeIcon}>
        <LayerTypeIcon
          element={element}
          color={element.timelineColor ?? lifespanColorFor(element)}
        />
      </span>
      <span className={cx(s.name, isSelected && s.nameSelected)}>
        {bound && (
          <span title="Bound to data" aria-label="bound to data">
            <Icon
              icon={Key}
              size={11}
              style={{
                display: 'inline-block',
                verticalAlign: 'middle',
                marginInlineEnd: '0.25rem',
                opacity: 0.7,
              }}
            />
          </span>
        )}
        {element.name}
      </span>
      <Control
        variant="bare"
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
      </Control>
      <Control
        variant="bare"
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
      </Control>
    </div>
  );
}

/**
 * The lucide icon for a layer's kind — matches the canvas-toolbar tool icons for
 * the shared kinds (text / shape / ellipse / image / ticker / clock / sequence /
 * repeater); kinds with no toolbar tool get a sensible lucide equivalent.
 */
function layerTypeIcon(element: Element): LucideIcon {
  switch (element.type) {
    case 'text':
      return Type;
    case 'image':
      // D-097 — a shared-library logo reads distinctly from a project-asset image.
      return element.source === 'shared' ? Stamp : Image;
    case 'ticker':
      return MoveHorizontal;
    case 'clock':
      return Clock;
    case 'sequence':
      return ArrowDownUp;
    case 'repeater':
      return Rows3;
    case 'lottie':
    case 'video-placeholder':
      return Film;
    case 'container':
      return Group;
    case 'composition':
      return Component;
    case 'shape':
      switch (element.shape) {
        case 'ellipse':
          return Circle;
        case 'polygon':
          return Triangle;
        case 'path':
          return Spline;
        default:
          // 'rect' / 'rounded-rect' → the toolbar rectangle icon.
          return Square;
      }
    default:
      return Square;
  }
}

/**
 * Tiny per-kind icon shown before the layer name, tinted with the layer's timeline
 * colour. Renders the shared lucide `Icon` (matching the canvas toolbar for shared
 * kinds); the per-layer `color` rides through `currentColor` via the inline style.
 */
function LayerTypeIcon({ element, color }: { element: Element; color: string }): JSX.Element {
  return <Icon icon={layerTypeIcon(element)} size={12} style={{ color, display: 'block' }} />;
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
      onClick={(e) => selectFromRow(e, element.id)}
      onContextMenu={
        onContextMenu === undefined
          ? undefined
          : (e) => {
              e.preventDefault();
              e.stopPropagation();
              // D-076 — standard-editor target normalization: right-clicking a row that is
              // already part of the multi-selection keeps the WHOLE selection (so the menu
              // acts on all); right-clicking one outside it retargets to just that row.
              if (!designerStore.get().selection.has(element.id)) {
                designerStore.setSelection([element.id]);
              }
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
  text: '#FACC15', // yellow (D-075)
  ticker: '#F97316', // orange (D-075; shares container's orange — acceptable)
  clock: '#7E22CE', // dark purple (D-075)
  sequence: '#EF4444', // red (D-075; shares video-placeholder's red — acceptable)
  repeater: '#10B981', // emerald — data-driven rows
  image: '#EC4899', // pink
  lottie: '#A78BFA', // violet
  'video-placeholder': '#EF4444', // red
  container: '#F97316', // orange
  composition: '#6366F1', // indigo — composition instance
};

const FALLBACK_COLOR = '#38BDF8';

export function lifespanColorFor(element: Element): string {
  if (element.type === 'shape') return SHAPE_COLORS[element.shape] ?? FALLBACK_COLOR;
  // D-097 — a shared/logo image gets a distinct teal vs the asset image's pink.
  if (element.type === 'image' && element.source === 'shared') return '#14B8A6';
  return TYPE_COLORS[element.type] ?? FALLBACK_COLOR;
}
