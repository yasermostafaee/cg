/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import type { Element, Scene } from '@cg/shared-schema';

/**
 * 🔴 `B-342` — **AN IMPORTED CLIP IS PLACED WITH ITS BOX CENTRED.** `position` is the element's
 * top-left; the import modal's `placeVideoElement` handed it the scene centre, so a full-frame
 * clip drew from (960, 540) — three quarters off the frame. Found on air during `D-164` §0.4: a
 * 1920×1080 image sequence's video reported `getBoundingClientRect()` = 960, 540, 1920, 1080.
 */

const { designerStore, editSceneOf } = await import('../src/renderer/state/store.js');
const { placeVideoElement } = await import('../src/renderer/features/assets/ProjectAssetsPanel.js');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function scene(): Scene {
  return {
    schemaVersion: 1,
    id: 'scene-place',
    name: 'place',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 500 }, // 10 s — every clip here fits, so no guard dialog
    editorBackdrop: 'transparent',
    layers: [
      { id: 'L1', name: 'l', visible: true, locked: false, blendMode: 'normal', children: [] },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-10-14T00:00:00.000Z', updatedAt: '2026-10-14T00:00:00.000Z' },
  } as unknown as Scene;
}

function placed(): Element {
  const st = designerStore.get();
  const el = editSceneOf(st.scene, st.activeCompositionId)!.layers[0]!.children[0];
  if (el === undefined) throw new Error('nothing was placed');
  return el;
}

function place(width: number, height: number): Element {
  act(() =>
    placeVideoElement(
      { asset: { assetId: 'asset-v' } as never, durationMs: 1000, width, height },
      designerStore.get().scene,
    ),
  );
  return placed();
}

beforeEach(() => {
  designerStore.setScene(scene(), null);
});

describe('B-342 — placeVideoElement centres the BOX', () => {
  it('🔴 a full-frame clip fills the frame exactly: top-left 0, 0', () => {
    const el = place(1920, 1080);
    expect(el.transform.size).toEqual({ w: 1920, h: 1080 });
    expect(el.transform.position).toEqual({ x: 0, y: 0 });
  });

  it('a smaller clip sits in the middle: its centre is the scene centre', () => {
    const { position, size } = place(640, 360).transform;
    expect(position).toEqual({ x: 640, y: 360 });
    expect(position.x + size.w / 2).toBe(960);
    expect(position.y + size.h / 2).toBe(540);
  });

  it('a clip larger than the frame is fitted, then centred', () => {
    const { position, size } = place(3840, 1080).transform; // fits to 1920 × 540
    expect(size).toEqual({ w: 1920, h: 540 });
    expect(position).toEqual({ x: 0, y: 270 });
  });
});
