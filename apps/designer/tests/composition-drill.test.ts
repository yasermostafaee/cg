import { afterEach, describe, expect, it } from 'vitest';
import type { Composition, Element } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore } from '../src/renderer/state/store.js';
import { defaultShape } from '../src/renderer/state/element-defaults.js';
import { drillTarget } from '../src/renderer/features/canvas/drill.js';
import { topmostHit } from '../src/renderer/features/canvas/hit-test.js';

afterEach(() => {
  designerStore._reset();
});

/** A child shape spanning child-local x 10..50, y 10..40. */
function childShape(id = 'cs-1'): Element {
  return {
    ...defaultShape(id, 10, 10),
    transform: {
      position: { x: 10, y: 10 },
      size: { w: 40, h: 30 },
      scale: { x: 1, y: 1 },
      rotation: 0,
      anchor: { x: 0, y: 0 },
    },
  };
}

/** A 200×100 child composition holding one shape. */
function childComp(id = 'child'): Composition {
  return {
    id,
    name: 'Child',
    resolution: { width: 200, height: 100 },
    frameRange: { in: 0, out: 50 },
    background: 'transparent',
    layers: [
      {
        id: 'l1',
        name: 'Layer',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [childShape()],
      },
    ],
  };
}

/** A composition instance placing `child` at (100,50). `size` defaults to the
 *  child resolution (1:1); pass a smaller size to test a scaled instance. */
function instanceOf(child: Composition, size = { w: 200, h: 100 }): Element {
  return {
    id: 'inst-1',
    name: 'Child',
    type: 'composition',
    compositionId: child.id,
    transform: {
      position: { x: 100, y: 50 },
      size,
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

describe('drillTarget — double-click maps the cursor into the child and finds the shape', () => {
  it('1:1 instance: a click over the child shape resolves to that shape', () => {
    const child = childComp();
    const inst = instanceOf(child);
    // Child shape centre (30,25) → parent (100+30, 50+25) at 1:1.
    const t = drillTarget(inst, child, { x: 130, y: 75 }, 0);
    expect(t).toEqual({ compositionId: 'child', shapeId: 'cs-1' });
  });

  it('inside the instance but over empty child space → no shape (null id)', () => {
    const child = childComp();
    const inst = instanceOf(child);
    // Parent (200,130) → child (100,80): inside the 200×100 child, outside the shape.
    const t = drillTarget(inst, child, { x: 200, y: 130 }, 0);
    expect(t).toEqual({ compositionId: 'child', shapeId: null });
  });

  it('scaled instance: the cursor is mapped back into child resolution before hit-test', () => {
    const child = childComp();
    const inst = instanceOf(child, { w: 100, h: 50 }); // half size → child scale ×2
    // Child centre (30,25) → local (15,12.5) → parent (115, 62.5).
    const t = drillTarget(inst, child, { x: 115, y: 62.5 }, 0);
    expect(t).toEqual({ compositionId: 'child', shapeId: 'cs-1' });
  });

  it('returns null for a non-composition element', () => {
    const child = childComp();
    expect(drillTarget(childShape(), child, { x: 0, y: 0 }, 0)).toBeNull();
  });

  it('returns null for a degenerate (zero-size) instance', () => {
    const child = childComp();
    const inst = instanceOf(child, { w: 0, h: 100 });
    expect(drillTarget(inst, child, { x: 100, y: 75 }, 0)).toBeNull();
  });
});

describe('single-click still selects the whole child instance as a unit', () => {
  it('topmostHit over the instance returns the composition element (not its insides)', () => {
    const child = childComp();
    const inst = instanceOf(child);
    // The same point that drills on double-click selects the instance on single-click.
    const hit = topmostHit([inst], { x: 130, y: 75 });
    expect(hit?.id).toBe('inst-1');
    expect(hit?.type).toBe('composition');
  });
});

describe('designerStore.openCompositionAndSelect — drill = open child + select shape', () => {
  function twoComps(): { a: string; b: string } {
    const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
    const { scene } = projects.newScene('drill', 'custom');
    designerStore.setScene(scene, null);
    const a = designerStore.addComposition()!;
    const b = designerStore.addComposition()!;
    return { a, b };
  }

  it('switches the active composition and selects the shape', () => {
    const { a, b } = twoComps();
    expect(designerStore.get().activeCompositionId).toBe(b); // last opened
    designerStore.openCompositionAndSelect(a, 'cs-1');
    expect(designerStore.get().activeCompositionId).toBe(a);
    expect(designerStore.get().selection.has('cs-1')).toBe(true);
    expect(designerStore.get().selection.size).toBe(1);
  });

  it('null shapeId opens the child with an empty selection', () => {
    const { a } = twoComps();
    designerStore.openCompositionAndSelect(a, null);
    expect(designerStore.get().activeCompositionId).toBe(a);
    expect(designerStore.get().selection.size).toBe(0);
  });

  it('unknown composition id is a no-op', () => {
    const { b } = twoComps();
    designerStore.openCompositionAndSelect('does-not-exist', 'x');
    expect(designerStore.get().activeCompositionId).toBe(b);
  });
});
