/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Element, Scene } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';
import { activeLookGroup } from '../src/renderer/state/slices/looks.js';
import { defaultLiveSource } from '../src/renderer/state/element-defaults.js';
import { LooksSection } from '../src/renderer/features/inspector/LooksSection.js';

/**
 * `DESIGNER-FIX-0905` §5 / `B-219` — **the two panels agree.** After every look is removed the
 * Looks section says "No looks yet" AND lists the compositions that can become one, each with
 * **Make it a look**; pressing it restores the look through the store. The Compositions panel
 * never stopped listing them — this is the half that was missing.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  designerStore._reset();
});

function editScene(): Scene {
  const st = designerStore.get();
  const s = editSceneOf(st.scene, st.activeCompositionId);
  if (s === null) throw new Error('no edit scene');
  return s;
}

function render(): HTMLDivElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root?.render(createElement(LooksSection, { scene: editScene() }));
  });
  return host;
}

function orphaned(): string | null {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('looks', 'custom');
  designerStore.setScene(scene, null);
  const home = designerStore.get().activeCompositionId;
  designerStore.createLookGroup();
  designerStore.addLook();
  designerStore.editLookContents('look-1');
  designerStore.addElement({
    ...defaultLiveSource('plate-1', 100, 100),
    routeKey: 'guest-1',
  } as unknown as Element);
  designerStore.setActiveComposition(home);
  designerStore.removeLook('look-1');
  return home;
}

describe('the Looks section after a removal', () => {
  it('says "No looks yet" AND offers the kept composition back, in the same frame', () => {
    orphaned();
    const h = render();
    expect(h.textContent).toMatch(/No looks yet/);
    expect(h.textContent).toMatch(/Compositions that can become a look/);
    const row = h.querySelector('[data-testid="detached-look-composition"]');
    expect(row?.textContent).toMatch(/look-1/);
    expect(h.querySelector('[aria-label="Make look-1 a look"]')).not.toBeNull();
  });

  it('Make it a look registers the composition through the store — plates and all', () => {
    orphaned();
    const h = render();
    const btn = h.querySelector<HTMLButtonElement>('[aria-label="Make look-1 a look"]');
    expect(btn).not.toBeNull();
    act(() => btn?.click());
    const group = activeLookGroup(designerStore.get().scene);
    expect(group?.looks.map((l) => l.id)).toEqual(['look-1']);
    // Re-render against the new scene: the offer is gone and the look row is back.
    act(() => {
      root?.render(createElement(LooksSection, { scene: editScene() }));
    });
    expect(h.querySelector('[data-testid="detached-look-composition"]')).toBeNull();
    expect(h.querySelector('[aria-label="Edit contents of look-1"]')).not.toBeNull();
  });

  it('with no detached composition the offer list is absent', () => {
    const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
    const { scene } = projects.newScene('looks', 'custom');
    designerStore.setScene(scene, null);
    designerStore.createLookGroup();
    designerStore.addLook();
    const h = render();
    expect(h.textContent).not.toMatch(/Compositions that can become a look/);
  });
});
