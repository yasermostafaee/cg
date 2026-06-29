/**
 * Pure geometry for the canvas editor — the non-React, deterministic math behind
 * the gizmo (resize/rotate), snapping, and the screen↔stage↔scene coordinate
 * conversions. Extracted from `Gizmo.tsx` / `CanvasOverlay.tsx` / `CanvasArea.tsx`
 * so it can be unit-tested in isolation (the React layer is covered by E2E).
 *
 * Coordinate spaces:
 *   - **screen / client px** — viewport pixels (pointer events).
 *   - **scene px** — the composition's own pixel grid (what the schema stores).
 *     `screen = scene * zoom + stageOrigin`, so `scene = (client - origin) / zoom`.
 *   - **element-local px** — a point inside an element's unscaled box, origin at
 *     `position`, spanning `0..size.w × 0..size.h`. The renderer maps local→scene
 *     with `Scale·Rotate` about the element's `anchor` (CSS transform-origin).
 */

/** The transform fields the gizmo math needs (a structural subset of the schema `Transform`). */
export interface BoxTransform {
  position: { x: number; y: number };
  size: { w: number; h: number };
  rotation: number;
  /** 0..1 fraction of the unscaled box — the rotate/scale pivot (CSS transform-origin). */
  anchor: { x: number; y: number };
  /** Element scale (CSS `scale(x,y)`), applied AFTER rotation about the anchor — matches
   *  the renderer (`scene-builder` `composeTransform`) and `hit-test.inverseToLocal`. */
  scale: { x: number; y: number };
}

export type Corner = 'tl' | 'tr' | 'bl' | 'br';
export type Handle = Corner | 't' | 'b' | 'l' | 'r';

/** Smallest width/height a resize can produce (scene px). */
export const MIN_SIZE = 4;
/** Rotation snaps to the nearest 15° within this many degrees. */
export const SNAP_DEG = 6;

/** Which corner stays fixed during a resize + which axes each handle frees. */
export const RESIZE_CFG: Record<Handle, { fixed: Corner; freeW: boolean; freeH: boolean }> = {
  br: { fixed: 'tl', freeW: true, freeH: true },
  tl: { fixed: 'br', freeW: true, freeH: true },
  tr: { fixed: 'bl', freeW: true, freeH: true },
  bl: { fixed: 'tr', freeW: true, freeH: true },
  r: { fixed: 'tl', freeW: true, freeH: false },
  l: { fixed: 'tr', freeW: true, freeH: false },
  b: { fixed: 'tl', freeW: false, freeH: true },
  t: { fixed: 'bl', freeW: false, freeH: true },
};

/** Rotate a vector by the angle whose cos/sin are given (2-D rotation matrix). */
export function rot(vx: number, vy: number, cos: number, sin: number): { x: number; y: number } {
  return { x: vx * cos - vy * sin, y: vx * sin + vy * cos };
}

/** Element-local coords (relative to the box top-left) of a named corner for size w×h. */
export function cornerLocal(c: Corner, w: number, h: number): { x: number; y: number } {
  switch (c) {
    case 'tl':
      return { x: 0, y: 0 };
    case 'tr':
      return { x: w, y: 0 };
    case 'bl':
      return { x: 0, y: h };
    case 'br':
      return { x: w, y: h };
  }
}

/** Element-local grab point for each handle (corner point, or edge midpoint). */
export function handleLocal(handle: Handle, w: number, h: number): { x: number; y: number } {
  switch (handle) {
    case 'r':
      return { x: w, y: h / 2 };
    case 'l':
      return { x: 0, y: h / 2 };
    case 't':
      return { x: w / 2, y: 0 };
    case 'b':
      return { x: w / 2, y: h };
    default:
      return cornerLocal(handle, w, h);
  }
}

/**
 * Map an element-local point (in the unscaled box) to scene coords using the element's
 * forward transform `Scale·Rotate about anchor`: rotate about the anchor, THEN scale in
 * scene axes. This is the exact inverse of `hit-test.inverseToLocal` and matches the
 * renderer (`scene-builder` emits `transform: scale(sx,sy) rotate(deg)` about
 * `transform-origin: anchor%`). Non-uniform scale of a rotated box yields a parallelogram.
 */
export function localToScene(t: BoxTransform, lx: number, ly: number): { x: number; y: number } {
  const { position, size, rotation, anchor, scale } = t;
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const o = rot(lx - anchor.x * size.w, ly - anchor.y * size.h, cos, sin);
  return {
    x: position.x + anchor.x * size.w + scale.x * o.x,
    y: position.y + anchor.y * size.h + scale.y * o.y,
  };
}

/**
 * Compute the new `{position, size}` for a resize: the pointer (in scene coords)
 * grabs `handle`; the opposite corner stays put. Works in the element's rotated
 * frame — project the pointer→fixed-corner vector onto the element's local axes to
 * get the new width/height, clamp to {@link MIN_SIZE}, then recompute the top-left
 * so the fixed corner doesn't move. Single-axis edge handles keep the other size.
 */
export function computeResize(
  t: BoxTransform,
  handle: Handle,
  pointerScene: { x: number; y: number },
): { position: { x: number; y: number }; size: { w: number; h: number } } {
  const { size, rotation, anchor, scale } = t;
  const w0 = size.w;
  const h0 = size.h;
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cfg = RESIZE_CFG[handle];
  const fc = cornerLocal(cfg.fixed, w0, h0);
  const fixedScene = localToScene(t, fc.x, fc.y);
  // Element-local unit axes expressed in scene space.
  const ux = { x: cos, y: sin };
  const uy = { x: -sin, y: cos };
  // Undo the element scale (scene axes) before projecting onto the local axes, so the
  // size delta is measured in the element's OWN units — `Δscene = Scale·Rotate·Δlocal`.
  const vx = (pointerScene.x - fixedScene.x) / scale.x;
  const vy = (pointerScene.y - fixedScene.y) / scale.y;
  const wNew = cfg.freeW ? Math.max(MIN_SIZE, Math.abs(vx * ux.x + vy * ux.y)) : w0;
  const hNew = cfg.freeH ? Math.max(MIN_SIZE, Math.abs(vx * uy.x + vy * uy.y)) : h0;
  // Keep the fixed corner anchored: solve for the top-left given the new size. The
  // re-anchoring offset is rotated THEN scaled (scene axes), mirroring `localToScene`.
  const qf = cornerLocal(cfg.fixed, wNew, hNew);
  const pvx = anchor.x * wNew;
  const pvy = anchor.y * hNew;
  const ro = rot(qf.x - pvx, qf.y - pvy, cos, sin);
  return {
    position: {
      x: fixedScene.x - pvx - scale.x * ro.x,
      y: fixedScene.y - pvy - scale.y * ro.y,
    },
    size: { w: wNew, h: hNew },
  };
}

/**
 * Recover the rotation pivot's client position from the grabbed handle's client
 * position and the handle's element-local offset from the pivot (pre-zoom). The offset is
 * rotated by the element angle, scaled by the element's `scaleX`/`scaleY` (scene axes —
 * matching the renderer's `Scale·Rotate`), then by the `zoom`, and subtracted. `scaleX` /
 * `scaleY` default to 1 so an unscaled element behaves exactly as before.
 */
export function pivotClientFromGrab(
  grabX: number,
  grabY: number,
  offLocalX: number,
  offLocalY: number,
  rotationDeg: number,
  zoom: number,
  scaleX = 1,
  scaleY = 1,
): { x: number; y: number } {
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const o = rot(offLocalX, offLocalY, cos, sin);
  return { x: grabX - zoom * scaleX * o.x, y: grabY - zoom * scaleY * o.y };
}

/** A screen-space point (overlay coords = scene × zoom). */
export interface ScreenPoint {
  x: number;
  y: number;
}

/**
 * Project the element's selection-box geometry into screen space (overlay coords, i.e.
 * `scene × zoom`) using the same `Scale·Rotate about anchor` map as the renderer. Returns
 * the four corners + the centre of the rendered box — a PARALLELOGRAM under non-uniform
 * scale — so the gizmo can draw a frame and place screen-sized handles that stay glued to
 * the shape. Corners are named by their UNSCALED-local position (`tl` = local (0,0), etc.).
 */
export function gizmoCorners(
  t: BoxTransform,
  zoom: number,
): { tl: ScreenPoint; tr: ScreenPoint; bl: ScreenPoint; br: ScreenPoint; center: ScreenPoint } {
  const { w, h } = t.size;
  const at = (lx: number, ly: number): ScreenPoint => {
    const p = localToScene(t, lx, ly);
    return { x: p.x * zoom, y: p.y * zoom };
  };
  return {
    tl: at(0, 0),
    tr: at(w, 0),
    bl: at(0, h),
    br: at(w, h),
    center: at(w / 2, h / 2),
  };
}

/** Angle (deg) of the vector `from → to`, for orienting cursors / edge strips. */
export function screenAngleDeg(from: ScreenPoint, to: ScreenPoint): number {
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
}

/** Euclidean distance between two screen points (edge-strip length). */
export function screenDistance(a: ScreenPoint, b: ScreenPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * New rotation (deg) during a rotate gesture: the start angle plus the change in
 * cursor angle about the pivot. When `snap`, snaps to the nearest 15° within
 * {@link SNAP_DEG}. Rounded to 2 dp (matches the committed value).
 */
export function computeRotationAngle(
  startAngleDeg: number,
  startCursorDeg: number,
  cursorDeg: number,
  snap: boolean,
): number {
  let next = startAngleDeg + (cursorDeg - startCursorDeg);
  if (snap) {
    const nearest = Math.round(next / 15) * 15;
    if (Math.abs(next - nearest) <= SNAP_DEG) next = nearest;
  }
  return Number(next.toFixed(2));
}

/** Nearest target to `v` within `thr`, or null. Used to snap a single resize edge. */
export function snapValue(v: number, targets: readonly number[], thr: number): number | null {
  let best: { t: number; d: number } | null = null;
  for (const t of targets) {
    const d = Math.abs(t - v);
    if (d <= thr && (best === null || d < best.d)) best = { t, d };
  }
  return best === null ? null : best.t;
}

/**
 * Snap one axis of a moving box: try the box's near / centre / far anchors against
 * every target and pick the closest within `threshold`. Returns the adjusted origin
 * and the guide line (scene coord) to draw, or null when nothing is in range.
 */
export function snapAxis(
  origin: number,
  size: number,
  targets: readonly number[],
  threshold: number,
): { value: number; guide: number } | null {
  const anchors = [origin, origin + size / 2, origin + size];
  let best: { adj: number; guide: number } | null = null;
  for (const a of anchors) {
    for (const tg of targets) {
      const d = tg - a;
      if (Math.abs(d) <= threshold && (best === null || Math.abs(d) < Math.abs(best.adj))) {
        best = { adj: d, guide: tg };
      }
    }
  }
  return best === null ? null : { value: origin + best.adj, guide: best.guide };
}

/** Convert a client/viewport point to scene coords given the stage rect + zoom. */
export function screenToScene(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number },
  scale: number,
): { x: number; y: number } {
  return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
}

/**
 * B-027 — the pasteboard is a FIXED extent (a pure function of the resolution), NOT
 * content-grown. The margins per side are a multiple of the frame dimension:
 * {@link PASTEBOARD_MARGIN_X}× the frame width left + right, {@link PASTEBOARD_MARGIN_Y}×
 * the frame height top + bottom. A shape parked beyond the extent stays in the scene and
 * is reachable by zooming out / panning; the extent never grows, so the frame can never
 * drift (the grow-to-fit origin shift was the source of the during-drag jitter).
 */
export const PASTEBOARD_MARGIN_X = 1;
export const PASTEBOARD_MARGIN_Y = 1;

/**
 * The canvas STAGE layout (scene px): the FIXED pasteboard. Total extent =
 * frame × (1 + 2·margin) per axis — width = 3× the frame width, height = 3× the frame
 * height (a one-frame margin on every side). `frame.{x,y}` is the frame's CONSTANT offset
 * (scene px) into the stage — scene (0,0) sits there — `PASTEBOARD_MARGIN_X·width` /
 * `PASTEBOARD_MARGIN_Y·height`. Independent of element positions, so dragging a shape
 * off-frame moves nothing but the shape (no extent growth, no origin shift). Element
 * drags/nudges are CLAMPED to this extent ({@link clampDeltaToPasteboard}) so no shape can
 * cross into the clipped region — the pasteboard IS the whole workable area.
 */
export function pasteboardLayout(resolution: { width: number; height: number }): {
  width: number;
  height: number;
  frame: { x: number; y: number };
} {
  const offX = Math.round(resolution.width * PASTEBOARD_MARGIN_X);
  const offY = Math.round(resolution.height * PASTEBOARD_MARGIN_Y);
  return {
    width: Math.round(resolution.width * (1 + 2 * PASTEBOARD_MARGIN_X)),
    height: Math.round(resolution.height * (1 + 2 * PASTEBOARD_MARGIN_Y)),
    frame: { x: offX, y: offY },
  };
}

/** The pasteboard's bounds in SCENE coordinates (scene 0,0 = frame top-left). The frame
 *  is the constant inset, so the pasteboard spans `[−margin, frame + margin]` per axis. */
export function pasteboardSceneBounds(resolution: { width: number; height: number }): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  const { width, height, frame } = pasteboardLayout(resolution);
  return { minX: -frame.x, minY: -frame.y, maxX: width - frame.x, maxY: height - frame.y };
}

/**
 * B-027 — clamp a move so an element/group's full bounding box `[boxMin, boxMax]` (one
 * axis) stays inside the pasteboard `[padMin, padMax]`. Returns the clamped DELTA (works
 * for a single element — box = its own AABB — and a multi-select group — box = the
 * combined AABB, so the group stops as soon as any member hits an edge). Edge cases:
 *
 *  - **Oversized** (box bigger than the pasteboard on this axis): the full box cannot fit,
 *    so CENTER it on this axis (it stops following the pointer here) rather than fighting —
 *    its center sits at the pasteboard center, maximally visible.
 *  - **Pre-existing outside** (a shape loaded/imported beyond the bounds): the clamp only
 *    TIGHTENS — it never pushes the box further out than where it started (`delta = 0`),
 *    and lets it move inward freely; once inside, normal bounds apply. So an outside shape
 *    is recoverable (draggable back in), never trapped or violently snapped.
 */
export function clampDeltaToPasteboard(
  delta: number,
  boxMin: number,
  boxMax: number,
  padMin: number,
  padMax: number,
): number {
  if (boxMax - boxMin >= padMax - padMin) {
    // Oversized: align the box center with the pasteboard center.
    return (padMin + padMax) / 2 - (boxMin + boxMax) / 2;
  }
  // Keep `[boxMin+delta, boxMax+delta]` inside `[padMin, padMax]`, but relax each bound
  // toward 0 (the start) so a box that begins outside isn't yanked / pushed further out.
  const lo = Math.min(padMin - boxMin, 0);
  const hi = Math.max(padMax - boxMax, 0);
  return Math.max(lo, Math.min(hi, delta));
}

/**
 * Cursor-anchored zoom: the new scroll offset (one axis) that keeps a scene point fixed
 * under the cursor across a zoom. `scenePoint` is the scene coordinate that was under the
 * cursor, captured BEFORE the zoom (`= (client − stageScreenBefore) / oldZoom`);
 * `stageScreen` is the stage's screen origin (this axis) AFTER the zoom relayout but
 * BEFORE this correction; `scroll` is the current scroll offset. After the relayout the
 * point sits at `stageScreen + scenePoint·newZoom`; scrolling by the difference from
 * `client` lands it back under the cursor — so the zoom doesn't jump.
 */
export function zoomAnchorScroll(
  scroll: number,
  stageScreen: number,
  scenePoint: number,
  newZoom: number,
  client: number,
): number {
  return scroll + stageScreen + scenePoint * newZoom - client;
}

/** Clamp a zoom factor to `[min, max]`; non-finite input falls back to `fallback`. */
export function clampZoom(z: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(z)) return fallback;
  return Math.max(min, Math.min(max, z));
}

/** Largest zoom that fits `scene` inside `viewport` (minus `margin`), or null if degenerate. */
export function fitZoom(
  viewportW: number,
  viewportH: number,
  sceneW: number,
  sceneH: number,
  margin: number,
): number | null {
  const z = Math.min((viewportW - margin) / sceneW, (viewportH - margin) / sceneH);
  return Number.isFinite(z) && z > 0 ? z : null;
}
