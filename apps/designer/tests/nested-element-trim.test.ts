/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Element, Scene } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { TimelineDock } from '../src/renderer/features/timeline/TimelineDock.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';
import { defaultShape } from '../src/renderer/state/element-defaults.js';

/**
 * B-090 — trimming a NESTED (container-child) element silently did nothing.
 *
 * The timeline's `flattenElements` recursed into `container.children` and was the ONLY
 * place in the app that did, so it rendered rows — with working-looking trim grippers —
 * for elements nothing else can address: `locate()` (every mutation), `reorderElement`,
 * the canvas hit-test and the Inspector's `findSelected` are all direct-children-only,
 * and the runtime builds a container via `buildPlaceholder`, which never builds its
 * children (they reach no `elementMap`, so they are invisible in preview AND export).
 *
 * The resolution PRD B-090 allows — "the trim applies (or the gripper is not offered)" —
 * is the second: persisting a lifespan onto an element the runtime provably never renders
 * would swap a visibly-inert control for an invisibly-inert one. So the timeline now lists
 * each layer's DIRECT children only, and these tests pin that the dead affordance is gone
 * while the real (top-level) trim path is untouched.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  if (root !== null) act(() => root!.unmount());
  root = null;
  host?.remove();
  host = null;
  designerStore._reset();
});

/** A container holding one child — only reachable via a hand-authored `.vcg` today. */
function containerWithChild(): Element {
  const child = { ...defaultShape('nested-child', 10, 10), name: 'Nested Child' } as Element;
  return {
    id: 'group-1',
    name: 'Group',
    type: 'container',
    clip: false,
    transform: {
      position: { x: 0, y: 0 },
      size: { w: 100, h: 100 },
      scale: { x: 1, y: 1 },
      rotation: 0,
      anchor: { x: 0, y: 0 },
    },
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    children: [child],
  } as unknown as Element;
}

function seedSceneWithContainer(): void {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('nested-trim-test', 'custom');
  designerStore.setScene(scene, null);
  designerStore.addElement(containerWithChild());
}

function renderTimeline(): HTMLDivElement {
  const st = designerStore.get();
  const scene = editSceneOf(st.scene, st.activeCompositionId) as Scene;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      createElement(TimelineDock, {
        scene,
        selection: new Set<string>(),
        selectedKeyframe: null,
        selectedKeyframes: [],
      }),
    ),
  );
  return host;
}

function activeChildren(): readonly Element[] {
  const st = designerStore.get();
  return editSceneOf(st.scene, st.activeCompositionId)!.layers[0]!.children;
}

describe('B-090 — the timeline offers no trim gripper for a container child', () => {
  it('renders a row for the CONTAINER but none for its child', () => {
    seedSceneWithContainer();
    const c = renderTimeline();
    expect(c.querySelector('[data-element-id="group-1"]')).not.toBeNull();
    expect(c.querySelector('[data-element-id="nested-child"]')).toBeNull();
  });

  it('renders no trim grippers for the container child (the dead control is gone)', () => {
    seedSceneWithContainer();
    const c = renderTimeline();
    // The container's own grippers are still offered — it IS a direct layer child.
    expect(c.querySelector('[data-testid="lifespan-trim-start-group-1"]')).not.toBeNull();
    expect(c.querySelector('[data-testid="lifespan-trim-start-nested-child"]')).toBeNull();
    expect(c.querySelector('[data-testid="lifespan-trim-end-nested-child"]')).toBeNull();
  });
});

describe('B-090 — the real (top-level) trim path is unaffected', () => {
  it('updateElementLifespan persists a trim on a direct layer child, and undo reverts it', () => {
    const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
    const { scene } = projects.newScene('trim-test', 'custom');
    designerStore.setScene(scene, null);
    designerStore.addElement(defaultShape('el-1', 50, 60));
    // The history engine coalesces mutations that land together; a real trim drag is a
    // separate gesture, so close the add's entry before trimming.
    designerStore.markHistoryBoundary();

    designerStore.updateElementLifespan('el-1', { in: 12, out: 34 });
    expect(activeChildren()[0]!.lifespan).toEqual({ in: 12, out: 34 });

    designerStore.undo();
    expect(activeChildren()[0]!.lifespan).toBeUndefined();
  });

  it('a trim aimed at a container CHILD writes nothing anywhere (no stray lifespan)', () => {
    seedSceneWithContainer();
    designerStore.updateElementLifespan('nested-child', { in: 12, out: 34 });
    const group = activeChildren().find((e) => e.id === 'group-1');
    expect(group?.lifespan).toBeUndefined();
    const child = (group as { children?: Element[] } | undefined)?.children?.[0];
    expect(child?.lifespan).toBeUndefined();
  });
});
