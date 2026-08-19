import { describe, expect, it } from 'vitest';
import { Window } from 'happy-dom';
import type { Element, Scene } from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';

/**
 * 🔴 **`B-149` — the mask hole took the cell's POSITION and the AUTHORED SIZE.**
 *
 * `applyArrangementToNodes` writes all four properties onto the node, but `liveArrangementView`
 * read back only `left` and `top` and took width/height from the authored rect. So every hole
 * was punched **at the cell's position, at the authored size** — and a box authored larger than
 * its cell opened the backdrop far outside the picture.
 *
 * ⚠ **On air that is not cosmetic.** Those holes open the live layer beneath the template where
 * no box exists — the crosstalk symptom this whole feature was built to eliminate, reintroduced
 * by the feature itself.
 *
 * 🔴 **THE AXIS THIS FILE EXISTS FOR: a cell that differs in SIZE.** C1's eleven-row matrix
 * asserted where the hole WAS, and every one of its cases moved a box without resizing it — so
 * a size-blind readback passed all eleven. Position-only, size-only and both are all asserted
 * below.
 */

const box = (x: number, y: number, w: number, h: number) => ({
  position: { x, y },
  size: { w, h },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
});
const baseProps = { opacity: 1, visible: true, locked: false };
const el = (type: string, id: string, t: ReturnType<typeof box>, over = {}): Element =>
  ({ ...baseProps, id, name: id, type, transform: t, zIndex: 0, ...over }) as unknown as Element;

/** A full-frame backdrop under a plate — the thing the hole is punched INTO. */
const BACKDROP = el('shape', 'backdrop', box(0, 0, 1920, 1080), {
  shape: 'rectangle',
  fill: { kind: 'solid', color: '#d00000' },
  zIndex: 0,
});

/** The owner's shape: a box authored MUCH larger than the cell it will sit in. */
const AUTHORED = box(0, 0, 1851, 1018);
const PLATE = el('video-placeholder', 'guest-1', AUTHORED, { routeKey: 'guest-1', zIndex: 10 });

function scene(): Scene {
  return {
    schemaVersion: 1,
    id: 's',
    name: 's',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    editorBackdrop: 'transparent',
    layers: [
      {
        id: 'L1',
        name: 'm',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [BACKDROP, PLATE],
      },
    ],
    fonts: [],
    fields: [],
    bindings: [],
  } as unknown as Scene;
}

function boot(): { runtime: ReturnType<typeof createRuntime>; root: HTMLElement } {
  const window = new Window();
  const doc = window.document as unknown as Document;
  const host = doc.createElement('div');
  doc.body.appendChild(host);
  const runtime = createRuntime(scene(), { root: host });
  return { runtime, root: host.querySelector('.cg-stage') as HTMLElement };
}

/** The single hole punched into the backdrop, as numbers. */
function hole(root: HTMLElement): { x: number; y: number; w: number; h: number } | null {
  const node = root.querySelector<HTMLElement>('[data-cg-element-id="backdrop"]');
  const svg = decodeURIComponent(node?.style.getPropertyValue('mask-image') ?? '');
  if (svg === '') return null;
  const rect = [...svg.matchAll(/<rect [^>]*fill='#000'[^>]*\/>/g)].map((m) => m[0])[0];
  if (rect === undefined) return null;
  const num = (k: string): number =>
    Number(new RegExp(`${k}='(-?[\\d.]+)'`).exec(rect)?.[1] ?? NaN);
  return { x: num('x'), y: num('y'), w: num('width'), h: num('height') };
}

describe('B-149 — the hole follows the cell in SIZE, not only in position', () => {
  it('POSITIVE CONTROL — with no arrangement the hole is the authored rect', () => {
    const { root } = boot();
    expect(hole(root)).toEqual({ x: 0, y: 0, w: 1851, h: 1018 });
  });

  it('🔴 SIZE ONLY — a cell the same place but smaller punches the SMALLER hole', () => {
    // ⚠ This case PASSED before the fix, and that is the informative part — it localises the
    // fault. `liveArrangementView` seeds its map from `base.geometry`, which already holds the
    // correct cell; with nothing moved the old readback added no entry, so the correct value
    // survived. The fault was never "the base is wrong" — it was that the readback CLOBBERED
    // the base with `{cell position, authored size}` the moment it detected a move. Keep this
    // case: without it, a future change could "fix" the base and leave the clobber in place.
    const { runtime, root } = boot();
    runtime.setArrangementView({
      geometry: { 'guest-1': { x: 0, y: 0, width: 922, height: 534 } },
    });
    expect(hole(root)).toEqual({ x: 0, y: 0, w: 922, h: 534 });
  });

  it('🔴 POSITION AND SIZE — the owner’s 3-box cell 1', () => {
    const { runtime, root } = boot();
    runtime.setArrangementView({
      geometry: { 'guest-1': { x: 42, y: 0, width: 922, height: 534 } },
    });
    // Before the fix this punched 42,0 1851×1018 — a hole nearly the whole frame, with the
    // picture covering only the top-left corner of it. That difference IS the checkerboard.
    expect(hole(root)).toEqual({ x: 42, y: 0, w: 922, h: 534 });
  });

  it('POSITION ONLY — still correct, so the fix does not trade one axis for the other', () => {
    const { runtime, root } = boot();
    runtime.setArrangementView({
      geometry: { 'guest-1': { x: 60, y: 30, width: 1851, height: 1018 } },
    });
    expect(hole(root)).toEqual({ x: 60, y: 30, w: 1851, h: 1018 });
  });

  it('…and clearing the arrangement restores the authored hole', () => {
    const { runtime, root } = boot();
    runtime.setArrangementView({
      geometry: { 'guest-1': { x: 42, y: 0, width: 922, height: 534 } },
    });
    runtime.setArrangementView(undefined);
    expect(hole(root)).toEqual({ x: 0, y: 0, w: 1851, h: 1018 });
  });
});
