/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SelectChoicesModal } from '../src/renderer/features/inspector/SelectChoicesModal.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
const onSave = vi.fn();
beforeEach(() => {
  onSave.mockClear();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
function mount(): void {
  act(() =>
    root.render(
      createElement(SelectChoicesModal, {
        options: [
          { value: 'آفتابی', label: 'آفتابی' },
          { value: 'بارانی', label: 'بارانی' },
        ],
        connectedFileCount: 1,
        onCancel: vi.fn(),
        onSave,
      }),
    ),
  );
}
function button(text: string): HTMLButtonElement {
  const item = [...document.querySelectorAll('button')].find(
    (element) => element.textContent === text,
  );
  if (!item) throw new Error(text);
  return item;
}
function setInput(label: string, value: string): void {
  const input = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!input) throw new Error(label);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  act(() => {
    input.focus();
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.blur();
  });
}
describe('text choice authoring', () => {
  it('adds editable choices and preserves Persian values and operator labels', () => {
    mount();
    act(() => button('Add choice').click());
    setInput('Choice 3 value', 'ابری');
    setInput('Choice 3 label', 'ابری');
    expect(document.querySelector('[role="status"]')?.textContent).toContain(
      'Connected data files',
    );
    act(() => button('Save choices').click());
    expect(onSave).toHaveBeenCalledWith([
      { value: 'آفتابی', label: 'آفتابی' },
      { value: 'بارانی', label: 'بارانی' },
      { value: 'ابری', label: 'ابری' },
    ]);
  });
  it('identifies duplicate choices without saving an ambiguous list', () => {
    mount();
    setInput('Choice 2 value', 'آفتابی');
    act(() => button('Save choices').click());
    expect(document.querySelector('[role="alert"]')?.textContent).toBe('Choice 2 repeats a value.');
    expect(onSave).not.toHaveBeenCalled();
  });
});
