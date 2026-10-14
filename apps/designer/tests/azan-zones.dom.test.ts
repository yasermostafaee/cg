/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ClockElement, Element, Scene, ShapeElement } from '@cg/shared-schema';
import { ClockElementSchema } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';
import { defaultClock, defaultShape } from '../src/renderer/state/element-defaults.js';
import { StyleSection } from '../src/renderer/features/inspector/StyleSection.js';
import { ZoneOverridesSection } from '../src/renderer/features/inspector/ZoneOverridesSection.js';
import { applyAzanPreset } from '../src/renderer/features/inspector/ClockZonesSection.js';
import {
  AZAN_PRESET,
  enclosingZoneKeys,
  unmatchedZoneKeys,
} from '../src/renderer/features/inspector/zone-scope.js';
import {
  clockTargetDataKey,
  setClockTargetDataKey,
} from '../src/renderer/features/inspector/clock-data-key.js';

/**
 * 🔴 `AZAN-DESIGNER-01` (`D-141` tasks 5.9–5.11, `B-344`) — the Designer authors the Azan countdown:
 * a `timeofday` target that survives the Inspector, the 4-zone preset as ONE undo entry, per-row
 * validation, the key picker that never rewrites a custom key, the per-key unmatched warning, and the
 * data key that lets the operator set the time.
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
    'azan',
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

/** A countdown clock `c1` to 20:32 today-or-tomorrow. */
function seedCountdown(): ClockElement {
  freshScene();
  designerStore.addElement(defaultClock('c1', 0, 0));
  designerStore.updateElement('c1', {
    mode: 'countdown',
    target: { kind: 'timeofday', time: '20:32' },
  } as Partial<Element>);
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
    expect(
      q<HTMLInputElement>(host, 'input[aria-label="Countdown target time of day"]').value,
    ).toBe(
      '۲۰:۳۲', // the clock's own Digits (Persian by default)
    );
    // No date-time input is offered for it — the branch that rewrote it.
    expect(host.querySelector('input[type="datetime-local"]')).toBeNull();

    choose(q<HTMLSelectElement>(host, 'select[aria-label="blink colon"]'), 'on');
    expect(elementById<ClockElement>('c1').blinkColon).toBe(true);
    expect(elementById<ClockElement>('c1').target).toEqual({ kind: 'timeofday', time: '20:32' });
  });

  it('a time typed in Persian digits is stored canonical Latin; a value that is not a time stores nothing', () => {
    seedCountdown();
    const host = renderClock();
    type(q<HTMLInputElement>(host, 'input[aria-label="Countdown target time of day"]'), '۲۱:۰۵');
    expect(elementById<ClockElement>('c1').target).toEqual({ kind: 'timeofday', time: '21:05' });
    renderClock();
    type(
      q<HTMLInputElement>(container ?? host, 'input[aria-label="Countdown target time of day"]'),
      '25:00',
    );
    expect(elementById<ClockElement>('c1').target).toEqual({ kind: 'timeofday', time: '21:05' });
  });
});

describe('D-141 5.3 / 5.9 — the preset, validation, and the mode gate', () => {
  it('🔴 the Azan preset writes base + three steps AND the clock’s own colours as ONE undo entry', () => {
    seedCountdown();
    // An edit just before, inside the 300 ms coalescing window: the preset must not fold into it.
    designerStore.updateElement('c1', { format: 'mm:ss' } as Partial<Element>);
    applyAzanPreset(elementById<ClockElement>('c1'));
    const clock = elementById<ClockElement>('c1');
    expect(clock.zones).toEqual(AZAN_PRESET);
    expect(clock.zoneOverrides).toEqual(
      ['normal', 'caution', 'warning', 'critical'].map((zone) => ({ zone, textColor: 'zone' })),
    );
    expect(ClockElementSchema.safeParse(clock).success).toBe(true);

    designerStore.undo();
    const undone = elementById<ClockElement>('c1');
    expect(undone.zones).toBeUndefined();
    expect(undone.zoneOverrides).toBeUndefined();
    expect(undone.format).toBe('mm:ss'); // the earlier edit is its own entry
  });

  it('🔴 a threshold that is not below the step above marks THAT row only, and nothing invalid is stored', () => {
    seedCountdown();
    applyAzanPreset(elementById<ClockElement>('c1'));
    const host = renderClock();
    const rows = (): HTMLElement[] => [...host.querySelectorAll<HTMLElement>('[data-zone-step]')];
    expect(rows().map((r) => r.dataset['zoneInvalid'])).toEqual(['false', 'false', 'false']);

    // The 30-minute step set to 90 — above the 60-minute step before it.
    type(q<HTMLInputElement>(rows()[1] ?? host, 'input[aria-label="at or below"]'), '90');
    expect(rows().map((r) => r.dataset['zoneInvalid'])).toEqual(['false', 'true', 'false']);
    expect(q(host, '[data-zone-issue="1"]').textContent).toContain('Must be below 60 min');
    // The store kept the last valid zones.
    expect(elementById<ClockElement>('c1').zones).toEqual(AZAN_PRESET);

    // Fixed: stored.
    type(q<HTMLInputElement>(rows()[1] ?? host, 'input[aria-label="at or below"]'), '20');
    expect(elementById<ClockElement>('c1').zones?.steps[1]?.atOrBelowMs).toBe(20 * 60_000);
  });

  it('switching the clock away from countdown drops its zones (the schema refuses them there)', () => {
    seedCountdown();
    applyAzanPreset(elementById<ClockElement>('c1'));
    const host = renderClock();
    choose(q<HTMLSelectElement>(host, 'select[aria-label="mode"]'), 'wall');
    const clock = elementById<ClockElement>('c1');
    expect(clock.zones).toBeUndefined();
    expect(ClockElementSchema.safeParse(clock).success).toBe(true);
    renderClock();
    expect(container?.querySelector('[data-testid="clock-zones"]')).toBeNull();
  });
});

describe('D-141 5.6 / 5.10 — the zone-key picker', () => {
  it('each canonical key round-trips through the picker', () => {
    seedCountdown();
    applyAzanPreset(elementById<ClockElement>('c1'));
    const host = renderClock();
    const zoneSelect = q<HTMLSelectElement>(
      q(host, '[data-zone-step="2"]'),
      'select[aria-label="zone"]',
    );
    expect(zoneSelect.value).toBe('critical');
    choose(zoneSelect, 'caution'); // a duplicate of step 0 — marked, not stored
    expect(elementById<ClockElement>('c1').zones?.steps[2]?.key).toBe('critical');
  });

  it('🔴 a stored CUSTOM key loads as Custom with its string intact, and is never rewritten', () => {
    seedCountdown();
    designerStore.updateElement('c1', {
      zones: {
        base: { key: 'normal', color: '#00c853' },
        steps: [{ atOrBelowMs: 600_000, key: 'اذان', color: '#d50000' }],
      },
    } as Partial<Element>);
    const host = renderClock();
    const step = q(host, '[data-zone-step="0"]');
    expect(q<HTMLSelectElement>(step, 'select[aria-label="zone"]').value).toBe('custom');
    expect(q<HTMLInputElement>(step, 'input[aria-label="zone custom key"]').value).toBe('اذان');
    expect(elementById<ClockElement>('c1').zones?.steps[0]?.key).toBe('اذان');
  });
});

describe('D-141 5.5 / 5.7 / 5.11 — per-element zone colours and the per-key warning', () => {
  function seedZonedWithShape(overrides?: ShapeElement['zoneOverrides']): void {
    seedCountdown();
    designerStore.updateElement('c1', {
      zones: {
        base: { key: 'normal', color: '#00c853' },
        steps: [
          { atOrBelowMs: 1_800_000, key: 'warning', color: '#ff9100' },
          { atOrBelowMs: 600_000, key: 'danger', color: '#d50000' },
        ],
      },
    } as Partial<Element>);
    designerStore.addElement(defaultShape('s1', 0, 0));
    if (overrides !== undefined) {
      designerStore.updateElement('s1', { zoneOverrides: overrides } as Partial<Element>);
    }
  }

  it('🔴 {warning, dangre} under {warning, danger} raises EXACTLY ONE warning, naming dangre', () => {
    seedZonedWithShape([
      { zone: 'warning', fill: 'zone' },
      { zone: 'dangre', fill: 'zone' },
    ]);
    const host = render(createElement(ZoneOverridesSection, { element: elementById('s1') }));
    const warnings = [...host.querySelectorAll<HTMLElement>('[data-zone-unmatched]')];
    expect(warnings.map((w) => w.dataset['zoneUnmatched'])).toEqual(['dangre']);
    expect(warnings[0]?.textContent).toContain('normal, warning, danger');
  });

  it('a fully matched element raises none; a renamed countdown key orphans its overrides', () => {
    seedZonedWithShape([{ zone: 'danger', fill: 'zone' }]);
    const keys = (): string[] => {
      const st = designerStore.get();
      if (st.scene === null) throw new Error('no scene');
      return enclosingZoneKeys(st.scene, st.activeCompositionId);
    };
    expect(unmatchedZoneKeys(elementById('s1'), keys())).toEqual([]);
    designerStore.updateElement('c1', {
      zones: {
        steps: [{ atOrBelowMs: 600_000, key: 'critical', color: '#d50000' }],
      },
    } as Partial<Element>);
    expect(unmatchedZoneKeys(elementById('s1'), keys())).toEqual(['danger']);
    // The zones editor names the orphan at the moment of the rename.
    const host = renderClock();
    expect(q(host, '[data-zone-orphan="danger"]').textContent).toContain('1 element');
  });

  it('the section is hidden with no zoned countdown — no warning for a standalone composition', () => {
    freshScene();
    designerStore.addElement(defaultShape('s1', 0, 0));
    designerStore.updateElement('s1', {
      zoneOverrides: [{ zone: 'dangre', fill: 'zone' }],
    } as Partial<Element>);
    const host = render(createElement(ZoneOverridesSection, { element: elementById('s1') }));
    expect(host.querySelector('[data-testid="zone-overrides"]')).toBeNull();
    expect(unmatchedZoneKeys(elementById('s1'), [])).toEqual([]);
  });

  it('only the slots the kind owns are offered: a shape gets fill + stroke, never text', () => {
    seedZonedWithShape([{ zone: 'danger', fill: 'zone' }]);
    const host = render(createElement(ZoneOverridesSection, { element: elementById('s1') }));
    const slots = [...host.querySelectorAll<HTMLElement>('[data-zone-slot]')].map(
      (s) => s.dataset['zoneSlot'],
    );
    expect(slots).toEqual(['fill', 'stroke']);
  });
});

describe('D-141 5.4 — the clock’s data key', () => {
  it('creates ONE text field with the Time (HH:MM) pattern and a clock-target binding, as one undo entry', () => {
    seedCountdown();
    expect(setClockTargetDataKey('c1', 'azanTime', '20:32')).toBe(true);
    const scene = projected();
    expect(scene.fields).toContainEqual(
      expect.objectContaining({
        id: 'azanTime',
        type: 'text',
        default: '20:32',
        pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$',
      }),
    );
    expect(scene.bindings).toContainEqual({
      fieldId: 'azanTime',
      target: { kind: 'clock-target', elementId: 'c1' },
    });
    const st = designerStore.get();
    if (st.scene === null) throw new Error('no scene');
    expect(clockTargetDataKey(st.scene, 'c1')).toBe('azanTime');

    designerStore.undo();
    expect(projected().fields.some((f) => f.id === 'azanTime')).toBe(false);
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
    expect(setClockTargetDataKey('c1', 'azanTime', '20:32')).toBe(true);
    expect(setClockTargetDataKey('c1', '', '20:32')).toBe(true);
    expect(projected().bindings.some((b) => b.target.kind === 'clock-target')).toBe(false);
  });
});
