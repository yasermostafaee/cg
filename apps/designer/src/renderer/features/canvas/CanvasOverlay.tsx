import { useEffect, useRef } from 'react';
import type { Element, Scene, TextElement } from '@cg/shared-schema';
import type { AssetMeta } from '@cg/shared-ipc';
import { designerStore, editSceneOf, type DesignerTool } from '../../state/store.js';
import {
  defaultClock,
  defaultEllipse,
  defaultImage,
  defaultRepeater,
  defaultSequence,
  defaultShape,
  defaultText,
  defaultTicker,
} from '../../state/element-defaults.js';
import { COMPOSITION_DND_TYPE } from '../compositions/CompositionsPanel.js';
import { getActiveSharedImage } from '../sharedLibrary/activeSharedImage.js';
import { resolveBinding } from '../fields/bind-resolver.js';
import { effectiveTransformAt } from '../timeline/keyframe-helpers.js';
import { topmostHit } from './hit-test.js';
import { collectGroupMoveTargets } from './group-move.js';
import { drillTarget } from './drill.js';
import { screenToScene, snapAxis } from './geometry.js';
import { Gizmo, MultiGizmo, lockCursor } from './Gizmo.js';
import { TextEditor } from './TextEditor.js';
import * as s from './CanvasOverlay.css.js';

/**
 * The default canvas pointer — a bold black arrow with a white outline, a bit
 * larger than the OS default (the Loopic look). OS-drawn from an inline SVG;
 * hotspot at the arrow tip.
 */
const ARROW_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24">' +
  '<defs><filter id="cgsh" x="-50%" y="-50%" width="200%" height="200%">' +
  '<feDropShadow dx="0" dy="0.7" stdDeviation="0.6" flood-color="#000" flood-opacity="0.4"/>' +
  '</filter></defs>' +
  '<path d="M5 3L5 18.5L9 14.8L14.6 14.8Z" filter="url(#cgsh)" ' +
  'fill="#0B0E16" stroke="#fff" stroke-width="0.9" stroke-linejoin="round"/></svg>';
export const ARROW_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(ARROW_SVG)}") 7 4, default`;

/** Initial size for a stamped logo: the image's aspect, longest side ≤ 320px. */
function logoSize(image: AssetMeta): { width: number; height: number } {
  const { width: w, height: h } = image;
  if (w === undefined || h === undefined || w <= 0 || h <= 0) return { width: 320, height: 320 };
  const scale = 320 / Math.max(w, h);
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/**
 * D-040 — insert the canvas logo tool's target as a `source: 'shared'` image:
 * the operator's selected library image, else the first in the library. With an
 * empty library, surface a hint and insert nothing (the D-030 guard).
 */
async function insertSharedLogo(scenePoint: { x: number; y: number }): Promise<void> {
  const active = getActiveSharedImage();
  // Stamp the operator's selection, else the NEWEST library image. The store's
  // `list()` is oldest→newest but the panel shows newest-first (D-070), so the
  // panel's top item is the LAST entry — `list[length-1]`, not `list[0]` (oldest).
  const list = await window.cg.sharedImages.list();
  const image = active ?? list[list.length - 1] ?? null;
  if (image === null) {
    designerStore.showNotice(
      'Add an image to the Shared Library (left panel) first, then use the logo tool.',
    );
    designerStore.setTool('cursor');
    return;
  }
  const { width, height } = logoSize(image);
  const id = `el-${String(Date.now())}`;
  designerStore.addElement(
    defaultImage(id, scenePoint.x, scenePoint.y, image.assetId, {
      source: 'shared',
      width,
      height,
    }),
  );
  designerStore.setSelection([id]);
  designerStore.setTool('cursor');
}

interface Props {
  scene: Scene;
  tool: DesignerTool;
  selection: ReadonlySet<string>;
  editingTextId: string | null;
  bindModeFieldId: string | null;
  scale: number;
  /**
   * D-071 Phase B — the frame's offset (scene px) into the symmetric pasteboard. The
   * pointer layer covers the WHOLE pasteboard (off-frame shapes stay selectable), but
   * scene (0,0) is the FRAME top-left — so the gizmos / `canvas-surface` are anchored
   * in an inner box at this offset and click→scene is measured from there.
   */
  frameOffset: { x: number; y: number };
  currentFrame: number;
  /** Hand-tool drag delta callback (deltaX, deltaY in scene pixels). */
  onPan?: (dx: number, dy: number) => void;
}

/**
 * Transparent overlay on top of the cgpreview iframe. Captures clicks,
 * routes them to element-creation (when a creator tool is active) or
 * selection (cursor tool), and hosts the Gizmo for the selected element.
 *
 * The iframe underneath renders the live template-runtime preview; this
 * overlay sits above it and steals pointer events. (The iframe still
 * receives `postMessage` field updates from the Inspector.)
 */
export function CanvasOverlay({
  scene,
  tool,
  selection,
  editingTextId,
  bindModeFieldId,
  scale,
  frameOffset,
  currentFrame,
  onPan,
}: Props): JSX.Element {
  const layerRef = useRef<HTMLDivElement>(null);
  // The frame-origin box (scene 0,0). The pointer LAYER spans the whole pasteboard;
  // this inner box is inset by `frameOffset`, so its rect is the scene origin used by
  // both the gizmo/`canvas-surface` positioning and click→scene mapping.
  const frameRef = useRef<HTMLDivElement>(null);

  const allElements: Element[] = [];
  for (const layer of scene.layers) {
    for (const el of layer.children) allElements.push(el);
  }
  // For hit-testing: clone each element with its *visually effective*
  // transform at the current frame, so the bounding boxes the
  // `topmostHit` function checks are the ones the operator can see.
  const allElementsAtFrame: Element[] = allElements.map((el) => ({
    ...el,
    transform: effectiveTransformAt(el, currentFrame),
  }));
  const selectedEl =
    selection.size === 1 ? (allElements.find((e) => selection.has(e.id)) ?? null) : null;
  // D-041 — the selected elements for the multi-selection gizmo (size > 1).
  const selectedEls = selection.size > 1 ? allElements.filter((e) => selection.has(e.id)) : [];
  const editingEl = editingTextId
    ? (allElements.find((e) => e.id === editingTextId) ?? null)
    : null;

  useEffect(() => {
    if (bindModeFieldId === null) return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') designerStore.setBindMode(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bindModeFieldId]);

  // Esc deselects the selected shape — unless something else owns Esc (bind
  // mode, inline text editing) or the operator is typing in a field.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key !== 'Escape') return;
      if (bindModeFieldId !== null || editingTextId !== null) return;
      const t = e.target;
      if (t instanceof HTMLElement) {
        const tag = t.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable)
          return;
      }
      if (selection.size > 0) designerStore.setSelection([]);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bindModeFieldId, editingTextId, selection]);

  function viewportToScene(clientX: number, clientY: number): { x: number; y: number } {
    // Measure from the FRAME origin (scene 0,0) — inset into the pasteboard — not the
    // pointer layer's top-left (the stage/pasteboard origin).
    const rect = frameRef.current?.getBoundingClientRect();
    if (rect === undefined) return { x: 0, y: 0 };
    return screenToScene(clientX, clientY, rect, scale);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    if (e.button !== 0) return;
    // Don't steal pointer events while a text editor is up — let
    // selection survive cross-canvas clicks and let the editor blur.
    if (editingEl !== null) return;
    // Commit a focused inspector field (e.g. the Dynamic/Data "Value") before
    // this click changes the selection. React flushes the selection update
    // synchronously and unmounts the field, so its own commit-on-blur would
    // otherwise fire after the input is already gone and be lost.
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')
    ) {
      active.blur();
    }
    const scenePoint = viewportToScene(e.clientX, e.clientY);
    if (bindModeFieldId !== null) {
      const hit = topmostHit(allElementsAtFrame, scenePoint);
      if (hit !== null) {
        const field = scene.fields.find((f) => f.id === bindModeFieldId);
        if (field !== undefined) {
          const binding = resolveBinding(field, hit);
          if (binding !== null) designerStore.addBinding(binding);
        }
      }
      designerStore.setBindMode(null);
      return;
    }
    if (tool === 'cursor') {
      // D-041 — shift / ctrl(+meta) build a multi-selection.
      const modifier = e.shiftKey || e.ctrlKey || e.metaKey;
      const hit = topmostHit(allElementsAtFrame, scenePoint);
      if (hit === null) {
        // A plain click on empty space clears; a modifier-click on empty space
        // is a no-op (it must not wipe an in-progress multi-selection).
        if (!modifier) designerStore.setSelection([]);
        return;
      }
      if (modifier) {
        // Toggle this element in/out of the selection — no drag on a toggle.
        designerStore.toggleInSelection(hit.id);
        return;
      }
      // Plain click on a member of an existing multi-selection → start a GROUP
      // move (it collapses to just this element if it turns out to be a click,
      // not a drag). Otherwise replace the selection with this element and run
      // the single-element drag (today's keyframe-aware path, unchanged).
      const isMember = selection.size > 1 && selection.has(hit.id);
      if (isMember && !hit.locked) {
        beginGroupDrag(hit.id, scale, currentFrame, e.nativeEvent);
      } else {
        designerStore.setSelection([hit.id]);
        // A locked element can be selected (to recolor / unlock it) but not
        // moved — and its resize/rotate gizmo is hidden (see render below).
        if (!hit.locked) beginDrag(hit.id, scale, currentFrame, e.nativeEvent);
      }
      return;
    }
    if (tool === 'hand') {
      beginPan(e.nativeEvent, onPan);
      return;
    }
    if (tool === 'text') {
      const id = `el-${String(Date.now())}`;
      designerStore.addElement(defaultText(id, scenePoint.x, scenePoint.y));
      designerStore.setTool('cursor');
      return;
    }
    if (tool === 'ticker') {
      const id = `el-${String(Date.now())}`;
      designerStore.addElement(defaultTicker(id, scenePoint.x, scenePoint.y));
      designerStore.setTool('cursor');
      return;
    }
    if (tool === 'clock') {
      const id = `el-${String(Date.now())}`;
      designerStore.addElement(defaultClock(id, scenePoint.x, scenePoint.y));
      designerStore.setTool('cursor');
      return;
    }
    if (tool === 'sequence') {
      const id = `el-${String(Date.now())}`;
      designerStore.addElement(defaultSequence(id, scenePoint.x, scenePoint.y));
      designerStore.setTool('cursor');
      return;
    }
    if (tool === 'repeater') {
      // D-030 — a repeater needs a child composition to stamp: insert only
      // when a valid (non-cyclic, not the open composition) one exists,
      // preselecting the first valid; otherwise explain instead of inserting.
      const valid = (scene.compositions ?? []).find((c) =>
        designerStore.canNestCompositionInActive(c.id),
      );
      if (valid === undefined) {
        designerStore.showNotice(
          'A repeater stamps another composition per row — create one first (it can’t repeat the open composition or anything that would loop).',
        );
        designerStore.setTool('cursor');
        return;
      }
      const id = `el-${String(Date.now())}`;
      designerStore.addElement(defaultRepeater(id, scenePoint.x, scenePoint.y, valid));
      designerStore.setTool('cursor');
      return;
    }
    if (tool === 'shape') {
      const id = `el-${String(Date.now())}`;
      designerStore.addElement(defaultShape(id, scenePoint.x, scenePoint.y));
      designerStore.setTool('cursor');
      return;
    }
    if (tool === 'ellipse') {
      const id = `el-${String(Date.now())}`;
      designerStore.addElement(defaultEllipse(id, scenePoint.x, scenePoint.y));
      designerStore.setTool('cursor');
      return;
    }
    if (tool === 'image') {
      // D-040 — stamp the selected Shared Library image as a `source: 'shared'`
      // logo. Empty library ⇒ a hint, never a silent insert (mirrors D-030).
      void insertSharedLogo(scenePoint);
      return;
    }
  }

  function onDoubleClick(e: React.MouseEvent<HTMLDivElement>): void {
    const scenePoint = viewportToScene(e.clientX, e.clientY);
    const hit = topmostHit(allElementsAtFrame, scenePoint);
    if (hit === null) return;
    if (hit.type === 'text') {
      designerStore.setSelection([hit.id]);
      designerStore.setEditingText(hit.id);
      return;
    }
    // D-024 — double-click a nested child-composition instance: drill into that
    // child (one level) and select the shape under the cursor. Single-click still
    // selects the whole instance as a unit (see onPointerDown). The child is the
    // SHARED definition — editing it affects every parent that uses it.
    if (hit.type === 'composition') {
      const child = scene.compositions?.find((c) => c.id === hit.compositionId);
      if (child === undefined) return;
      const target = drillTarget(hit, child, scenePoint, currentFrame);
      if (target === null) return;
      designerStore.openCompositionAndSelect(target.compositionId, target.shapeId);
    }
  }

  const cursorStyle =
    bindModeFieldId !== null
      ? 'crosshair'
      : tool === 'cursor'
        ? ARROW_CURSOR
        : tool === 'hand'
          ? 'grab'
          : 'crosshair';
  // Bind-mode shows an actionable hint ("BIND → fieldId, Esc to cancel"),
  // but the always-on tool name was redundant with the toolbar's
  // pressed state and clutters the canvas — removed.
  function onDragOver(e: React.DragEvent<HTMLDivElement>): void {
    const t = e.dataTransfer.types;
    if (!t.includes('application/x-cg-asset-id') && !t.includes(COMPOSITION_DND_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>): void {
    // A composition dragged from the Compositions panel → place an instance
    // as a new layer (the child's own layers are not copied). Refused when it
    // would create a cycle.
    const compId = e.dataTransfer.getData(COMPOSITION_DND_TYPE);
    if (compId !== '') {
      e.preventDefault();
      const p = viewportToScene(e.clientX, e.clientY);
      const ok = designerStore.addCompositionInstance(compId, {
        x: Math.round(p.x),
        y: Math.round(p.y),
      });
      if (!ok) {
        designerStore.showNotice(
          'Can’t place this composition here — it already contains the open composition, so nesting it would loop forever.',
        );
      }
      return;
    }
    const assetId = e.dataTransfer.getData('application/x-cg-asset-id');
    if (assetId === '') return;
    e.preventDefault();
    const scenePoint = viewportToScene(e.clientX, e.clientY);
    const id = `el-${String(Date.now())}`;
    designerStore.addElement(defaultImage(id, scenePoint.x, scenePoint.y, assetId));
    designerStore.setSelection([id]);
  }

  return (
    <div
      ref={layerRef}
      className={s.layer}
      style={{ cursor: cursorStyle }}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {/* D-071 Phase B — the FRAME box (scene 0,0), INSET into the pasteboard by
          `frameOffset`. The pointer-handling layer (parent) covers the whole pasteboard
          so off-frame shapes are selectable, but the gizmos are anchored HERE so they
          track scene coords (the gizmo SVG sizes to this box — keeping it FRAME-sized,
          not 0×0, keeps the B-025 stroke painted). Off-frame gizmos paint as SVG
          overflow (the layer doesn't clip; the stage clips only at the pasteboard
          edge). This box doubles as the `canvas-surface` hook, so `canvas.boundingBox()`
          stays the FRAME; no handler of its own — clicks bubble to the layer. */}
      <div
        ref={frameRef}
        data-testid="canvas-surface"
        style={{
          position: 'absolute',
          top: frameOffset.y * scale,
          left: frameOffset.x * scale,
          width: scene.resolution.width * scale,
          height: scene.resolution.height * scale,
        }}
      >
        {selectedEl !== null &&
          selectedEl.visible &&
          !selectedEl.locked &&
          editingEl === null &&
          bindModeFieldId === null && (
            <Gizmo element={selectedEl} scale={scale} currentFrame={currentFrame} />
          )}
        {selectedEls.length > 1 && editingEl === null && bindModeFieldId === null && (
          <MultiGizmo elements={selectedEls} scale={scale} currentFrame={currentFrame} />
        )}
        {editingEl !== null && editingEl.type === 'text' && (
          <TextEditor
            element={editingEl as TextElement}
            scale={scale}
            onCommit={() => designerStore.setEditingText(null)}
          />
        )}
      </div>
      {bindModeFieldId !== null && (
        <div className={s.toolHint}>BIND → {bindModeFieldId} (Esc to cancel)</div>
      )}
      {/* D-071 Phase B — the snap/alignment guides moved to CanvasArea so they span
          the full visible canvas (the pasteboard), not just this frame-bound stage. */}
    </div>
  );
}

function beginPan(ev: PointerEvent, onPan?: (dx: number, dy: number) => void): void {
  if (onPan === undefined) return;
  let lastX = ev.clientX;
  let lastY = ev.clientY;
  const onMove = (e: PointerEvent): void => {
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    if (dx === 0 && dy === 0) return;
    lastX = e.clientX;
    lastY = e.clientY;
    onPan(dx, dy);
  };
  const onUp = (): void => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

function beginDrag(elementId: string, scale: number, currentFrame: number, ev: PointerEvent): void {
  const state = designerStore.get();
  if (state.scene === null) return;
  // Look up the element in the *active composition* — the project root's
  // `layers` is empty under the composition model.
  const doc = editSceneOf(state.scene, state.activeCompositionId);
  if (doc === null) return;
  let element: Element | null = null;
  for (const layer of doc.layers) {
    for (const el of layer.children) {
      if (el.id === elementId) {
        element = el;
        break;
      }
    }
  }
  if (element === null) return;
  // Hold the move (arrow) cursor for the whole drag so it doesn't flip when the
  // pointer passes over the gizmo's resize/rotate handles.
  const unlockCursor = lockCursor(ARROW_CURSOR);
  const startX = ev.clientX;
  const startY = ev.clientY;
  // Drag from the *visually effective* start so the shape stays under
  // the cursor when the property is animated.
  const t0 = effectiveTransformAt(element, currentFrame);
  const startPos = { x: t0.position.x, y: t0.position.y };
  const w = t0.size.w * t0.scale.x;
  const h = t0.size.h * t0.scale.y;

  // Snap targets in scene coords, computed once: the canvas edges + centre,
  // and every other element's edges + centre. The dragged element is excluded.
  const W = doc.resolution.width;
  const H = doc.resolution.height;
  const xTargets: number[] = [0, W / 2, W];
  const yTargets: number[] = [0, H / 2, H];
  for (const layer of doc.layers) {
    for (const el of layer.children) {
      if (el.id === elementId) continue;
      const t = effectiveTransformAt(el, currentFrame);
      const ew = t.size.w * t.scale.x;
      const eh = t.size.h * t.scale.y;
      xTargets.push(t.position.x, t.position.x + ew / 2, t.position.x + ew);
      yTargets.push(t.position.y, t.position.y + eh / 2, t.position.y + eh);
    }
  }
  // Ruler guides are snap targets too.
  for (const gx of state.guides.x) xTargets.push(gx);
  for (const gy of state.guides.y) yTargets.push(gy);

  let moved = false;
  const onMove = (e: PointerEvent): void => {
    const dx = (e.clientX - startX) / scale;
    const dy = (e.clientY - startY) / scale;
    if (!moved && Math.abs(dx) + Math.abs(dy) < 2) return; // click vs drag
    moved = true;
    let nx = startPos.x + dx;
    let ny = startPos.y + dy;
    const guides: { x: number[]; y: number[] } = { x: [], y: [] };
    if (designerStore.get().snappingEnabled) {
      const threshold = 6 / scale; // ~6 screen px regardless of zoom
      const sx = snapAxis(nx, w, xTargets, threshold);
      if (sx !== null) {
        nx = sx.value;
        guides.x.push(sx.guide);
      }
      const sy = snapAxis(ny, h, yTargets, threshold);
      if (sy !== null) {
        ny = sy.value;
        guides.y.push(sy.guide);
      }
    }
    designerStore.commitAnimatable(elementId, 'position.x', nx);
    designerStore.commitAnimatable(elementId, 'position.y', ny);
    designerStore.setSnapGuides(guides);
  };
  const onUp = (): void => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    unlockCursor();
    designerStore.setSnapGuides({ x: [], y: [] });
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

/**
 * D-041 — group move. Drag every SELECTED element by the same delta as ONE undo
 * step. Reuses the single-drag delta + snapping math, anchoring snapping on the
 * grabbed element. D-054 — each member's position is written KEYFRAME-AWARE via the
 * shared `commitAnimatable`: a member with a track on the moved axis keyframes at
 * the playhead (as if dragged alone), others write their static base — exactly the
 * single-drag rule. Locked/hidden members are skipped (like single drag). A pure
 * click (no movement) collapses the selection to just the grabbed element.
 */
function beginGroupDrag(
  anchorId: string,
  scale: number,
  currentFrame: number,
  ev: PointerEvent,
): void {
  const state = designerStore.get();
  if (state.scene === null) return;
  const doc = editSceneOf(state.scene, state.activeCompositionId);
  if (doc === null) return;
  const { movers, anchor, xTargets, yTargets } = collectGroupMoveTargets(
    doc.layers,
    state.selection,
    anchorId,
    currentFrame,
    doc.resolution,
  );
  if (anchor === null) return;
  const anc = anchor;
  // Ruler guides are snap targets too.
  for (const gx of state.guides.x) xTargets.push(gx);
  for (const gy of state.guides.y) yTargets.push(gy);

  const unlockCursor = lockCursor(ARROW_CURSOR);
  const startX = ev.clientX;
  const startY = ev.clientY;
  // Start a fresh undo entry; per-move writes coalesce into it; the boundary at
  // pointer-up closes it — the whole gesture is a single undo step.
  designerStore.markHistoryBoundary();
  let moved = false;

  const onMove = (e: PointerEvent): void => {
    const dx = (e.clientX - startX) / scale;
    const dy = (e.clientY - startY) / scale;
    if (!moved && Math.abs(dx) + Math.abs(dy) < 2) return; // click vs drag
    moved = true;
    // Snap the ANCHOR, then apply its (snapped) delta to every member so the
    // selection's relative offsets are preserved.
    let ax = anc.x + dx;
    let ay = anc.y + dy;
    const guides: { x: number[]; y: number[] } = { x: [], y: [] };
    if (designerStore.get().snappingEnabled) {
      const threshold = 6 / scale; // ~6 screen px regardless of zoom
      const sx = snapAxis(ax, anc.w, xTargets, threshold);
      if (sx !== null) {
        ax = sx.value;
        guides.x.push(sx.guide);
      }
      const sy = snapAxis(ay, anc.h, yTargets, threshold);
      if (sy !== null) {
        ay = sy.value;
        guides.y.push(sy.guide);
      }
    }
    const fdx = ax - anc.x;
    const fdy = ay - anc.y;
    for (const m of movers) {
      // D-054 — keyframe-AWARE per member via the shared single-drag helper: a
      // member with a position track keyframes at the playhead (m.x/m.y are the
      // evaluated-at-playhead start, so the keyframe holds start+delta, B-005-safe),
      // others write their static base. commitAnimatable is unmodified.
      designerStore.commitAnimatable(m.id, 'position.x', m.x + fdx);
      designerStore.commitAnimatable(m.id, 'position.y', m.y + fdy);
    }
    designerStore.setSnapGuides(guides);
  };
  const onUp = (): void => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    unlockCursor();
    designerStore.setSnapGuides({ x: [], y: [] });
    designerStore.markHistoryBoundary();
    // A pure click (no drag) on a member collapses the selection to just it.
    if (!moved) designerStore.setSelection([anchorId]);
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}
