/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { AnimatableProperty, Element, Keyframe } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';
import { defaultShape } from '../src/renderer/state/element-defaults.js';
import { StyleSection } from '../src/renderer/features/inspector/StyleSection.js';

// B-015 — toggling a border-radius control between uniform and per-corner MIGRATES
// the value + keyframes (Option 2) instead of dropping them. These tests drive the
// real RadiusToggle (rendered StyleSection) and assert the store's keyframe tracks.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root !== null) act(() => root!.unmount());
  root = null;
  container?.remove();
  container = null;
  designerStore._reset();
});

const CORNERS: readonly AnimatableProperty[] = [
  'cornerRadius.tl',
  'cornerRadius.tr',
  'cornerRadius.br',
  'cornerRadius.bl',
];

/** Create a fresh single-shape scene and set its cornerRadius (resets history). */
function freshShape(cornerRadius: number | [number, number, number, number]): void {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('radius-mig', 'custom');
  designerStore.setScene(scene, null);
  designerStore.addElement(defaultShape('el-1', 40, 40));
  designerStore.updateElement('el-1', { cornerRadius } as Partial<Element>);
}

function current(): Element {
  const s = designerStore.get();
  return editSceneOf(s.scene, s.activeCompositionId)!.layers[0]!.children[0]!;
}

function radius(): unknown {
  return (current() as { cornerRadius?: unknown }).cornerRadius;
}

function tracks(): Record<string, { keyframes: Keyframe[] }> {
  const el = current() as { animation?: { tracks: Record<string, { keyframes: Keyframe[] }> } };
  return el.animation?.tracks ?? {};
}

/** Keyframe stripped of its id — the value identity we compare across a migration. */
function byValue(k: Keyframe): Omit<Keyframe, 'id'> {
  const { id: _omit, ...rest } = k;
  void _omit;
  return rest;
}

/** Render the Style section for the current element and click a toggle by aria-label. */
function clickToggle(label: string): void {
  if (root !== null) act(() => root!.unmount());
  container?.remove();
  const el = current();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(createElement(StyleSection, { element: el, selectedKeyframe: null })));
  // CollapseSection only mounts children when expanded — open every collapsed header.
  for (let i = 0; i < 20; i++) {
    const collapsed = container.querySelector<HTMLElement>('[aria-expanded="false"]');
    if (collapsed === null) break;
    act(() => collapsed.click());
  }
  const btn = container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
  if (btn === null) throw new Error(`no toggle button "${label}"`);
  act(() => btn.click());
}

const TO_PER_CORNER = 'Use per-corner border radius';
const TO_UNIFORM = 'Use a single border radius';

describe('B-015 — border-radius keyframe migration on toggle', () => {
  it('uniform→per-corner copies value + keyframes into all four corners with distinct ids', () => {
    freshShape(8);
    designerStore.upsertKeyframe('el-1', 'cornerRadius', 0, 8, 'easeIn');
    designerStore.upsertKeyframe('el-1', 'cornerRadius', 25, 20, 'linear');
    designerStore.setKeyframeBezier('el-1', 'cornerRadius', 25, [0.1, 0.2, 0.3, 0.4]);
    const src = tracks()['cornerRadius']!.keyframes.map(byValue);

    clickToggle(TO_PER_CORNER);

    const t = tracks();
    expect(t['cornerRadius']).toBeUndefined(); // orphaned uniform track cleared
    expect(radius()).toEqual([8, 8, 8, 8]);
    const ids: string[] = [];
    for (const c of CORNERS) {
      expect(t[c]).toBeDefined();
      expect(t[c]!.keyframes.map(byValue)).toEqual(src); // frame/value/easing/bezier preserved
      for (const k of t[c]!.keyframes) ids.push(k.id!);
    }
    expect(new Set(ids).size).toBe(ids.length); // every copied keyframe has a distinct id
  });

  it('uniform→per-corner with no keyframes just spreads the static value (no tracks)', () => {
    freshShape(10);
    clickToggle(TO_PER_CORNER);
    expect(radius()).toEqual([10, 10, 10, 10]);
    expect(Object.keys(tracks())).toHaveLength(0);
  });

  it('per-corner→uniform keeps value + keyframes when all four corners are identical', () => {
    freshShape([12, 12, 12, 12]);
    for (const c of CORNERS) {
      designerStore.upsertKeyframe('el-1', c, 0, 12, 'easeOut');
      designerStore.upsertKeyframe('el-1', c, 30, 4, 'linear');
    }
    const tlVals = tracks()['cornerRadius.tl']!.keyframes.map(byValue);

    clickToggle(TO_UNIFORM);

    const t = tracks();
    expect(radius()).toBe(12);
    expect(t['cornerRadius']!.keyframes.map(byValue)).toEqual(tlVals);
    for (const c of CORNERS) expect(t[c]).toBeUndefined();
  });

  it('per-corner→uniform takes the top-left representative when corners differ', () => {
    freshShape([5, 6, 7, 8]);
    designerStore.upsertKeyframe('el-1', 'cornerRadius.tl', 0, 5, 'easeIn');
    designerStore.upsertKeyframe('el-1', 'cornerRadius.tr', 0, 99, 'linear'); // must be dropped
    const tlVals = tracks()['cornerRadius.tl']!.keyframes.map(byValue);

    clickToggle(TO_UNIFORM);

    const t = tracks();
    expect(radius()).toBe(5); // top-left static
    expect(t['cornerRadius']!.keyframes.map(byValue)).toEqual(tlVals);
    for (const c of CORNERS) expect(t[c]).toBeUndefined(); // tr/br/bl dropped
  });

  it('easing and bezier survive the migration in both directions', () => {
    freshShape(9);
    designerStore.upsertKeyframe('el-1', 'cornerRadius', 10, 9, 'easeInOut');
    designerStore.setKeyframeBezier('el-1', 'cornerRadius', 10, [0.2, 0, 0.8, 1]);

    clickToggle(TO_PER_CORNER);
    for (const c of CORNERS) {
      const k = tracks()[c]!.keyframes[0]!;
      expect(k.easing).toBe('easeInOut');
      expect(k.bezier).toEqual([0.2, 0, 0.8, 1]);
    }

    clickToggle(TO_UNIFORM); // top-left carries it back
    const k = tracks()['cornerRadius']!.keyframes[0]!;
    expect(k.easing).toBe('easeInOut');
    expect(k.bezier).toEqual([0.2, 0, 0.8, 1]);
  });

  it('the B-015 round-trip yields the Option-2 (top-left) result, not a silent loss', () => {
    freshShape(8);
    designerStore.upsertKeyframe('el-1', 'cornerRadius', 0, 8, 'linear');
    clickToggle(TO_PER_CORNER); // uniform kf now on all four corners
    designerStore.upsertKeyframe('el-1', 'cornerRadius.tr', 20, 30, 'linear'); // edit a corner
    clickToggle(TO_UNIFORM); // collapse — top-left is the representative

    const t = tracks();
    expect(radius()).toBe(8);
    // top-left kept its migrated uniform keyframe; the tr-only keyframe is dropped.
    expect(t['cornerRadius']!.keyframes.map((k) => [k.frame, k.value])).toEqual([[0, 8]]);
    for (const c of CORNERS) expect(t[c]).toBeUndefined();
  });

  it('a single undo restores the pre-toggle value and tracks (both directions)', () => {
    // uniform→per-corner, then one undo
    freshShape(8);
    designerStore.upsertKeyframe('el-1', 'cornerRadius', 0, 8, 'linear');
    const before = JSON.stringify(current().animation ?? {});
    clickToggle(TO_PER_CORNER);
    designerStore.undo();
    expect(radius()).toBe(8);
    expect(JSON.stringify(current().animation ?? {})).toBe(before);

    // per-corner→uniform, then one undo (fresh scene resets history)
    freshShape([3, 4, 5, 6]);
    designerStore.upsertKeyframe('el-1', 'cornerRadius.tl', 0, 3, 'linear');
    const beforeB = JSON.stringify(current().animation ?? {});
    clickToggle(TO_UNIFORM);
    designerStore.undo();
    expect(radius()).toEqual([3, 4, 5, 6]);
    expect(JSON.stringify(current().animation ?? {})).toBe(beforeB);
  });

  it('a keyframe selection on a dropped track is cleared by the toggle', () => {
    // per-corner→uniform drops tr → its selection is cleared
    freshShape([4, 5, 6, 7]);
    designerStore.upsertKeyframe('el-1', 'cornerRadius.tr', 0, 5, 'linear');
    designerStore.setSelectedKeyframe({ elementId: 'el-1', property: 'cornerRadius.tr', frame: 0 });
    clickToggle(TO_UNIFORM);
    expect(designerStore.get().selectedKeyframe).toBeNull();

    // uniform→per-corner drops the uniform track → its selection is cleared
    freshShape(8);
    designerStore.upsertKeyframe('el-1', 'cornerRadius', 0, 8, 'linear');
    designerStore.setSelectedKeyframe({ elementId: 'el-1', property: 'cornerRadius', frame: 0 });
    clickToggle(TO_PER_CORNER);
    expect(designerStore.get().selectedKeyframe).toBeNull();
  });
});
