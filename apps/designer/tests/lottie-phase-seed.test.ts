/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import type { Element, LottieElement } from '@cg/shared-schema';
import type * as LottieBridge from '@cg/lottie-bridge';

/**
 * §4.5 (A) — a MARKER-LESS Lottie can be given phase markers from the Inspector.
 *
 * A marker-less clip resolves `introEnd = op`, so it plays once and freezes on its last
 * frame — blank, for a furniture clip that animates OFF at the end — on the canvas AND on
 * air. The Inspector used to only EXPLAIN that ("No phase markers — plays once then
 * freezes") and offer nothing, which is a control that teaches the operator nothing.
 *
 * The seed claims as little as possible: `introEnd` at the clip MIDPOINT (the frame the
 * canvas poster already picks, through the SAME shared helper) and `outroStart` at `op`
 * (degenerate — "no outro claimed", because nothing can detect where a clip animates off).
 * Both land in the editable inputs, where the operator sees and corrects them; that
 * visibility is what makes seeding legitimate where guessing in the runtime is not.
 */

const { midpointCalls } = vi.hoisted(() => ({ midpointCalls: [] as unknown[] }));

// The seed MUST route through the shared helper, not a second copy of `(ip + op) / 2`.
// Asserting two equal NUMBERS would pass against a duplicated derivation — which is
// exactly how a second derivation hides — so this asserts the shared CALL.
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

// ip 0, op 60 → midpoint 30; fr 30.
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
const { defaultLottie } = await import('../src/renderer/state/element-defaults.js');
const { ProjectStore } = await import('../src/platform/ProjectStore.js');
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

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  midpointCalls.length = 0;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('demo', 'lower-third');
  designerStore.setScene(scene, null);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  designerStore._reset();
});

function render(element: Element): void {
  act(() => {
    root.render(
      createElement(StyleSection, { element, currentFrame: 0, selectedKeyframe: null } as never),
    );
  });
}

function elById(id: string): LottieElement {
  const st = designerStore.get();
  const layer = editSceneOf(st.scene, st.activeCompositionId)!.layers[0]!;
  return layer.children.find((c) => c.id === id) as LottieElement;
}

const addButton = (): HTMLButtonElement | null =>
  [...host.querySelectorAll('button')].find((b) =>
    /add phase markers/i.test(b.textContent ?? ''),
  ) ?? null;

describe('§4.5 (A) — adding phase markers to a marker-less Lottie', () => {
  it('offers the affordance for a MARKER-LESS clip, and not for a marked one', () => {
    const markerless = defaultLottie('lot', 0, 0, 'asset-a');
    designerStore.addElement(markerless as unknown as Element);
    render(markerless as unknown as Element);
    expect(addButton()).not.toBeNull();
    // The hint that used to be the whole answer is still there — it explains WHY the
    // affordance exists. It is the offer beside it that is new.
    expect(host.textContent).toContain('No phase markers');

    const marked = defaultLottie('lot2', 0, 0, 'asset-a', {
      phases: { introEnd: 10, outroStart: 50, source: 'markers' },
    });
    render(marked as unknown as Element);
    expect(addButton()).toBeNull();
  });

  it('taking it writes MANUAL phases, seeded at the midpoint and a degenerate outro', () => {
    const el = defaultLottie('lot', 0, 0, 'asset-a');
    designerStore.addElement(el as unknown as Element);
    render(el as unknown as Element);

    act(() => addButton()!.click());

    const after = elById('lot');
    expect(after.phases).toEqual({ introEnd: 30, outroStart: 60, source: 'manual' });
    // `outroStart === op` is DEGENERATE on purpose: nothing can detect where a clip
    // animates off, so the seed claims no outro rather than inventing one.
    expect(after.phases?.outroStart).toBe(CLIP.op);
  });

  it('the seed routes through the SHARED midpoint helper, not a second derivation', () => {
    const el = defaultLottie('lot', 0, 0, 'asset-a');
    designerStore.addElement(el as unknown as Element);
    render(el as unknown as Element);
    expect(midpointCalls).toHaveLength(0);

    act(() => addButton()!.click());

    // The CALL is the assertion. A copy of `Math.round((ip + op) / 2)` would produce the
    // same 30 and leave this at zero.
    expect(midpointCalls).toHaveLength(1);
    expect(midpointCalls[0]).toMatchObject({ ip: 0, op: 60 });
  });

  it('the seeded values are EDITABLE afterwards — the guess lands where it can be corrected', () => {
    const el = defaultLottie('lot', 0, 0, 'asset-a');
    designerStore.addElement(el as unknown as Element);
    render(el as unknown as Element);
    act(() => addButton()!.click());

    // Re-render with the updated element: the manual branch now shows its inputs, and the
    // add affordance is gone.
    render(elById('lot') as unknown as Element);
    expect(addButton()).toBeNull();
    const labels = [...host.querySelectorAll('*')]
      .map((n) => n.textContent ?? '')
      .join(' ')
      .toLowerCase();
    expect(labels).toContain('intro end');
    expect(labels).toContain('outro start');
  });

  it('an UNTOUCHED marker-less clip is unchanged — nothing is written on render', () => {
    // The regression guard for §4.5's rejection of (B): the runtime's marker-less
    // fallback is untouched, and merely LOOKING at a clip in the Inspector must not
    // author phases behind the operator's back.
    const el = defaultLottie('lot', 0, 0, 'asset-a');
    designerStore.addElement(el as unknown as Element);
    const before = JSON.stringify(elById('lot'));
    render(el as unknown as Element);
    expect(JSON.stringify(elById('lot'))).toBe(before);
    expect(elById('lot').phases).toBeUndefined();
  });
});
