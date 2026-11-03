/** @vitest-environment jsdom */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { DynamicField, ListItem } from '@cg/shared-schema';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ListFieldEditor } from '../src/renderer/features/inspector/ListFieldEditor.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FIELD: DynamicField = {
  id: 'weather',
  type: 'list',
  label: 'Weather',
  required: false,
  default: [],
  itemFields: [
    { id: 'city', type: 'text', label: 'City', required: true, default: 'Tehran' },
    { id: 'temperature', type: 'number', label: 'Temperature', required: false, default: 20 },
    {
      id: 'icon',
      type: 'image',
      label: 'Icon',
      required: false,
      accept: ['png'],
      defaultAssetId: 'img-01',
      assetOptions: [
        { assetId: 'img-01', label: 'sunny.png' },
        { assetId: 'img-02', label: 'rain.png' },
      ],
    },
  ],
};

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
});

function render(value: ListItem[], onStage: (next: ListItem[]) => void): HTMLDivElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root?.render(
      createElement(ListFieldEditor, {
        fieldId: 'weather',
        field: FIELD,
        value,
        onStage,
      }),
    ),
  );
  return host;
}

describe('D-180 — structured Repeater rows in CG Control', () => {
  it('renders one typed control per child field and seeds a new row from child defaults', () => {
    const onStage = vi.fn<(next: ListItem[]) => void>();
    const el = render(
      [{ id: 'row-1', city: 'Shiraz', temperature: 27, icon: { assetId: 'img-02' } }],
      onStage,
    );

    expect(
      el.querySelector<HTMLInputElement>('input[aria-label="weather item 1 City"]')?.value,
    ).toBe('Shiraz');
    expect(
      el.querySelector<HTMLInputElement>('input[aria-label="weather item 1 Temperature"]')?.value,
    ).toBe('27');
    const picture = el.querySelector<HTMLSelectElement>('select[aria-label="weather item 1 Icon"]');
    expect(picture?.value).toBe('img-02');
    expect(picture?.selectedOptions[0]?.textContent).toBe('rain.png');
    expect(el.querySelector('textarea[aria-label="weather item 1"]')).toBeNull();

    act(() =>
      el.querySelector<HTMLButtonElement>('button[aria-label="Add weather item"]')?.click(),
    );
    const next = onStage.mock.calls.at(-1)?.[0] ?? [];
    expect(next[1]).toMatchObject({
      city: 'Tehran',
      temperature: 20,
      icon: { assetId: 'img-01' },
    });
  });

  it('stages the canonical image object while the operator only sees filenames', () => {
    const onStage = vi.fn<(next: ListItem[]) => void>();
    const el = render([{ id: 'row-1', city: 'Tehran', icon: { assetId: 'img-01' } }], onStage);
    const picture = el.querySelector<HTMLSelectElement>('select[aria-label="weather item 1 Icon"]');
    expect(picture?.textContent).not.toContain('img-01');
    act(() => {
      if (picture === null) return;
      picture.value = 'img-02';
      picture.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onStage.mock.calls.at(-1)?.[0]?.[0]).toMatchObject({ icon: { assetId: 'img-02' } });
  });
});
