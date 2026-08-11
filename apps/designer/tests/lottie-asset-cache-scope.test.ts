// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Element, Layer, Scene } from '@cg/shared-schema';
import {
  clearAll,
  getAll,
  getForScene,
  prime,
} from '../src/renderer/features/assets/lottieAssetCache.js';

/**
 * B-137 — THE POSTED LOTTIE MAP IS SCOPED TO THE SCENE, WHICH IS WHAT UN-STICKS THE FREEZE.
 *
 * The preview iframe rebuilds its scene whenever it is handed a NON-EMPTY Lottie map, and
 * a rebuild is what strands a playing video's driver on a reparented node. The map came
 * from `getAll()` — the whole module-level cache — so once any Lottie had ever been
 * parsed, that condition stayed true for the rest of the session. Deleting the Lottie
 * ELEMENT did not evict the parsed ASSET (only a project change does), so the rebuilds
 * kept coming and the freeze could not be undone by undoing its cause. THAT is the
 * "sticky" half of B-137, and it lives here in module state rather than in the engine.
 *
 * The assertion that matters is the last one: with the element deleted, the scene-scoped
 * map is EMPTY, so `Object.keys(lottieAssets).length > 0` — the preview's rebuild-forcing
 * condition — goes false.
 */

const ANIM = { v: '5.7.4', fr: 25, ip: 0, op: 50, w: 100, h: 100, layers: [] };

function lottieEl(id: string, assetId: string): Element {
  return {
    id,
    type: 'lottie',
    name: id,
    assetId,
    transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0 },
  } as unknown as Element;
}

function sceneWith(children: Element[]): Scene {
  const layer: Layer = { id: 'l1', name: 'L1', children } as unknown as Layer;
  return {
    schemaVersion: 1,
    id: 's-b137',
    name: 'lottie-scope',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    editorBackdrop: 'transparent',
    layers: [layer],
    compositions: [],
  } as unknown as Scene;
}

/** Prime the cache without a real workspace: stub the bridge + fetch the cache uses. */
async function primeFake(assetId: string): Promise<void> {
  vi.stubGlobal('fetch', () => Promise.resolve(new Response(JSON.stringify(ANIM))));
  (
    globalThis as unknown as {
      window: { cg: { assets: { url: (id: string) => Promise<string> } } };
    }
  ).window.cg = {
    assets: { url: () => Promise.resolve(`blob:fake/${assetId}`) },
  } as never;
  await prime(assetId);
}

describe('B-137 — the Lottie map handed to a preview is scene-scoped', () => {
  beforeEach(() => {
    clearAll();
    vi.unstubAllGlobals();
  });

  it('returns only the ids the scene references, not the whole cache', async () => {
    await primeFake('asset-in-scene');
    await primeFake('asset-elsewhere');
    expect(Object.keys(getAll()).sort()).toEqual(['asset-elsewhere', 'asset-in-scene']);

    const scoped = getForScene(sceneWith([lottieEl('el-1', 'asset-in-scene')]));
    expect(Object.keys(scoped)).toEqual(['asset-in-scene']);
    expect(scoped['asset-in-scene']).toEqual(ANIM);
  });

  it('DELETE THE LOTTIE → the rebuild-forcing condition goes FALSE, though the cache is not empty', async () => {
    await primeFake('asset-doomed');
    const withLottie = getForScene(sceneWith([lottieEl('el-1', 'asset-doomed')]));
    expect(Object.keys(withLottie).length > 0, 'a rebuild IS forced while the element exists').toBe(
      true,
    );

    // The element is removed from the scene. The parsed ASSET deliberately survives in the
    // module cache (re-adding the element must not re-fetch), which is exactly the state
    // that used to keep forcing rebuilds forever.
    const afterDelete = getForScene(sceneWith([]));
    expect(Object.keys(getAll()).length, 'the cache itself still holds the parsed asset').toBe(1);
    expect(
      Object.keys(afterDelete).length > 0,
      'B-137 — no rebuild may be forced once the Lottie element is gone',
    ).toBe(false);
  });
});
