import type { ImageElement, ShapeElement, TextElement, Transform } from '@cg/shared-schema';

/**
 * Default element factories — what we drop on the canvas when the
 * operator clicks with the text/shape/image tool. The transform is
 * computed at the call site (click position → top-left corner with
 * an opinionated default size).
 */

function baseTransform(x: number, y: number, w: number, h: number): Transform {
  return {
    position: { x, y },
    size: { w, h },
    rotation: 0,
    scale: { x: 1, y: 1 },
    anchor: { x: 0, y: 0 },
  };
}

export function defaultText(id: string, x: number, y: number): TextElement {
  return {
    id,
    name: 'Text',
    type: 'text',
    visible: true,
    locked: false,
    opacity: 1,
    zIndex: 0,
    transform: baseTransform(x, y, 480, 80),
    text: 'New text',
    font: {
      family: 'Inter',
      weight: 700,
      style: 'normal',
      size: 48,
      lineHeight: 1.15,
      letterSpacing: 0,
    },
    color: '#FFFFFF',
    align: 'start',
    direction: 'auto',
    fitMode: 'fixed',
    overflow: 'clip',
  };
}

export function defaultShape(id: string, x: number, y: number): ShapeElement {
  return {
    id,
    name: 'Rectangle',
    type: 'shape',
    visible: true,
    locked: false,
    opacity: 1,
    zIndex: 0,
    transform: baseTransform(x, y, 320, 120),
    shape: 'rect',
    fill: { kind: 'solid', color: '#E11D48' },
  };
}

/**
 * Ellipse/circle shape. Defaults to an equal-sided box (a circle) so the
 * operator starts symmetric and can drag a handle to make any ellipse.
 * Renders via the runtime's `border-radius: 50%` path — same ShapeElement,
 * just `shape: 'ellipse'`.
 */
export function defaultEllipse(id: string, x: number, y: number): ShapeElement {
  return {
    id,
    name: 'Ellipse',
    type: 'shape',
    visible: true,
    locked: false,
    opacity: 1,
    zIndex: 0,
    transform: baseTransform(x, y, 200, 200),
    shape: 'ellipse',
    fill: { kind: 'solid', color: '#38BDF8' },
  };
}

/**
 * Image elements need an asset id — the click action creates one only
 * after the operator picks an asset. This factory is for the
 * "after-pick" step.
 */
export function defaultImage(id: string, x: number, y: number, assetId: string): ImageElement {
  return {
    id,
    name: 'Image',
    type: 'image',
    visible: true,
    locked: false,
    opacity: 1,
    zIndex: 0,
    transform: baseTransform(x, y, 320, 320),
    assetId,
    fit: 'contain',
    preserveAspect: true,
  };
}
