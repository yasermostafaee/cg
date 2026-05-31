import type { Element } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { designerStore } from '../../state/store.js';
import { effectiveTransformAt } from '../timeline/keyframe-helpers.js';

interface Props {
  element: Element;
  scale: number;
  currentFrame: number;
}

const HANDLE = 10;

const styles = {
  frame: {
    position: 'absolute' as const,
    border: `1px solid ${colors.accent}`,
    boxSizing: 'border-box' as const,
    pointerEvents: 'none' as const,
  },
  handle: {
    position: 'absolute' as const,
    width: HANDLE,
    height: HANDLE,
    background: colors.accent,
    border: '1px solid #FFF',
    boxSizing: 'border-box' as const,
    pointerEvents: 'auto' as const,
    cursor: 'nwse-resize',
  },
  rotateHandle: {
    position: 'absolute' as const,
    width: HANDLE,
    height: HANDLE,
    background: '#FFF',
    border: `1px solid ${colors.accent}`,
    borderRadius: '50%',
    boxSizing: 'border-box' as const,
    pointerEvents: 'auto' as const,
    cursor: 'crosshair',
  },
  rotateLine: {
    position: 'absolute' as const,
    width: 1,
    height: 16,
    background: colors.accent,
    pointerEvents: 'none' as const,
  },
} as const;

/**
 * Selection gizmo overlay. Renders a frame around the selected element
 * with four corner resize handles + one rotate handle on top.
 *
 * Drag interactions:
 *   - body drag (handled by CanvasOverlay, not here) → move element
 *   - corner handle drag → resize from that corner (preserves opposite)
 *   - rotate handle drag → rotate around the element's center
 *
 * The handles use viewport (CSS) coordinates — the overlay scales their
 * positions by the same factor the iframe is at, so they line up.
 */
export function Gizmo({ element, scale, currentFrame }: Props): JSX.Element {
  const t = effectiveTransformAt(element, currentFrame);
  const { position, size, rotation } = t;
  const w = size.w * t.scale.x * scale;
  const h = size.h * t.scale.y * scale;
  const x = position.x * scale;
  const y = position.y * scale;

  const frameStyle: React.CSSProperties = {
    ...styles.frame,
    left: x,
    top: y,
    width: w,
    height: h,
    transform: rotation === 0 ? undefined : `rotate(${String(rotation)}deg)`,
    transformOrigin: '0 0',
  };

  const corners: { dx: number; dy: number; corner: 'tl' | 'tr' | 'bl' | 'br' }[] = [
    { dx: 0, dy: 0, corner: 'tl' },
    { dx: w, dy: 0, corner: 'tr' },
    { dx: 0, dy: h, corner: 'bl' },
    { dx: w, dy: h, corner: 'br' },
  ];

  return (
    <>
      <div style={frameStyle} />
      {corners.map((c) => (
        <div
          key={c.corner}
          style={{
            ...styles.handle,
            left: x + c.dx - HANDLE / 2,
            top: y + c.dy - HANDLE / 2,
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            beginResize(element, c.corner, scale, currentFrame, e.nativeEvent);
          }}
        />
      ))}
      <div style={{ ...styles.rotateLine, left: x + w / 2 - 0.5, top: y - 16 }} />
      <div
        style={{ ...styles.rotateHandle, left: x + w / 2 - HANDLE / 2, top: y - 22 }}
        onPointerDown={(e) => {
          e.stopPropagation();
          beginRotate(element, currentFrame, e.nativeEvent);
        }}
      />
    </>
  );
}

function beginResize(
  element: Element,
  corner: 'tl' | 'tr' | 'bl' | 'br',
  scale: number,
  currentFrame: number,
  ev: PointerEvent,
): void {
  const startX = ev.clientX;
  const startY = ev.clientY;
  // Read the *visually effective* transform at the current frame so the
  // resize starts from where the operator can see the shape, not from the
  // element's static value (which may differ once the property has a
  // keyframe track).
  const t0 = effectiveTransformAt(element, currentFrame);
  const start = {
    x: t0.position.x,
    y: t0.position.y,
    w: t0.size.w,
    h: t0.size.h,
  };

  const onMove = (e: PointerEvent): void => {
    const dx = (e.clientX - startX) / scale;
    const dy = (e.clientY - startY) / scale;
    let { x, y, w, h } = start;
    switch (corner) {
      case 'tl':
        x += dx;
        y += dy;
        w -= dx;
        h -= dy;
        break;
      case 'tr':
        y += dy;
        w += dx;
        h -= dy;
        break;
      case 'bl':
        x += dx;
        w -= dx;
        h += dy;
        break;
      case 'br':
        w += dx;
        h += dy;
        break;
    }
    if (w < 4 || h < 4) return; // minimum size
    designerStore.commitAnimatable(element.id, 'position.x', x);
    designerStore.commitAnimatable(element.id, 'position.y', y);
    designerStore.commitAnimatable(element.id, 'size.w', w);
    designerStore.commitAnimatable(element.id, 'size.h', h);
  };
  const onUp = (): void => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

function beginRotate(element: Element, currentFrame: number, ev: PointerEvent): void {
  // Center of the element in viewport coordinates — captured by reading
  // the gizmo's bounding rect via the target's parent.
  const startAngle = effectiveTransformAt(element, currentFrame).rotation;
  const startX = ev.clientX;
  const startY = ev.clientY;
  // Approximate center from the gizmo position (no scale needed — both
  // sides cancel in the angle calculation).
  const cx = startX;
  const cy = startY + 22; // rotate handle is ~22px above the frame top

  const onMove = (e: PointerEvent): void => {
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    // atan2 returns radians measured from +X axis, counter-clockwise.
    // We want clockwise rotation in degrees, with "up" = 0°.
    const deg = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
    designerStore.commitAnimatable(element.id, 'rotation', startAngle + deg);
  };
  const onUp = (): void => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}
