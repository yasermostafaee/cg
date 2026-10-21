import { afterEach, describe, expect, it } from 'vitest';
import type { Element, VideoPlaceholderElement } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';
import { defaultLiveSource } from '../src/renderer/state/element-defaults.js';
import { liveSourceIssues } from '../src/renderer/state/live-source-preflight.js';

/**
 * 🔴 `RUN-NEXT-VERSION-02` Q5 (the owner) — **A DUPLICATED OR PASTED PLATE GETS THE NEXT FREE `live-N`,
 * MARKED AUTO.** It used to keep its original's id: two plates naming one source in one look, which
 * the export refuses (`live-source-repeated`).
 */

afterEach(() => {
  designerStore._reset();
});

function freshProject(): void {
  const { scene } = new ProjectStore(new MemoryWorkspace(), new MemoryKv()).newScene(
    'plates',
    'lower-third',
  );
  designerStore.setScene(scene, null);
}

function plates(): VideoPlaceholderElement[] {
  const st = designerStore.get();
  const view = editSceneOf(st.scene, st.activeCompositionId)!;
  const out: VideoPlaceholderElement[] = [];
  const walk = (children: readonly Element[]): void => {
    for (const el of children) {
      if (el.type === 'video-placeholder') out.push(el);
      if (el.type === 'container') walk(el.children);
    }
  };
  for (const layer of view.layers) walk(layer.children);
  return out;
}

function addPlate(id: string, routeKey: string | undefined, x = 0): void {
  const p = defaultLiveSource(id, x, 0);
  designerStore.addElement({ ...p, ...(routeKey !== undefined ? { routeKey } : {}) } as Element);
}

describe('🔴 Q5 — a copied plate takes the next free live-N, marked auto', () => {
  it('duplicate: the copy is live-2, auto; the original keeps live-1, confirmed', () => {
    freshProject();
    addPlate('p1', 'live-1');
    designerStore.setSelection(['p1']);
    designerStore.duplicateSelection();
    const [original, copy] = plates();
    expect(original).toMatchObject({ id: 'p1', routeKey: 'live-1' });
    expect(original).not.toHaveProperty('routeKeyAuto');
    expect(copy).toMatchObject({ routeKey: 'live-2', routeKeyAuto: true });
  });

  it('paste twice: live-2 and live-3, and the export refuses no repeated source', () => {
    freshProject();
    addPlate('p1', 'live-1');
    designerStore.setSelection(['p1']);
    designerStore.copySelection();
    designerStore.pasteElements();
    designerStore.pasteElements();
    expect(plates().map((p) => p.routeKey)).toEqual(['live-1', 'live-2', 'live-3']);
    const st = designerStore.get();
    const issues = liveSourceIssues(editSceneOf(st.scene, st.activeCompositionId)!);
    expect(issues.filter((i) => i.code === 'live-source-repeated')).toEqual([]);
  });

  it('two plates selected and duplicated get two different ids', () => {
    freshProject();
    addPlate('p1', 'live-1');
    addPlate('p2', 'live-2', 700);
    designerStore.setSelection(['p1', 'p2']);
    designerStore.duplicateSelection();
    expect(new Set(plates().map((p) => p.routeKey)).size).toBe(4);
  });

  it('a plate with no id is copied without one', () => {
    freshProject();
    addPlate('p1', undefined);
    designerStore.setSelection(['p1']);
    designerStore.duplicateSelection();
    expect(plates().map((p) => p.routeKey)).toEqual([undefined, undefined]);
  });
});
