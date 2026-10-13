/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Element, LottieElement, Scene, VideoElement } from '@cg/shared-schema';
import type * as LottieBridge from '@cg/lottie-bridge';

/**
 * media-phases-follow-composition — the Inspector's follow affordances, both kinds:
 * attach ("Follow composition"), the derived-window readout, the ONE editable "hold at"
 * input (seeded from the SHARED poster/midpoint helper), Detach (bake to manual), and the
 * no-lifecycle explanation (§9.1 — an inert control that does not explain itself is a
 * defect).
 *
 * The scene: 25 fps, active [0 → 100], out-point 85, content start 25 ⇒ entrance 1000 ms,
 * OUT 600 ms. The clip: ip 0, op 60 at fr 30 ⇒ a 2 s clip whose midpoint is frame 30
 * (= 1000 ms). With `holdAt` 30 the derived window is [frame 0 → 30] / hold 30 /
 * [30 → 48] — every number exact.
 */

const { midpointCalls } = vi.hoisted(() => ({ midpointCalls: [] as unknown[] }));

// The hold-at seed MUST route through the shared helper, not a second copy of
// `(ip + op) / 2` — asserting two equal numbers would pass against a duplicate.
vi.mock('@cg/lottie-bridge', async (importOriginal) => {
  const actual = await importOriginal<typeof LottieBridge>();
  return {
    ...actual,
    lottieClipMidpoint: (meta: { ip: number; op: number; fr: number }) => {
      midpointCalls.push(meta);
      return actual.lottieClipMidpoint(meta);
    },
  };
});

const CLIP = { ip: 0, op: 60, fr: 30, w: 100, h: 100, layers: [] };

vi.mock('../src/renderer/features/assets/lottieAssetCache.js', () => ({
  get: (assetId: string) => (assetId === 'asset-a' ? CLIP : undefined),
  getAll: () => ({ 'asset-a': CLIP }),
  getForScene: () => ({ 'asset-a': CLIP }),
  subscribe: () => () => undefined,
  prime: () => Promise.resolve(),
  primeScene: () => Promise.resolve(),
  clearAll: () => undefined,
}));

const { designerStore, editSceneOf } = await import('../src/renderer/state/store.js');
const { StyleSection } = await import('../src/renderer/features/inspector/StyleSection.js');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const noUnsub = (): void => undefined;
(window as unknown as { cg: unknown }).cg = {
  assets: {
    list: () => Promise.resolve([]),
    url: () => Promise.resolve(null),
    onImported: () => noUnsub,
    onCleared: () => noUnsub,
  },
  sharedImages: {
    list: () => Promise.resolve([]),
    url: () => Promise.resolve(null),
    onImported: () => noUnsub,
  },
};

const T = {
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
} as const;

function lottieEl(over: Record<string, unknown> = {}): Element {
  return {
    ...T,
    id: 'lot',
    name: 'lot',
    type: 'lottie',
    assetId: 'asset-a',
    speed: 1,
    loopMode: 'none',
    holdBehavior: 'freeze',
    ...over,
  } as unknown as Element;
}

function videoEl(over: Record<string, unknown> = {}): Element {
  return {
    ...T,
    id: 'vid',
    name: 'vid',
    type: 'video',
    assetId: 'asset-v',
    durationMs: 5000,
    holdBehavior: 'loop',
    ...over,
  } as unknown as Element;
}

function scene(children: Element[], lifecycle?: object): Scene {
  return {
    schemaVersion: 1,
    id: 'scene-fps',
    name: 'fps',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 25,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 100 },
    editorBackdrop: 'transparent',
    ...(lifecycle !== undefined ? { lifecycle } : {}),
    layers: [{ id: 'L1', name: 'l', visible: true, locked: false, blendMode: 'normal', children }],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-08-13T00:00:00.000Z', updatedAt: '2026-08-13T00:00:00.000Z' },
  } as unknown as Scene;
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  midpointCalls.length = 0;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  designerStore._reset();
});

function mount(el: Element, lifecycle: object | null = { outPoint: 85, contentStart: 25 }): void {
  // `null` = build the scene WITHOUT a lifecycle (an explicit `undefined` argument would
  // trigger the default parameter and silently hand every test anchors).
  designerStore.setScene(scene([el], lifecycle ?? undefined), null);
  render(el);
}

function render(element: Element): void {
  act(() => {
    root.render(
      createElement(StyleSection, { element, currentFrame: 0, selectedKeyframe: null } as never),
    );
  });
}

function stored(id: string): LottieElement | VideoElement {
  const st = designerStore.get();
  const layer = editSceneOf(st.scene, st.activeCompositionId)!.layers[0]!;
  return layer.children.find((c) => c.id === id) as LottieElement | VideoElement;
}

const button = (re: RegExp): HTMLButtonElement | null =>
  [...host.querySelectorAll('button')].find((b) => re.test(b.textContent ?? '')) ?? null;
const click = (b: HTMLButtonElement): void => act(() => b.click());

describe('Lottie — attach, window, hold at, detach, no-anchors', () => {
  it('a marker-less clip offers "Follow composition" beside "Add phase markers"; attaching writes the source', () => {
    const el = lottieEl();
    mount(el);
    expect(button(/add phase markers/i)).not.toBeNull();
    const follow = button(/follow composition/i);
    expect(follow).not.toBeNull();
    click(follow!);
    const p = (stored('lot') as LottieElement).phases!;
    expect(p.source).toBe('composition');
    // Session Y — the source ALONE: seeded numbers were a stored lie (under the corrected
    // rule an authored value GOVERNS, so a seed would masquerade as intent). Absent fields
    // mean derive-from-the-composition, with the outro as the clip's ending.
    expect(p.introEnd).toBeUndefined();
    expect(p.outroStart).toBeUndefined();
  });

  it('a manual clip can attach too, keeping its stored numbers exactly', () => {
    const el = lottieEl({ phases: { introEnd: 12, outroStart: 44, source: 'manual' } });
    mount(el);
    const follow = button(/follow composition/i);
    expect(follow).not.toBeNull();
    click(follow!);
    const p = (stored('lot') as LottieElement).phases!;
    expect(p).toMatchObject({ introEnd: 12, outroStart: 44, source: 'composition' });
  });

  it('under follow the derived window renders read-only, and "Set hold frame" seeds via the SHARED helper', () => {
    // Session Y: source-only — the attach state. (Authored values now govern the window and
    // replace the hold-at affordance; that path is pinned separately below.)
    const el = lottieEl({ phases: { source: 'composition' } });
    mount(el);
    expect(host.querySelector('[data-testid="follow-window"]')).not.toBeNull();
    // No holdAt yet — the default plays from the clip head; the seed affordance exists.
    midpointCalls.length = 0;
    const setHold = button(/set hold frame/i);
    expect(setHold).not.toBeNull();
    click(setHold!);
    expect((stored('lot') as LottieElement).phases!.holdAt).toBe(30);
    expect(midpointCalls.length).toBeGreaterThan(0); // the SHARED call, not a copy
  });

  it('clearing hold at reverts to the default (play from the head)', () => {
    const el = lottieEl({ phases: { source: 'composition', holdAt: 30 } });
    mount(el);
    const clear = button(/clear hold frame/i);
    expect(clear).not.toBeNull();
    click(clear!);
    expect((stored('lot') as LottieElement).phases!.holdAt).toBeUndefined();
  });

  it('Detach bakes the EXACT currently-derived values into manual and keeps holdAt', () => {
    const el = lottieEl({ phases: { source: 'composition', holdAt: 30 } });
    mount(el);
    const detach = button(/detach/i);
    expect(detach).not.toBeNull();
    click(detach!);
    const p = (stored('lot') as LottieElement).phases!;
    // Session Y — truthful bake: hold H = frame 30, and the clip's OWN outro start — the
    // END-anchored 60 − 18 (OUT 0.6 s at fr 30) = frame 42. Manual then plays what follow
    // was playing.
    expect(p).toMatchObject({ introEnd: 30, outroStart: 42, source: 'manual', holdAt: 30 });
  });

  it('with NO lifecycle the mode explains itself instead of silently doing nothing', () => {
    const el = lottieEl({ phases: { introEnd: 12, outroStart: 44, source: 'composition' } });
    mount(el, null);
    expect(host.querySelector('[data-testid="follow-no-anchors"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="follow-window"]')).toBeNull();
  });
});

describe('video — the same affordances in the clip’s ms units', () => {
  it('attach from the marker-less state writes source composition with the claim-least slots', () => {
    const el = videoEl();
    mount(el);
    const follow = button(/follow composition/i);
    expect(follow).not.toBeNull();
    click(follow!);
    const p = (stored('vid') as VideoElement).phases!;
    expect(p.source).toBe('composition');
    // Session Y — the source alone; no seeded numbers (see the lottie attach pin above).
    expect(p.introEnd).toBeUndefined();
    expect(p.outroStart).toBeUndefined();
  });

  it('under follow: window renders, "Set hold time" seeds the poster midpoint, Detach bakes truthfully', () => {
    const el = videoEl({ phases: { source: 'composition' } });
    mount(el);
    expect(host.querySelector('[data-testid="follow-window"]')).not.toBeNull();
    click(button(/set hold time/i)!);
    expect((stored('vid') as VideoElement).phases!.holdAt).toBe(2500);
    // Re-render against the updated element (the panel derives from props).
    render(stored('vid') as unknown as Element);
    click(button(/detach/i)!);
    const p = (stored('vid') as VideoElement).phases!;
    // Session Y — H = holdAt 2500 ms; OUT 600 ms ⇒ the clip's own outro start 5000 − 600.
    expect(p).toMatchObject({ introEnd: 2500, outroStart: 4400, source: 'manual', holdAt: 2500 });
  });

  it('with NO lifecycle the video panel explains itself too', () => {
    const el = videoEl({ phases: { introEnd: 400, outroStart: 600, source: 'composition' } });
    mount(el, null);
    expect(host.querySelector('[data-testid="follow-no-anchors"]')).not.toBeNull();
  });
});

describe('session V — the zero-OUT-segment clamp explains itself (never a silent no-outro)', () => {
  it('video: an out point at the end of the active range raises the noOutSegment hint', () => {
    mount(videoEl({ phases: { introEnd: 2500, outroStart: 5000, source: 'composition' } }), {
      outPoint: 100, // == active end (frameRange {0,100}, no activeRange) ⇒ outSpan 0
      contentStart: 25,
    });
    const clamps = host.querySelector('[data-testid="follow-clamps"]');
    expect(clamps).not.toBeNull();
    expect(clamps!.textContent).toMatch(/no OUT segment/i);
  });

  it('lottie: the same hint through the same shared component', () => {
    mount(lottieEl({ phases: { introEnd: 40, outroStart: 60, source: 'composition' } }), {
      outPoint: 100,
      contentStart: 25,
    });
    const clamps = host.querySelector('[data-testid="follow-clamps"]');
    expect(clamps).not.toBeNull();
    expect(clamps!.textContent).toMatch(/no OUT segment/i);
  });

  it('a REAL OUT segment shows no such hint', () => {
    mount(videoEl({ phases: { introEnd: 2500, outroStart: 5000, source: 'composition' } }), {
      outPoint: 85,
      contentStart: 25,
    });
    const clamps = host.querySelector('[data-testid="follow-clamps"]');
    expect(clamps?.textContent ?? '').not.toMatch(/no OUT segment/i);
  });
});

describe('session Y — authored phases govern, and the seam hint names both clip times', () => {
  it('authored values replace the hold-at affordance with the explanatory line', () => {
    // 12/44 are genuinely authored (≠ the 30/60 seed signature for the 60-frame clip).
    mount(lottieEl({ phases: { introEnd: 12, outroStart: 44, source: 'composition' } }));
    expect(host.querySelector('[data-testid="follow-hold-authored"]')).not.toBeNull();
    expect(button(/set hold frame/i)).toBeNull();
  });

  it('the hold→outro seam jump is named with both clip times (the deliberate-jump hint)', () => {
    // Source-only video: H = entrance 1000 ms; END-anchored outro starts at 4400 ms — a jump.
    mount(videoEl({ phases: { source: 'composition' } }));
    const clamps = host.querySelector('[data-testid="follow-clamps"]');
    expect(clamps).not.toBeNull();
    expect(clamps!.textContent).toMatch(/jumps from its held look/i);
    expect(clamps!.textContent).toContain('1.00 s');
    expect(clamps!.textContent).toContain('4.40 s');
  });
});
