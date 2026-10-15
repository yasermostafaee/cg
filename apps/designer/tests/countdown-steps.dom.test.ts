/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ClockElement, Element, Scene } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';
import { defaultClock, defaultShape } from '../src/renderer/state/element-defaults.js';
import { StyleSection } from '../src/renderer/features/inspector/StyleSection.js';
import { ElementStepsSection } from '../src/renderer/features/inspector/CountdownStepsSection.js';
import {
  governedElements,
  presetSteps,
  STEPS_PRESET_LABEL,
} from '../src/renderer/features/inspector/countdown-steps.js';
import {
  clockTargetDataKey,
  setClockTargetDataKey,
  TARGET_FIELD_LABEL,
} from '../src/renderer/features/inspector/clock-data-key.js';
import { PATTERN_PRESETS } from '../src/renderer/features/inspector/pattern-presets.js';

/**
 * 🔴 `DELTA-RUN-NEXT-VERSION-01-A` / `-B` / `-D` / `-E` / `-F` (and `D-141`'s surviving half,
 * `B-344`) — the Designer authors a countdown's STEPS: the preset as ONE undo entry and with no event's
 * name in it, per-row validation, the mode gate, the elements a step can reach and the properties a
 * kind owns, the ELEMENT's door to the same records, what the countdown does after zero, and an
 * instance that starts hidden. (Formerly `azan-zones.dom.test.ts`: D-141 v1's zone editors are
 * replaced by the steps, so their tests are replaced by these.)
 */

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

let root: Root | null = null;
let container: HTMLDivElement | null = null;
afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  designerStore._reset();
});

function freshScene(): void {
  const { scene } = new ProjectStore(new MemoryWorkspace(), new MemoryKv()).newScene(
    'countdown',
    'lower-third',
  );
  designerStore.setScene(scene, null);
}

function projected(): Scene {
  const st = designerStore.get();
  const scene = editSceneOf(st.scene, st.activeCompositionId);
  if (scene === null) throw new Error('no active composition');
  return scene;
}

function elementById<T extends Element = Element>(id: string): T {
  const el = projected().layers[0]?.children.find((c) => c.id === id);
  if (el === undefined) throw new Error(`no element ${id}`);
  return el as T;
}

/** A countdown clock `c1` to 20:32 today-or-tomorrow, and a rectangle `s1`. */
function seedCountdown(): ClockElement {
  freshScene();
  designerStore.addElement(defaultClock('c1', 0, 0));
  designerStore.updateElement('c1', {
    mode: 'countdown',
    target: { kind: 'timeofday', time: '20:32' },
  } as Partial<Element>);
  designerStore.addElement(defaultShape('s1', 100, 100));
  designerStore.markHistoryBoundary();
  return elementById<ClockElement>('c1');
}

function render(node: ReturnType<typeof createElement>): HTMLDivElement {
  if (container === null) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }
  act(() => root?.render(node));
  return container;
}

const renderClock = (): HTMLDivElement =>
  render(createElement(StyleSection, { element: elementById('c1'), selectedKeyframe: null }));

function choose(select: HTMLSelectElement, value: string): void {
  act(() => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function type(input: HTMLInputElement, value: string): void {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
}

function click(el: HTMLElement): void {
  act(() => el.click());
}

function q<T extends HTMLElement>(host: ParentNode, selector: string): T {
  const el = host.querySelector<T>(selector);
  if (el === null) throw new Error(`no ${selector}`);
  return el;
}

describe('B-344 — a timeofday target survives the Inspector', () => {
  it('🔴 loads as “time of day” with its time intact, and an unrelated edit leaves it so', () => {
    seedCountdown();
    const host = renderClock();
    expect(q<HTMLSelectElement>(host, 'select[aria-label="target"]').value).toBe('timeofday');
    // The clock's own Digits (Persian by default), one typed segment per unit (delta B §2).
    expect(
      q<HTMLInputElement>(host, 'input[aria-label="Countdown target time of day hour"]').value,
    ).toBe('۲۰');
    expect(
      q<HTMLInputElement>(host, 'input[aria-label="Countdown target time of day minute"]').value,
    ).toBe('۳۲');
    // No date-time input is offered for it — the branch that rewrote it.
    expect(host.querySelector('input[type="datetime-local"]')).toBeNull();
    expect(host.querySelector('[aria-label^="Countdown target date and time"]')).toBeNull();

    choose(q<HTMLSelectElement>(host, 'select[aria-label="blink colon"]'), 'on');
    expect(elementById<ClockElement>('c1').blinkColon).toBe(true);
    expect(elementById<ClockElement>('c1').target).toEqual({ kind: 'timeofday', time: '20:32' });
  });

  it('a time typed in Persian digits is stored canonical Latin; a value that is not a time stores nothing', () => {
    seedCountdown();
    const host = renderClock();
    type(q<HTMLInputElement>(host, 'input[aria-label="Countdown target time of day hour"]'), '۲۱');
    renderClock();
    type(
      q<HTMLInputElement>(
        container ?? host,
        'input[aria-label="Countdown target time of day minute"]',
      ),
      '۰۵',
    );
    expect(elementById<ClockElement>('c1').target).toEqual({ kind: 'timeofday', time: '21:05' });
    renderClock();
    // An hour out of range is REFUSED — never clamped into a different time.
    type(
      q<HTMLInputElement>(
        container ?? host,
        'input[aria-label="Countdown target time of day hour"]',
      ),
      '25',
    );
    expect(elementById<ClockElement>('c1').target).toEqual({ kind: 'timeofday', time: '21:05' });
  });
});

describe('-A — the preset, validation and the mode gate', () => {
  it('🔴 the preset writes three steps — each turning the countdown’s own digits — as ONE undo entry, and names no event', () => {
    seedCountdown();
    const host = renderClock();
    const preset = q<HTMLButtonElement>(host, '[data-testid="steps-preset"]');
    expect(preset.textContent).toBe(STEPS_PRESET_LABEL);
    expect(host.textContent?.toLowerCase()).not.toContain('azan');
    click(preset);
    expect(elementById<ClockElement>('c1').steps).toEqual(presetSteps('c1'));
    designerStore.undo();
    expect(elementById<ClockElement>('c1').steps).toBeUndefined();
  });

  it('🔴 a threshold that is not below the step above marks THAT row only, and nothing invalid is stored', () => {
    seedCountdown();
    designerStore.updateElement('c1', { steps: presetSteps('c1') } as Partial<Element>);
    const host = renderClock();
    const row1 = q<HTMLElement>(host, '[data-step="1"]');
    type(q<HTMLInputElement>(row1, 'input[aria-label="when"]'), '90');
    expect(q<HTMLElement>(host, '[data-step="1"]').dataset['stepInvalid']).toBe('true');
    expect(q<HTMLElement>(host, '[data-step="0"]').dataset['stepInvalid']).toBe('false');
    expect(host.querySelector('[data-step-issue="1"]')).not.toBeNull();
    // The stored steps are still the preset's.
    expect(elementById<ClockElement>('c1').steps).toEqual(presetSteps('c1'));
  });

  it('switching the clock away from countdown drops its steps and its after-zero choice', () => {
    seedCountdown();
    designerStore.updateElement('c1', {
      steps: presetSteps('c1'),
      afterZero: 'count-past',
    } as Partial<Element>);
    const host = renderClock();
    choose(q<HTMLSelectElement>(host, 'select[aria-label="mode"]'), 'wall');
    expect(elementById<ClockElement>('c1').steps).toBeUndefined();
    expect(elementById<ClockElement>('c1').afterZero).toBeUndefined();
  });
});

describe('-A — what a step can reach, and what a kind owns', () => {
  it('🔴 a countdown reaches its own composition and nested instances — never a nested composition with its own countdown, never a Live Source', () => {
    const shape = (id: string): Element => ({ ...defaultShape(id, 0, 0) }) as Element;
    const scene = {
      ...({} as Scene),
      layers: [
        {
          id: 'L',
          name: 'L',
          visible: true,
          locked: false,
          blendMode: 'normal',
          children: [
            {
              ...defaultClock('c1', 0, 0),
              mode: 'countdown',
              target: { kind: 'duration', ms: 60_000 },
              steps: { steps: [] },
            },
            shape('s1'),
            {
              ...shape('i-w'),
              id: 'i-w',
              name: 'warning',
              type: 'composition',
              compositionId: 'w',
            },
            { ...shape('i-z'), id: 'i-z', name: 'other', type: 'composition', compositionId: 'z' },
            { ...shape('live'), id: 'live', type: 'video-placeholder' },
          ],
        },
      ],
      compositions: [
        {
          id: 'w',
          name: 'w',
          layers: [
            {
              id: 'wl',
              name: 'wl',
              visible: true,
              locked: false,
              blendMode: 'normal',
              children: [shape('frame')],
            },
          ],
        },
        {
          id: 'z',
          name: 'z',
          layers: [
            {
              id: 'zl',
              name: 'zl',
              visible: true,
              locked: false,
              blendMode: 'normal',
              children: [
                {
                  ...defaultClock('c2', 0, 0),
                  mode: 'countdown',
                  target: { kind: 'duration', ms: 60_000 },
                  steps: { steps: [] },
                },
                shape('zz'),
              ],
            },
          ],
        },
      ],
    } as unknown as Scene;
    const reach = governedElements(scene, null);
    const ids = reach.map((g) => g.element.id);
    expect(ids).toEqual(expect.arrayContaining(['c1', 's1', 'i-w', 'frame', 'i-z']));
    expect(ids).not.toContain('zz');
    expect(ids).not.toContain('c2');
    expect(ids).not.toContain('live');
    expect(reach.find((g) => g.element.id === 'frame')?.path).toEqual(['warning']);
  });

  it('a change on a shape offers what a shape owns — show/hide, opacity, fill, stroke, blink — never a text colour', () => {
    seedCountdown();
    designerStore.updateElement('c1', {
      steps: {
        steps: [
          {
            name: 'Step 1',
            atMs: 60_000,
            changes: [{ elementId: 's1', property: 'fill', value: '#ff0000' }],
          },
        ],
      },
    } as Partial<Element>);
    const host = renderClock();
    const row = q<HTMLElement>(host, '[data-change="0:0"]');
    const options = [...q<HTMLSelectElement>(row, 'select[aria-label="property"]').options].map(
      (o) => o.value,
    );
    expect(options).toEqual(['visible', 'opacity', 'fill', 'stroke', 'blink']);
  });
});

describe('-B — the element’s door to the SAME change records', () => {
  it('🔴 lists every step of the countdown in order, dims the ones that change nothing here, and a change added here lands on the countdown', () => {
    seedCountdown();
    designerStore.updateElement('c1', { steps: presetSteps('c1') } as Partial<Element>);
    let host = render(createElement(ElementStepsSection, { element: elementById('s1') }));
    expect(q<HTMLElement>(host, '[data-testid="element-steps-title"]').textContent).toBe(
      'Steps of Clock',
    );
    expect(q<HTMLElement>(host, '[data-testid="element-steps-title"] bdi').textContent).toBe(
      'Clock',
    );
    const rows = [...host.querySelectorAll<HTMLElement>('[data-element-step]')];
    expect(rows.map((r) => r.dataset['elementStep'])).toEqual(['0', '1', '2']);
    expect(rows.every((r) => r.dataset['elementStepEmpty'] === 'true')).toBe(true);
    expect(rows[1]?.textContent).toContain('30 min · ≤ 30 min');

    click(q<HTMLButtonElement>(host, '[data-testid="element-steps-add-1"]'));
    // The SAME record: the countdown's step 1 now carries the change.
    const step1 = elementById<ClockElement>('c1').steps?.steps[1];
    expect(step1?.changes).toContainEqual({ elementId: 's1', property: 'visible', value: false });
    host = render(createElement(ElementStepsSection, { element: elementById('s1') }));
    expect(q<HTMLElement>(host, '[data-element-step="1"]').dataset['elementStepEmpty']).toBe(
      'false',
    );
    expect(q<HTMLElement>(host, '[data-element-step="1"]').textContent).toContain('hidden');
  });

  it('an element no countdown can reach shows no steps section at all', () => {
    freshScene();
    designerStore.addElement(defaultShape('s1', 0, 0));
    const host = render(createElement(ElementStepsSection, { element: elementById('s1') }));
    expect(host.querySelector('[data-testid="element-steps"]')).toBeNull();
  });
});

describe('-D / -E — after zero', () => {
  it('the choice is written; Close the graphic under a hold it cannot end is stated as a FACT', () => {
    seedCountdown();
    const host = renderClock();
    choose(q<HTMLSelectElement>(host, 'select[aria-label="after zero"]'), 'count-past');
    expect(elementById<ClockElement>('c1').afterZero).toBe('count-past');
    const host2 = renderClock();
    choose(q<HTMLSelectElement>(host2, 'select[aria-label="after zero"]'), 'close');
    expect(elementById<ClockElement>('c1').afterZero).toBe('close');
    const host3 = renderClock();
    // A fresh project's hold is manual — no content can end it.
    expect(host3.querySelector('[data-testid="after-zero-close-fact"]')).not.toBeNull();
    // Hold at zero is the default and is stored as nothing.
    choose(q<HTMLSelectElement>(host3, 'select[aria-label="after zero"]'), 'hold');
    expect(elementById<ClockElement>('c1').afterZero).toBeUndefined();
  });
});

describe('-F — an instance that starts hidden', () => {
  it('“Starts hidden” Yes writes startsHidden; No removes it', () => {
    freshScene();
    designerStore.addElement({
      ...(defaultShape('i1', 0, 0) as Element),
      type: 'composition',
      compositionId: 'missing',
    } as unknown as Element);
    const host = render(
      createElement(StyleSection, { element: elementById('i1'), selectedKeyframe: null }),
    );
    const row = q<HTMLElement>(host, '[data-testid="instance-starts-hidden"]');
    const yes = [...row.querySelectorAll('button')].find((b) => b.textContent === 'Yes');
    if (yes === undefined) throw new Error('no Yes');
    click(yes);
    expect((elementById('i1') as { startsHidden?: boolean }).startsHidden).toBe(true);
    const host2 = render(
      createElement(StyleSection, { element: elementById('i1'), selectedKeyframe: null }),
    );
    const no = [
      ...q<HTMLElement>(host2, '[data-testid="instance-starts-hidden"]').querySelectorAll('button'),
    ].find((b) => b.textContent === 'No');
    if (no === undefined) throw new Error('no No');
    click(no);
    // Absent and undefined are one state (the schema's optional, and JSON drops it on save).
    expect((elementById('i1') as { startsHidden?: boolean }).startsHidden).toBeUndefined();
  });
});

describe('D-141 5.4 / -C §2 — the clock’s data key', () => {
  it('creates ONE text field — the time pattern with optional seconds, labelled “Target time” — and a clock-target binding, as one undo entry', () => {
    seedCountdown();
    expect(setClockTargetDataKey('c1', 'targetTime', '20:32')).toBe(true);
    const scene = projected();
    expect(scene.fields).toContainEqual(
      expect.objectContaining({
        id: 'targetTime',
        type: 'text',
        label: TARGET_FIELD_LABEL,
        default: '20:32',
        // -C §2 widened the D-141 pattern: the countdown's own time of day takes seconds, so the
        // field that sets it does too (`20:32` still matches; `20:32:15` no longer refused).
        pattern: '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$',
      }),
    );
    expect(scene.bindings).toContainEqual({
      fieldId: 'targetTime',
      target: { kind: 'clock-target', elementId: 'c1' },
    });
    const st = designerStore.get();
    if (st.scene === null) throw new Error('no scene');
    expect(clockTargetDataKey(st.scene, 'c1')).toBe('targetTime');

    designerStore.undo();
    expect(projected().fields.some((f) => f.id === 'targetTime')).toBe(false);
    expect(projected().bindings.some((b) => b.target.kind === 'clock-target')).toBe(false);
  });

  it('a key another element owns is refused and nothing changes; clearing makes the target static', () => {
    seedCountdown();
    designerStore.addField({
      id: 'title',
      type: 'text',
      label: 'Title',
      required: false,
      default: '',
    });
    designerStore.addBinding({ fieldId: 'title', target: { kind: 'text', elementId: 'other' } });
    expect(setClockTargetDataKey('c1', 'title', '20:32')).toBe(false);
    expect(setClockTargetDataKey('c1', 'targetTime', '20:32')).toBe(true);
    expect(setClockTargetDataKey('c1', '', '20:32')).toBe(true);
    expect(projected().bindings.some((b) => b.target.kind === 'clock-target')).toBe(false);
  });
});

describe('-C §2 — the target is the operator’s by default, and the author’s target is its default', () => {
  const fieldOf = (id: string): { default?: unknown; pattern?: string } | undefined =>
    projected().fields.find((f) => f.id === id) as
      | { default?: unknown; pattern?: string }
      | undefined;

  it('🔴 switching the target to a time of day exposes `targetTime` (“Target time”) — the switch and the field ONE undo entry', () => {
    freshScene();
    designerStore.addElement(defaultClock('c1', 0, 0));
    designerStore.updateElement('c1', { mode: 'countdown' } as Partial<Element>);
    designerStore.markHistoryBoundary();
    const host = renderClock();
    choose(q<HTMLSelectElement>(host, 'select[aria-label="target"]'), 'timeofday');
    const target = elementById<ClockElement>('c1').target;
    if (target?.kind !== 'timeofday') throw new Error('not a time of day');
    expect(fieldOf('targetTime')).toEqual(
      expect.objectContaining({ label: TARGET_FIELD_LABEL, default: target.time }),
    );
    expect(projected().bindings).toContainEqual({
      fieldId: 'targetTime',
      target: { kind: 'clock-target', elementId: 'c1' },
    });
    const shown = renderClock();
    expect(q<HTMLElement>(shown, '[data-testid="clock-target-field"]').textContent).toContain(
      'targetTime',
    );
    designerStore.undo();
    expect(elementById<ClockElement>('c1').target?.kind ?? 'duration').toBe('duration');
    expect(fieldOf('targetTime')).toBeUndefined();
  });

  it('a taken `targetTime` gives the next free key; a duration exposes nothing', () => {
    freshScene();
    designerStore.addField({
      id: 'targetTime',
      type: 'text',
      label: 'x',
      required: false,
      default: '',
    });
    designerStore.addElement(defaultClock('c1', 0, 0));
    designerStore.updateElement('c1', { mode: 'countdown' } as Partial<Element>);
    const host = renderClock();
    choose(q<HTMLSelectElement>(host, 'select[aria-label="target"]'), 'timeofday');
    expect(clockTargetDataKey(designerStore.get().scene as Scene, 'c1')).toBe('targetTime2');
    renderClock();
    choose(q<HTMLSelectElement>(container ?? host, 'select[aria-label="target"]'), 'duration');
    // Back to a duration: the field stays (the author may clear the key) and nothing new appears.
    expect(projected().fields.filter((f) => f.id.startsWith('targetTime'))).toHaveLength(2);
  });

  it('🔴 every edit of the target becomes the field’s default — ONE undo entry — and a date and time re-shapes the field to ISO', () => {
    seedCountdown();
    expect(setClockTargetDataKey('c1', 'targetTime', '20:32')).toBe(true);
    designerStore.markHistoryBoundary();
    const host = renderClock();
    type(q<HTMLInputElement>(host, 'input[aria-label="Countdown target time of day hour"]'), '۲۲');
    expect(elementById<ClockElement>('c1').target).toEqual({ kind: 'timeofday', time: '22:32' });
    expect(fieldOf('targetTime')?.default).toBe('22:32');
    designerStore.undo();
    expect(elementById<ClockElement>('c1').target).toEqual({ kind: 'timeofday', time: '20:32' });
    expect(fieldOf('targetTime')?.default).toBe('20:32');

    renderClock();
    choose(q<HTMLSelectElement>(container ?? host, 'select[aria-label="target"]'), 'datetime');
    const target = elementById<ClockElement>('c1').target;
    if (target?.kind !== 'datetime') throw new Error('not a date and time');
    const field = fieldOf('targetTime');
    expect(field?.default).toBe(target.iso);
    expect(field).toEqual(
      expect.objectContaining({ pattern: PATTERN_PRESETS['datetime']?.pattern }),
    );
    expect(new RegExp((field as { pattern: string }).pattern).test(target.iso)).toBe(true);
  });

  it('an author’s own pattern is kept — only the default follows', () => {
    seedCountdown();
    expect(setClockTargetDataKey('c1', 'targetTime', '20:32')).toBe(true);
    designerStore.updateField('targetTime', { pattern: '^2[0-3]:[0-5][0-9]$' });
    const host = renderClock();
    type(q<HTMLInputElement>(host, 'input[aria-label="Countdown target time of day hour"]'), '21');
    expect(fieldOf('targetTime')).toEqual(
      expect.objectContaining({ default: '21:32', pattern: '^2[0-3]:[0-5][0-9]$' }),
    );
  });
});
