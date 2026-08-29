/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement, Fragment } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Element, Scene } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore } from '../src/renderer/state/store.js';
import { defaultLiveSource } from '../src/renderer/state/element-defaults.js';
import { StyleSection } from '../src/renderer/features/inspector/StyleSection.js';
import { LooksSection } from '../src/renderer/features/inspector/LooksSection.js';
import * as looksCls from '../src/renderer/features/inspector/LooksSection.css.js';
import { liveSourceIssues } from '../src/renderer/state/live-source-preflight.js';
import { editSceneOf } from '../src/renderer/state/scene-doc.js';

/**
 * ⭐ **`B-183` / `B-184` — THE PLATE, THE PREFLIGHT AND THE INSPECTOR, MEASURED TOGETHER.**
 *
 * ── 🔴 WHY THE FIXTURE IS AN UNDECLARED PLATE, AND WHY THAT IS NOT OPTIONAL ──
 *
 * **A fixture in which every plate is declared cannot see any of this**, which is exactly how
 * it shipped: the existing look tests build scenes whose plates all reference declared
 * sources, so nothing ever exercised the disagreement between what a plate holds and what a
 * group declares. Every test below therefore builds a plate whose `routeKey` is NOT in its
 * group's declared list, and asserts the scene, the preflight and the Inspector **by value,
 * in the same test** — because the defect was never in any one of them, it was in whether
 * they agreed.
 *
 * ── ⚠ WHAT THE MEASUREMENT KILLED, AND WHY THAT IS PINNED HERE TOO ──────────
 *
 * The brief that commissioned this work carried a second hypothesis: that the Inspector
 * renders the group's DECLARED list and falls back to its first option, which is why it
 * showed `l1` for an element holding `live-1`. **That is FALSE and was false before this
 * change** — the select already rendered the real value labeled `(undeclared)`. It is pinned
 * below anyway: an honest control that nothing tests is one refactor from becoming a
 * dishonest one, and this is the file where that would be noticed.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const noUnsub = (): void => {
  /* no unsubscribe needed in tests */
};
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

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  designerStore._reset();
});

const src = (routeKey: string) => ({ routeKey, dynamic: false });

/** The DECLARED list for every fixture here — deliberately NOT `live-*`, as the owner's is. */
const DECLARED = ['l1', 'l2'] as const;

/**
 * A project holding ONE composition that carries both the look group and the plate.
 *
 * 🔴 **The composition, not the project scene, is where `lookGroups` has to sit — and that
 * was measured, not assumed.** The preflight runs on the EDIT scene (`App.tsx`:
 * `useIssues(editScene)`), and `editSceneOf` projects `lookGroups: c.lookGroups ?? []` — the
 * ACTIVE COMPOSITION's groups. A group parked on the project scene is therefore out of scope
 * on the surface the author is looking at, and §B.1 never runs: a first version of this
 * fixture did exactly that and the undeclared test failed with `[]`, which reads as "the
 * check is broken" and actually meant "the fixture is not the app".
 *
 * ⚠ Built explicitly rather than via `setScene` + `addElement`: `ensureCompositions` migrates
 * root layers into a composition with a TIMESTAMPED id and leaves `scene.layers` empty, which
 * is neither addressable nor reachable by the document walk.
 */
function seed(plate: Element, declared: readonly string[] | null = DECLARED): void {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('demo', 'custom');
  designerStore.setScene(
    {
      ...scene,
      layers: [],
      compositions: [
        {
          id: 'comp-main',
          name: 'Main',
          resolution: { width: 1920, height: 1080 },
          frameRange: { in: 0, out: 50 },
          editorBackdrop: 'transparent',
          layers: [
            {
              id: 'L1',
              name: 'main',
              visible: true,
              locked: false,
              blendMode: 'normal',
              children: [plate],
            },
          ],
          fields: [],
          bindings: [],
          ...(declared === null
            ? {}
            : {
                lookGroups: [
                  { id: 'g1', sources: declared.map(src), looks: [], defaultLookId: undefined },
                ],
              }),
        },
      ],
    } as unknown as Scene,
    null,
  );
  designerStore.setActiveComposition('comp-main');
}

/** A project with NO look group — the free-text `source id` path. */
function seedNoGroup(plate: Element): void {
  seed(plate, null);
}

function held(id: string): Element {
  const st = designerStore.get();
  const doc = editSceneOf(st.scene, st.activeCompositionId);
  const found = doc?.layers.flatMap((l) => l.children).find((e) => e.id === id);
  if (found === undefined) throw new Error(`no element ${id}`);
  return found;
}

function renderStyle(el: Element): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      createElement(
        Fragment,
        null,
        createElement(StyleSection, { element: el, selectedKeyframe: null }),
      ),
    ),
  );
  return container;
}

/** The `source` picker, or the free-text `source id` box when there is no group. */
function sourceSelect(host: HTMLElement): HTMLSelectElement | null {
  return host.querySelector('select[aria-label="source"]');
}
/** Every option as `value|label`, so a substitution cannot hide behind a matching label. */
function optionsOf(sel: HTMLSelectElement): string[] {
  return Array.from(sel.options).map((o) => `${o.value}|${o.textContent ?? ''}`);
}

/** The same edit scene the app renders and preflights — see {@link issuesNow}. */
function editScene(): Scene {
  const st = designerStore.get();
  const edit = editSceneOf(st.scene, st.activeCompositionId);
  if (edit === null) throw new Error('no active composition');
  return edit;
}

/**
 * The issues the APP would show — computed on the EDIT scene, exactly as `App.tsx` does
 * (`useIssues(editScene)`). Running this on the project scene instead would leave `layers`
 * empty and `lookGroups` unprojected, so every group-scope rule would silently return
 * nothing and each assertion below would pass or fail for the wrong reason.
 */
function issuesNow(): readonly { code: string; message: string; elementId?: string }[] {
  return liveSourceIssues(editScene()) as readonly {
    code: string;
    message: string;
    elementId?: string;
  }[];
}

describe('B-183 — a new plate is created UNASSIGNED', () => {
  it('holds no routeKey, and the Inspector offers the unassigned state as its own option', () => {
    seed(defaultLiveSource('p1', 0, 0) as unknown as Element);
    const el = held('p1');
    expect((el as { routeKey?: string }).routeKey).toBeUndefined();

    const sel = sourceSelect(renderStyle(el));
    expect(sel).not.toBeNull();
    // 🔴 By value: the unassigned sentinel is SELECTED and labeled, and the declared options
    // are offered beside it — never selected in its place.
    expect(sel?.value).toBe('');
    expect(optionsOf(sel as HTMLSelectElement)).toEqual(['|— no source —', 'l1|l1', 'l2|l2']);
  });

  it('is refused with live-source-unset, and the message names the picker', () => {
    seed(defaultLiveSource('p1', 0, 0) as unknown as Element);
    const mine = issuesNow().filter((i) => i.elementId === 'p1');
    expect(mine.map((i) => i.code)).toEqual(['live-source-unset']);
    const m = mine[0]?.message ?? '';
    expect(m).toContain('has no source');
    // B3 — WITH a group the remedy is the picker, and the message says so.
    expect(m).toContain('"source" list');
    expect(m).not.toContain('"source id" box');
    // 🔴 It must not be the old wrong messages an absent value used to produce.
    expect(m).not.toContain('not symbolic');
    expect(m).not.toContain('references source');
  });

  it('names the FREE-TEXT row instead when the template declares no group', () => {
    seedNoGroup(defaultLiveSource('p1', 0, 0) as unknown as Element);
    const mine = issuesNow().filter((i) => i.elementId === 'p1');
    expect(mine.map((i) => i.code)).toEqual(['live-source-unset']);
    expect(mine[0]?.message).toContain('"source id" box');
    expect(mine[0]?.message).not.toContain('"source" list');
  });

  it('choosing a declared source clears the refusal; choosing no source restores it', () => {
    seed(defaultLiveSource('p1', 0, 0) as unknown as Element);
    const sel = sourceSelect(renderStyle(held('p1'))) as HTMLSelectElement;

    act(() => {
      sel.value = 'l1';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect((held('p1') as { routeKey?: string }).routeKey).toBe('l1');
    expect(issuesNow().filter((i) => i.elementId === 'p1')).toEqual([]);

    // Back to unassigned — the sentinel must round-trip to `undefined`, never to `''`.
    act(() => {
      sel.value = '';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect((held('p1') as { routeKey?: string }).routeKey).toBeUndefined();
    expect(
      issuesNow()
        .filter((i) => i.elementId === 'p1')
        .map((i) => i.code),
    ).toEqual(['live-source-unset']);
  });
});

describe('B-183 — the DISCRIMINATING fixture: a plate the group does not declare', () => {
  /**
   * 🔴 THE ONE TEST THE BRIEF ASKED FOR: scene, preflight and Inspector, by value, together.
   * This is the owner's exact situation — a plate holding `live-1` under a group declaring
   * `l1`/`l2` — and it is the shape a fixture of all-declared plates can never produce.
   */
  it('the scene, the preflight and the Inspector all say live-1 — none of them substitutes', () => {
    const plate = { ...defaultLiveSource('p1', 0, 0), routeKey: 'live-1' } as unknown as Element;
    seed(plate);

    // 1. what the SCENE holds
    expect((held('p1') as { routeKey?: string }).routeKey).toBe('live-1');

    // 2. what the PREFLIGHT says — by value, including the declared list and the remedy
    const mine = issuesNow().filter((i) => i.elementId === 'p1');
    expect(mine.map((i) => i.code)).toEqual(['look-source-undeclared']);
    const m = mine[0]?.message ?? '';
    expect(m).toContain('references source "live-1"');
    expect(m).toContain('Declared sources: "l1", "l2"');
    // B3 — BOTH legitimate remedies are named: fix the plate, or declare the name.
    expect(m).toContain('"source" list');
    expect(m).toContain('declare it with "+ Source" in the Looks panel');

    // 3. what the INSPECTOR renders — the real value, marked, and NOT replaced by `l1`
    const sel = sourceSelect(renderStyle(held('p1'))) as HTMLSelectElement;
    expect(sel.value).toBe('live-1');
    expect(optionsOf(sel)).toEqual(['live-1|live-1 (undeclared)', 'l1|l1', 'l2|l2']);
  });

  it('POSITIVE CONTROL — a declared plate: no issue, no marking, no extra option', () => {
    const plate = { ...defaultLiveSource('p1', 0, 0), routeKey: 'l1' } as unknown as Element;
    seed(plate);
    expect(issuesNow().filter((i) => i.elementId === 'p1')).toEqual([]);
    const sel = sourceSelect(renderStyle(held('p1'))) as HTMLSelectElement;
    expect(sel.value).toBe('l1');
    expect(optionsOf(sel)).toEqual(['l1|l1', 'l2|l2']);
  });

  it('the undeclared plate is NOT repaired — the scene keeps the author value', () => {
    const plate = { ...defaultLiveSource('p1', 0, 0), routeKey: 'live-1' } as unknown as Element;
    seed(plate);
    renderStyle(held('p1'));
    // Rendering the Inspector is not a write. The value is the author's to fix.
    expect((held('p1') as { routeKey?: string }).routeKey).toBe('live-1');
  });
});

describe('B-184 — an export refusal is drawn in danger, not caution', () => {
  function renderLooks(): HTMLDivElement {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const scene = editScene();
    act(() => {
      root?.render(createElement(LooksSection, { scene }));
    });
    return container;
  }

  it('the issue block uses issueSummary + issue, and neither is groupLabel', () => {
    const plate = { ...defaultLiveSource('p1', 0, 0), routeKey: 'live-1' } as unknown as Element;
    seed(plate);
    const host = renderLooks();

    const block = host.querySelector('[aria-label="Look issues"]');
    expect(block).not.toBeNull();
    const summary = block?.querySelector('p');
    expect(summary?.textContent).toContain('export will refuse');
    /*
      🔴 Asserted against the STYLE IDENTITY, not a colour string. vanilla-extract compiles
      `colors.danger` away at build time, so a test reading a hex would be asserting the
      bundler's output; the meaningful invariant is that the summary uses the dedicated
      danger-coloured class and NOT the neutral `groupLabel` it used to share with every
      other heading in this panel.
    */
    expect(summary?.className).toBe(looksCls.issueSummary);
    expect(summary?.className).not.toBe(looksCls.groupLabel);
    const rows = Array.from(block?.querySelectorAll('p') ?? []).slice(1);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.className).toBe(looksCls.issue);
  });

  it('an UNASSIGNED plate still reaches this panel — the split did not shrink it', () => {
    seed(defaultLiveSource('p1', 0, 0) as unknown as Element);
    expect(renderLooks().textContent ?? '').toContain('has no source');
  });
});
