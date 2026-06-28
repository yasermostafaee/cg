import type { AnchorPoint, Element } from '@cg/shared-schema';
import { designerStore } from '../../state/store.js';
import { pathFromScenePoints } from '../../state/element-defaults.js';

/**
 * D-109 — the Pen tool's pointer state machine. A click places a CORNER anchor; a
 * click-drag places a SMOOTH anchor whose two handles mirror the drag; clicking the
 * first anchor (within a screen-px threshold) CLOSES the path; Enter / Esc /
 * double-click FINISH an open path. The draft renders live as the real path element
 * once it has ≥ 2 anchors (the schema minimum), so preview == export the whole time.
 *
 * State is module-level (like the drag controllers): the overlay is a thin caller.
 */

const CLOSE_PX = 12; // screen-px radius around the first anchor that closes the path
let seq = 0;
const anchorId = (): string => `pt-${Date.now().toString(36)}-${(seq++).toString(36)}`;

interface Draft {
  id: string;
  points: AnchorPoint[];
  created: boolean; // has the element been added to the store yet (needs ≥ 2 points)?
}
let draft: Draft | null = null;

export function isPenDrawing(): boolean {
  return draft !== null;
}

function commit(closed: boolean): void {
  if (draft === null || draft.points.length < 2) return;
  const el = pathFromScenePoints(draft.id, draft.points, closed);
  if (draft.created) {
    designerStore.updateElement(draft.id, {
      points: el.points,
      closed: el.closed,
      transform: el.transform,
    } as Partial<Element>);
  } else {
    designerStore.addElement(el);
    draft.created = true;
  }
}

/**
 * A pen-tool pointer-down at `scene` coords. Returns `true` if the gesture finished
 * the path (closed by clicking the first anchor), so the caller restores the cursor.
 */
export function penPointerDown(
  scene: { x: number; y: number },
  scale: number,
  e: PointerEvent,
): boolean {
  // Click the first anchor → close + finish.
  const first = draft?.points[0];
  if (draft !== null && draft.points.length >= 2 && first !== undefined) {
    const d = Math.hypot(scene.x - first.x, scene.y - first.y);
    if (d <= CLOSE_PX / scale) {
      finishPen(true);
      return true;
    }
  }
  const anchor: AnchorPoint = { id: anchorId(), x: scene.x, y: scene.y, smooth: false };
  if (draft === null) draft = { id: `el-${String(Date.now())}`, points: [anchor], created: false };
  else draft.points.push(anchor);
  commit(false);

  // Drag-to-smooth: a drag before pointer-up turns this anchor smooth with mirrored
  // handles (out = drag vector in scene units, in = its negation).
  const originClientX = e.clientX;
  const originClientY = e.clientY;
  const onMove = (ev: PointerEvent): void => {
    if (draft === null) return;
    const dx = (ev.clientX - originClientX) / scale;
    const dy = (ev.clientY - originClientY) / scale;
    if (Math.hypot(dx, dy) < 3) return; // ignore micro-jitter
    const a = draft.points[draft.points.length - 1];
    if (a === undefined) return;
    a.smooth = true;
    a.out = { x: dx, y: dy };
    a.in = { x: -dx, y: -dy };
    commit(false);
  };
  const onUp = (): void => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  return false;
}

/** Finish the current draft (open unless `closed`), select it, and return to cursor. */
export function finishPen(closed: boolean): void {
  if (draft === null) return;
  if (draft.points.length >= 2) {
    commit(closed);
    designerStore.setSelection([draft.id]);
    designerStore.markHistoryBoundary();
  } else if (draft.created) {
    // Degenerate (shouldn't happen): a created-but-<2 element — remove it.
    designerStore.removeElement(draft.id);
  }
  draft = null;
  designerStore.setTool('cursor');
}
