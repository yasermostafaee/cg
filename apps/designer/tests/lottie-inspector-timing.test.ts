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
 * D-125 Phase 3b-1 — the Lottie timing panel, restructured around COMP-SPACE answers.
 *
 * Phase 3a rendered every number as equal-weight prose mixing TWO frame spaces, and the
 * owner misread an animation-space marker ("outro-start 60") as a point on the comp
 * timeline. The main level now carries comp frames ONLY; animation frames are demoted
 * into a collapsed "animation details" disclosure and labelled as such.
 *
 * The clip: `fr: 30`, `op: 100`. At composition 50 fps, speed 1, phases 20/90:
 *   intro  0→20   = 0.667s → 33 comp frames   (the settle — THE decision number)
 *   hold   20→90  = 2.333s → 117 comp frames  (only meaningful when idle-looping)
 *   outro  90→100 = 0.333s → 17 comp frames   (time to clear after OUT)
 * Every figure comes from `lottieTiming`, the same helper the runtime derives the settle
 * from, so a drift between what is shown and what plays out fails here.
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

const panel = (c: HTMLDivElement): HTMLElement | null =>
  c.querySelector('[data-testid="lottie-timing"]');
/** The MAIN level = the panel minus the collapsed/expanded animation-details block. */
const mainText = (c: HTMLDivElement): string => {
  const p = panel(c)?.cloneNode(true) as HTMLElement | undefined;
  p?.querySelector('[data-testid="lottie-animation-details"]')?.remove();
  return p?.textContent ?? '';
};
const details = (c: HTMLDivElement): HTMLElement | null =>
  c.querySelector('[data-testid="lottie-animation-details"]');
const warning = (c: HTMLDivElement): string | null =>
  c.querySelector('[data-testid="lottie-settle-warning"]')?.textContent ?? null;
const disclosure = (c: HTMLDivElement): HTMLButtonElement | null => {
  const buttons = [...c.querySelectorAll('button')];
  return (buttons.find((b) => (b.textContent ?? '').includes('animation details')) ??
    null) as HTMLButtonElement | null;
};

const lottie = (
  over: { speed?: number; introEnd?: number; idleLoop?: boolean; markers?: boolean } = {},
): LottieElement => ({
  ...defaultLottie('lot', 0, 0, 'asset-1', {
    speed: over.speed ?? 1,
    phases: {
      introEnd: over.introEnd ?? 20,
      outroStart: 90,
      source: over.markers === true ? 'markers' : 'manual',
    },
  }),
  holdBehavior: over.idleLoop === true ? 'idle-loop' : 'freeze',
});

describe('D-125 Phase 3b-1 — the comp-space Lottie timing panel', () => {
  it('leads with THE decision number: the settle frame, in comp frames (33), and what to do with it', async () => {
    const c = await render(lottie(), 90);
    const text = mainText(c);
    expect(text).toContain('intro settles at frame');
    expect(text).toContain('33'); // lottieTiming: 20/30 = 0.667s x 50fps
    expect(text).toContain('put the out-point at 33 or later');
  });

  it('the settle frame is the SINGLE most-prominent element (accent + stepped-up size)', async () => {
    const c = await render(lottie(), 90);
    // Exactly one node carries the hero treatment, and it is the settle number.
    const hero = [...(panel(c)?.querySelectorAll('span') ?? [])].filter((n) =>
      /settleFrame/.test(n.className),
    );
    expect(hero).toHaveLength(1);
    expect(hero[0]?.textContent).toBe('33');
  });

  it('FREEZE shows NO hold duration — that segment never plays (the misleading Phase 3a number)', async () => {
    const c = await render(lottie(), 90);
    const text = mainText(c);
    expect(text).toContain('on hold: freezes');
    expect(text).toContain('holds until OUT');
    // 117 = the hold span in comp frames. Quoting it under freeze is the bug.
    expect(text).not.toContain('117');
    expect(text).not.toContain('loops every');
  });

  it('IDLE-LOOP shows one loop pass, where the duration IS meaningful', async () => {
    const c = await render(lottie({ idleLoop: true }), 90);
    const text = mainText(c);
    expect(text).toContain('loops every 117 comp frames');
    expect(text).toContain('2.33s');
    expect(text).not.toContain('freezes');
  });

  it('states the time to clear after OUT, and where the stage actually clears', async () => {
    const c = await render(lottie(), 90);
    const text = mainText(c);
    expect(text).toContain('after OUT: 17 comp frames');
    expect(text).toContain('0.33s');
    // out-point 90 + 17 = 107.
    expect(text).toContain('out-point 90 → stage clears at frame 107');
  });

  it('NO animation-frame numbers leak into the main level', async () => {
    const c = await render(lottie(), 90);
    const text = mainText(c);
    // The clip's native rate and its marker values belong to the collapsed details only.
    expect(text).not.toContain('30 fps');
    expect(text).not.toContain('intro-end');
    expect(text).not.toContain('outro-start');
  });

  it('animation details are COLLAPSED by default and labelled as a different frame space', async () => {
    const c = await render(lottie({ markers: true }), 90);
    expect(details(c)).toBeNull(); // absent until asked for

    const toggle = disclosure(c);
    expect(toggle).not.toBeNull();
    act(() => toggle!.click());

    const d = details(c);
    expect(d).not.toBeNull();
    const text = d?.textContent ?? '';
    expect(text).toContain('clip 100 frames @ 30 fps');
    expect(text).toContain('3.33s');
    expect(text).toContain('intro-end 20');
    expect(text).toContain('outro-start 90');
    expect(text).toContain('animation frames, not this comp');
  });

  it('WARNS, dominating the panel, when the derived settle exceeds the out-point', async () => {
    // The owner's case: the intro needs 33 comp frames, the out-point is at 30.
    const c = await render(lottie(), 30);
    const w = warning(c);
    expect(w).not.toBeNull();
    expect(w).toContain('33');
    expect(w).toContain('30');
    expect(w).toContain('extend the out-point');
  });

  it('does NOT warn when the out-point comfortably covers the intro', async () => {
    const c = await render(lottie(), 90);
    expect(warning(c)).toBeNull();
  });

  it('LIVE-UPDATES the settle when speed changes — speed 2 halves it', async () => {
    const c = await render(lottie(), 90);
    expect(mainText(c)).toContain('put the out-point at 33 or later');
    act(() =>
      root!.render(
        createElement(StyleSection, { element: lottie({ speed: 2 }), selectedKeyframe: null }),
      ),
    );
    expect(mainText(c)).toContain('put the out-point at 17 or later');
  });

  it('MANUAL phases keep their animation-frame inputs but show the comp-frame equivalent', async () => {
    const c = await render(lottie(), 90);
    // The inputs are authored in animation frames…
    expect(c.querySelector('input[aria-label="intro end"]')).not.toBeNull();
    // …so each carries what it means on THIS comp's timeline.
    expect(c.textContent).toContain('= frame 33 of this comp');
    expect(c.textContent).toContain('= 17 comp frames of outro after OUT');
  });

  it('a MARKER-LESS clip shows no decision number and never warns', async () => {
    const c = await render(defaultLottie('lot', 0, 0, 'asset-1'), 30);
    const text = mainText(c);
    expect(text).toContain('no phase markers');
    expect(text).toContain('does not set the content start');
    expect(text).not.toContain('intro settles at frame');
    expect(warning(c)).toBeNull();
  });
});
