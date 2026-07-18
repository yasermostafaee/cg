/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { LottieElement, Scene } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore } from '../src/renderer/state/store.js';
import { defaultLottie } from '../src/renderer/state/element-defaults.js';
import { StyleSection } from '../src/renderer/features/inspector/StyleSection.js';
import * as lottieAssetCache from '../src/renderer/features/assets/lottieAssetCache.js';

/**
 * D-125 Phase 3a — the Lottie Inspector's TIMING guidance. design.md §D1.1 called for it
 * and Phase 1 never built it, so the operator had to convert animation frames to
 * composition frames by hand to know where to place an overlay.
 *
 * The numbers asserted here come from `lottieTiming` — the SAME helper the runtime derives
 * the entrance settle from — so a drift between "what the Inspector says" and "what plays
 * out" would fail here (see `packages/lottie-bridge/tests/timing.test.ts` for the
 * conversion itself, and `lottie-entrance-settle.test.ts` for the runtime consumption).
 *
 * The clip: `fr: 30`, 100 frames. At composition 50 fps and speed 1, an `introEnd` of 20
 * is 0.667s ⇒ composition frame 33.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ANIMATION = { ip: 0, op: 100, fr: 30, w: 480, h: 270, layers: [] };

const noUnsub = (): void => {
  /* no unsubscribe needed in tests */
};
(window as unknown as { cg: unknown }).cg = {
  assets: {
    list: () => Promise.resolve([]),
    url: () => Promise.resolve('blob:lottie'),
    onImported: () => noUnsub,
    onCleared: () => noUnsub,
  },
  sharedImages: {
    list: () => Promise.resolve([]),
    url: () => Promise.resolve(null),
    onImported: () => noUnsub,
  },
};
(globalThis as { fetch?: unknown }).fetch = () =>
  Promise.resolve({ text: () => Promise.resolve(JSON.stringify(ANIMATION)) });

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root !== null) act(() => root!.unmount());
  root = null;
  container?.remove();
  container = null;
  designerStore._reset();
  lottieAssetCache.clearAll();
});

/**
 * A scene at 50 fps with an explicit out-point, so both frame spaces are pinned.
 * `setScene` opens the first COMPOSITION, and the Inspector reads the out-point off the
 * ACTIVE document (`activeDocOf`) — so the out-point is set on the composition, which is
 * also where a real element's governing out-point lives. `frameRate` stays project-level.
 */
function sceneWith(outPoint: number): Scene {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('demo', 'custom');
  return {
    ...scene,
    frameRate: 50,
    lifecycle: { ...scene.lifecycle, outPoint },
    compositions: (scene.compositions ?? []).map((c) => ({
      ...c,
      lifecycle: { ...c.lifecycle, outPoint },
    })),
  } as Scene;
}

async function render(el: LottieElement, outPoint: number): Promise<HTMLDivElement> {
  designerStore.setScene(sceneWith(outPoint), null);
  await lottieAssetCache.prime(el.assetId);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(createElement(StyleSection, { element: el, selectedKeyframe: null })));
  return container;
}

const timingText = (c: HTMLDivElement): string =>
  c.querySelector('[data-testid="lottie-timing"]')?.textContent ?? '';
const warning = (c: HTMLDivElement): string | null =>
  c.querySelector('[data-testid="lottie-settle-warning"]')?.textContent ?? null;

const marked = (over: { speed?: number; introEnd?: number } = {}): LottieElement =>
  defaultLottie('lot', 0, 0, 'asset-1', {
    speed: over.speed ?? 1,
    phases: { introEnd: over.introEnd ?? 20, outroStart: 90, source: 'manual' },
  });

describe('D-125 Phase 3a — the Lottie Inspector timing readout', () => {
  it('shows the CLIP totals: frames, native frame rate, and duration in seconds', async () => {
    const c = await render(marked(), 90);
    const text = timingText(c);
    expect(text).toContain('100 f'); // total frames (`op`)
    expect(text).toContain('30 fps'); // native rate (`fr`)
    expect(text).toContain('3.33s'); // 100 / 30
  });

  it('shows each phase in ANIMATION frames, in SECONDS, and in THIS composition frames', async () => {
    const c = await render(marked(), 90);
    const text = timingText(c);
    // THE number the operator needs: intro 0–20 (0.67s) → frame 33 of this comp.
    expect(text).toContain('intro 0–20');
    expect(text).toContain('0.67s');
    expect(text).toContain('frame 33 of this comp');
    expect(text).toContain('hold 20–90');
    expect(text).toContain('outro 90–100');
  });

  it('LIVE-UPDATES when speed changes — speed 2 halves the derived composition frame', async () => {
    const c = await render(marked(), 90);
    expect(timingText(c)).toContain('frame 33 of this comp');
    act(() =>
      root!.render(
        createElement(StyleSection, { element: marked({ speed: 2 }), selectedKeyframe: null }),
      ),
    );
    expect(timingText(c)).toContain('frame 17 of this comp');
    expect(timingText(c)).toContain('0.33s');
  });

  it('LIVE-UPDATES when the phase values change', async () => {
    const c = await render(marked(), 90);
    act(() =>
      root!.render(
        createElement(StyleSection, { element: marked({ introEnd: 40 }), selectedKeyframe: null }),
      ),
    );
    expect(timingText(c)).toContain('intro 0–40');
    expect(timingText(c)).toContain('frame 67 of this comp'); // 40/30 = 1.333s × 50
  });

  it('WARNS, naming both numbers, when the derived settle exceeds the out-point', async () => {
    // The owner's exact case: the intro needs 33 composition frames, the out-point is 30.
    const c = await render(marked(), 30);
    const w = warning(c);
    expect(w).not.toBeNull();
    expect(w).toContain('33');
    expect(w).toContain('30');
    expect(w).toContain('extend the out-point');
  });

  it('does NOT warn when the out-point comfortably covers the intro', async () => {
    const c = await render(marked(), 90);
    expect(warning(c)).toBeNull();
  });

  it('a MARKER-LESS clip states it sets no content start, and never warns', async () => {
    const c = await render(defaultLottie('lot', 0, 0, 'asset-1'), 30);
    expect(timingText(c)).toContain('does not set the content start');
    expect(warning(c)).toBeNull();
  });
});
