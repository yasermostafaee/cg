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
 * ⭐ **`B-183` / `B-184` / `B-188` — THE PLATE, THE PREFLIGHT AND THE INSPECTOR, TOGETHER.**
 *
 * ── 🔴 WHY THE FIXTURE IS A PLATE NO DECLARATION MENTIONS ────────
 *
 * **A fixture in which every plate is declared cannot see any of this**, which is exactly how
 * `B-183` shipped: the existing look tests built scenes whose plates all referenced declared
 * sources, so nothing ever exercised the disagreement between what a plate held and what a
 * group declared. Every test below therefore builds a plate whose `routeKey` is NOT in the
 * group's (now retired) declared list, and asserts the scene, the preflight and the Inspector
 * **by value, in the same test** — because the defect was never in any one of them, it was
 * in whether they agreed.
 *
 * 🔴 **`B-188` INVERTED THE ANSWER AND THE FIXTURE IS UNCHANGED, WHICH IS THE POINT.** The
 * group no longer declares sources: the list is derived from the plates, so this same plate is
 * now an ORDINARY SOURCE and `look-source-undeclared` is deleted. The fixtures still write the
 * retired `sources` array, because a scene stored before the change carries it and "the field
 * is ignored" is only asserted by a fixture that contains one.
 *
 * ── ⚠ WHAT THE MEASUREMENT KILLED, AND WHY THAT IS PINNED HERE TOO ──────
 *
 * The brief that commissioned `B-183` carried a second hypothesis: that the Inspector renders
 * the group's DECLARED list and falls back to its first option, which is why it showed `l1` for
 * an element holding `live-1`. **That was FALSE then and is unreachable now** — the control
 * shows what the element holds, and after `B-188` it is a text box that cannot substitute at
 * all. Pinned anyway: an honest control that nothing tests is one refactor from becoming a
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

const baseElProps = { opacity: 1, visible: true, locked: false, zIndex: 0 };

/**
 * A SIBLING plate holding a key — which, after `B-188`, is the only way a source exists.
 *
 * Placed clear of the plate under test at `(0, 0, 640, 360)`, so an OVERLAP refusal (a
 * different rule) can never be mistaken for this file's subject.
 */
const sibling = (id: string, routeKey: string, x: number): Element =>
  ({
    ...baseElProps,
    id,
    name: id,
    type: 'video-placeholder',
    transform: {
      position: { x, y: 0 },
      size: { w: 600, h: 340 },
      scale: { x: 1, y: 1 },
      rotation: 0,
      anchor: { x: 0, y: 0 },
    },
    routeKey,
  }) as unknown as Element;

/**
 * The keys the template already uses — deliberately NOT `live-*`, as the owner's are.
 *
 * 🔴 `B-188`: these are held by SIBLING PLATES now, not by a declaration. They are also
 * written into the group's retired `sources` array by {@link seed}, so every assertion below
 * runs against a scene that still carries the old field.
 */
const IN_USE = ['l1', 'l2'] as const;

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
function seed(plate: Element, declared: readonly string[] | null = IN_USE): void {
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
              children: [
                plate,
                // `B-188` — the keys exist because PLATES hold them.
                ...(declared ?? []).map((k, i) => sibling(`sib-${k}`, k, 660 + i * 620)),
              ],
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

/**
 * The `source id` box.
 *
 * 🔴 **`B-188` — THERE IS ONLY ONE CONTROL NOW.** It used to be a `<select>` over the
 * group's declared sources when a group existed and a text box otherwise. The group declares
 * nothing, so a picker could only ever offer what other plates already chose and there would be
 * no way to create a source at all. Typing a new key IS how one comes into existence.
 */
function sourceInput(host: HTMLElement): HTMLInputElement | null {
  return host.querySelector('input[aria-label="Live Source source id"]');
}
/** ⚠ There must be NO `<select>` here — asserted, so the picker cannot creep back. */
function sourceSelect(host: HTMLElement): HTMLSelectElement | null {
  return host.querySelector('select[aria-label="source"]');
}
/** The keys OFFERED by the field's datalist — a suggestion, never a constraint. */
function suggestionsOf(host: HTMLElement): string[] {
  const list = host.querySelector('datalist');
  return Array.from(list?.querySelectorAll('option') ?? []).map((o) => o.value);
}
/**
 * Type a value into the box and blur, which is how `TextField` commits.
 *
 * ⚠ `focusout`, not `blur`. React attaches `onBlur` to the DELEGATED `focusout` event; a
 * plain non-bubbling `blur` reaches no handler and the assertion then fails as "the commit
 * did nothing" when the commit was simply never invoked.
 */
function typeInto(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('focusout', { bubbles: true }));
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
  it('holds no routeKey, and the box is EMPTY while the keys in use are offered beside it', () => {
    seed(defaultLiveSource('p1', 0, 0) as unknown as Element);
    const el = held('p1');
    expect((el as { routeKey?: string }).routeKey).toBeUndefined();

    const host = renderStyle(el);
    const box = sourceInput(host);
    expect(box).not.toBeNull();
    // 🔴 By value: unassigned reads as an EMPTY box, and the keys the template already uses
    // are OFFERED — never substituted into the field.
    expect(box?.value).toBe('');
    expect(suggestionsOf(host)).toEqual(['l1', 'l2']);
    // 🔴 `B-188` — and there is no picker, on a template that HAS a group. A select here
    // would mean a control that cannot create the source it is being asked for.
    expect(sourceSelect(host)).toBeNull();
  });

  it('is refused with live-source-unset, and the message names the row and the remedy', () => {
    seed(defaultLiveSource('p1', 0, 0) as unknown as Element);
    const mine = issuesNow().filter((i) => i.elementId === 'p1');
    expect(mine.map((i) => i.code)).toEqual(['live-source-unset']);
    const m = mine[0]?.message ?? '';
    expect(m).toContain('has no source');
    expect(m).toContain('"source id" box');
    // `B-188` — and it says that typing a new name is legitimate, because it now is.
    expect(m).toContain('comes into existence');
    // 🔴 It must not be the old wrong messages an absent value used to produce.
    expect(m).not.toContain('not symbolic');
    expect(m).not.toContain('references source');
  });

  it('🔴 `B-188` — the message is the SAME with and without a group; there is no branch left', () => {
    seed(defaultLiveSource('p1', 0, 0) as unknown as Element);
    const withGroup = issuesNow().find((i) => i.elementId === 'p1')?.message;
    designerStore._reset();
    seedNoGroup(defaultLiveSource('p1', 0, 0) as unknown as Element);
    const without = issuesNow().find((i) => i.elementId === 'p1')?.message;
    expect(withGroup).toBe(without);
    expect(withGroup).toContain('"source id" box');
  });

  it('typing a key clears the refusal; emptying the box restores it', () => {
    seed(defaultLiveSource('p1', 0, 0) as unknown as Element);
    const box = sourceInput(renderStyle(held('p1'))) as HTMLInputElement;

    act(() => typeInto(box, 'l1'));
    expect((held('p1') as { routeKey?: string }).routeKey).toBe('l1');
    expect(issuesNow().filter((i) => i.elementId === 'p1')).toEqual([]);

    // Back to unassigned — the empty box must round-trip to `undefined`, never to `''`.
    act(() => typeInto(box, ''));
    expect((held('p1') as { routeKey?: string }).routeKey).toBeUndefined();
    expect(
      issuesNow()
        .filter((i) => i.elementId === 'p1')
        .map((i) => i.code),
    ).toEqual(['live-source-unset']);
  });

  /**
   * 🔴 **`B-188` — TYPING A KEY NOBODY ELSE USES IS HOW A SOURCE COMES INTO EXISTENCE.**
   *
   * This is the act the old model made impossible: the picker could only offer what the group
   * declared, and typing was not available at all on a template with a group. The assertion is
   * end to end — the scene holds it, the preflight is clean, and it joins the derived list.
   */
  it('🔴 typing a BRAND-NEW key is accepted and creates the source', () => {
    seed(defaultLiveSource('p1', 0, 0) as unknown as Element);
    const box = sourceInput(renderStyle(held('p1'))) as HTMLInputElement;
    act(() => typeInto(box, 'presenter'));

    expect((held('p1') as { routeKey?: string }).routeKey).toBe('presenter');
    expect(issuesNow().filter((i) => i.elementId === 'p1')).toEqual([]);
    // It is now one of the template's sources, offered to the NEXT plate.
    expect(suggestionsOf(renderStyle(held('sib-l1')))).toContain('presenter');
  });
});

describe('B-188 — the DISCRIMINATING fixture: a plate the stale declaration does not mention', () => {
  /**
   * 🔴 **THE TEST THAT INVERTED, AND THE FIXTURE THAT DID NOT.**
   *
   * This is the owner's exact situation — a plate holding `live-1` while the group's retired
   * array lists `l1`/`l2`. Under `B-183` it asserted an export-blocking `look-source-undeclared`
   * naming the declared list. Under `B-188` there IS no declared list: the same plate is an
   * ordinary source, and the assertion is that the scene, the preflight and the Inspector agree
   * about that — which is the property the file has always been for.
   */
  it('the scene, the preflight and the Inspector all say live-1, and NOTHING refuses it', () => {
    const plate = { ...defaultLiveSource('p1', 0, 0), routeKey: 'live-1' } as unknown as Element;
    seed(plate);

    // 1. what the SCENE holds
    expect((held('p1') as { routeKey?: string }).routeKey).toBe('live-1');

    // 2. what the PREFLIGHT says — nothing, and specifically not the deleted code
    expect(issuesNow().filter((i) => i.elementId === 'p1')).toEqual([]);
    expect(issuesNow().map((i) => i.code)).not.toContain('look-source-undeclared');

    // 3. what the INSPECTOR renders — the real value, unmarked, with the other keys OFFERED
    const host = renderStyle(held('p1'));
    expect(sourceInput(host)?.value).toBe('live-1');
    expect(suggestionsOf(host)).toEqual(['l1', 'l2']);
    // 🔴 The `(undeclared)` mark is GONE with the concept. A label that says a key is not
    // declared, on a template that declares nothing, would be a control telling a falsehood.
    expect(host.textContent ?? '').not.toContain('(undeclared)');
  });

  it('POSITIVE CONTROL — a plate on a key others use: no issue, and it is not offered to itself', () => {
    const plate = { ...defaultLiveSource('p1', 0, 0), routeKey: 'l1' } as unknown as Element;
    seed(plate);
    expect(issuesNow().filter((i) => i.elementId === 'p1')).toEqual([]);
    const host = renderStyle(held('p1'));
    expect(sourceInput(host)?.value).toBe('l1');
    // Its own key is filtered out of its own suggestions — offering it is offering a no-op.
    expect(suggestionsOf(host)).toEqual(['l2']);
  });

  it('the plate is NOT repaired — the scene keeps the author value', () => {
    const plate = { ...defaultLiveSource('p1', 0, 0), routeKey: 'live-1' } as unknown as Element;
    seed(plate);
    renderStyle(held('p1'));
    // Rendering the Inspector is not a write. The value is the author's.
    expect((held('p1') as { routeKey?: string }).routeKey).toBe('live-1');
  });

  /**
   * 🔴 **`B-188` condition (c) — THE TYPO TRADE, WITH THE NUDGE THAT REPLACED THE ERROR.**
   *
   * The commonest real slip is a separator or a case, which normalisation folds out — so `l-1`
   * beside `l1` is a distance-0 near miss. It is a WARNING and must stay one: `severity` is
   * asserted rather than merely the presence of a message, because an error here would recreate
   * the second copy of the truth this whole change deleted.
   */
  it('🔴 a NEAR-MISS key warns and does NOT block; a numbered sibling is silent', () => {
    const plate = { ...defaultLiveSource('p1', 0, 0), routeKey: 'l-1' } as unknown as Element;
    seed(plate);
    const near = issuesNow().filter((i) => i.code === 'live-source-near-miss');
    expect(near).toHaveLength(1);
    expect((near[0] as { severity?: string }).severity).toBe('warning');
    expect(near[0]?.message).toContain('"l1"');
    // 🔴 Nothing about it blocks: no error anywhere in the scene.
    expect(issuesNow().filter((i) => (i as { severity?: string }).severity === 'error')).toEqual(
      [],
    );

    // POSITIVE CONTROL — `l3` is the owner's own numbering convention, and must be silent.
    designerStore._reset();
    seed({ ...defaultLiveSource('p2', 0, 0), routeKey: 'l3' } as unknown as Element);
    expect(issuesNow().filter((i) => i.code === 'live-source-near-miss')).toEqual([]);
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
    // ⚠ `B-188` — an UNDECLARED plate is no longer a refusal, so this fixture is an UNSET
    // one. The subject is the colour of an export refusal, and `live-source-unset` is the
    // refusal that survived; using a plate that no longer refuses would have made the whole
    // block vanish and the assertion pass on `null`.
    seed(defaultLiveSource('p1', 0, 0) as unknown as Element);
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
