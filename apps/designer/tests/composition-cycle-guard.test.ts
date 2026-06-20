import { afterEach, describe, expect, it } from 'vitest';
import type { Element } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore } from '../src/renderer/state/store.js';
import { defaultRepeater } from '../src/renderer/state/element-defaults.js';

/**
 * D-086 — the author-time nesting cycle guard (`canNestCompositionInActive`) now
 * follows BOTH `composition` AND `repeater` child references, via the shared
 * `compositionClosure`. Previously the guard only walked `composition` edges, so a
 * repeater-mediated cycle (A instances B while B repeats A) slipped through and the
 * runtime would loop forever. This pins the hole shut without regressing the
 * existing composition-only cycle detection.
 */

afterEach(() => {
  designerStore._reset();
});

/** Two empty sibling compositions A and B in a fresh project; returns their ids. */
function twoComps(): { a: string; b: string } {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('cycle', 'custom');
  designerStore.setScene(scene, null);
  const a = designerStore.addComposition();
  const b = designerStore.addComposition();
  if (a === null || b === null) throw new Error('addComposition returned null');
  return { a, b };
}

/** Replace `compId`'s layers with a single layer holding `el`, preserving the active doc. */
function placeIn(compId: string, el: Element): void {
  const cur = designerStore.get().scene;
  if (cur === null) throw new Error('no scene');
  const next = {
    ...cur,
    compositions: (cur.compositions ?? []).map((c) =>
      c.id === compId
        ? {
            ...c,
            layers: [
              {
                id: `L-${compId}`,
                name: 'L',
                visible: true,
                locked: false,
                blendMode: 'normal' as const,
                children: [el],
              },
            ],
          }
        : c,
    ),
  };
  designerStore.setScene(next, designerStore.get().activeCompositionId);
}

function compInstance(id: string, compositionId: string): Element {
  return {
    id,
    name: id,
    type: 'composition',
    compositionId,
    transform: {
      position: { x: 0, y: 0 },
      size: { w: 100, h: 50 },
      scale: { x: 1, y: 1 },
      rotation: 0,
      anchor: { x: 0, y: 0 },
    },
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
  };
}

describe('D-086 — repeater-mediated nesting cycle is blocked at author time', () => {
  it('blocks nesting A into B when A already REPEATS B (the previously-missed edge)', () => {
    const { a, b } = twoComps();
    placeIn(a, defaultRepeater('rep-1', 0, 0, { id: b, fields: [] })); // A → B via repeater
    designerStore.setActiveComposition(b);
    // Placing A inside B would close A → B → A. The repeater edge must be seen.
    expect(designerStore.canNestCompositionInActive(a)).toBe(false);
  });

  it('still blocks the classic composition-instance cycle (no regression)', () => {
    const { a, b } = twoComps();
    placeIn(a, compInstance('inst-1', b)); // A → B via composition instance
    designerStore.setActiveComposition(b);
    expect(designerStore.canNestCompositionInActive(a)).toBe(false);
  });

  it('allows a safe nesting (a leaf composition into an unrelated parent)', () => {
    const { a, b } = twoComps();
    // B references nothing; nesting it into A cannot create a cycle.
    designerStore.setActiveComposition(a);
    expect(designerStore.canNestCompositionInActive(b)).toBe(true);
  });
});
