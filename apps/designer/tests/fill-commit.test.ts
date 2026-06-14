import { afterEach, describe, expect, it } from 'vitest';
import type { AnimatableProperty, Element, Fill } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';
import { defaultShape, defaultText } from '../src/renderer/state/element-defaults.js';
import { applyFillModeChange } from '../src/renderer/features/inspector/fill-commit.js';

/**
 * B-014 — switching a keyframed colour fill to a gradient must drop the now-orphaned
 * colour track (it is no longer keyframe-able per D-051's registry), as ONE undo step.
 * Before the fix the track survived and the runtime kept animating the colour over the
 * gradient; these assert it is gone and that one undo restores both the solid mode and
 * the keyframes.
 */

const LINEAR: Fill = {
  kind: 'linear',
  stops: [
    { at: 0, color: '#000000' },
    { at: 1, color: '#FFFFFF' },
  ],
  angle: 0,
};

function freshScene(): void {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('b014', 'custom');
  designerStore.setScene(scene, null);
}

function selected(id: string): Element {
  const st = designerStore.get();
  const doc = editSceneOf(st.scene, st.activeCompositionId)!;
  return doc.layers[0]!.children.find((c) => c.id === id)!;
}

function trackOf(id: string, property: AnimatableProperty): unknown {
  return selected(id).animation?.tracks[property];
}

afterEach(() => designerStore._reset());

interface Case {
  name: string;
  make: (id: string) => Element;
  property: AnimatableProperty;
  values: [number | string, number | string];
  gradientPatch: Partial<Element>;
  /** Reads the element's fill-mode for the property ('solid' | gradient kind). */
  fillKind: (el: Element) => string;
}

const CASES: Case[] = [
  {
    name: 'shape fill',
    make: (id) => defaultShape(id, 0, 0),
    property: 'fill.color',
    values: ['#FF0000', '#00FF00'],
    gradientPatch: { fill: LINEAR } as Partial<Element>,
    fillKind: (el) => (el.type === 'shape' && el.fill !== undefined ? el.fill.kind : 'none'),
  },
  {
    name: 'text colour',
    make: (id) => defaultText(id, 0, 0),
    property: 'text.color',
    values: ['#FF0000', '#00FF00'],
    gradientPatch: { colorFill: LINEAR } as unknown as Partial<Element>,
    fillKind: (el) => (el.type === 'text' ? (el.colorFill?.kind ?? 'solid') : 'none'),
  },
  {
    name: 'text background',
    make: (id) => defaultText(id, 0, 0),
    property: 'backgroundColor',
    values: ['#112233', '#445566'],
    gradientPatch: { backgroundFill: LINEAR } as unknown as Partial<Element>,
    fillKind: (el) => (el.type === 'text' ? (el.backgroundFill?.kind ?? 'solid') : 'none'),
  },
];

describe('B-014 — switching a keyframed colour to gradient drops the orphaned track', () => {
  for (const c of CASES) {
    it(`${c.name}: gradient switch removes the track; one undo restores the mode + keyframes`, () => {
      freshScene();
      const el = c.make('el-1');
      designerStore.addElement(el);
      designerStore.upsertKeyframe('el-1', c.property, 0, c.values[0]);
      designerStore.upsertKeyframe('el-1', c.property, 10, c.values[1]);
      expect(trackOf('el-1', c.property)).toBeDefined();
      expect(c.fillKind(selected('el-1'))).toBe('solid');

      // Switch the fill to a gradient via the shared handler path.
      applyFillModeChange(selected('el-1'), c.property, c.gradientPatch);

      // The track is gone (the runtime no longer animates the colour) and the fill is
      // now a gradient.
      expect(trackOf('el-1', c.property)).toBeUndefined();
      expect(c.fillKind(selected('el-1'))).toBe('linear');

      // ONE undo restores BOTH the solid mode AND its keyframes (accidental switch is
      // recoverable).
      designerStore.undo();
      expect(c.fillKind(selected('el-1'))).toBe('solid');
      const restored = trackOf('el-1', c.property) as { keyframes: unknown[] } | undefined;
      expect(restored?.keyframes).toHaveLength(2);
    });
  }

  it('switching a fill with NO keyframes is a clean no-op (mode changes, nothing to delete)', () => {
    freshScene();
    designerStore.addElement(defaultShape('el-1', 0, 0));
    expect(trackOf('el-1', 'fill.color')).toBeUndefined();

    applyFillModeChange(selected('el-1'), 'fill.color', { fill: LINEAR } as Partial<Element>);

    const el = selected('el-1');
    expect(el.type === 'shape' && el.fill?.kind).toBe('linear');
    expect(el.animation).toBeUndefined(); // no orphan, no empty shell
    // The mode change is itself one undo entry.
    designerStore.undo();
    expect(
      selected('el-1').type === 'shape' && (selected('el-1') as { fill?: Fill }).fill?.kind,
    ).toBe('solid');
  });

  it('is registry-driven: applying a still-keyframe-able (solid) fill keeps the track', () => {
    freshScene();
    designerStore.addElement(defaultShape('el-1', 0, 0));
    designerStore.upsertKeyframe('el-1', 'fill.color', 0, '#FF0000');

    // A solid fill is keyframe-able → the predicate is true → the track is NOT cleared
    // (proves the delete keys off the registry, not a blanket "applyFillModeChange wipes").
    applyFillModeChange(selected('el-1'), 'fill.color', {
      fill: { kind: 'solid', color: '#123456' },
    } as Partial<Element>);

    expect(trackOf('el-1', 'fill.color')).toBeDefined();
  });
});
