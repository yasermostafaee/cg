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
 *  1. **The gate lost its CONTENT half** (`design.md` §9.2 / §3.5). "Pin content start" is
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
 * The Lottie case is a REGRESSION GUARD, not a fix: `hasContentElement` already counted an
 * opted-in Lottie, so removing the gate changes nothing for it. The earlier claim that this
 * change "resolves a discrepancy" was false and is withdrawn (§8 risk 5); the test exists to
 * keep the case true, not to prove a change.
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

function shape(id: string): Element {
  return {
    ...T,
    id,
    name: id,
    type: 'shape',
    shape: 'rect',
    fill: { kind: 'solid', color: '#FF0000' },
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

const button = (re: RegExp): HTMLButtonElement | null =>
  [...host.querySelectorAll('button')].find((b) => re.test(b.textContent ?? '')) ?? null;
const click = (b: HTMLButtonElement): void => act(() => b.click());
const loopState = (): string =>
  host.querySelector<HTMLElement>('[data-testid="hold-loop-state"]')?.textContent ?? '';

describe('the loop range is authorable wherever an out-point exists', () => {
  it('a SHAPES-ONLY scene with an out-point offers "Pin content start" — the content gate is gone', () => {
    mount(scene([shape('rect-1')]));
    expect(button(/pin content start/i)).not.toBeNull();
  });

  it('and pinning writes the marker, so the affordance is real rather than merely present', () => {
    mount(scene([shape('rect-1')]));
    click(button(/pin content start/i)!);
    expect(editScene().lifecycle?.contentStart).toBeTypeOf('number');
  });

  it('a composition whose ONLY hold driver is an opted-in Lottie can pin its content start', () => {
    // REGRESSION GUARD, not a fix — this already held, because the affordance's old gate
    // counted opted-in media exactly as the canonical predicate does.
    mount(scene([holdingLottie('lot')]));
    expect(button(/pin content start/i)).not.toBeNull();
  });

  it('with NO out-point there is no loop-range surface at all — only "Add out point"', () => {
    mount(scene([tickerEl('tick')], { lifecycle: null }));
    expect(button(/pin content start/i)).toBeNull();
    expect(loopState()).toBe('');
    expect(button(/add out point/i)).not.toBeNull();
  });
});

describe('authoring a loop range never creates an out-point', () => {
  it('the loop-range surface does not call setLifecycle — pinning, and resetting to auto', () => {
    const spy = vi.spyOn(designerStore, 'setLifecycle');

    mount(scene([shape('rect-1')]));
    click(button(/pin content start/i)!);
    expect(spy).not.toHaveBeenCalled();

    // The pinned half of the surface too — "Reset to auto" is the other control on it.
    mount(scene([shape('rect-1')], { lifecycle: { outPoint: 75, contentStart: 40 } }));
    click(button(/reset to auto/i)!);
    expect(spy).not.toHaveBeenCalled();

    // The CONTROL that proves the spy discriminates: the out-point path, which is a
    // different surface and DOES write the lifecycle, exactly as it always has.
    click(button(/clear out point/i)!);
    expect(spy).toHaveBeenCalledWith(null);
  });
});

describe('the three loops are named apart, and an inert range says why', () => {
  it('ACTIVE: a content-driven hold with a real driver names the range and distinguishes the other two loops', () => {
    mount(
      scene([tickerEl('tick'), shape('rect-1')], {
        lifecycle: { outPoint: 75, contentStart: 40 },
        playout: { mode: 'auto-out', holdSource: 'content-driven' },
      }),
    );
    const text = loopState();
    expect(text).toMatch(/hold loop/i);
    expect(text).toMatch(/frames 40 → 75/);
    // The CLAIM: the content survives the repeat. This is the item, so the surface says it.
    expect(text).toMatch(/never restarts|keeps running/i);
    // And it is not either of the other two loops.
    expect(text).toMatch(/preview loop/i);
    expect(text).toMatch(/loop cycle/i);
  });

  it('INERT (no drivers): it names the MISSING DRIVER, not the hold select', () => {
    // A shapes-only scene with the select on content-driven: B-032 resolves that back to
    // `timed` everywhere, so "switch the select" would be a lie — it is already switched.
    mount(
      scene([shape('rect-1')], {
        lifecycle: { outPoint: 75, contentStart: 40 },
        playout: { mode: 'auto-out', holdSource: 'content-driven' },
      }),
    );
    const text = loopState();
    expect(text).toMatch(/no playback effect/i);
    expect(text).toMatch(/no effective hold driver/i);
    expect(text).toMatch(/ticker|sequence|countdown/i);
    // The wrong advice, explicitly excluded.
    expect(text).not.toMatch(/set hold to content-driven/i);
  });

  it('INERT (timed hold): with a real driver present it names the HOLD SOURCE as the missing condition', () => {
    mount(
      scene([tickerEl('tick'), shape('rect-1')], {
        lifecycle: { outPoint: 75, contentStart: 40 },
        playout: { mode: 'auto-out', holdSource: 'timed', holdMs: 2000 },
      }),
    );
    const text = loopState();
    expect(text).toMatch(/no playback effect/i);
    expect(text).toMatch(/hold is timed/i);
    expect(text).toMatch(/content-driven/i);
    // NOT the driver reason — this composition has one.
    expect(text).not.toMatch(/no effective hold driver/i);
  });

  it('INERT (manual): `holdSource` is ignored entirely, so the MODE is named — even with drivers and the select on content-driven', () => {
    // §9.1 correction 4: there are THREE hold states, and under `manual` there is no hold
    // source at all. Naming the select here would send the operator to a control that is
    // already correct.
    mount(
      scene([tickerEl('tick')], {
        lifecycle: { outPoint: 75, contentStart: 40 },
        playout: { mode: 'manual', holdSource: 'content-driven' },
      }),
    );
    const text = loopState();
    expect(text).toMatch(/no playback effect/i);
    expect(text).toMatch(/manual hold/i);
    expect(text).toMatch(/auto-out|loop-cycle/i);
    expect(text).not.toMatch(/no effective hold driver/i);
  });

  it('the UNPINNED range still states its frames — it is present by default, not on demand', () => {
    // No `contentStart`: the surface reports the range it WOULD loop, from the same default
    // the pin button writes, so the operator can see the loop before authoring anything.
    mount(
      scene([tickerEl('tick'), shape('rect-1')], {
        lifecycle: { outPoint: 75 },
        playout: { mode: 'auto-out', holdSource: 'content-driven' },
      }),
    );
    expect(loopState()).toMatch(/frames \d+ → 75/);
  });
});
