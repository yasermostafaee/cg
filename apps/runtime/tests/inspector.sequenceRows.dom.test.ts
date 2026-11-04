// @vitest-environment jsdom
import { StrictMode, act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompositionFieldGroup, StackItemState } from '@cg/shared-schema';
import type { TemplateInfo } from '@cg/shared-ipc';
import { Inspector } from '../src/renderer/features/inspector/Inspector.js';
import {
  __resetDraftsForTest,
  buildApplyPayload,
  valueAt,
} from '../src/renderer/features/inspector/draftStore.js';
import {
  __resetFromFileForTest,
  attachFileSource,
} from '../src/renderer/features/inspector/fromFileStore.js';
import { fillBridgeStub } from './support/authStub.js';
import { connectionsStub, linkFor } from './support/reachability.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FIELD = {
  id: 'cities',
  type: 'list' as const,
  label: 'Cities',
  required: true,
  default: [],
  maxItems: 2,
  itemFields: [
    { id: 'city', type: 'text' as const, label: 'City', required: true, default: '' },
    {
      id: 'temperature',
      type: 'number' as const,
      label: 'Temperature',
      required: true,
      default: 0,
    },
    {
      id: 'weather',
      type: 'number' as const,
      label: 'Weather',
      required: true,
      default: 0,
      allowedValues: [0, 1, 2],
      allowedValueLabels: { '0': 'Rain', '1': 'Sun', '2': 'Cloud' },
    },
  ],
};

function page(itemId: string, item: number, field: typeof FIELD = FIELD): CompositionFieldGroup {
  return {
    instanceId: `weather:${itemId}`,
    name: `weather:${itemId}`,
    label: `Weather card — item ${String(item)}`,
    labelParts: { name: 'Weather card', item },
    compositionId: 'weather-card',
    sequence: { id: 'weather', name: 'Weather pages', itemId },
    aggregate: { fields: [field], groups: [] },
  };
}

const TEMPLATE: TemplateInfo = {
  templateId: 'weather-template',
  templateType: 'full-frame',
  fields: [],
  groups: [page('page-1', 1), page('page-2', 2)],
};

function stackItem(): StackItemState {
  return {
    itemId: 'stack-weather',
    templateId: TEMPLATE.templateId,
    status: 'loaded',
    pending: false,
    fields: {
      'weather:page-1': {
        cities: [
          { id: 'tehran', city: 'Tehran', temperature: 20, weather: 0 },
          { id: 'tabriz', city: 'Tabriz', temperature: 10, weather: 1 },
        ],
      },
      'weather:page-2': {
        cities: [{ id: 'shiraz', city: 'Shiraz', temperature: 24, weather: 1 }],
      },
    },
  };
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  __resetDraftsForTest();
  __resetFromFileForTest();
});
afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
});

async function render(
  template: TemplateInfo = TEMPLATE,
  item: StackItemState = stackItem(),
): Promise<HTMLDivElement> {
  const stub = {
    link: {
      status: () => linkFor('both-up'),
      onStatusChanged: () => () => undefined,
      resyncing: () => false,
      onResyncingChanged: () => () => undefined,
    },
    connections: connectionsStub('both-up'),
    templates: {
      get: vi.fn(() => Promise.resolve(template)),
      list: vi.fn(() => Promise.resolve([template])),
      onChanged: () => () => undefined,
    },
    fixedLayers: {
      config: () => Promise.resolve(null),
      onConfigChanged: () => () => undefined,
      state: () => Promise.resolve([]),
      onStateChanged: () => () => undefined,
    },
    stack: { setPosition: vi.fn(() => Promise.resolve({ ok: true })) },
  };
  (window as unknown as { cg: typeof stub }).cg = fillBridgeStub(stub);
  container = document.createElement('div');
  document.body.appendChild(container);
  const mountedRoot = createRoot(container);
  root = mountedRoot;
  await act(async () => {
    mountedRoot.render(
      createElement(
        StrictMode,
        null,
        createElement(Inspector, {
          item,
          onApply: () => Promise.resolve({ accepted: true }),
          onDiscard: () => undefined,
        }),
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return container;
}

describe('D-180 — one operator table for all Sequence pages', () => {
  it('flattens the page Repeaters and hides the repetitive page groups', async () => {
    const el = await render();
    const combined = el.querySelector('section[aria-label="Weather pages all rows"]');

    expect(combined).not.toBeNull();
    expect(combined?.querySelectorAll('input[aria-label*=" City"]')).toHaveLength(3);
    expect(combined?.querySelectorAll('select[aria-label*=" Weather"]')).toHaveLength(3);
    expect(el.querySelector('section[aria-label="Weather card — item 1 fields"]')).toBeNull();
    expect(combined?.textContent).toContain('2 pages · 2 per page');
    expect(combined?.textContent).toContain('Not connected');
    expect(combined?.textContent).toContain('Save and connect Excel');
    expect(combined?.textContent).not.toContain('From Excel/CSV');
    expect(combined?.querySelector('svg')).not.toBeNull();
    expect(
      combined
        ?.querySelector('input[aria-label="Cities item 1 Temperature"]')
        ?.classList.contains('cg-field'),
    ).toBe(true);
  });

  it('honours File only and keeps connection ownership in Designer', async () => {
    const fileOnlyField = {
      ...FIELD,
      allowFileSource: true,
      fileSource: { inputMode: 'file-only' as const },
    };
    const template: TemplateInfo = {
      ...TEMPLATE,
      groups: [page('page-1', 1, fileOnlyField), page('page-2', 2, fileOnlyField)],
    };
    const el = await render(template);
    const combined = el.querySelector('section[aria-label="Weather pages all rows"]');

    expect(combined).not.toBeNull();
    expect(combined?.textContent).toContain('File only');
    expect(combined?.textContent).toContain('View current data');
    expect(combined?.textContent).toContain('Not connected');
    expect(combined?.textContent).not.toContain('Save and connect Excel');
    expect(combined?.querySelector('input')).toBeNull();
    expect(combined?.querySelector('select')).toBeNull();
    expect(combined?.querySelector('button[aria-label^="Remove Cities item"]')).toBeNull();
    expect(combined?.querySelector('button[aria-label="Add Cities item"]')).toBeNull();
  });

  it('shows current File-only rows read-only and identifies an invalid legacy cell', async () => {
    const fileOnlyField = {
      ...FIELD,
      allowFileSource: true,
      fileSource: { inputMode: 'file-only' as const },
    };
    const template: TemplateInfo = {
      ...TEMPLATE,
      groups: [page('page-1', 1, fileOnlyField), page('page-2', 2, fileOnlyField)],
    };
    const item = stackItem();
    item.fields = {
      ...item.fields,
      'weather:page-1': {
        cities: [
          { id: 'tehran', city: 'Tehran', temperature: 20, weather: 9 },
          { id: 'tabriz', city: 'Tabriz', temperature: 10, weather: 1 },
        ],
      },
    };
    const el = await render(template, item);
    const view = [...el.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'View current data',
    );
    if (view === undefined) throw new Error('View current data button missing');

    await act(async () => {
      view.click();
      await Promise.resolve();
    });

    const dialog = document.querySelector('[role="dialog"][aria-label^="Current file-only data"]');
    expect(dialog?.textContent).toContain('3 rows');
    expect(dialog?.textContent).toContain('1 invalid cell');
    expect(dialog?.textContent).toContain('Sun (1)');
    const invalid = dialog?.querySelector<HTMLElement>('[aria-label^="Row 1, Weather:"]');
    expect(invalid?.textContent).toContain('9');
    expect(invalid?.textContent).toContain('Must be one of');
    expect(dialog?.querySelector('input')).toBeNull();
    expect(dialog?.querySelector('select')).toBeNull();

    const done = [...(dialog?.querySelectorAll('button') ?? [])].find(
      (button) => button.textContent?.trim() === 'Done',
    );
    if (done === undefined) throw new Error('Done button missing');
    await act(async () => {
      done.click();
      await Promise.resolve();
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(buildApplyPayload(item.itemId, item.fields)).toEqual(item.fields);
  });

  it('stages an edited flat row back into the correct page namespace', async () => {
    const el = await render();
    const city = el.querySelector<HTMLInputElement>('input[aria-label="Cities item 3 City"]');
    if (city === null) throw new Error('third city input missing');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;

    await act(async () => {
      setter?.call(city, 'Yazd');
      city.dispatchEvent(new Event('input', { bubbles: true }));
      await Promise.resolve();
    });

    const payload = buildApplyPayload('stack-weather', stackItem().fields);
    expect(valueAt(payload, ['weather:page-2', 'cities'])).toEqual([
      { id: 'shiraz', city: 'Yazd', temperature: 24, weather: 1 },
    ]);
    expect(valueAt(payload, ['weather:page-1', 'cities'])).toHaveLength(2);
  });

  it('offers the authored numeric choices and stages one in CG Control', async () => {
    const el = await render();
    const weather = el.querySelector<HTMLSelectElement>(
      'select[aria-label="Cities item 1 Weather"]',
    );
    if (weather === null) throw new Error('weather dropdown missing');
    expect([...weather.options].map((option) => option.textContent)).toEqual([
      'Rain',
      'Sun',
      'Cloud',
    ]);

    await act(async () => {
      weather.value = '2';
      weather.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });

    const payload = buildApplyPayload('stack-weather', stackItem().fields);
    expect(valueAt(payload, ['weather:page-1', 'cities'])).toEqual([
      { id: 'tehran', city: 'Tehran', temperature: 20, weather: 2 },
      { id: 'tabriz', city: 'Tabriz', temperature: 10, weather: 1 },
    ]);
  });

  it('warns when a connected workbook predates the current template schema', async () => {
    const el = await render();
    act(() => {
      attachFileSource(
        'stack-weather',
        ['$sequence-rows', 'weather'],
        {
          name: 'weather.xlsx',
          displayPath: 'weather.xlsx',
          read: () => Promise.resolve(''),
          readBytes: () => Promise.resolve(new Uint8Array()),
        },
        { split: false, delimiter: '', format: 'csv', schemaSignature: 'old-schema' },
      );
    });

    const combined = el.querySelector('section[aria-label="Weather pages all rows"]');
    expect(combined?.textContent).toContain('Connected · update file · weather.xlsx');
    expect(combined?.textContent).toContain('Excel choices may be outdated');
    expect(combined?.textContent).toContain('Reload file');
  });
});
