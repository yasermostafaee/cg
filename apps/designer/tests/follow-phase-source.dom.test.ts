/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Element, LottieElement, Scene, VideoElement } from '@cg/shared-schema';

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
    // Keep the async asset refresh pending; these tests exercise the Inspector synchronously and
    // derive the fallback source frame from the composition rate.
    list: () => new Promise<never>(() => undefined),
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

function scene(
  children: Element[],
  lifecycle?: object,
  frameRate = 25,
  frameOut = 100,
  holdBehavior: 'freeze' | 'loop' = 'freeze',
): Scene {
  return {
    schemaVersion: 1,
    id: 'scene-fps',
    name: 'fps',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: frameOut },
    editorBackdrop: 'transparent',
    ...(lifecycle !== undefined ? { lifecycle } : {}),
    playout: { mode: 'manual', holdBehavior },
    layers: [{ id: 'L1', name: 'l', visible: true, locked: false, blendMode: 'normal', children }],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-11-02T00:00:00.000Z', updatedAt: '2026-11-02T00:00:00.000Z' },
  } as unknown as Scene;
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  designerStore._reset();
});

function mount(
  el: Element,
  lifecycle: object | null = { outPoint: 85, contentStart: 25 },
  frameRate = 25,
  frameOut = 100,
  holdBehavior: 'freeze' | 'loop' = 'freeze',
): void {
  designerStore.setScene(
    scene([el], lifecycle ?? undefined, frameRate, frameOut, holdBehavior),
    null,
  );
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
describe('composition-owned media timing', () => {
  it('attaches a phase-less Lottie without inventing media markers', () => {
    mount(lottieEl());
    expect(button(/add phase markers/i)).toBeNull();
    click(button(/follow composition/i)!);
    expect((stored('lot') as LottieElement).phases).toEqual({ source: 'composition' });
  });

  it('shows only a compact derived Lottie hold and hides editable hold actions', () => {
    mount(
      lottieEl({
        phases: { source: 'composition', introEnd: 12, outroStart: 20, holdAt: 18, idle: [2, 8] },
      }),
      undefined,
      25,
      100,
      'loop',
    );
    const readout = host.querySelector('[data-testid="follow-hold-readout"]');
    expect(readout?.textContent).toMatch(/Hold 1s · frame 30 · loops middle/i);
    expect(readout?.querySelector('[data-testid="info-tip"]')).not.toBeNull();
    expect(button(/set hold|clear hold/i)).toBeNull();
    expect(host.querySelector('[aria-label="on hold"]')).toBeNull();
  });

  it('bakes the composition-derived Lottie boundaries on Detach', () => {
    mount(lottieEl({ phases: { source: 'composition', holdAt: 18 } }));
    click(button(/detach/i)!);
    expect((stored('lot') as LottieElement).phases).toMatchObject({
      introEnd: 30,
      outroStart: 42,
      source: 'manual',
    });
  });

  it('attaches a phase-less Video and shows derived time plus source frame', () => {
    mount(videoEl(), undefined, 25, 100, 'loop');
    click(button(/follow composition/i)!);
    const attached = stored('vid') as VideoElement;
    expect(attached.phases).toEqual({ source: 'composition' });
    render(attached as Element);
    const readout = host.querySelector('[data-testid="follow-hold-readout"]');
    expect(readout?.textContent).toMatch(/Hold 1\.00 s · frame 25 · loops middle/i);
    expect(button(/set hold|clear hold/i)).toBeNull();
  });

  it('ignores stored Video phase values and bakes only composition-derived boundaries', () => {
    mount(
      videoEl({
        phases: {
          source: 'composition',
          introEnd: 2300,
          outroStart: 3100,
          holdAt: 2800,
          idle: { start: 2500, end: 2700 },
        },
      }),
    );
    expect(host.querySelector('[data-testid="follow-hold-readout"]')?.textContent).toContain(
      'Hold 4.40 s',
    );
    click(button(/detach/i)!);
    expect((stored('vid') as VideoElement).phases).toMatchObject({
      introEnd: 1000,
      outroStart: 4400,
      source: 'manual',
    });
  });

  it('derives Follow Video Freeze from Outro start without an authored frame control', () => {
    mount(
      videoEl({
        holdBehavior: 'freeze',
        phases: { source: 'composition' },
      }),
    );
    expect(host.querySelector('[data-testid="follow-hold-readout"]')?.textContent).toContain(
      'Hold 4.40 s · frame 110 · freezes',
    );
    expect(host.querySelector('[aria-label="freeze frame"]')).toBeNull();
    expect(host.querySelector('[aria-label="freeze time"]')).toBeNull();
    expect(button(/reset freeze/i)).toBeNull();

    act(() => designerStore.setPlayout({ holdBehavior: 'loop' }));
    const looping = stored('vid') as VideoElement;
    expect(looping.phases).toEqual({ source: 'composition' });
    render(looping as Element);
    expect(host.querySelector('[data-testid="follow-hold-readout"]')?.textContent).toContain(
      'Hold 1.00 s · frame 25 · loops middle',
    );
  });

  it('reports the derived Outro-start Freeze picture at the composition rate', () => {
    mount(
      videoEl({
        durationMs: 10_000,
        holdBehavior: 'freeze',
        phases: { source: 'composition' },
      }),
      { contentStart: 50, outPoint: 450 },
      50,
      500,
    );
    expect(host.querySelector('[data-testid="follow-hold-readout"]')?.textContent).toContain(
      'Hold 9.00 s · frame 450 · freezes',
    );
    expect(host.querySelector('[aria-label="freeze frame"]')).toBeNull();
    click(button(/detach/i)!);
    expect((stored('vid') as VideoElement).phases).toMatchObject({
      introEnd: 1000,
      outroStart: 9000,
      source: 'manual',
    });
  });

  it('keeps drives hold in the composition Playback checklist only', () => {
    mount(videoEl({ phases: { source: 'composition' }, drivesHold: true }));
    expect(host.querySelector('[aria-label="drives hold"]')).toBeNull();
  });

  it('keeps Detach available for a source-only Video with no lifecycle anchors', () => {
    mount(videoEl({ phases: { source: 'composition' } }), null);
    expect(host.querySelector('[data-testid="follow-no-anchors"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="follow-window"]')).toBeNull();
    const detach = button(/detach/i);
    expect(detach).not.toBeNull();
    click(detach!);
    expect((stored('vid') as VideoElement).phases).toBeUndefined();
  });

  it('keeps Detach available for a source-only Lottie with no lifecycle anchors', () => {
    mount(lottieEl({ phases: { source: 'composition' } }), null);
    expect(host.querySelector('[data-testid="follow-no-anchors"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="follow-window"]')).toBeNull();
    const detach = button(/detach/i);
    expect(detach).not.toBeNull();
    click(detach!);
    expect((stored('lot') as LottieElement).phases).toBeUndefined();
  });

  it('restores ignored Video phase values as manual when Detach has no anchors to bake', () => {
    mount(
      videoEl({
        phases: {
          source: 'composition',
          introEnd: 400,
          outroStart: 600,
          holdAt: 500,
          idle: { start: 450, end: 550 },
        },
      }),
      null,
    );
    click(button(/detach/i)!);
    expect((stored('vid') as VideoElement).phases).toEqual({
      source: 'manual',
      introEnd: 400,
      outroStart: 600,
      holdAt: 500,
      idle: { start: 450, end: 550 },
    });
  });

  it('restores ignored Lottie phase values as manual when Detach has no anchors to bake', () => {
    mount(
      lottieEl({
        phases: {
          source: 'composition',
          introEnd: 12,
          outroStart: 44,
          holdAt: 18,
          idle: [20, 30],
        },
      }),
      null,
    );
    click(button(/detach/i)!);
    expect((stored('lot') as LottieElement).phases).toEqual({
      source: 'manual',
      introEnd: 12,
      outroStart: 44,
      holdAt: 18,
      idle: [20, 30],
    });
  });
});
