import { useSyncExternalStore } from 'react';
import type { Element } from '@cg/shared-schema';
import { designerStore, editSceneOf } from '../../state/store.js';
import { effectivePathLocalRect } from '../timeline/keyframe-helpers.js';
import { measureElementSceneSize, subscribeMeasure, getMeasureVersion } from './measure-element.js';
import { cx } from '../../cx.js';
import {
  boxRect,
  computeRectResize,
  computeRotationAngle,
  gizmoCorners,
  gizmoCornersOfRect,
  localToScene,
  pivotClientFromGrab,
  quantizeBoxToLayout,
  rectCorner,
  rectHandleLocal,
  screenAngleDeg,
  screenDistance,
  snapValue,
  RESIZE_CFG,
  type Corner,
  type Handle,
  type LocalRect,
  type ScreenPoint,
} from './geometry.js';
import { colors } from '../../theme.js';
import * as s from './Gizmo.css.js';
import { hasNoActiveCell, renderedTransformAt } from '../../state/slices/arrangements.js';
import { sizeRatioForAspect } from '../inspector/aspect-presets.js';

interface Props {
  element: Element;
  scale: number;
  currentFrame: number;
}

// Handle / hit-area pixel sizes are baked into the shared Gizmo.css.js classes
// (`s.handle` 8px, `s.cornerHit` 18px); the gizmo only positions them on the
// projected corners. ROT_ZONE/EDGE are needed here for placement + strip thickness.
/** Rotation hover area around each corner (screen px) — outside the resize hit. */
const ROT_ZONE = 18;
/** Edge resize strips this thick (screen px) — also their hover highlight. */
const EDGE = 6;
/** Resize snap threshold (screen px). Rotation's degree threshold lives in geometry. */
const SNAP_PX = 7;

/** Midpoint of two screen points (edge-strip centre). */
function mid(a: ScreenPoint, b: ScreenPoint): ScreenPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Push `p` away from `center` by `dist` screen px — places a rotate zone just outside a corner. */
function outward(center: ScreenPoint, p: ScreenPoint, dist: number): ScreenPoint {
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: p.x + (dx / len) * dist, y: p.y + (dy / len) * dist };
}

/**
 * Custom cursors matching the reference recording: a black double-headed
 * arrow (white outline) for resize, and a curved double arrow for rotate.
 * Both are rendered at the handle's *screen* angle (base direction + the
 * element's rotation) so they line up with a rotated element. Cursors are
 * OS-drawn from these inline-SVG data URIs.
 */
function cursorDataUrl(inner: string, viewBox: number, renderPx: number, hotVb: number): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(renderPx)}" height="${String(renderPx)}" ` +
    `viewBox="0 0 ${String(viewBox)} ${String(viewBox)}">${inner}</svg>`;
  const hot = Math.round((hotVb * renderPx) / viewBox);
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${String(hot)} ${String(hot)}, auto`;
}

/** Rendered size (px) of the resize/rotate cursors — smaller than the default pointer. */
const CURSOR_PX = 23;

/**
 * Faint drop shadow giving the cursor a touch of lift off the canvas so it
 * reads clearly over any fill colour. Wrapped AROUND the rotation transform
 * (via {@link withShadow}) so the shadow always falls the same way instead of
 * spinning with the glyph. The generous filter region keeps the blur from
 * being clipped at the SVG edge.
 */
const SHADOW_FILTER =
  '<filter id="cgsh" x="-50%" y="-50%" width="200%" height="200%">' +
  '<feDropShadow dx="0" dy="0.7" stdDeviation="0.6" flood-color="#000" flood-opacity="0.4"/>' +
  '</filter>';
const withShadow = (content: string): string =>
  `<defs>${SHADOW_FILTER}</defs><g filter="url(#cgsh)">${content}</g>`;

/** Straight double-headed resize arrow, rotated `deg` (0 = horizontal ↔). */
function resizeCursor(deg: number): string {
  const arrow =
    '<path d="M2 14L8 8.5V11.5H20V8.5L26 14L20 19.5V16.5H8V19.5Z" ' +
    'fill="#111" stroke="#fff" stroke-width="1" stroke-linejoin="round"/>';
  return cursorDataUrl(
    withShadow(`<g transform="rotate(${String(Math.round(deg))} 14 14)">${arrow}</g>`),
    28,
    CURSOR_PX,
    14,
  );
}

/** Curved double-arrow rotate cursor, rotated `deg`. */
function rotateCursor(deg: number): string {
  const glyph =
    '<path d="M6 16.5A8 8 0 1 1 20 16.5" fill="none"/>' +
    '<path d="M6 16.5L2.7 13.6L7.8 12.8Z"/>' +
    '<path d="M20 16.5L18.2 12.8L23.3 13.6Z"/>';
  const halo = `<g fill="#fff" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">${glyph}</g>`;
  const ink = `<g fill="#111" stroke="#111" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round">${glyph}</g>`;
  return cursorDataUrl(
    withShadow(`<g transform="rotate(${String(Math.round(deg))} 13 13)">${halo}${ink}</g>`),
    26,
    CURSOR_PX,
    13,
  );
}

/**
 * Force one cursor everywhere for the duration of a drag gesture so passing
 * over other handles doesn't flip the icon. Returns a cleanup to call on
 * pointer-up.
 */
export function lockCursor(cursor: string): () => void {
  const style = document.createElement('style');
  style.textContent = `* { cursor: ${cursor} !important; }`;
  document.head.appendChild(style);
  return () => style.remove();
}

/**
 * Selection gizmo (the Loopic pattern). A thin accent frame with four
 * outlined corner handles, four edge strips, and a centre pivot dot — all
 * rotated with the element. Interactions:
 *   - body drag (handled by CanvasOverlay) → move
 *   - corner handle → resize both axes (opposite corner fixed)
 *   - edge strip → resize one axis (opposite edge fixed)
 *   - just outside a corner → rotate about the element's anchor
 * Resize works in the element's local (rotated) frame.
 */
export function Gizmo({ element, scale, currentFrame }: Props): JSX.Element {
  // D-060 §C — re-measure after the preview iframe re-lays-out (text/font edits stream
  // asynchronously; webfonts swap in later). Subscribing re-renders the gizmo so the
  // auto box stays glued without polling.
  useSyncExternalStore(subscribeMeasure, getMeasureVersion);
  // 🔴 D-154 — the ARRANGED transform, not the authored one. With an arrangement active a
  // box renders at its CELL, and a gizmo drawn from `element.transform` sat in empty space
  // while the picture was elsewhere — the owner's handles did not touch what he could see.
  // 🔴 B-175 — through the ONE read side, so this DRAW and the gestures below cannot be
  // reading two different rects. They were, and that is the bug this call now shares a
  // function with rather than a convention.
  let t = renderedTransformAt(element, currentFrame);
  // D-060 §C — an auto-sized text box is content-driven, so `transform.size` is not
  // authoritative. Trace the RENDERED box (the element's local content size measured
  // from the iframe — `offsetWidth/Height`, unaffected by zoom or scale/rotate), and
  // its resize handles are INERT (the box can't be drag-resized). RTL pins the RIGHT
  // edge, so the rendered left edge is `position.x − width`.
  const isAutoText = element.type === 'text' && element.fitMode === 'autosize';
  if (element.type === 'text' && element.fitMode === 'autosize') {
    const m = measureElementSceneSize(element.id);
    if (m !== null) {
      const leftX = element.direction === 'rtl' ? t.position.x - m.w : t.position.x;
      t = { ...t, size: { w: m.w, h: m.h }, position: { ...t.position, x: leftX } };
    }
  }
  // B-059/B-062 — a STATIC path needs no display override: under the owner model the
  // stored `transform.size` IS the visual (curve-aware) bbox. D-110 (owner decision
  // 2026-07-11) — a KEYFRAMED path's box is LIVE: the morph bounds at the playhead
  // (`effectivePathLocalRect`, an OFFSET local rect), projected through the same
  // pivot/rotation map so a rotated, morphing path's box stays glued to the shape.
  // Other element kinds keep the plain [0,size] box.
  const liveRect = effectivePathLocalRect(element, currentFrame);
  // Project the element's RENDERED box (`Scale·Rotate` about the anchor — a parallelogram
  // under non-uniform scale) into overlay/screen space, so the frame + handles trace the
  // SAME geometry the renderer draws (matches `hit-test.inverseToLocal`). Fixes B-022,
  // where the old box baked scale into width/height and rotated a rectangle instead.
  // B-042 — the VISUAL projection quantizes the box to the engine's LayoutUnit lattice
  // (1/64 css px, truncated) because that's where the preview ACTUALLY lays the element
  // out: at fractional model coords the raw model sat up to zoom·dpr/64 device px (1.25 at
  // 6400%/dpr 1.25 — owner-measured +1.0156) OUTSIDE the rendered edge. No-op at integer
  // coords; interaction math below stays on the raw model. The live morph rect is a
  // virtual overlay box (not an engine-laid-out edge), so it skips the quantization.
  const c =
    liveRect !== null
      ? gizmoCornersOfRect(t, liveRect, scale)
      : gizmoCorners(quantizeBoxToLayout(t), scale);
  const center = c.center;
  // B-042 — a 1-DEVICE-px frame stroke: 1 css px is 1.25 device px at dpr 1.25 — a fuzzy band
  // straddling the very edge the operator is judging at pixel-grid zoom. One device pixel,
  // centered on the RENDERED (layout-quantized) edge, stays crisp at any dpr and remains
  // HONEST for fractional placement (the border visibly sits between grid lines — see D-122).
  const frameStrokePx = 1 / (window.devicePixelRatio > 0 ? window.devicePixelRatio : 1);

  /** Resize cursor for a handle: the double-arrow points along centre→handle. */
  const resizeCur = (p: ScreenPoint): string => resizeCursor(screenAngleDeg(center, p));

  const down =
    (handle: Handle, kind: 'resize' | 'rotate') => (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      if (kind === 'rotate')
        beginRotate(element, handle as Corner, scale, currentFrame, e.nativeEvent);
      else beginResize(element, handle, scale, currentFrame, e.nativeEvent);
    };

  // Edges as corner→corner segments (single-axis resize); corners (two-axis resize).
  const edges: { h: Handle; a: ScreenPoint; b: ScreenPoint }[] = [
    { h: 't', a: c.tl, b: c.tr },
    { h: 'r', a: c.tr, b: c.br },
    { h: 'b', a: c.br, b: c.bl },
    { h: 'l', a: c.bl, b: c.tl },
  ];
  const cornerPts: { h: Corner; p: ScreenPoint }[] = [
    { h: 'tl', p: c.tl },
    { h: 'tr', p: c.tr },
    { h: 'bl', p: c.bl },
    { h: 'br', p: c.br },
  ];

  /** A fixed screen-size piece centred on a projected point. */
  const at = (p: ScreenPoint, extra?: React.CSSProperties): React.CSSProperties => ({
    left: p.x,
    top: p.y,
    transform: 'translate(-50%, -50%)',
    ...extra,
  });

  return (
    <>
      {/* Frame outline — the true parallelogram through the four projected corners.
          B-025 — the SVG must have a REAL size (it covers the overlay): a `width=0
          height=0` SVG paints its polygon only as OVERFLOW, which an ancestor's
          `overflow:hidden` then clips, so the stroke never showed. Sized to the
          overlay, the polygon (overlay-relative coords) paints inside the viewport.
          `pointer-events:none` keeps the handles/edges (drawn on top) interactive. */}
      <svg
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          overflow: 'visible',
          pointerEvents: 'none',
        }}
        aria-hidden
      >
        <polygon
          data-testid="gizmo-frame"
          points={`${String(c.tl.x)},${String(c.tl.y)} ${String(c.tr.x)},${String(c.tr.y)} ${String(c.br.x)},${String(c.br.y)} ${String(c.bl.x)},${String(c.bl.y)}`}
          fill="none"
          stroke={colors.accent}
          strokeWidth={frameStrokePx}
        />
      </svg>

      {/* Rotation zones — just OUTSIDE each corner along the centre→corner diagonal, so
          rotation is offered beyond the shape while the corner hit owns the exact corner. */}
      {cornerPts.map(({ h, p }) => (
        <div
          key={`rot-${h}`}
          className={s.rotZone}
          style={at(outward(center, p, ROT_ZONE / 2), {
            cursor: rotateCursor(screenAngleDeg(center, p) + 90),
          })}
          onPointerDown={down(h, 'rotate')}
        />
      ))}

      {/* Edge strips (single-axis resize) — a strip laid along each parallelogram side so
          the hover highlight (.cg-gizmo-edge) covers it; corner hits sit on top. */}
      {edges.map(({ h, a, b }) => {
        const m = mid(a, b);
        return (
          <div
            key={`edge-${h}`}
            className={cx('cg-gizmo-edge', s.edge)}
            style={{
              left: m.x,
              top: m.y,
              width: screenDistance(a, b),
              height: EDGE,
              transform: `translate(-50%, -50%) rotate(${String(screenAngleDeg(a, b))}deg)`,
              cursor: isAutoText ? 'default' : resizeCur(m),
            }}
            onPointerDown={isAutoText ? undefined : down(h, 'resize')}
          />
        );
      })}

      {/* Corner resize hit areas (larger than the visible square). D-060 — inert for an
          auto-sized text box (the box is content-driven, not drag-resizable). */}
      {cornerPts.map(({ h, p }) => (
        <div
          key={`hit-${h}`}
          className={`cg-gizmo-corner ${s.cornerHit}`}
          style={at(p, { cursor: isAutoText ? 'default' : resizeCur(p) })}
          onPointerDown={isAutoText ? undefined : down(h, 'resize')}
        />
      ))}

      {/* Visible corner squares (decoration only; dimmed when resize is inert). */}
      {cornerPts.map(({ h, p }) => (
        <div
          key={`rs-${h}`}
          className={s.handle}
          style={at(p, isAutoText ? { opacity: 0.35 } : undefined)}
        />
      ))}

      {/* Centre pivot indicator (visual only). */}
      <div className={s.pivot} style={at(center)} />
    </>
  );
}

interface MultiProps {
  elements: readonly Element[];
  scale: number;
  currentFrame: number;
}

/**
 * Multi-selection gizmo (D-041 + D-049): an individual selection box around EACH
 * selected shape — MOVE ONLY, with no resize/rotate handles, and NO single
 * group-spanning bounding box. Visual only (`pointerEvents: none`); the group
 * move drag is initiated from `CanvasOverlay` when a selected element is grabbed
 * (a press in empty space hits nothing → clears, per the cursor-tool rule).
 * Boxes are the elements' effective axis-aligned boxes at the current frame.
 */
export function MultiGizmo({ elements, scale, currentFrame }: MultiProps): JSX.Element | null {
  if (elements.length < 2) return null;
  const boxes = elements.map((el) => {
    // B-042 — same LayoutUnit quantization as the single-selection gizmo (visual only).
    // B-175 — and the same ONE read side: a member box drawn at its authored rect while the
    // single-selection gizmo drew the cell made the two gizmos disagree about one element.
    const t = quantizeBoxToLayout(renderedTransformAt(el, currentFrame));
    // D-110 — a keyframed path's member box follows its live morph rect (same
    // axis-aligned fidelity as the other members — rotation is ignored here).
    const r = effectivePathLocalRect(el, currentFrame) ?? boxRect(t);
    return {
      id: el.id,
      x: (t.position.x + r.x * t.scale.x) * scale,
      y: (t.position.y + r.y * t.scale.y) * scale,
      w: r.w * t.scale.x * scale,
      h: r.h * t.scale.y * scale,
    };
  });
  return (
    <>
      {boxes.map((b) => (
        <div
          key={`member-${b.id}`}
          className={s.multiBox}
          style={{ left: b.x, top: b.y, width: b.w, height: b.h }}
          data-testid="multi-select-box"
          aria-hidden
        />
      ))}
    </>
  );
}

// ── interaction (impure: reads the store, drives the pointer gesture) ─────────

/**
 * Snap targets in the active document: canvas edges + centre, every *other*
 * element's edges + centre, and the operator's ruler guides.
 */
function buildSnapTargets(excludeId: string, currentFrame: number): { xs: number[]; ys: number[] } {
  const st = designerStore.get();
  const doc = editSceneOf(st.scene, st.activeCompositionId);
  const xs: number[] = [];
  const ys: number[] = [];
  if (doc !== null) {
    xs.push(0, doc.resolution.width / 2, doc.resolution.width);
    ys.push(0, doc.resolution.height / 2, doc.resolution.height);
    for (const layer of doc.layers) {
      for (const el of layer.children) {
        if (el.id === excludeId) continue;
        // B-175 — snap to where a box IS DRAWN, not to where it was authored. A target
        // read from the authored rect is a guide line the author cannot see, pulling the
        // dragged edge to an alignment that is not on screen.
        const tr = renderedTransformAt(el, currentFrame);
        const ew = tr.size.w * tr.scale.x;
        const eh = tr.size.h * tr.scale.y;
        xs.push(tr.position.x, tr.position.x + ew / 2, tr.position.x + ew);
        ys.push(tr.position.y, tr.position.y + eh / 2, tr.position.y + eh);
      }
    }
  }
  for (const gx of st.guides.x) xs.push(gx);
  for (const gy of st.guides.y) ys.push(gy);
  return { xs, ys };
}

function beginResize(
  element: Element,
  handle: Handle,
  scale: number,
  currentFrame: number,
  ev: PointerEvent,
): void {
  // 🔴 B-175 — a box the active arrangement gives NO CELL renders nowhere, and starting a
  // resize on it would divide by `NO_CELL`'s zero width. Refused at the door, from the SAME
  // predicate the write side refuses with — see `hasNoActiveCell`.
  if (hasNoActiveCell(element.id)) return;
  // 🔴 B-175 — the ONE read side, the same call the gizmo DREW from. This read
  // `effectiveTransformAt` — the AUTHORED rect — so `grabScene`, the fixed corner and both
  // ratios were solved against a rect that was not where the handle was drawn.
  const t0 = renderedTransformAt(element, currentFrame);
  // D-110 — a keyframed path resizes from its LIVE morph rect (what the handles
  // sit on); everything else from the plain element box. `computeRectResize`'s
  // ratio-based commits make either box mean "scale the shape so THIS extent
  // matches the gesture" (bake / size-keyframe, both scale the live extent).
  const rect0: LocalRect = effectivePathLocalRect(element, currentFrame) ?? boxRect(t0);
  const cfg = RESIZE_CFG[handle];
  // The grabbed handle's start position in scene coords — the pointer delta is
  // added to this each move, then `computeRectResize` does the rotated-frame math.
  const grab = rectHandleLocal(handle, rect0);
  const grabScene = localToScene(t0, grab.x, grab.y);
  const centerScene = localToScene(t0, rect0.x + rect0.w / 2, rect0.y + rect0.h / 2);
  const startX = ev.clientX;
  const startY = ev.clientY;
  // Hold this handle's cursor for the whole gesture (don't flip over others). The arrow
  // points along centre→handle in the element's actual (scaled, rotated) screen frame.
  const unlock = lockCursor(resizeCursor(screenAngleDeg(centerScene, grabScene)));
  // Snap the moving edge to other elements / canvas / guides — only when the
  // element is axis-aligned (snapping to H/V lines is undefined when rotated).
  const snapping = designerStore.get().snappingEnabled && t0.rotation === 0;
  /*
    🔴 `D-155` — THE LOCK, RESOLVED ONCE FOR THE WHOLE GESTURE.

    Read here rather than per pointer-move on purpose: a lock toggled MID-DRAG would change
    which solution the box is tracking halfway through, so the box would relocate under a
    pointer that did not change direction. The press decides.

    ⚠ This comment previously justified that by appeal to "the same visible jump the
    dominant-axis rule produces". **That jump does not exist** — it was measured, and both
    candidate corner rules are continuous at the diagonal. See `lockExtents` in `geometry.ts`
    for the full correction. The reason above stands on its own and does not borrow it.

    The ratio is `sizeRatioForAspect`'s, never `aspect` itself — that function is the ONE
    place that knows the effective aspect includes `scale`, and `geometry.ts` deliberately
    never learns what an aspect is.

    ⚠ NARROW BY CONSTRUCTION: a `video-placeholder` with `expectedAspect` SET, and nothing
    else. Every other element kind, an unspecified aspect, and the lock switched off all
    resolve to `undefined` and take the untouched free-resize path.
  */
  const lockRatio =
    element.type === 'video-placeholder' &&
    element.expectedAspect !== undefined &&
    designerStore.get().aspectLockEnabled
      ? (sizeRatioForAspect(element.expectedAspect, t0.scale) ?? undefined)
      : undefined;
  const targets = snapping ? buildSnapTargets(element.id, currentFrame) : { xs: [], ys: [] };
  const thr = SNAP_PX / scale;

  const onMove = (e: PointerEvent): void => {
    const pScene = {
      x: grabScene.x + (e.clientX - startX) / scale,
      y: grabScene.y + (e.clientY - startY) / scale,
    };
    let guideX: number | null = null;
    let guideY: number | null = null;
    if (snapping && e.shiftKey !== true) {
      if (cfg.freeW) {
        const sx = snapValue(pScene.x, targets.xs, thr);
        if (sx !== null) {
          pScene.x = sx;
          guideX = sx;
        }
      }
      if (cfg.freeH) {
        const sy = snapValue(pScene.y, targets.ys, thr);
        if (sy !== null) {
          pScene.y = sy;
          guideY = sy;
        }
      }
    }
    const next = computeRectResize(t0, rect0, handle, pScene, lockRatio);
    designerStore.commitAnimatable(element.id, 'position.x', next.position.x);
    designerStore.commitAnimatable(element.id, 'position.y', next.position.y);
    designerStore.commitAnimatable(element.id, 'size.w', next.size.w);
    designerStore.commitAnimatable(element.id, 'size.h', next.size.h);
    if (snapping) {
      designerStore.setSnapGuides({
        x: guideX === null ? [] : [guideX],
        y: guideY === null ? [] : [guideY],
      });
    }
  };
  const onUp = (): void => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    unlock();
    designerStore.setSnapGuides({ x: [], y: [] });
    designerStore.markHistoryBoundary();
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

function beginRotate(
  element: Element,
  corner: Corner,
  scale: number,
  currentFrame: number,
  ev: PointerEvent,
): void {
  // 🔴 B-175 — as `beginResize`: no cell means the box is not on screen, so there is no
  // pivot to rotate about and the gesture must not open.
  if (hasNoActiveCell(element.id)) return;
  // 🔴 B-175 — the ONE read side. Rotation pivots about `anchor ⊙ size`, so reading the
  // AUTHORED size here spun the box about a pivot that was not inside the drawn box.
  const t0 = renderedTransformAt(element, currentFrame);
  const startAngle = t0.rotation;
  // D-110 — the rotate zones sit just outside the LIVE rect corners for a
  // keyframed path; the pivot stays the element anchor (transform-origin).
  const rect0: LocalRect = effectivePathLocalRect(element, currentFrame) ?? boxRect(t0);
  const cl = rectCorner(corner, rect0);
  // Recover the anchor's client position from the grabbed corner — the corner's offset is
  // rotated AND scaled (the renderer's `Scale·Rotate`) before the zoom, so the pivot lands
  // on the anchor regardless of a prior non-uniform scale.
  const pivot = pivotClientFromGrab(
    ev.clientX,
    ev.clientY,
    cl.x - t0.anchor.x * t0.size.w,
    cl.y - t0.anchor.y * t0.size.h,
    startAngle,
    scale,
    t0.scale.x,
    t0.scale.y,
  );
  const startCursor = Math.atan2(ev.clientY - pivot.y, ev.clientX - pivot.x) * (180 / Math.PI);
  const cornerScene = localToScene(t0, cl.x, cl.y);
  const centerScene = localToScene(t0, rect0.x + rect0.w / 2, rect0.y + rect0.h / 2);
  const unlock = lockCursor(rotateCursor(screenAngleDeg(centerScene, cornerScene) + 90));
  const snapping = designerStore.get().snappingEnabled;

  const onMove = (e: PointerEvent): void => {
    const ang = Math.atan2(e.clientY - pivot.y, e.clientX - pivot.x) * (180 / Math.PI);
    // Snap to the nearest 15° when close (hold Shift to rotate freely).
    const next = computeRotationAngle(
      startAngle,
      startCursor,
      ang,
      snapping && e.shiftKey !== true,
    );
    designerStore.commitAnimatable(element.id, 'rotation', next);
  };
  const onUp = (): void => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    unlock();
    designerStore.markHistoryBoundary();
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}
