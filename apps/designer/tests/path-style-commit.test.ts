/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import type { PathElement, ShapeElement, TickerElement } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';
import {
  defaultShape,
  defaultTicker,
  pathFromScenePoints,
} from '../src/renderer/state/element-defaults.js';

/**
 * B-051 — Path Style commits on `path` elements. The Inspector routes fill /
 * stroke / width / dash through `commitAnimatable`, which (with no keyframe
 * track) lands in `writeStaticAnimatable` — whose per-kind guards must accept
 * `path` (they were shape/text-only from D-056, predating the D-109 path).
 */

afterEach(() => {
  designerStore._reset();
});

function freshScene(): void {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('demo', 'lower-third');
  designerStore.setScene(scene, null);
}

const corner = (id: string, x: number, y: number) => ({ id, x, y, smooth: false });

function addPath(): PathElement {
  const el = pathFromScenePoints(
    'p1',
    [corner('a', 0, 0), corner('b', 100, 0), corner('c', 50, 100)],
    true,
  );
  designerStore.addElement(el);
  return el;
}

function getEl<T>(id: string): T {
  const st = designerStore.get();
  const doc = editSceneOf(st.scene, st.activeCompositionId);
  for (const layer of doc?.layers ?? []) {
    for (const el of layer.children) if (el.id === id) return el as T;
  }
  throw new Error(`element ${id} not found`);
}

describe('writeStaticAnimatable — path style (B-051)', () => {
  it('a freshly created pen path carries default fill + stroke (recon baseline)', () => {
    freshScene();
    addPath();
    const el = getEl<PathElement>('p1');
    expect(el.fill).toBeDefined();
    expect(el.stroke).toBeDefined();
  });

  it('stroke.width commit mutates a path', () => {
    freshScene();
    addPath();
    designerStore.commitAnimatable('p1', 'stroke.width', 7);
    expect(getEl<PathElement>('p1').stroke?.width).toBe(7);
  });

  it('stroke.color commit mutates a path', () => {
    freshScene();
    addPath();
    designerStore.commitAnimatable('p1', 'stroke.color', '#ff0000');
    expect(getEl<PathElement>('p1').stroke?.color).toBe('#ff0000');
  });

  it('stroke.dash commit mutates a path (0 clears the dash)', () => {
    freshScene();
    addPath();
    designerStore.commitAnimatable('p1', 'stroke.dash', 6);
    expect(getEl<PathElement>('p1').stroke?.dash).toEqual([6]);
    designerStore.commitAnimatable('p1', 'stroke.dash', 0);
    expect(getEl<PathElement>('p1').stroke?.dash).toEqual([]);
  });

  it('fill.color commit mutates a path', () => {
    freshScene();
    addPath();
    designerStore.commitAnimatable('p1', 'fill.color', '#00ff00');
    expect(getEl<PathElement>('p1').fill).toEqual({ kind: 'solid', color: '#00ff00' });
  });

  it('shapes keep working (regression guard)', () => {
    freshScene();
    designerStore.addElement(defaultShape('s1', 0, 0));
    designerStore.commitAnimatable('s1', 'stroke.width', 4);
    designerStore.commitAnimatable('s1', 'fill.color', '#123456');
    const el = getEl<ShapeElement>('s1');
    expect(el.stroke?.width).toBe(4);
    expect(el.fill).toEqual({ kind: 'solid', color: '#123456' });
  });

  it('D-056 strictness preserved: a ticker still refuses stroke writes', () => {
    freshScene();
    designerStore.addElement(defaultTicker('t1', 0, 0));
    designerStore.commitAnimatable('t1', 'stroke.width', 4);
    expect((getEl<TickerElement>('t1') as { stroke?: unknown }).stroke).toBeUndefined();
  });
});
