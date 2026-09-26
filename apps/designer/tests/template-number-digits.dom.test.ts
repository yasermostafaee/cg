/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { DynamicField, FieldValue, ListItem, NestedFieldValues } from '@cg/shared-schema';
import { PreviewFieldForm } from '../src/renderer/features/fields/PreviewFieldForm.js';
import { ListItemsEditor } from '../src/renderer/features/fields/ListItemsEditor.js';
import { NumberField } from '../src/renderer/features/inspector/controls.js';

/**
 * 🔴 `PERSIAN-DIGITS-01` §2 B — **THE DESIGNER'S NUMBER INPUTS FOR TEMPLATE VALUES KEEP THE AUTHOR'S
 * DIGITS.** Measured in Chromium before this change: every one of them was a native
 * `type="number"` box, so `۱۲` typed into a number field's default left the box EMPTY and stored
 * `0`, and `۱۲٫۵` in the preview form previewed as `0`.
 *
 * Each case is paired with its control: an impossible text is refused and commits nothing, and a
 * CHROME number (any `NumberField` that does not opt in) is still the old `type="number"` box —
 * §1 E, the owner's "nothing else changes".
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function mount(element: ReturnType<typeof createElement>): HTMLDivElement {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(element));
  return host;
}

/** Typing and paste both deliver the box's whole value through `input`. */
function type(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function input(el: HTMLElement, label: string): HTMLInputElement {
  const found = el.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (found === null) throw new Error(`no input labelled ${label}`);
  return found;
}

const alerts = (el: HTMLElement): string[] =>
  [...el.querySelectorAll('[role="alert"]')].map((n) => n.textContent ?? '');

describe('the preview form’s number field', () => {
  const NUMBER: DynamicField = {
    id: 'score',
    label: 'score',
    required: false,
    type: 'number',
    default: 5,
  };

  function Harness({ onChange }: { onChange: (path: string[], v: FieldValue) => void }) {
    const [values, setValues] = useState<NestedFieldValues>({ score: 5 });
    return createElement(PreviewFieldForm, {
      aggregate: { fields: [NUMBER], groups: [] },
      values,
      onChange: (path: string[], v: FieldValue) => {
        onChange(path, v);
        setValues((prev) => ({ ...prev, [path[0] ?? '']: v }));
      },
    });
  }

  it('keeps `۱۲٫۵` on screen and hands on the NUMBER 12.5', () => {
    const onChange = vi.fn();
    const el = mount(createElement(Harness, { onChange }));
    const box = input(el, 'score');
    expect(box.type, 'not a type="number" box, which drops Persian digits').toBe('text');
    type(box, '۱۲٫۵');
    expect(box.value).toBe('۱۲٫۵');
    expect(onChange).toHaveBeenLastCalledWith(['score'], 12.5);
    type(box, '١٢٫٥');
    expect(box.value).toBe('١٢٫٥');
    expect(onChange).toHaveBeenLastCalledWith(['score'], 12.5);
    expect(alerts(el)).toEqual([]);
  });

  it('refuses `۱۲a` in one line and hands on NOTHING (the control)', () => {
    const onChange = vi.fn();
    const el = mount(createElement(Harness, { onChange }));
    const box = input(el, 'score');
    type(box, '۱۲');
    expect(onChange).toHaveBeenCalledTimes(1);
    type(box, '۱۲a');
    expect(onChange, 'an impossible text commits nothing').toHaveBeenCalledTimes(1);
    expect(alerts(el)).toEqual(['Not a number']);
    expect(box.getAttribute('aria-invalid')).toBe('true');
    expect(box.value).toBe('۱۲a');
  });
});

describe('a list item’s number column and dwell', () => {
  function Harness({ onItems }: { onItems: (items: ListItem[]) => void }) {
    const [items, setItems] = useState<ListItem[]>([{ id: 'i1', goals: 1 } as ListItem]);
    return createElement(ListItemsEditor, {
      items,
      label: 'rows',
      showDwell: true,
      columns: [{ key: 'goals', label: 'Goals', kind: 'number' }],
      onChange: (next: ListItem[]) => {
        onItems(next);
        setItems(next);
      },
    });
  }

  it('a number column keeps `۳` on screen and stores 3; `۳x` stores nothing', () => {
    const onItems = vi.fn();
    const el = mount(createElement(Harness, { onItems }));
    const cell = input(el, 'rows item 1 Goals');
    expect(cell.type).toBe('text');
    type(cell, '۳');
    expect(cell.value).toBe('۳');
    expect(onItems).toHaveBeenLastCalledWith([{ id: 'i1', goals: 3 }]);
    const calls = onItems.mock.calls.length;
    type(cell, '۳x');
    expect(onItems.mock.calls.length, 'the control: an impossible text stores nothing').toBe(calls);
    expect(cell.getAttribute('aria-invalid')).toBe('true');
    expect(cell.title).toBe('Not a number');
  });

  it('the dwell reads `۰۰:۳۰` as thirty seconds, and a bare `۵` as five', () => {
    const onItems = vi.fn();
    const el = mount(createElement(Harness, { onItems }));
    const dwell = input(el, 'rows item 1 dwell');
    type(dwell, '۰۰:۳۰');
    expect(dwell.value).toBe('۰۰:۳۰');
    expect(onItems).toHaveBeenLastCalledWith([{ id: 'i1', goals: 1, dwellMs: 30_000 }]);
    type(dwell, '۵');
    expect(onItems).toHaveBeenLastCalledWith([{ id: 'i1', goals: 1, dwellMs: 5_000 }]);
    // Emptied: the item falls back to the element's default dwell.
    type(dwell, '');
    expect(onItems).toHaveBeenLastCalledWith([{ id: 'i1', goals: 1 }]);
  });
});

describe('the Inspector’s number field default ("Value")', () => {
  it('`as-typed` keeps `۱۲`, commits 12, and refuses `۱۲a` in one line', () => {
    const onCommit = vi.fn();
    function Harness() {
      const [value, setValue] = useState(0);
      return createElement(NumberField, {
        label: 'Value',
        value,
        digits: 'as-typed',
        onCommit: (n: number) => {
          onCommit(n);
          setValue(n);
        },
      });
    }
    const el = mount(createElement(Harness));
    const box = input(el, 'Value');
    expect(box.type).toBe('text');
    act(() => box.focus());
    type(box, '۱۲');
    expect(onCommit).toHaveBeenLastCalledWith(12);
    expect(box.value).toBe('۱۲');
    type(box, '۱۲a');
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(alerts(el)).toEqual(['Not a number']);
    // Leaving the box: the never-committed text gives way to the value, in the author's digits.
    act(() => box.blur());
    expect(box.value).toBe('۱۲');
    expect(alerts(el)).toEqual([]);
  });

  it('a CHROME number field is unchanged — still the `type="number"` box (the control)', () => {
    const el = mount(
      createElement(NumberField, { label: 'X position', value: 5, onCommit: () => undefined }),
    );
    expect(input(el, 'X position').type).toBe('number');
  });
});
