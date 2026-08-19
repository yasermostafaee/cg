import { beforeEach, describe, expect, it } from 'vitest';
import type { Element, Scene } from '@cg/shared-schema';
import { designerStore } from '../src/renderer/state/store.js';
import {
  activeCellFor,
  arrangedTransform,
  commitToActiveCell,
  isNoCell,
} from '../src/renderer/state/slices/arrangements.js';

/**
 * 🔴 **`D-154` — WHICH VALUE a geometry commit lands on.**
 *
 * The routing rule, asserted directly. Driving the Transform panel's scrub-surface number
 * fields through a browser would test the field's plumbing; what matters here is that a box
 * under an active arrangement writes its CELL, a non-box writes its own transform, and a box
 * with NO cell writes NOTHING — never a silent fall-back to the authored transform, which is
 * the defect this item exists to end, in the one case where it is hardest to notice.
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

const BOX_COMP = {
  id: 'comp-box',
  name: 'box',
  resolution: { width: 960, height: 540 },
  frameRange: { in: 0, out: 50 },
  editorBackdrop: 'transparent',
  layers: [
    {
      id: 'bl',
      name: 'l',
      visible: true,
      locked: false,
      blendMode: 'normal',
      children: [el('video-placeholder', 'plate', box(0, 0, 960, 540), { routeKey: 'guest-1' })],
    },
  ],
  fields: [],
  bindings: [],
};

const cell = (x: number) => ({ x, y: 0, width: 960, height: 1080 });

/** Main: two box instances, a 2-box arrangement (both cells) and a 1-box (one cell). */
const MAIN = {
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
        el('composition', 'inst-a', box(0, 0, 1920, 1080), { compositionId: 'comp-box' }),
        el('composition', 'inst-b', box(0, 0, 1920, 1080), { compositionId: 'comp-box' }),
        el('shape', 'backdrop', box(11, 22, 300, 200), {
          shape: 'rectangle',
          fill: { kind: 'solid', color: '#111' },
        }),
      ],
    },
  ],
  fields: [],
  bindings: [],
  arrangements: [
    {
      id: 'two',
      name: 'two',
      cells: [cell(0), cell(960)],
      isDefault: true,
      transition: { mode: 'cut' },
    },
    { id: 'one', name: 'one', cells: [cell(480)], isDefault: true, transition: { mode: 'cut' } },
  ],
};

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
    compositions: [BOX_COMP, MAIN],
    fonts: [],
    fields: [],
    bindings: [],
  } as unknown as Scene;
}

const cellsOf = (arrangementId: string): readonly { x: number }[] => {
  const scene = designerStore.get().scene;
  const comp = (scene?.compositions ?? []).find((c) => c.id === 'comp-main');
  return (comp?.arrangements ?? []).find((a) => a.id === arrangementId)?.cells ?? [];
};

beforeEach(() => {
  designerStore.setScene(project(), null);
  designerStore.setActiveComposition('comp-main');
  designerStore.setActiveArrangement('two');
});

describe('D-154 — activeCellFor: what the arrangement owns', () => {
  it('a box instance WITH a cell reports it', () => {
    const found = activeCellFor(designerStore.get().scene, 'inst-b');
    expect(found?.index).toBe(1);
    expect(found?.rect.x).toBe(960);
  });

  it('🔴 a NON-box element reports NOTHING — its geometry stays its own', () => {
    expect(activeCellFor(designerStore.get().scene, 'backdrop')).toBeNull();
  });

  it('🔴 a box with NO cell reports the NO-CELL sentinel, not null', () => {
    // `null` here would mean "geometry is the authored transform", which is the silent
    // fall-back this item exists to end — for a box that is not even on screen.
    designerStore.setActiveArrangement('one');
    const found = activeCellFor(designerStore.get().scene, 'inst-b');
    expect(found).not.toBeNull();
    expect(isNoCell(found?.rect ?? { x: 0, y: 0, width: 1, height: 1 })).toBe(true);
  });

  it('with NO arrangement active, nothing is owned — the pre-feature world is unchanged', () => {
    designerStore.setActiveArrangement(null);
    expect(activeCellFor(designerStore.get().scene, 'inst-a')).toBeNull();
    expect(activeCellFor(designerStore.get().scene, 'backdrop')).toBeNull();
  });
});

describe('D-154 — commitToActiveCell: where a geometry write lands', () => {
  it('🔴 a box write lands on the ACTIVE arrangement’s cell, and no other arrangement moves', () => {
    expect(commitToActiveCell('inst-a', 'position.x', 300)).toBe(true);
    expect(cellsOf('two')[0]?.x).toBe(300);
    // The owner's actual complaint: editing one arrangement moved the others.
    expect(cellsOf('one')[0]?.x, 'the 1-box arrangement moved too').toBe(480);
  });

  it('each of the four rect properties routes to its own axis', () => {
    commitToActiveCell('inst-b', 'position.y', 40);
    commitToActiveCell('inst-b', 'size.w', 111);
    commitToActiveCell('inst-b', 'size.h', 222);
    const c = cellsOf('two')[1] as { y: number; width: number; height: number } | undefined;
    expect(c?.y).toBe(40);
    expect(c?.width).toBe(111);
    expect(c?.height).toBe(222);
  });

  it('🔴 a NON-box write is NOT intercepted — it falls through to the element, as always', () => {
    expect(commitToActiveCell('backdrop', 'position.x', 999)).toBe(false);
  });

  it('🔴 a box with NO cell is REFUSED, and writes nothing anywhere', () => {
    designerStore.setActiveArrangement('one');
    const before = JSON.stringify(cellsOf('one'));
    // Handled (so it does NOT fall through to the authored transform) but writes no cell.
    expect(commitToActiveCell('inst-b', 'position.x', 777)).toBe(true);
    expect(JSON.stringify(cellsOf('one'))).toBe(before);
  });

  it('rotation is NOT a cell property — it falls through, because a cell is an axis-aligned rect', () => {
    expect(commitToActiveCell('inst-a', 'rotation', 45)).toBe(false);
  });
});

describe('D-154 — arrangedTransform: what the gizmo and the panel read', () => {
  it('🔴 a box reads its CELL, not its authored transform', () => {
    const authored = box(0, 0, 1920, 1080);
    const t = arrangedTransform(el('composition', 'inst-b', authored), authored);
    expect(t.position).toEqual({ x: 960, y: 0 });
    expect(t.size).toEqual({ w: 960, h: 1080 });
  });

  it('a NON-box reads its own transform, byte for byte', () => {
    const authored = box(11, 22, 300, 200);
    const t = arrangedTransform(el('shape', 'backdrop', authored), authored);
    expect(t).toEqual(authored);
  });

  it('with NO arrangement active a box reads its own transform — "As authored"', () => {
    designerStore.setActiveArrangement(null);
    const authored = box(0, 0, 1920, 1080);
    const t = arrangedTransform(el('composition', 'inst-a', authored), authored);
    expect(t).toEqual(authored);
  });
});
