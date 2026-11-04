/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Element, Playout, Scene } from '@cg/shared-schema';

/**
 * D-133 §1 — AUTHORING THE HOLD LOOP RANGE.
 *
 * Three things are pinned here, and they are three different claims:
 *
 *  1. **The gate lost its CONTENT half** (`design.md` §9.2 / §3.5). "Set hold start" is
 *     offered on every composition with an out-point, shapes-only scenes included — the
 *     loop range is the two shipped markers and needs no ticker to mean something.
 *  2. **The out-point path is UNCHANGED, deliberately.** §9.2 settled that authoring a loop
 *     range must never create an out-point as a side effect, because creating one is not a
 *     marker edit: it moves the composition out of `static` and gives it an animated OUT
 *     segment where it used to hard-cut on stop. That is a decision to make NO change, so
 *     it carries a test rather than a comment — the loop-range surface never calls
 *     `setLifecycle`.
 *  3. **An inert range EXPLAINS ITSELF** (§9.1, the rule now settled three times over). The
 *     assertions read what the surface CLAIMS — which condition it names — not that some
 *     hint rendered. A hint that rendered the wrong reason would pass a presence check and
 *     teach the operator the wrong fix.
 *
 * The Lottie case is a REGRESSION GUARD, not a fix: the former content-presence gate already
 * counted an opted-in Lottie, so removing that gate changed nothing for it. The earlier claim
 * that this change "resolves a discrepancy" was false and is withdrawn (§8 risk 5); the test
 * exists to keep the case true, not to prove a change.
 */

const { designerStore, editSceneOf } = await import('../src/renderer/state/store.js');
const { PlayoutSection } = await import('../src/renderer/features/inspector/PlayoutSection.js');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

function shape(id: string, timed = false): Element {
  return {
    ...T,
    id,
    name: id,
    type: 'shape',
    shape: 'rect',
    fill: { kind: 'solid', color: '#FF0000' },
    ...(timed ? { lifespan: { in: 0, out: 100 } } : {}),
  } as unknown as Element;
}

function tickerEl(id: string): Element {
  return {
    ...T,
    id,
    name: id,
    type: 'ticker',
    font: { family: 'Vazirmatn', weight: 500, style: 'normal', size: 24, lineHeight: 1.4 },
    color: '#FFFFFF',
    direction: 'rtl',
    speed: 100,
    gap: 10,
    repeat: 'infinite',
    cycleBoundary: 'seamless',
    items: [{ id: 'a', text: 'headline' }],
  } as unknown as Element;
}

/** A Lottie OPTED IN to drive the hold — media `drivesHold` is `=== true`, the inverse default. */
function holdingLottie(id: string): Element {
  return {
    ...T,
    id,
    name: id,
    type: 'lottie',
    assetId: 'asset-a',
    speed: 1,
    loopMode: 'none',
    holdBehavior: 'freeze',
    drivesHold: true,
  } as unknown as Element;
}

function scene(
  children: Element[],
  o: { lifecycle?: object | null; playout?: Playout } = {},
): Scene {
  return {
    schemaVersion: 1,
    id: 'scene-1',
    name: 'main',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 25,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 100 },
    ...(o.lifecycle !== null ? { lifecycle: o.lifecycle ?? { outPoint: 75 } } : {}),
    ...(o.playout !== undefined ? { playout: o.playout } : {}),
    editorBackdrop: 'transparent',
    layers: [{ id: 'L1', name: 'l', visible: true, locked: false, blendMode: 'normal', children }],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-08-14T00:00:00.000Z', updatedAt: '2026-08-14T00:00:00.000Z' },
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
  vi.restoreAllMocks();
  designerStore._reset();
});

/**
 * Mount the panel the way `InspectorPanel` does — on the store's resolved EDIT scene, not
 * on the literal handed to `setScene`, which folds root layers into an entry composition.
 * The document the store's writers mutate is that composition, so rendering the pre-fold
 * literal would leave every write assertion reading the wrong object (and passing for the
 * wrong reason: the panel would render fine and the marker would land elsewhere).
 */
function editScene(): Scene {
  const st = designerStore.get();
  return editSceneOf(st.scene, st.activeCompositionId)!;
}

function mount(s: Scene): void {
  designerStore.setScene(s, null);
  act(() => {
    root.render(createElement(PlayoutSection, { scene: editScene() }));
  });
}

function rerender(): void {
  act(() => {
    root.render(createElement(PlayoutSection, { scene: editScene() }));
  });
}

const button = (re: RegExp): HTMLButtonElement | null =>
  [...host.querySelectorAll('button')].find((b) =>
    re.test(b.getAttribute('aria-label') ?? b.textContent ?? ''),
  ) ?? null;
const click = (b: HTMLButtonElement): void => act(() => b.click());
const choose = (select: HTMLSelectElement, value: string): void => {
  act(() => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
};
const loopState = (): string =>
  host.querySelector<HTMLElement>('[data-testid="hold-loop-state"]')?.textContent ?? '';
const holdLoopHelp = (): string => {
  const tip = host.querySelector<HTMLButtonElement>(
    '[data-testid="hold-loop-state"] [data-testid="info-tip"]',
  );
  expect(tip).not.toBeNull();
  click(tip!);
  return document.body.querySelector('[role="dialog"]')?.textContent ?? '';
};

describe('the loop range is authorable wherever an out-point exists', () => {
  it('a SHAPES-ONLY scene with an Outro start offers "Set hold start"', () => {
    mount(scene([shape('rect-1')]));
    expect(button(/set hold start/i)).not.toBeNull();
  });

  it('and pinning writes the marker, so the affordance is real rather than merely present', () => {
    mount(scene([shape('rect-1')]));
    click(button(/set hold start/i)!);
    expect(editScene().lifecycle?.contentStart).toBeTypeOf('number');
  });

  it('a composition whose ONLY hold driver is an opted-in Lottie can pin its content start', () => {
    // REGRESSION GUARD, not a fix — this already held, because the affordance's old gate
    // counted opted-in media exactly as the canonical predicate does.
    mount(scene([holdingLottie('lot')]));
    expect(button(/set hold start/i)).not.toBeNull();
  });

  it('with NO Outro start there is no loop-range surface — only "Set outro start"', () => {
    mount(scene([tickerEl('tick')], { lifecycle: null }));
    expect(button(/set hold start/i)).toBeNull();
    expect(loopState()).toBe('');
    expect(button(/set outro start/i)).not.toBeNull();
  });
});

describe('authoring a loop range never creates an out-point', () => {
  it('the loop-range surface does not call setLifecycle — setting and clearing Hold start', () => {
    const spy = vi.spyOn(designerStore, 'setLifecycle');

    mount(scene([shape('rect-1')]));
    click(button(/set hold start/i)!);
    expect(spy).not.toHaveBeenCalled();

    // The explicit half of the surface too — Clear returns Hold start to its derived value.
    mount(scene([shape('rect-1')], { lifecycle: { outPoint: 75, contentStart: 40 } }));
    click(button(/clear hold start/i)!);
    expect(spy).not.toHaveBeenCalled();

    // The CONTROL that proves the spy discriminates: the out-point path, which is a
    // different surface and DOES write the lifecycle, exactly as it always has.
    click(button(/clear outro start/i)!);
    expect(spy).toHaveBeenCalledWith(null);
  });
});

describe('composition-owned Hold behaviour (D-187)', () => {
  it('Freeze is explicit and keeps the settled out-point picture', () => {
    mount(
      scene([shape('rect-1', true)], {
        lifecycle: { outPoint: 75, contentStart: 40 },
        playout: { mode: 'manual', holdBehavior: 'freeze' },
      }),
    );
    expect(loopState()).toMatch(/^freeze/i);
    expect(loopState()).toMatch(/hold at frame 75/i);
    expect(host.querySelector('[aria-label="rect-1 repeats during Hold"]')).toBeNull();
  });

  it.each([
    ['manual', undefined],
    ['auto-out', 'timed'],
    ['auto-out', 'content-driven'],
    ['loop-cycle', 'timed'],
  ] as const)('Loop middle is active for %s / %s Hold', (mode, holdSource) => {
    mount(
      scene([tickerEl('tick'), shape('rect-1', true)], {
        lifecycle: { outPoint: 75, contentStart: 40 },
        playout: {
          mode,
          holdBehavior: 'loop',
          ...(holdSource === undefined ? {} : { holdSource }),
        },
      }),
    );
    expect(loopState()).toMatch(/^loop/i);
    expect(loopState()).toMatch(/middle frames 40 → 75/i);
  });

  it('an empty Middle range is reported as empty', () => {
    mount(
      scene([shape('rect-1', true)], {
        lifecycle: { outPoint: 38, contentStart: 38 },
        playout: { mode: 'manual', holdBehavior: 'loop' },
      }),
    );
    expect(loopState()).toMatch(/^empty/i);
    expect(loopState()).toMatch(/frames 38 → 38/);
    expect(holdLoopHelp()).toMatch(/nothing to replay/i);
  });

  it('the unpinned Middle range still states the effective frames', () => {
    mount(
      scene([shape('rect-1', true)], {
        lifecycle: { outPoint: 75 },
        playout: { mode: 'manual', holdBehavior: 'loop' },
      }),
    );
    expect(loopState()).toMatch(/frames \d+ → 75/);
  });

  it('lists only loop-capable picture elements and persists unchecked elements as one-shot', () => {
    mount(
      scene([shape('Plate', true), holdingLottie('Sting'), tickerEl('Crawl')], {
        lifecycle: { outPoint: 75, contentStart: 40 },
        playout: { mode: 'manual', holdBehavior: 'loop' },
      }),
    );

    const plate = host.querySelector<HTMLInputElement>('[aria-label="Plate repeats during Hold"]');
    const sting = host.querySelector<HTMLInputElement>('[aria-label="Sting repeats during Hold"]');
    expect(plate?.checked).toBe(true);
    expect(sting?.checked).toBe(true);
    expect(host.querySelector('[aria-label="Crawl repeats during Hold"]')).toBeNull();

    act(() => plate!.click());
    expect(editScene().playout?.holdLoopElementIds).toEqual(['Sting']);
  });

  it('changing the composition selector reveals and hides the repeat checklist immediately', () => {
    mount(
      scene([shape('Plate', true)], {
        lifecycle: { outPoint: 75, contentStart: 40 },
        playout: { mode: 'manual', holdBehavior: 'freeze' },
      }),
    );
    const select = host.querySelector<HTMLSelectElement>('[aria-label="On hold"]');
    expect(select?.value).toBe('freeze');
    choose(select!, 'loop');
    rerender();
    expect(host.querySelector('[aria-label="Plate repeats during Hold"]')).not.toBeNull();
    choose(host.querySelector<HTMLSelectElement>('[aria-label="On hold"]')!, 'freeze');
    rerender();
    expect(host.querySelector('[aria-label="Plate repeats during Hold"]')).toBeNull();
  });
});
