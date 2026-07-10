import type { AnchorPoint, Element } from '@cg/shared-schema';
import { designerStore } from '../../state/store.js';
import { freshElementId } from '../../state/scene-doc.js';
import { pathFromScenePoints } from '../../state/element-defaults.js';

/**
 * D-109 / B-037 — the Pen tool's pointer state machine. A click places a CORNER
 * anchor; a click-drag places a SMOOTH anchor whose two handles mirror the drag;
 * clicking the first anchor (within a screen-px threshold) CLOSES the path; Enter /
 * double-click FINISH an open path; Esc CANCELS the draft (removes the created
 * element). The draft renders live as the real path element once it has ≥ 2 anchors
 * (the schema minimum), so preview == export the whole time.
 *
 * B-037 — finishing keeps the pen ARMED: the next pointer-down starts a NEW element
 * (N draws → N independent elements); exiting to the cursor is explicit (toolbar /
 * Esc while idle). State is module-level (like the drag controllers): the overlay is
 * a thin caller and MUST call `endPenSession` on every pen exit (tool change,
 * composition switch, unmount) so a draft can never leak into a later pen session.
 */

/** Screen-px radius around the first anchor that closes the path (shared with the
 *  CanvasOverlay close-affordance so the highlight and the click agree). */
export const PEN_CLOSE_PX = 12;
let seq = 0;
const anchorId = (): string => `pt-${Date.now().toString(36)}-${(seq++).toString(36)}`;

interface Draft {
  id: string;
  points: AnchorPoint[];
  created: boolean; // has the element been added to the store yet (needs ≥ 2 points)?
}
let draft: Draft | null = null;

export function isPenDrawing(): boolean {
  dropStaleDraft(); // lazy invalidation — a Delete/undo mid-draw kills the draft here
  return draft !== null;
}

/** The in-progress draft's anchors in SCENE coordinates (`[]` when idle) — read-only,
 *  for the CanvasOverlay draw-state feedback (rubber band + close affordance). */
export function penDraftPoints(): readonly AnchorPoint[] {
  dropStaleDraft();
  return draft === null ? [] : draft.points;
}

/**
 * B-037 (review round) — the store can invalidate the draft's element MID-draw:
 * Delete/Backspace acts on the auto-selected draft, and Ctrl+Z steps the scene back
 * while the module-level draft keeps its points. A created draft whose element is
 * gone, or whose committed anchor count no longer matches, is STALE and must die —
 * continuing it would resurrect deleted/undone geometry on the next click, and
 * finishing it would select a nonexistent id.
 */
function draftIsStale(): boolean {
  if (draft === null || !draft.created) return false;
  const el = designerStore.allElements().find((e) => e.id === draft?.id);
  return el === undefined || el.type !== 'path' || el.points.length !== draft.points.length;
}

/** Drop a stale draft (see {@link draftIsStale}); returns true when it did. */
function dropStaleDraft(): boolean {
  if (!draftIsStale()) return false;
  draft = null;
  return true;
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
 * the path (closed by clicking the first anchor) — the pen stays armed either way.
 */
export function penPointerDown(
  scene: { x: number; y: number },
  scale: number,
  e: PointerEvent,
): boolean {
  // A stale draft (element deleted / undone mid-draw) dies here: this click starts
  // a FRESH element instead of resurrecting the removed geometry.
  dropStaleDraft();
  // Click the first anchor → close + finish.
  const first = draft?.points[0];
  if (draft !== null && draft.points.length >= 2 && first !== undefined) {
    const d = Math.hypot(scene.x - first.x, scene.y - first.y);
    if (d <= PEN_CLOSE_PX / scale) {
      finishPen(true);
      return true;
    }
  }
  const anchor: AnchorPoint = { id: anchorId(), x: scene.x, y: scene.y, smooth: false };
  if (draft === null) draft = { id: freshElementId(), points: [anchor], created: false };
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

/** Finish the current draft (open unless `closed`) and select it. B-037 — the pen
 *  stays armed; the next pointer-down starts a NEW element. */
export function finishPen(closed: boolean): void {
  if (draft === null || dropStaleDraft()) return;
  if (draft.points.length >= 2) {
    commit(closed);
    designerStore.setSelection([draft.id]);
    designerStore.markHistoryBoundary();
  } else if (draft.created) {
    // Degenerate (shouldn't happen): a created-but-<2 element — remove it.
    designerStore.removeElement(draft.id);
  }
  draft = null;
}

/** B-037 — cancel the in-progress draft (Esc): remove the created element (if any)
 *  so nothing of the draft persists, then reset. */
export function cancelPen(): void {
  if (draft === null || dropStaleDraft()) return;
  if (draft.created) {
    // The LEADING boundary keeps the removal out of the draw's coalescing window
    // (same reason the App Delete handler marks one first): without it a fast Esc
    // folds the removal into the last anchor's undo entry and Ctrl+Z resurrects a
    // PARTIAL path. The trailing boundary closes the removal as its own undo step.
    designerStore.markHistoryBoundary();
    designerStore.removeElement(draft.id);
    designerStore.markHistoryBoundary();
  }
  draft = null;
}

/**
 * B-037 — passive end-of-session on ANY pen exit (tool switch, composition switch,
 * overlay unmount). A created draft (`created ⇒ ≥ 2 anchors`) is FINISHED as an OPEN
 * path — it is already committed to the scene, so this only closes the undo burst; a
 * smaller draft is dropped (it was never added: `commit` requires ≥ 2 points).
 * Deliberately NO selection or tool writes: the finished element is already selected
 * in the tool-switch case, and a composition switch has just cleared the selection —
 * re-selecting a cross-composition id would corrupt the new context. Idempotent.
 */
export function endPenSession(): void {
  if (draft === null || dropStaleDraft()) return;
  if (draft.created) designerStore.markHistoryBoundary();
  draft = null;
}
