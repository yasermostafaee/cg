/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Composition, Element, Scene, VideoElement } from '@cg/shared-schema';
import { activeRangeOf } from '@cg/shared-schema';

/**
 * add-time-duration-guard (D-151) — at the moment content is ADDED to a composition, content
 * longer than its host raises ONE dialog (Extend / Add as backdrop / Cancel — two choices for a
 * composition insert, which cannot follow), through ONE chokepoint every add door passes.
 *
 * The host in every fixture: 2 s at 25 fps (frameRange [0, 50]). The oversized clip: 5 s.
 */

const { probed } = vi.hoisted(() => ({
  probed: { durationMs: 5000, width: 640, height: 360 },
}));
vi.mock('../src/renderer/features/assets/video-asset-probe.js', () => ({
  probeStoredVideo: () => Promise.resolve({ ...probed }),
}));

const { designerStore, editSceneOf } = await import('../src/renderer/state/store.js');
const { activeDocOf } = await import('../src/renderer/state/scene-doc.js');
const guard = await import('../src/renderer/features/addGuard/duration-guard.js');
const { DurationGuardDialog } =
  await import('../src/renderer/features/addGuard/DurationGuardDialog.js');
const { placeVideoElement } = await import('../src/renderer/features/assets/ProjectAssetsPanel.js');
const { insertLottieFromAsset, insertVideoFromAsset } =
  await import('../src/renderer/features/canvas/CanvasOverlay.js');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const noUnsub = (): void => undefined;
(window as unknown as { cg: unknown }).cg = {
  assets: {
    list: () => Promise.resolve([]),
    url: () => Promise.resolve('blob:mock-asset'),
    onImported: () => noUnsub,
    onCleared: () => noUnsub,
  },
  sharedImages: {
    list: () => Promise.resolve([]),
    url: () => Promise.resolve(null),
    onImported: () => noUnsub,
  },
};

/** A 5 s bodymovin clip (fr 30, [0 → 150]) that passes the import allowlist. */
const LOTTIE_5S = {
  v: '5.7.0',
  fr: 30,
  ip: 0,
  op: 150,
  w: 100,
  h: 100,
  nm: 'clip',
  ddd: 0,
  assets: [],
  layers: [
    {
      ddd: 0,
      ind: 1,
      ty: 4,
      nm: 'shape',
      sr: 1,
      ks: {
        o: { a: 0, k: 100 },
        r: { a: 0, k: 0 },
        p: { a: 0, k: [50, 50, 0] },
        a: { a: 0, k: [0, 0, 0] },
        s: { a: 0, k: [100, 100, 100] },
      },
      ao: 0,
      shapes: [],
      ip: 0,
      op: 150,
      st: 0,
      bm: 0,
    },
  ],
};

function scene(over: Record<string, unknown> = {}): Scene {
  return {
    schemaVersion: 1,
    id: 'scene-guard',
    name: 'guard',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 25,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 }, // 2 s at 25 fps
    editorBackdrop: 'transparent',
    layers: [
      { id: 'L1', name: 'l', visible: true, locked: false, blendMode: 'normal', children: [] },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-08-13T00:00:00.000Z', updatedAt: '2026-08-13T00:00:00.000Z' },
    ...over,
  } as unknown as Scene;
}

function videoEl(durationMs: number): VideoElement {
  return {
    id: 'vid-1',
    name: 'Video',
    type: 'video',
    transform: {
      position: { x: 0, y: 0 },
      size: { w: 480, h: 270 },
      scale: { x: 1, y: 1 },
      rotation: 0,
      anchor: { x: 0.5, y: 0.5 },
    },
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    assetId: 'asset-v',
    durationMs,
    holdBehavior: 'loop',
  } as unknown as VideoElement;
}

/** Children of the active composition (setScene migrates root layers into one). */
function children(): readonly Element[] {
  const st = designerStore.get();
  return editSceneOf(st.scene, st.activeCompositionId)!.layers[0]!.children;
}

function hostFrames(): number {
  const doc = activeDocOf(designerStore.get().scene!);
  const r = activeRangeOf(doc);
  return r.out - r.in;
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  probed.durationMs = 5000;
  guard._resetDurationGuard();
  designerStore.setScene(scene(), null);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root.render(createElement(DurationGuardDialog));
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  guard._resetDurationGuard();
  designerStore._reset();
  vi.restoreAllMocks();
});

const dialog = (): HTMLElement | null =>
  document.body.querySelector('[role="dialog"][aria-label="Content longer than the composition"]');
const dialogButton = (re: RegExp): HTMLButtonElement | null =>
  dialog() === null
    ? null
    : ([...dialog()!.querySelectorAll('button')].find((b) => re.test(b.textContent ?? '')) ?? null);
const click = (b: HTMLButtonElement): void => act(() => b.click());

describe('the guard decision — video (adapter: durationMs)', () => {
  it('a 5 s clip into a 2 s composition raises the dialog naming BOTH durations, adding nothing yet', () => {
    act(() => guard.guardedAddVideo(videoEl(5000)));
    expect(children()).toHaveLength(0); // nothing inserted before the operator answers
    expect(dialog()).not.toBeNull();
    const text = dialog()!.textContent ?? '';
    expect(text).toContain('5.0 s');
    expect(text).toContain('2.0 s');
  });

  it('EXTEND grows the host to exactly ceil-to-frame, adds the element, and ONE undo restores both', () => {
    act(() => guard.guardedAddVideo(videoEl(5000)));
    click(dialogButton(/extend/i)!);
    expect(hostFrames()).toBe(125); // ceil(5000 × 25 / 1000)
    expect(children()).toHaveLength(1);
    expect(dialog()).toBeNull();

    act(() => designerStore.undo());
    expect(hostFrames()).toBe(50); // BOTH restored together — one history entry
    expect(children()).toHaveLength(0);
  });

  it('BACKDROP adds the element with phases.source composition and touches the host not at all', () => {
    act(() => guard.guardedAddVideo(videoEl(5000)));
    click(dialogButton(/backdrop/i)!);
    expect(hostFrames()).toBe(50);
    const el = children()[0] as VideoElement;
    expect(el.phases?.source).toBe('composition');
    // The claim-least slots are the SHARED follow-attach seed (poster midpoint / duration).
    expect(el.phases?.introEnd).toBe(2500);
    expect(el.phases?.outroStart).toBe(5000);
  });

  it('CANCEL leaves the scene IDENTICAL (object identity — stronger than byte equality)', () => {
    const before = designerStore.get().scene;
    act(() => guard.guardedAddVideo(videoEl(5000)));
    click(dialogButton(/cancel/i)!);
    expect(designerStore.get().scene).toBe(before);
    expect(children()).toHaveLength(0);
    expect(dialog()).toBeNull();
  });

  it('Escape routes to Cancel — decline-means-not-added on every dismissal gesture', () => {
    const before = designerStore.get().scene;
    act(() => guard.guardedAddVideo(videoEl(5000)));
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(dialog()).toBeNull();
    expect(designerStore.get().scene).toBe(before);
  });

  it('a 1 s clip into a 2 s composition is SILENT — added exactly as today', () => {
    act(() => guard.guardedAddVideo(videoEl(1000)));
    expect(dialog()).toBeNull();
    expect(children()).toHaveLength(1);
    expect((children()[0] as VideoElement).phases).toBeUndefined();
  });

  it('an exact fit (2 s into 2 s) is silent too — the comparison is strictly greater-than', () => {
    act(() => guard.guardedAddVideo(videoEl(2000)));
    expect(dialog()).toBeNull();
    expect(children()).toHaveLength(1);
  });
});

describe('lottie parity (adapter: (op − ip) / fr at 1× — the creation default)', () => {
  const meta = { ip: 0, op: 150, fr: 30 }; // 5 s
  const lottieEl = (): Element =>
    ({
      id: 'lot-1',
      name: 'Lottie',
      type: 'lottie',
      transform: {
        position: { x: 0, y: 0 },
        size: { w: 100, h: 100 },
        scale: { x: 1, y: 1 },
        rotation: 0,
        anchor: { x: 0.5, y: 0.5 },
      },
      opacity: 1,
      visible: true,
      locked: false,
      zIndex: 0,
      assetId: 'asset-l',
      speed: 1,
      loopMode: 'none',
      holdBehavior: 'freeze',
    }) as unknown as Element;

  it('raises, extends, and cancels exactly as the video does', () => {
    act(() => guard.guardedAddLottie(lottieEl(), meta));
    expect(dialog()).not.toBeNull();
    click(dialogButton(/extend/i)!);
    expect(hostFrames()).toBe(125);
    expect(children()).toHaveLength(1);
  });

  it('BACKDROP seeds the SHARED follow-attach slots (midpoint / op)', () => {
    act(() => guard.guardedAddLottie(lottieEl(), meta));
    click(dialogButton(/backdrop/i)!);
    const el = children()[0] as Extract<Element, { type: 'lottie' }>;
    expect(el.phases).toMatchObject({ introEnd: 75, outroStart: 150, source: 'composition' });
    expect(hostFrames()).toBe(50);
  });

  it('a Lottie that arrived WITH markers keeps its marker values in the slots on backdrop', () => {
    const el = {
      ...(lottieEl() as object),
      phases: { introEnd: 30, outroStart: 120, idle: [40, 80], source: 'markers' },
    } as Element;
    act(() => guard.guardedAddLottie(el, meta));
    click(dialogButton(/backdrop/i)!);
    const added = children()[0] as Extract<Element, { type: 'lottie' }>;
    expect(added.phases).toMatchObject({
      introEnd: 30,
      outroStart: 120,
      idle: [40, 80],
      source: 'composition',
    });
  });

  it('a short clip is silent', () => {
    act(() => guard.guardedAddLottie(lottieEl(), { ip: 0, op: 30, fr: 30 })); // 1 s
    expect(dialog()).toBeNull();
    expect(children()).toHaveLength(1);
  });
});

describe('composition-into-composition — the firm TWO-choice form', () => {
  function compScene(): Scene {
    const comp = (id: string, out: number): Composition =>
      ({
        id,
        name: id,
        resolution: { width: 1920, height: 1080 },
        frameRange: { in: 0, out },
        layers: [
          {
            id: `${id}-L1`,
            name: 'l',
            visible: true,
            locked: false,
            blendMode: 'normal',
            children: [],
          },
        ],
      }) as unknown as Composition;
    return scene({ compositions: [comp('host', 50), comp('long', 150), comp('short', 30)] });
  }

  beforeEach(() => {
    designerStore.setScene(compScene(), null);
    designerStore.setActiveComposition('host');
  });

  it('inserting a longer composition raises a TWO-choice dialog — no backdrop button', () => {
    act(() => guard.guardedAddCompositionInstance('long'));
    expect(dialog()).not.toBeNull();
    expect(dialogButton(/backdrop/i)).toBeNull(); // an instance has no phases and cannot follow
    expect(dialogButton(/extend/i)).not.toBeNull();
    expect(dialogButton(/cancel/i)).not.toBeNull();
    const text = dialog()!.textContent ?? '';
    expect(text).toContain('6.0 s'); // 150 frames at 25 fps
    expect(text).toContain('2.0 s');
  });

  it('EXTEND grows the host to the child length and inserts the instance, one undo step', () => {
    act(() => guard.guardedAddCompositionInstance('long'));
    click(dialogButton(/extend/i)!);
    expect(hostFrames()).toBe(150);
    const kids = children();
    expect(kids).toHaveLength(1);
    expect(kids[0]!.type).toBe('composition');
    act(() => designerStore.undo());
    expect(hostFrames()).toBe(50);
    expect(children()).toHaveLength(0);
  });

  it('CANCEL leaves the scene identical', () => {
    const before = designerStore.get().scene;
    act(() => guard.guardedAddCompositionInstance('long'));
    click(dialogButton(/cancel/i)!);
    expect(designerStore.get().scene).toBe(before);
  });

  it('a FITTING composition inserts silently', () => {
    act(() => guard.guardedAddCompositionInstance('short')); // 30 frames into 50 — fits
    expect(dialog()).toBeNull();
    expect(children()).toHaveLength(1);
    expect(children()[0]!.type).toBe('composition');
  });
});

describe('import to the LIBRARY fires nothing — the trigger is add-to-scene, never import', () => {
  it('importing an oversized Lottie stores the asset, raises no dialog, and touches no scene', async () => {
    const { ProjectAssetsPanel } =
      await import('../src/renderer/features/assets/ProjectAssetsPanel.js');
    const stored: string[] = [];
    const cg = (window as unknown as { cg: Record<string, unknown> }).cg as {
      assets: Record<string, unknown>;
    };
    cg.assets['pick'] = () =>
      Promise.resolve([
        {
          name: 'clip-5s.json',
          text: () => Promise.resolve(JSON.stringify(LOTTIE_5S)),
        } as unknown as File,
      ]);
    cg.assets['store'] = (file: File) => {
      stored.push(file.name);
      return Promise.resolve({ asset: { assetId: 'a', kind: 'lottie', filename: file.name } });
    };
    const before = designerStore.get().scene;
    const panelHost = document.createElement('div');
    document.body.appendChild(panelHost);
    const panelRoot = createRoot(panelHost);
    act(() => {
      panelRoot.render(createElement(ProjectAssetsPanel));
    });
    // Open the Add menu and pick Lottie… — the import flow, end to end.
    await act(async () => {
      document
        .querySelector('[aria-label="Add asset"]')!
        .dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });
    const lottieItem = [...document.querySelectorAll('button')].find((b) =>
      /lottie…/i.test(b.textContent ?? ''),
    )!;
    await act(async () => {
      lottieItem.click();
      // let pick → validate → store settle
      for (let i = 0; i < 8; i += 1) await Promise.resolve();
    });
    expect(stored).toEqual(['clip-5s.json']); // the asset landed in the library…
    expect(guard.pendingDurationGuard()).toBeNull(); // …with NO guard raised…
    expect(dialog()).toBeNull();
    expect(designerStore.get().scene).toBe(before); // …and the scene untouched (identity).
    act(() => panelRoot.unmount());
    panelHost.remove();
  });
});

describe('every add door goes through the guard', () => {
  it('door V1/V2 — the import modal onDone tail (placeVideoElement)', () => {
    act(() =>
      placeVideoElement(
        {
          asset: { assetId: 'asset-v' } as never,
          durationMs: 5000,
          width: 640,
          height: 360,
        },
        designerStore.get().scene,
      ),
    );
    expect(dialog()).not.toBeNull();
    expect(children()).toHaveLength(0);
  });

  it('door V3 — canvas drag-drop (insertVideoFromAsset, probe mocked to 5 s)', async () => {
    await act(async () => {
      await insertVideoFromAsset('asset-v', { x: 10, y: 10 }, { width: 1920, height: 1080 });
    });
    expect(dialog()).not.toBeNull();
    expect(children()).toHaveLength(0);
    // …and a SHORT probe result inserts silently through the same door.
    click(dialogButton(/cancel/i)!);
    probed.durationMs = 1000;
    await act(async () => {
      await insertVideoFromAsset('asset-v', { x: 10, y: 10 }, { width: 1920, height: 1080 });
    });
    expect(dialog()).toBeNull();
    expect(children()).toHaveLength(1);
  });

  it('door L1 — canvas drag-drop of a Lottie (insertLottieFromAsset, fetch mocked to a 5 s clip)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      text: () => Promise.resolve(JSON.stringify(LOTTIE_5S)),
    } as Response);
    await act(async () => {
      await insertLottieFromAsset('asset-l', { x: 10, y: 10 });
    });
    expect(dialog()).not.toBeNull();
    expect(children()).toHaveLength(0);
  });

  it('doors C1/C2 — both composition doors share guardedAddCompositionInstance (asserted above); the guard refuses nothing the cycle guard would not', () => {
    // The cycle guard still runs INSIDE addCompositionInstance at commit time — the duration
    // guard wraps it without replacing it.
    designerStore.setScene(
      scene({
        compositions: [
          {
            id: 'host',
            name: 'host',
            resolution: { width: 1920, height: 1080 },
            frameRange: { in: 0, out: 50 },
            layers: [
              {
                id: 'hL',
                name: 'l',
                visible: true,
                locked: false,
                blendMode: 'normal',
                children: [],
              },
            ],
          },
        ],
      }),
      null,
    );
    designerStore.setActiveComposition('host');
    act(() => guard.guardedAddCompositionInstance('host')); // self-insert — cycle-refused
    expect(dialog()).toBeNull();
    expect(children()).toHaveLength(0);
  });
});
