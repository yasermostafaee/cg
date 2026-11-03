/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { NumberChoicesModal } from '../src/renderer/features/inspector/NumberChoicesModal.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
const onCancel = vi.fn();
const onSave = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function mount({
  values = [0, 1],
  labels = { '0': 'alias1' },
  connectedFileCount = 0,
}: {
  values?: readonly number[];
  labels?: Readonly<Record<string, string>>;
  connectedFileCount?: number;
} = {}): void {
  act(() => {
    root.render(
      createElement(NumberChoicesModal, {
        values,
        labels,
        connectedFileCount,
        onCancel,
        onSave,
      }),
    );
  });
}

function button(label: string): HTMLButtonElement {
  const hit = [...document.querySelectorAll('button')].find((item) => item.textContent === label);
  if (hit === undefined) throw new Error(`no button “${label}”`);
  return hit;
}

function setInput(label: string, value: string): void {
  const input = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (input === null) throw new Error(`no input “${label}”`);
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (setValue === undefined) throw new Error('native input setter is unavailable');
  act(() => {
    input.focus();
    setValue.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.blur();
  });
}

describe('number choice modal', () => {
  it('adds a suggested numeric row and saves canonical values with optional aliases', () => {
    mount();
    expect(
      document.querySelector<HTMLInputElement>('input[aria-label="Choice 1 alias"]')?.value,
    ).toBe('alias1');

    act(() => button('Add choice').click());
    expect(
      document.querySelector<HTMLInputElement>('input[aria-label="Choice 3 value"]')?.value,
    ).toBe('2');

    setInput('Choice 2 alias', 'alias2');
    act(() => button('Save choices').click());
    expect(onSave).toHaveBeenCalledWith([0, 1, 2], { '0': 'alias1', '1': 'alias2' });
  });

  it('keeps the modal open and identifies a duplicate row', () => {
    mount();
    setInput('Choice 2 value', '۰');
    act(() => button('Save choices').click());

    expect(document.querySelector('[role="alert"]')?.textContent).toBe('Choice 2 repeats value 0.');
    expect(onSave).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('continues the established step and warns when a data file is connected', () => {
    mount({ values: [10, 20, 30], labels: {}, connectedFileCount: 1 });
    act(() => button('Add choice').click());

    expect(
      document.querySelector<HTMLInputElement>('input[aria-label="Choice 4 value"]')?.value,
    ).toBe('40');
    expect(document.querySelector('[role="status"]')?.textContent).toContain(
      'connected data file may need replacement',
    );
  });
});
