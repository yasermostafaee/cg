import { beforeEach, describe, expect, it } from 'vitest';
import type { Element, Scene } from '@cg/shared-schema';
import { designerStore } from '../src/renderer/state/store.js';
import { cellResolutionAspect, lockedCellEdit } from '../src/renderer/state/slices/arrangements.js';

/**
 * 🔴 **`D-155` §4 — A CELL HAS NO `expectedAspect`, AND LOCKING IT TO ONE WOULD BE SILENTLY
 * WRONG FOR EVERY BOX BUT THE SIMPLEST.**
 *
 * This is the correction the item's brief needed, and it is asserted here as well as written
 * in the spec because the wrong rule is the intuitive one:
 *
 * - an arrangement's cells hold **COMPOSITION INSTANCES** (`boxInstanceIds` filters
 *   `type === 'composition'`), while `expectedAspect` lives on a `video-placeholder`;
 * - a plate inside is still deformed by a mis-shaped cell, because `preScale` is per-axis;
 * - therefore the quantity a cell preserves is the **composition's RESOLUTION aspect**.
 *
 * The fixture below is built so the two rules give DIFFERENT answers: the box composition is
 * 2:1, and the plate inside it declares 16:9 and does not fill it. An implementation that
 * locked to the plate would derive a visibly different height, and the first assertion catches
 * it.
 */

const box = (x: number, y: number, w: number, h: number) => ({
  position: { x, y },
  size: { w, h },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
});
const base = { opacity: 1, visible: true, locked: false };
const el = (type: string, id: string, t: ReturnType<typeof box>, over = {}): Element =>
  ({ ...base, id, name: id, type, transform: t, zIndex: 0, ...over }) as unknown as Element;

/** 🔴 2:1 composition holding a 16:9 plate that does NOT fill it — the two rules disagree. */
const BOX_COMP = {
  id: 'comp-box',
  name: 'box',
  resolution: { width: 1000, height: 500 },
  frameRange: { in: 0, out: 50 },
  editorBackdrop: 'transparent',
  layers: [
    {
      id: 'bl',
      name: 'l',
      visible: true,
      locked: false,
      blendMode: 'normal',
      children: [
        el('video-placeholder', 'plate', box(0, 0, 640, 360), {
          routeKey: 'guest-1',
          expectedAspect: 16 / 9,
        }),
      ],
    },
  ],
  fields: [],
  bindings: [],
};

/** A SECOND composition with a different resolution, so "which box" is a real question. */
const TALL_COMP = { ...BOX_COMP, id: 'comp-tall', resolution: { width: 500, height: 1000 } };

/** …and one with a degenerate resolution, which must pass the edit through untouched. */
const BAD_COMP = { ...BOX_COMP, id: 'comp-bad', resolution: { width: 0, height: 0 } };

function project(): Scene {
  return {
    schemaVersion: 1,
    id: 'proj',
    name: 'proj',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    editorBackdrop: 'transparent',
    layers: [],
    compositions: [
      BOX_COMP,
      TALL_COMP,
      BAD_COMP,
      {
        id: 'comp-main',
        name: 'Main',
        resolution: { width: 1920, height: 1080 },
        frameRange: { in: 0, out: 50 },
        editorBackdrop: 'transparent',
        layers: [
          {
            id: 'ml',
            name: 'l',
            visible: true,
            locked: false,
            blendMode: 'normal',
            children: [
              el('composition', 'inst-a', box(0, 0, 960, 480), { compositionId: 'comp-box' }),
              el('composition', 'inst-b', box(0, 0, 480, 960), { compositionId: 'comp-tall' }),
              el('composition', 'inst-c', box(0, 0, 100, 100), { compositionId: 'comp-bad' }),
              el('shape', 'backdrop', box(0, 0, 10, 10), { shape: 'rectangle' }),
            ],
          },
        ],
        fields: [],
        bindings: [],
        arrangements: [
          {
            id: 'three',
            name: 'three',
            cells: [
              { x: 0, y: 0, width: 600, height: 300 },
              { x: 600, y: 0, width: 300, height: 600 },
              { x: 900, y: 0, width: 100, height: 100 },
            ],
            isDefault: true,
            transition: { mode: 'cut' },
          },
        ],
      },
    ],
    fonts: [],
    fields: [],
    bindings: [],
  } as unknown as Scene;
}

const sceneNow = (): Scene | null => designerStore.get().scene;
const CELL = { x: 0, y: 0, width: 600, height: 300 };

beforeEach(() => {
  designerStore.setScene(project(), null);
  designerStore.setActiveComposition('comp-main');
  designerStore.setActiveArrangement('three');
});

describe('D-155 §4 — the aspect a CELL preserves', () => {
  it('🔴 is the COMPOSITION’s resolution aspect, not the plate’s expectedAspect', () => {
    // comp-box is 1000×500 = 2.0. The plate inside declares 16:9 = 1.78 and does NOT fill it.
    expect(cellResolutionAspect(sceneNow(), 0)).toBeCloseTo(2, 10);
    expect(cellResolutionAspect(sceneNow(), 0)).not.toBeCloseTo(16 / 9, 2);
  });

  it('each cell asks its OWN box — index 1 is the tall composition', () => {
    expect(cellResolutionAspect(sceneNow(), 1)).toBeCloseTo(0.5, 10);
  });

  it('a cell with no box, and a degenerate resolution, answer null', () => {
    expect(cellResolutionAspect(sceneNow(), 99)).toBeNull();
    expect(cellResolutionAspect(sceneNow(), 2)).toBeNull(); // comp-bad is 0×0
    expect(cellResolutionAspect(null, 0)).toBeNull();
  });
});

describe('D-155 §4 — lockedCellEdit', () => {
  it('🔴 typing a WIDTH derives the height', () => {
    const out = lockedCellEdit(sceneNow(), 0, CELL, 'width', 800, true);
    expect(out.width).toBe(800);
    expect(out.height).toBeCloseTo(400, 6); // 800 / 2.0
  });

  it('🔴 typing a HEIGHT derives the width', () => {
    const out = lockedCellEdit(sceneNow(), 0, CELL, 'height', 250, true);
    expect(out.height).toBe(250);
    expect(out.width).toBeCloseTo(500, 6); // 250 × 2.0
  });

  it('🔴 a box holding a plate that does NOT fill it is still correct', () => {
    // The whole point of the correction: the plate is 16:9 inside a 2:1 composition. Locking
    // to the PLATE would give height 800/1.78 = 450, which is a cell that deforms every plate
    // inside the box. The composition rule gives 400.
    const out = lockedCellEdit(sceneNow(), 0, CELL, 'width', 800, true);
    expect(out.height).toBeCloseTo(400, 6);
    expect(out.height).not.toBeCloseTo(800 / (16 / 9), 1);
  });

  it('x and y MOVE the cell and are left alone — a lock on position would be the wrong axis', () => {
    expect(lockedCellEdit(sceneNow(), 0, CELL, 'x', 42, true)).toEqual({ ...CELL, x: 42 });
    expect(lockedCellEdit(sceneNow(), 0, CELL, 'y', 42, true)).toEqual({ ...CELL, y: 42 });
  });

  it('🔴 with the lock OFF the edit passes through untouched', () => {
    expect(lockedCellEdit(sceneNow(), 0, CELL, 'width', 800, false)).toEqual({
      ...CELL,
      width: 800,
    });
  });

  it('🔴 a degenerate composition changes nothing — task 4.2', () => {
    expect(
      lockedCellEdit(sceneNow(), 2, { x: 900, y: 0, width: 100, height: 100 }, 'width', 7, true),
    ).toEqual({ x: 900, y: 0, width: 7, height: 100 });
  });
});
