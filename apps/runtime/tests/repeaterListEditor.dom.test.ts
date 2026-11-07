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

function render(
  value: ListItem[],
  onStage: (next: ListItem[]) => void,
  field: DynamicField = FIELD,
): HTMLDivElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root?.render(
      createElement(ListFieldEditor, {
        fieldId: 'weather',
        field,
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

    expect(el.querySelector('input[aria-label="weather item 1 City"]')).toBeNull();
    expect(el.textContent).toContain('1 row');
    act(() =>
      [...el.querySelectorAll('button')]
        .find((button) => button.textContent?.trim() === 'Edit rows…')
        ?.click(),
    );
    const dialog = document.body.querySelector<HTMLElement>(
      '[role="dialog"][aria-label="Edit weather rows"]',
    );
    expect(
      [...(dialog?.querySelectorAll('button') ?? [])].find(
        (button) => button.textContent?.trim() === 'Apply',
      )?.disabled,
    ).toBe(true);
    expect(
      dialog?.querySelector<HTMLInputElement>('input[aria-label="weather item 1 City"]')?.value,
    ).toBe('Shiraz');
    expect(
      dialog?.querySelector<HTMLInputElement>('input[aria-label="weather item 1 Temperature"]')
        ?.value,
    ).toBe('27');
    const picture = dialog?.querySelector<HTMLButtonElement>(
      'button[aria-label="weather item 1 Icon"]',
    );
    expect(picture?.textContent).toContain('rain.png');
    expect(dialog?.querySelector('textarea[aria-label="weather item 1"]')).toBeNull();

    act(() =>
      dialog?.querySelector<HTMLButtonElement>('button[aria-label="Add weather item"]')?.click(),
    );
    expect(onStage).not.toHaveBeenCalled();
    expect(
      [...(dialog?.querySelectorAll('button') ?? [])].find(
        (button) => button.textContent?.trim() === 'Apply',
      )?.disabled,
    ).toBe(false);
    act(() =>
      [...(dialog?.querySelectorAll('button') ?? [])]
        .find((button) => button.textContent?.trim() === 'Apply')
        ?.click(),
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
    act(() =>
      [...el.querySelectorAll('button')]
        .find((button) => button.textContent?.trim() === 'Edit rows…')
        ?.click(),
    );
    const picture = document.body.querySelector<HTMLButtonElement>(
      '[role="dialog"] button[aria-label="weather item 1 Icon"]',
    );
    expect(picture?.textContent).not.toContain('img-01');
    act(() => picture?.click());
    const imageDialog = document.body.querySelector<HTMLElement>(
      '[role="dialog"][aria-label="Choose picture for weather item 1 Icon"]',
    );
    act(() =>
      [...(imageDialog?.querySelectorAll('button') ?? [])]
        .find((button) => button.textContent?.includes('rain.png'))
        ?.click(),
    );
    expect(onStage).not.toHaveBeenCalled();
    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]');
    act(() =>
      [...(dialog?.querySelectorAll('button') ?? [])]
        .find((button) => button.textContent?.trim() === 'Apply')
        ?.click(),
    );
    expect(onStage.mock.calls.at(-1)?.[0]?.[0]).toMatchObject({ icon: { assetId: 'img-02' } });
  });

  it('discards modal edits when Close is used without Apply', () => {
    const onStage = vi.fn<(next: ListItem[]) => void>();
    const el = render([{ id: 'row-1', city: 'Tehran', temperature: 20 }], onStage);
    const open = (): void => {
      [...el.querySelectorAll('button')]
        .find((button) => button.textContent?.trim() === 'Edit rows…')
        ?.click();
    };
    act(open);
    let dialog = document.body.querySelector<HTMLElement>('[role="dialog"]');
    const city = dialog?.querySelector<HTMLInputElement>('input[aria-label="weather item 1 City"]');
    act(() => {
      if (city === undefined || city === null) return;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      setter?.call(city, 'Shiraz');
      city.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() =>
      [...(dialog?.querySelectorAll('button') ?? [])]
        .find((button) => button.textContent?.trim() === 'Close')
        ?.click(),
    );
    expect(onStage).not.toHaveBeenCalled();

    act(open);
    dialog = document.body.querySelector<HTMLElement>('[role="dialog"]');
    expect(
      dialog?.querySelector<HTMLInputElement>('input[aria-label="weather item 1 City"]')?.value,
    ).toBe('Tehran');
  });

  it('keeps authored locked columns visible but disabled', () => {
    const onStage = vi.fn<(next: ListItem[]) => void>();
    const locked: DynamicField = {
      ...FIELD,
      itemFields:
        FIELD.type === 'list'
          ? FIELD.itemFields?.map((field) =>
              field.id === 'temperature' ? field : { ...field, operatorEditable: false as const },
            )
          : [],
    };
    const el = render(
      [{ id: 'row-1', city: 'Persepolis', temperature: 7, icon: { assetId: 'img-01' } }],
      onStage,
      locked,
    );
    act(() =>
      [...el.querySelectorAll('button')]
        .find((button) => button.textContent?.trim() === 'Edit rows…')
        ?.click(),
    );
    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]');
    expect(
      dialog?.querySelector<HTMLInputElement>('input[aria-label="weather item 1 City"]')?.disabled,
    ).toBe(true);
    expect(
      dialog?.querySelector<HTMLInputElement>('input[aria-label="weather item 1 Temperature"]')
        ?.disabled,
    ).toBe(false);
    expect(
      dialog?.querySelector<HTMLButtonElement>('button[aria-label="weather item 1 Icon"]')
        ?.disabled,
    ).toBe(true);
    expect(
      dialog?.querySelector<HTMLButtonElement>('button[aria-label="Add weather item"]')?.disabled,
    ).toBe(true);
    expect(
      dialog?.querySelector<HTMLButtonElement>('button[aria-label="Remove weather item 1"]')
        ?.disabled,
    ).toBe(true);
    expect(
      dialog?.querySelector<HTMLButtonElement>('button[aria-label="Reorder weather item 1"]')
        ?.disabled,
    ).toBe(true);
    expect(dialog?.textContent).toContain('locked');
  });
});
