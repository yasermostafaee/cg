/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Element, Playout, Scene } from '@cg/shared-schema';

/**
 * 🔴 `TIMING-BUILD-21` §4 — THE DESIGNER AUTHORS `repeat` AND `delayMs`.
 *
 * `repeat` was declared on the schema but had no authoring control anywhere: it was written
 * only by the preview's SESSION override, so a designer could rehearse a three-pass loop and
 * export a template that stored nothing. `delayMs` is new. Both now live beside `mode` and
 * `hold ms` in the Playout section, through the SAME writer (`setPlayout`) — no second path.
 *
 * ⚠ The ownership MARKING is asserted here too, and it is not decoration. The panel holds two
 * kinds of field (ADR 0009) and an author who believes an overridable value is guaranteed
 * designs against a promise nobody made. The marks are HEADINGS OVER THEIR GROUPS: rendered as
 * trailing footnotes they sat above the wrong fields and read as introducing them.
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

function scene(playout?: Playout): Scene {
  return {
    schemaVersion: 1,
    id: 'scene-1',
    name: 'main',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 25,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 100 },
    lifecycle: { outPoint: 75 },
    ...(playout !== undefined ? { playout } : {}),
    editorBackdrop: 'transparent',
    layers: [
      {
        id: 'L1',
        name: 'l',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [shape('s1')],
      },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-09-15T00:00:00.000Z', updatedAt: '2026-09-15T00:00:00.000Z' },
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

function editScene(): Scene {
  const st = designerStore.get();
  return editSceneOf(st.scene, st.activeCompositionId)!;
}

/**
 * Re-render from the store's CURRENT edit scene. `InspectorPanel` subscribes, so the real panel
 * re-renders after every write; a one-shot render would leave the controls showing the scene as
 * it was at mount and a second interaction would act on stale props.
 */
function rerender(): void {
  act(() => {
    root.render(createElement(PlayoutSection, { scene: editScene() }));
  });
}

function mount(s: Scene): void {
  designerStore.setScene(s, null);
  rerender();
}

const byLabel = (label: string): HTMLInputElement | null =>
  host.querySelector<HTMLInputElement>(`[aria-label="${label}"]`);

/**
 * Type a number into a `RealtimeNumberInput` and commit it.
 *
 * ⚠ The value MUST go through the native setter. React tracks the last value it wrote on the
 * DOM node, and assigning `el.value` directly leaves that tracker in step — so the synthetic
 * `change` never fires and the commit silently does nothing, which reads in a test exactly like
 * a broken writer. (A bare blur commits nothing either, deliberately: `B-180` pins that a
 * rounded display can never be written back.)
 */
function commit(label: string, value: string): void {
  const el = byLabel(label);
  if (el === null) throw new Error(`no control labelled "${label}"`);
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  act(() => {
    setter?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => el.dispatchEvent(new FocusEvent('blur', { bubbles: true })));
  rerender();
}

function clickLabel(label: string): void {
  const el = byLabel(label);
  if (el === null) throw new Error(`no control labelled "${label}"`);
  act(() => el.click());
  rerender();
}

const storedPlayout = (): Playout | undefined => editScene().playout;
const text = (): string => host.textContent ?? '';

describe('TIMING-BUILD-21 §4 — repeat and delay have an authored home', () => {
  it('both controls appear for loop-cycle, beside mode and hold ms', () => {
    mount(scene({ mode: 'loop-cycle' } as Playout));
    expect(byLabel('Repeat passes') ?? byLabel('Repeat forever')).not.toBeNull();
    expect(byLabel('Delay between passes in milliseconds')).not.toBeNull();
  });

  it('neither appears for auto-out — one pass has no count and no gap between passes', () => {
    // A gap BETWEEN passes is meaningless where there is only ever one pass; offering it would
    // be a dead control, which is the same rule the hold-source select already follows.
    mount(scene({ mode: 'auto-out' } as Playout));
    expect(byLabel('Repeat passes')).toBeNull();
    expect(byLabel('Repeat forever')).toBeNull();
    expect(byLabel('Delay between passes in milliseconds')).toBeNull();
  });

  it('the delay writes STORED playout.delayMs through setPlayout', () => {
    mount(scene({ mode: 'loop-cycle' } as Playout));
    commit('Delay between passes in milliseconds', '2000');
    expect(storedPlayout()?.delayMs, 'the authored gap must reach the stored document').toBe(2000);
  });

  it('zero is a legal delay and is STORED, not treated as absent', () => {
    // Absent means "inheriting the default"; an explicit 0 means "this template wants no gap".
    // Collapsing the two would make the author unable to state the second.
    mount(scene({ mode: 'loop-cycle', delayMs: 2000 } as Playout));
    commit('Delay between passes in milliseconds', '0');
    expect(storedPlayout()?.delayMs).toBe(0);
  });

  it('the repeat count writes STORED playout.repeat', () => {
    mount(scene({ mode: 'loop-cycle', repeat: 3 } as Playout));
    commit('Repeat passes', '5');
    expect(storedPlayout()?.repeat).toBe(5);
  });

  it('the infinite checkbox stores the literal, and unticking it stores a count', () => {
    mount(scene({ mode: 'loop-cycle', repeat: 3 } as Playout));
    clickLabel('Repeat forever');
    expect(storedPlayout()?.repeat).toBe('infinite');
    clickLabel('Repeat forever');
    expect(storedPlayout()?.repeat).toBe(1);
  });

  it('an UNAUTHORED repeat rests on infinite without writing anything', () => {
    // The control shows the DEFAULT `repeatOf` would resolve, so it does not lie about what the
    // template will do — but it must not write that value on render, or every composition
    // anybody opened would acquire an authored count it never had.
    mount(scene({ mode: 'loop-cycle' } as Playout));
    expect((byLabel('Repeat forever') as HTMLInputElement).checked).toBe(true);
    expect(storedPlayout()?.repeat, 'rendering must not author a value').toBeUndefined();
  });
});

describe('TIMING-BUILD-21 §4 — the panel marks its two ownerships', () => {
  it('says which fields are the template’s and which the operator may override', () => {
    mount(scene({ mode: 'loop-cycle' } as Playout));
    expect(text()).toMatch(/Set by the template/i);
    expect(text()).toMatch(/Operator can override per row/i);
  });

  it('the operator-override mark introduces the group, never trails the wrong one', () => {
    // ORDER IS THE CLAIM. Each mark must precede the fields it covers: as a trailing line the
    // template mark sat directly above the overridable inputs and read as introducing them.
    mount(scene({ mode: 'loop-cycle' } as Playout));
    const body = text();
    const templateMark = body.indexOf('Set by the template');
    const operatorMark = body.indexOf('Operator can override per row');
    expect(templateMark).toBeGreaterThanOrEqual(0);
    expect(operatorMark).toBeGreaterThan(templateMark);
    // `delay ms` is an overridable field, so it must come AFTER the operator mark.
    expect(body.indexOf('delay ms')).toBeGreaterThan(operatorMark);
  });

  it('states that the delay never delays the first showing', () => {
    // ADR 0009's operational reason: a press whose result is invisible gets repeated. The panel
    // says so where the field is authored, not only in a doc nobody reads at 22:58.
    mount(scene({ mode: 'loop-cycle' } as Playout));
    expect(text()).toMatch(/never delays the first showing/i);
  });

  it('no longer claims repeat is tuned live in the preview', () => {
    // That sentence was false the moment the field got an authored home.
    mount(scene({ mode: 'loop-cycle' } as Playout));
    expect(text()).not.toMatch(/tuned live in the preview/i);
  });
});
