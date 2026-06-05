import type { Element } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { designerStore } from '../../state/store.js';
import { effectiveTransformAt } from '../timeline/keyframe-helpers.js';

interface Props {
  element: Element;
  scale: number;
  currentFrame: number;
}

/** Visible corner square (screen px). */
const HANDLE = 8;
/** Invisible corner *resize* hover/hit area, larger than the visible square. */
const CORNER_HIT = 16;
/** Rotation hover area around each corner (screen px) — outside the resize hit. */
const ROT_ZONE = 28;
/** Edge resize strips this thick (screen px). */
const EDGE = 7;
const MIN_SIZE = 4;

/**
 * Custom cursors matching the reference recording: a black double-headed
 * arrow (white outline) for resize, and a curved double arrow for rotate.
 * Both are rendered at the handle's *screen* angle (base direction + the
 * element's rotation) so they line up with a rotated element. Cursors are
 * OS-drawn from these inline-SVG data URIs.
 */
function cursorDataUrl(inner: string, size: number, hot: number): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(size)}" height="${String(size)}" ` +
    `viewBox="0 0 ${String(size)} ${String(size)}">${inner}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${String(hot)} ${String(hot)}, auto`;
}

/** Straight double-headed resize arrow, rotated `deg` (0 = horizontal ↔). */
function resizeCursor(deg: number): string {
  const arrow =
    '<path d="M2 14L8 8.5V11.5H20V8.5L26 14L20 19.5V16.5H8V19.5Z" ' +
    'fill="#111" stroke="#fff" stroke-width="1" stroke-linejoin="round"/>';
  return cursorDataUrl(
    `<g transform="rotate(${String(Math.round(deg))} 14 14)">${arrow}</g>`,
    28,
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
    `<g transform="rotate(${String(Math.round(deg))} 13 13)">${halo}${ink}</g>`,
    26,
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

type Corner = 'tl' | 'tr' | 'bl' | 'br';
type Handle = Corner | 't' | 'b' | 'l' | 'r';

/** Base screen angle of each resize handle's arrow (before element rotation). */
const RESIZE_ANGLE: Record<Handle, number> = {
  r: 0,
  l: 0,
  t: 90,
  b: 90,
  br: 45,
  tl: 45,
  tr: 135,
  bl: 135,
};

/** Base angle of each corner's rotate cursor (faces outward), before rotation. */
const ROTATE_ANGLE: Record<Corner, number> = { br: 45, bl: 135, tl: 225, tr: 315 };

const styles = {
  frame: {
    position: 'absolute' as const,
    border: `1px solid ${colors.accent}`,
    boxSizing: 'border-box' as const,
    pointerEvents: 'none' as const,
  },
  // Loopic-style corner handle: white fill, accent outline. Visual only — the
  // (larger) cornerHit area below owns the resize gesture.
  handle: {
    position: 'absolute' as const,
    width: HANDLE,
    height: HANDLE,
    background: '#FFF',
    border: `1px solid ${colors.accent}`,
    boxSizing: 'border-box' as const,
    pointerEvents: 'none' as const,
  },
  cornerHit: {
    position: 'absolute' as const,
    width: CORNER_HIT,
    height: CORNER_HIT,
    pointerEvents: 'auto' as const,
    background: 'transparent',
  },
  rotZone: {
    position: 'absolute' as const,
    width: ROT_ZONE,
    height: ROT_ZONE,
    pointerEvents: 'auto' as const,
    background: 'transparent',
  },
  edge: {
    position: 'absolute' as const,
    pointerEvents: 'auto' as const,
    background: 'transparent',
  },
  // Centre pivot indicator (visual only).
  pivot: {
    position: 'absolute' as const,
    width: 7,
    height: 7,
    borderRadius: '50%',
    border: `1px solid ${colors.accent}`,
    background: '#FFF',
    boxSizing: 'border-box' as const,
    pointerEvents: 'none' as const,
  },
} as const;

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
  const t = effectiveTransformAt(element, currentFrame);
  const { position, size, rotation, anchor } = t;
  const w = size.w * t.scale.x * scale;
  const h = size.h * t.scale.y * scale;
  const x = position.x * scale;
  const y = position.y * scale;

  // The renderer rotates each element about its `anchor` (CSS transform-origin);
  // match it so the frame + handles track a rotated element.
  const rotateOrigin = `${String(anchor.x * 100)}% ${String(anchor.y * 100)}%`;
  const rotateTransform = rotation === 0 ? undefined : `rotate(${String(rotation)}deg)`;

  const box = (extra: React.CSSProperties): React.CSSProperties => ({
    position: 'absolute',
    left: x,
    top: y,
    width: w,
    height: h,
    transform: rotateTransform,
    transformOrigin: rotateOrigin,
    ...extra,
  });

  const corners: { c: Corner; cx: number; cy: number }[] = [
    { c: 'tl', cx: 0, cy: 0 },
    { c: 'tr', cx: w, cy: 0 },
    { c: 'bl', cx: 0, cy: h },
    { c: 'br', cx: w, cy: h },
  ];

  const down =
    (handle: Handle, kind: 'resize' | 'rotate') => (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      if (kind === 'rotate')
        beginRotate(element, handle as Corner, scale, currentFrame, e.nativeEvent);
      else beginResize(element, handle, scale, currentFrame, e.nativeEvent);
    };

  return (
    <>
      <div style={{ ...styles.frame, ...box({}) }} />
      <div style={box({ pointerEvents: 'none' })}>
        {/* Rotation zones first (lowest) so the resize squares sit on top. */}
        {corners.map(({ c, cx, cy }) => (
          <div
            key={`rot-${c}`}
            style={{
              ...styles.rotZone,
              left: cx - ROT_ZONE / 2,
              top: cy - ROT_ZONE / 2,
              cursor: rotateCursor(ROTATE_ANGLE[c] + rotation + 90),
            }}
            onPointerDown={down(c, 'rotate')}
          />
        ))}
        {/* Edge strips (single-axis resize), inset past the corner hit areas. */}
        <div
          style={{
            ...styles.edge,
            left: CORNER_HIT / 2,
            top: -EDGE / 2,
            width: w - CORNER_HIT,
            height: EDGE,
            cursor: resizeCursor(RESIZE_ANGLE.t + rotation),
          }}
          onPointerDown={down('t', 'resize')}
        />
        <div
          style={{
            ...styles.edge,
            left: CORNER_HIT / 2,
            top: h - EDGE / 2,
            width: w - CORNER_HIT,
            height: EDGE,
            cursor: resizeCursor(RESIZE_ANGLE.b + rotation),
          }}
          onPointerDown={down('b', 'resize')}
        />
        <div
          style={{
            ...styles.edge,
            left: -EDGE / 2,
            top: CORNER_HIT / 2,
            width: EDGE,
            height: h - CORNER_HIT,
            cursor: resizeCursor(RESIZE_ANGLE.l + rotation),
          }}
          onPointerDown={down('l', 'resize')}
        />
        <div
          style={{
            ...styles.edge,
            left: w - EDGE / 2,
            top: CORNER_HIT / 2,
            width: EDGE,
            height: h - CORNER_HIT,
            cursor: resizeCursor(RESIZE_ANGLE.r + rotation),
          }}
          onPointerDown={down('r', 'resize')}
        />
        {/* Corner resize hover areas (larger than the visible square). */}
        {corners.map(({ c, cx, cy }) => (
          <div
            key={`hit-${c}`}
            style={{
              ...styles.cornerHit,
              left: cx - CORNER_HIT / 2,
              top: cy - CORNER_HIT / 2,
              cursor: resizeCursor(RESIZE_ANGLE[c] + rotation),
            }}
            onPointerDown={down(c, 'resize')}
          />
        ))}
        {/* Visible corner squares (decoration only). */}
        {corners.map(({ c, cx, cy }) => (
          <div
            key={`rs-${c}`}
            style={{ ...styles.handle, left: cx - HANDLE / 2, top: cy - HANDLE / 2 }}
          />
        ))}
        <div style={{ ...styles.pivot, left: w / 2 - 3.5, top: h / 2 - 3.5 }} />
      </div>
    </>
  );
}

// ── geometry ────────────────────────────────────────────────────────────────

function rot(vx: number, vy: number, cos: number, sin: number): { x: number; y: number } {
  return { x: vx * cos - vy * sin, y: vx * sin + vy * cos };
}

/** Local coords (relative to the box top-left) of a named corner for size w×h. */
function cornerLocal(c: Corner, w: number, h: number): { x: number; y: number } {
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

/** Which corner stays put + which axes a handle frees. */
const RESIZE_CFG: Record<Handle, { fixed: Corner; freeW: boolean; freeH: boolean }> = {
  br: { fixed: 'tl', freeW: true, freeH: true },
  tl: { fixed: 'br', freeW: true, freeH: true },
  tr: { fixed: 'bl', freeW: true, freeH: true },
  bl: { fixed: 'tr', freeW: true, freeH: true },
  r: { fixed: 'tl', freeW: true, freeH: false },
  l: { fixed: 'tr', freeW: true, freeH: false },
  b: { fixed: 'tl', freeW: false, freeH: true },
  t: { fixed: 'bl', freeW: false, freeH: true },
};

/** Local grab point (box-relative) for each handle, used as the drag origin. */
function handleLocal(handle: Handle, w: number, h: number): { x: number; y: number } {
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

function beginResize(
  element: Element,
  handle: Handle,
  scale: number,
  currentFrame: number,
  ev: PointerEvent,
): void {
  const t0 = effectiveTransformAt(element, currentFrame);
  const w0 = t0.size.w;
  const h0 = t0.size.h;
  const { x: px, y: py } = t0.position;
  const a = t0.anchor;
  const rad = (t0.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // Pivot in scene coords (anchor point of the unscaled box).
  const pivot = { x: px + a.x * w0, y: py + a.y * h0 };
  const sceneOf = (lx: number, ly: number): { x: number; y: number } => {
    const o = rot(lx - a.x * w0, ly - a.y * h0, cos, sin);
    return { x: pivot.x + o.x, y: pivot.y + o.y };
  };
  const cfg = RESIZE_CFG[handle];
  const fixedScene = sceneOf(...cornerToArgs(cfg.fixed, w0, h0));
  const grab = handleLocal(handle, w0, h0);
  const grabScene = sceneOf(grab.x, grab.y);
  // Local unit axes (scene space).
  const ux = { x: cos, y: sin };
  const uy = { x: -sin, y: cos };
  const startX = ev.clientX;
  const startY = ev.clientY;
  // Hold this handle's cursor for the whole gesture (don't flip over others).
  const unlock = lockCursor(resizeCursor(RESIZE_ANGLE[handle] + t0.rotation));

  const onMove = (e: PointerEvent): void => {
    const pScene = {
      x: grabScene.x + (e.clientX - startX) / scale,
      y: grabScene.y + (e.clientY - startY) / scale,
    };
    const vx = pScene.x - fixedScene.x;
    const vy = pScene.y - fixedScene.y;
    const wNew = cfg.freeW ? Math.max(MIN_SIZE, Math.abs(vx * ux.x + vy * ux.y)) : w0;
    const hNew = cfg.freeH ? Math.max(MIN_SIZE, Math.abs(vx * uy.x + vy * uy.y)) : h0;
    // Recompute the top-left so the fixed corner stays put with the new size.
    const qf = cornerLocal(cfg.fixed, wNew, hNew);
    const pvx = a.x * wNew;
    const pvy = a.y * hNew;
    const ro = rot(qf.x - pvx, qf.y - pvy, cos, sin);
    const Px = fixedScene.x - pvx - ro.x;
    const Py = fixedScene.y - pvy - ro.y;
    designerStore.commitAnimatable(element.id, 'position.x', Px);
    designerStore.commitAnimatable(element.id, 'position.y', Py);
    designerStore.commitAnimatable(element.id, 'size.w', wNew);
    designerStore.commitAnimatable(element.id, 'size.h', hNew);
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

function cornerToArgs(c: Corner, w: number, h: number): [number, number] {
  const p = cornerLocal(c, w, h);
  return [p.x, p.y];
}

/**
 * Recover the rotation pivot's client position from the grabbed handle's client
 * position and the handle's local offset from the pivot (in element-local px,
 * pre-zoom). Pure + exported for unit testing.
 */
export function pivotClientFromGrab(
  grabX: number,
  grabY: number,
  offLocalX: number,
  offLocalY: number,
  rotationDeg: number,
  scale: number,
): { x: number; y: number } {
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const o = rot(offLocalX, offLocalY, cos, sin);
  return { x: grabX - scale * o.x, y: grabY - scale * o.y };
}

function beginRotate(
  element: Element,
  corner: Corner,
  scale: number,
  currentFrame: number,
  ev: PointerEvent,
): void {
  const t0 = effectiveTransformAt(element, currentFrame);
  const startAngle = t0.rotation;
  const cl = cornerLocal(corner, t0.size.w, t0.size.h);
  const pivot = pivotClientFromGrab(
    ev.clientX,
    ev.clientY,
    cl.x - t0.anchor.x * t0.size.w,
    cl.y - t0.anchor.y * t0.size.h,
    startAngle,
    scale,
  );
  const startCursor = Math.atan2(ev.clientY - pivot.y, ev.clientX - pivot.x) * (180 / Math.PI);
  const unlock = lockCursor(rotateCursor(ROTATE_ANGLE[corner] + startAngle + 90));

  const onMove = (e: PointerEvent): void => {
    const ang = Math.atan2(e.clientY - pivot.y, e.clientX - pivot.x) * (180 / Math.PI);
    let next = startAngle + (ang - startCursor);
    if (e.shiftKey) next = Math.round(next / 15) * 15; // Shift = snap to 15°
    designerStore.commitAnimatable(element.id, 'rotation', Number(next.toFixed(2)));
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
