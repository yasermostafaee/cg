/** @vitest-environment jsdom */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Element, Scene } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { ValueRulesSection } from '../src/renderer/features/inspector/ValueRulesSection.js';
import { InspectorPanel } from '../src/renderer/features/inspector/InspectorPanel.js';
import { defaultShape, defaultText } from '../src/renderer/state/element-defaults.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const noUnsub = (): void => undefined;
const pending = (): Promise<never> => new Promise(() => undefined);
(window as unknown as { cg: unknown }).cg = {
  assets: {
    list: pending,
    url: () => Promise.resolve(null),
    onImported: () => noUnsub,
    onCleared: () => noUnsub,
  },
  sharedImages: {
    list: pending,
    url: () => Promise.resolve(null),
    onImported: () => noUnsub,
  },
};

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  const { scene } = new ProjectStore(new MemoryWorkspace(), new MemoryKv()).newScene(
    'rules',
    'custom',
  );
  designerStore.setScene(scene, null);
  designerStore.addField({
    id: 'temperature',
    label: 'Temperature',
    required: false,
    type: 'number',
    default: 30,
    allowedValues: [10, 20, 30],
    allowedValueLabels: { '10': 'Cold', '20': 'Mild', '30': 'Hot' },
  });
  designerStore.addElement(defaultShape('badge', 0, 0));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  designerStore._reset();
});

function scene(): Scene {
  const state = designerStore.get();
  const current = editSceneOf(state.scene, state.activeCompositionId);
  if (current === null) throw new Error('no edit scene');
  return current;
}

function element(): Element {
  const found = scene()
    .layers.flatMap((layer) => layer.children)
    .find((item) => item.id === 'badge');
  if (found === undefined) throw new Error('no badge');
  return found;
}

function render(): void {
  act(() => root.render(createElement(ValueRulesSection, { element: element(), scene: scene() })));
}

function choose(label: string, value: string, within: ParentNode = document): void {
  const select = within.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`);
  if (select === null) throw new Error(`no select ${label}`);
  act(() => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  render();
}

describe('D-139 — Value rules authoring', () => {
  it('places the compact Value rules section immediately after Dynamic / Data', () => {
    designerStore.addElement(defaultText('headline', 0, 0));
    act(() =>
      root.render(
        createElement(InspectorPanel, {
          scene: scene(),
          selection: new Set(['headline']),
          selectedKeyframe: null,
          selectedKeyframes: [],
          keyframeInspectorOpen: false,
        }),
      ),
    );
    const dynamic = host.querySelector('[aria-label="Toggle Dynamic / Data"]');
    const rules = host.querySelector('[aria-label="Toggle Value rules"]');
    if (dynamic === null || rules === null) throw new Error('expected inspector sections missing');

    expect(dynamic.closest('[data-section]')?.nextElementSibling).toBe(
      rules.closest('[data-section]'),
    );
  });

  it('authors ordered first-match rules and shows which rule the field default reaches', () => {
    render();
    expect(host.querySelector('[data-testid="value-rule-add"]')).toBeNull();
    expect(host.querySelector('[data-testid="value-rules-summary"]')?.textContent).toContain(
      'No rules',
    );
    expect(host.querySelector('[data-testid="value-rules-active"]')).toBeNull();
    act(() => host.querySelector<HTMLButtonElement>('[data-testid="value-rules-open"]')?.click());
    const add = document.querySelector<HTMLButtonElement>('[data-testid="value-rule-add"]');
    expect(add).not.toBeNull();
    act(() => add?.click());
    render();

    expect(element().valueRules).toMatchObject({
      input: { kind: 'field', fieldId: 'temperature' },
      rules: [
        {
          condition: { comparator: '=', value: 30 },
          effect: { elementId: 'badge', property: 'visible', value: true },
        },
      ],
    });
    expect(document.querySelector('[data-testid="value-rules-status"]')?.textContent).toContain(
      'rule 1',
    );
    expect(host.querySelector('[data-testid="value-rules-active"]')?.textContent).toContain(
      '1 active',
    );
    expect(host.querySelector('[data-testid="value-rules-summary"]')?.textContent).toContain(
      'Rules active',
    );

    const first = document.querySelector<HTMLElement>('[data-rule-index="0"]');
    if (first === null) throw new Error('no first rule');
    choose('Rule 1 comparison', '>=', first);
    choose('effect', 'fill', document.querySelector('[data-rule-index="0"]') ?? document);
    expect(element().valueRules?.rules[0]).toMatchObject({
      condition: { comparator: '>=', value: 30 },
      effect: { elementId: 'badge', property: 'fill' },
    });

    act(() => document.querySelector<HTMLButtonElement>('[data-testid="value-rule-add"]')?.click());
    render();
    choose('Rule 2 comparison', '<', document.querySelector('[data-rule-index="1"]') ?? document);
    act(() =>
      document.querySelector<HTMLButtonElement>('button[aria-label="Move rule 2 up"]')?.click(),
    );
    render();
    expect(element().valueRules?.rules.map((rule) => rule.condition.comparator)).toEqual([
      '<',
      '>=',
    ]);

    act(() =>
      document.querySelector<HTMLButtonElement>('button[aria-label="Delete rule 1"]')?.click(),
    );
    render();
    expect(element().valueRules?.rules).toHaveLength(1);
  });

  it('uses the bound number field choices and aliases for rule values', () => {
    render();
    act(() => host.querySelector<HTMLButtonElement>('[data-testid="value-rules-open"]')?.click());
    act(() => document.querySelector<HTMLButtonElement>('[data-testid="value-rule-add"]')?.click());
    render();

    const value = document.querySelector<HTMLSelectElement>('select[aria-label="value"]');
    expect(
      [...((value?.options ?? []) as unknown as HTMLOptionsCollection)].map((option) => [
        option.value,
        option.textContent,
      ]),
    ).toEqual([
      ['10', 'Cold'],
      ['20', 'Mild'],
      ['30', 'Hot'],
    ]);
    choose('value', '20');
    expect(element().valueRules?.rules[0]?.condition).toEqual({ comparator: '=', value: 20 });
  });
});
