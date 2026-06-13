import { afterEach, describe, expect, it } from 'vitest';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';
import {
  defaultEllipse,
  defaultShape,
  defaultText,
} from '../src/renderer/state/element-defaults.js';
import {
  sharedEditableProperties,
  selectedElements,
} from '../src/renderer/features/inspector/shared-properties.js';
import { collectGroupMoveTargets } from '../src/renderer/features/canvas/group-move.js';

afterEach(() => {
  designerStore._reset();
});

function freshScene(): void {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('demo', 'lower-third');
  designerStore.setScene(scene, null);
}

function doc() {
  const st = designerStore.get();
  return editSceneOf(st.scene, st.activeCompositionId)!;
}
function layers() {
  return doc().layers;
}
function elById(id: string) {
  for (const l of layers()) for (const e of l.children) if (e.id === id) return e;
  return undefined;
}

describe('toggleInSelection — modifier select (D-041)', () => {
  it('adds an absent id and removes a present one', () => {
    freshScene();
    designerStore.addElement(defaultShape('el-1', 0, 0));
    designerStore.addElement(defaultShape('el-2', 0, 0));
    designerStore.setSelection(['el-1']);
    designerStore.toggleInSelection('el-2'); // shift/ctrl-click adds
    expect([...designerStore.get().selection].sort()).toEqual(['el-1', 'el-2']);
    designerStore.toggleInSelection('el-1'); // shift/ctrl-click again removes
    expect([...designerStore.get().selection]).toEqual(['el-2']);
  });

  it('plain setSelection replaces; toggle accumulates', () => {
    freshScene();
    designerStore.addElement(defaultShape('el-1', 0, 0));
    designerStore.addElement(defaultShape('el-2', 0, 0));
    designerStore.setSelection(['el-1']); // plain click
    designerStore.toggleInSelection('el-2'); // modifier click
    expect(designerStore.get().selection.size).toBe(2);
    designerStore.setSelection(['el-2']); // plain click replaces
    expect([...designerStore.get().selection]).toEqual(['el-2']);
  });
});

describe('sharedEditableProperties — kind intersection (D-041)', () => {
  it('homogeneous shapes expose the transform set plus fill', () => {
    const keys = sharedEditableProperties([defaultShape('a', 0, 0), defaultShape('b', 0, 0)]).map(
      (p) => p.descriptor.key,
    );
    expect(keys).toEqual(
      expect.arrayContaining([
        'position.x',
        'position.y',
        'size.w',
        'size.h',
        'rotation',
        'opacity',
        'fill.color',
      ]),
    );
  });

  it('a mixed text+shape selection shares the universal set (transform + filter) but no kind-specific props (D-050)', () => {
    const keys = sharedEditableProperties([defaultShape('a', 0, 0), defaultText('b', 0, 0)]).map(
      (p) => p.descriptor.key,
    );
    // Universal (on ElementBase): transform incl. scale + opacity + filter.* —
    // shared by every kind.
    expect(keys).toEqual(
      expect.arrayContaining([
        'position.x',
        'position.y',
        'size.w',
        'size.h',
        'scale.x',
        'scale.y',
        'rotation',
        'opacity',
        'filter.blur',
        'filter.brightness',
      ]),
    );
    // Kind-specific props are NOT shared across text + shape.
    expect(keys).not.toContain('fill.color'); // shape-only
    expect(keys).not.toContain('stroke.width'); // shape-only
    expect(keys).not.toContain('cornerRadius'); // shape-only
    expect(keys).not.toContain('text.color'); // text-only
  });

  it('agrees when values match and is mixed (no coercion) when they differ', () => {
    const a = defaultShape('a', 10, 20);
    const same = sharedEditableProperties([a, defaultShape('b', 10, 20)]).find(
      (p) => p.descriptor.key === 'position.x',
    )!;
    expect(same.mixed).toBe(false);
    expect(same.value).toBe(10);

    const diff = sharedEditableProperties([a, defaultShape('c', 999, 20)]).find(
      (p) => p.descriptor.key === 'position.x',
    )!;
    expect(diff.mixed).toBe(true);
    expect(diff.value).toBeUndefined();
  });

  it('fill agrees for identical shapes and is mixed when colours differ', () => {
    const a = defaultShape('a', 0, 0);
    const b = defaultShape('b', 0, 0);
    expect(
      sharedEditableProperties([a, b]).find((p) => p.descriptor.key === 'fill.color')!.mixed,
    ).toBe(false);
    const b2 = { ...b, fill: { kind: 'solid' as const, color: '#123456' } };
    expect(
      sharedEditableProperties([a, b2]).find((p) => p.descriptor.key === 'fill.color')!.mixed,
    ).toBe(true);
  });

  it('is empty for an empty selection', () => {
    expect(sharedEditableProperties([])).toEqual([]);
  });

  it('two shapes expose the FULL shape set — scale, stroke, cornerRadius, drop-shadow, filter (D-050)', () => {
    const keys = sharedEditableProperties([
      defaultEllipse('a', 0, 0),
      defaultEllipse('b', 0, 0),
    ]).map((p) => p.descriptor.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'scale.x',
        'scale.y',
        'fill.color',
        'stroke.color',
        'stroke.width',
        'stroke.dash',
        'cornerRadius',
        'shadow.offsetX',
        'shadow.offsetY',
        'shadow.blur',
        'shadow.color',
        'filter.blur',
        'filter.brightness',
        'filter.sepia',
      ]),
    );
  });

  it('rectangles + ellipses share the full shape set (both are the shape kind) (D-050)', () => {
    const keys = sharedEditableProperties([defaultShape('a', 0, 0), defaultEllipse('b', 0, 0)]).map(
      (p) => p.descriptor.key,
    );
    expect(keys).toEqual(
      expect.arrayContaining(['stroke.width', 'cornerRadius', 'shadow.blur', 'filter.blur']),
    );
  });

  it('adding a text shrinks a shape selection to the universal set (no shape-specific) (D-050)', () => {
    const keys = sharedEditableProperties([
      defaultShape('a', 0, 0),
      defaultEllipse('b', 0, 0),
      defaultText('c', 0, 0),
    ]).map((p) => p.descriptor.key);
    expect(keys).toContain('opacity');
    expect(keys).toContain('filter.blur'); // universal (on ElementBase)
    expect(keys).not.toContain('stroke.width'); // shape-only → dropped
    expect(keys).not.toContain('cornerRadius');
    expect(keys).not.toContain('fill.color');
  });
});

describe('applySharedProperty — group edit as one undo step (D-041)', () => {
  it('applies to every selected id; a single undo reverts the whole group and leaves the elements', () => {
    freshScene();
    designerStore.addElement(defaultShape('el-1', 0, 0));
    designerStore.addElement(defaultShape('el-2', 0, 0));
    designerStore.addElement(defaultShape('el-3', 0, 0));
    const before = elById('el-1')!.opacity;
    // No explicit boundary: runAsSingleHistoryEntry must isolate the group edit
    // from the synchronous setup on its own.
    designerStore.applySharedProperty(['el-1', 'el-2', 'el-3'], 'opacity', 0.5);
    expect(elById('el-1')!.opacity).toBe(0.5);
    expect(elById('el-2')!.opacity).toBe(0.5);
    expect(elById('el-3')!.opacity).toBe(0.5);
    designerStore.undo();
    expect(elById('el-1')!.opacity).toBe(before);
    expect(elById('el-2')!.opacity).toBe(before);
    expect(elById('el-3')!.opacity).toBe(before);
    expect(layers()[0]!.children).toHaveLength(3); // setup intact
  });

  it('writes the static value and never creates an animation track', () => {
    freshScene();
    designerStore.addElement(defaultShape('el-1', 0, 0));
    designerStore.addElement(defaultShape('el-2', 0, 0));
    designerStore.applySharedProperty(['el-1', 'el-2'], 'position.x', 42);
    expect(elById('el-1')!.transform.position.x).toBe(42);
    expect(elById('el-1')!.animation).toBeUndefined();
    expect(elById('el-2')!.animation).toBeUndefined();
  });

  it('a shared SHAPE-property edit (stroke width) applies to all, keyframe-free, in one undo (D-050)', () => {
    freshScene();
    designerStore.addElement(defaultShape('el-1', 0, 0));
    designerStore.addElement(defaultShape('el-2', 0, 0));
    designerStore.applySharedProperty(['el-1', 'el-2'], 'stroke.width', 6);
    const a = elById('el-1');
    const b = elById('el-2');
    expect(a?.type === 'shape' ? a.stroke?.width : null).toBe(6);
    expect(b?.type === 'shape' ? b.stroke?.width : null).toBe(6);
    expect(a?.animation).toBeUndefined(); // keyframe-free
    designerStore.undo();
    expect((elById('el-1')?.type === 'shape' && elById('el-1')) || null).toBeTruthy();
    const a2 = elById('el-1');
    expect(a2?.type === 'shape' ? (a2.stroke?.width ?? 0) : null).toBe(0); // one undo reverts
  });
});

describe('group move (D-041)', () => {
  it('collectGroupMoveTargets keeps visible/unlocked members + anchor, skips locked & hidden', () => {
    freshScene();
    designerStore.addElement(defaultShape('el-1', 100, 100));
    designerStore.addElement(defaultShape('el-2', 200, 100));
    designerStore.addElement(defaultShape('el-3', 300, 100));
    designerStore.addElement(defaultShape('el-4', 400, 100));
    designerStore.updateElement('el-3', { locked: true });
    designerStore.updateElement('el-4', { visible: false });
    designerStore.setSelection(['el-1', 'el-2', 'el-3', 'el-4']);
    const d = doc();
    const t = collectGroupMoveTargets(
      d.layers,
      designerStore.get().selection,
      'el-1',
      0,
      d.resolution,
    );
    expect(t.movers.map((m) => m.id).sort()).toEqual(['el-1', 'el-2']);
    expect(t.anchor).not.toBeNull();
    expect(t.anchor!.x).toBe(100);
  });

  it('applies the same delta to every mover as ONE undo step; locked members do not move', () => {
    freshScene();
    designerStore.addElement(defaultShape('el-1', 100, 100));
    designerStore.addElement(defaultShape('el-2', 200, 150));
    designerStore.addElement(defaultShape('el-3', 300, 100));
    designerStore.updateElement('el-3', { locked: true });
    designerStore.setSelection(['el-1', 'el-2', 'el-3']);
    const d = doc();
    const { movers } = collectGroupMoveTargets(
      d.layers,
      designerStore.get().selection,
      'el-1',
      0,
      d.resolution,
    );
    // Simulate the gesture: a boundary at start, fan-out static writes, a
    // boundary at end — exactly what beginGroupDrag does per pointer event.
    const dx = 30;
    const dy = -20;
    designerStore.markHistoryBoundary();
    for (const m of movers) {
      designerStore.writeStaticAnimatable(m.id, 'position.x', m.x + dx);
      designerStore.writeStaticAnimatable(m.id, 'position.y', m.y + dy);
    }
    designerStore.markHistoryBoundary();
    expect(elById('el-1')!.transform.position).toEqual({ x: 130, y: 80 });
    expect(elById('el-2')!.transform.position).toEqual({ x: 230, y: 130 });
    expect(elById('el-3')!.transform.position).toEqual({ x: 300, y: 100 }); // locked, unmoved
    designerStore.undo();
    expect(elById('el-1')!.transform.position).toEqual({ x: 100, y: 100 });
    expect(elById('el-2')!.transform.position).toEqual({ x: 200, y: 150 });
  });
});

describe('group delete + accessor parity (D-041)', () => {
  it('deleteSelection removes the whole selection in one undo step', () => {
    freshScene();
    designerStore.addElement(defaultShape('el-1', 0, 0));
    designerStore.addElement(defaultShape('el-2', 0, 0));
    designerStore.addElement(defaultText('el-3', 0, 0));
    designerStore.setSelection(['el-1', 'el-2', 'el-3']);
    designerStore.markHistoryBoundary();
    designerStore.deleteSelection();
    expect(layers()[0]!.children).toHaveLength(0);
    designerStore.undo();
    expect(layers()[0]!.children).toHaveLength(3);
  });

  it('selectedElements tracks the set; reducing to one and clearing collapse it', () => {
    freshScene();
    designerStore.addElement(defaultShape('el-1', 0, 0));
    designerStore.addElement(defaultText('el-2', 0, 0));
    designerStore.setSelection(['el-1', 'el-2']);
    expect(selectedElements(doc(), designerStore.get().selection).map((e) => e.id)).toEqual([
      'el-1',
      'el-2',
    ]);
    designerStore.setSelection(['el-1']); // reduce to one
    expect(selectedElements(doc(), designerStore.get().selection).map((e) => e.id)).toEqual([
      'el-1',
    ]);
    designerStore.setSelection([]); // clear
    expect(selectedElements(doc(), designerStore.get().selection)).toHaveLength(0);
  });
});
