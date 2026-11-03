/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { DynamicField, FieldValue, ListItem, NestedFieldValues } from '@cg/shared-schema';
import { PreviewFieldForm } from '../src/renderer/features/fields/PreviewFieldForm.js';
import { ListItemsEditor } from '../src/renderer/features/fields/ListItemsEditor.js';
import * as listStyles from '../src/renderer/features/fields/ListItemsEditor.css.js';
import { NumberField } from '../src/renderer/features/inspector/controls.js';

/**
 * 🔴 `PERSIAN-DIGITS-01` §2 B — **THE DESIGNER'S NUMBER INPUTS FOR TEMPLATE VALUES KEEP THE AUTHOR'S
 * DIGITS.** Measured in Chromium before this change: every one of them was a native
 * `type="number"` box, so `۱۲` typed into a number field's default left the box EMPTY and stored
 * `0`, and `۱۲٫۵` in the preview form previewed as `0`.
 *
 * Each case is paired with its control: an impossible character is rejected, and a
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
  /*
    `TEXT-DIGITS-01` re-expressed this block: the form now shows a number in its FIELD's digits, what
    air draws. The reader half is `PERSIAN-DIGITS-01`'s and unchanged — Persian and Arabic-Indic
    digits are READ, never dropped — so the Persian field keeps `۱۲٫۵`, an Arabic-Indic entry is
    written in its Persian, and a field with no setting (Latin) writes it `12.5`, each handing on 12.5.
  */
  const NUMBER: DynamicField = {
    id: 'score',
    label: 'score',
    required: false,
    type: 'number',
    default: 5,
    digits: 'persian',
  };

  function Harness({
    onChange,
    field = NUMBER,
  }: {
    onChange: (path: string[], v: FieldValue) => void;
    field?: DynamicField;
  }) {
    const [values, setValues] = useState<NestedFieldValues>({ score: 5 });
    return createElement(PreviewFieldForm, {
      aggregate: { fields: [field], groups: [] },
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
    expect(box.value, 'written in the field’s Persian').toBe('۱۲٫۵');
    expect(onChange).toHaveBeenLastCalledWith(['score'], 12.5);
    expect(alerts(el)).toEqual([]);
  });

  it('a field with no setting shows the number in Latin, what air draws (the control)', () => {
    const onChange = vi.fn();
    const latin: DynamicField = {
      id: 'score',
      label: 'score',
      required: false,
      type: 'number',
      default: 5,
    };
    const el = mount(createElement(Harness, { onChange, field: latin }));
    const box = input(el, 'score');
    type(box, '۱۲٫۵');
    expect(box.value).toBe('12.5');
    expect(onChange).toHaveBeenLastCalledWith(['score'], 12.5);
  });

  it('does not let `۱۲a` replace a valid numeric value', () => {
    const onChange = vi.fn();
    const el = mount(createElement(Harness, { onChange }));
    const box = input(el, 'score');
    type(box, '۱۲');
    expect(onChange).toHaveBeenCalledTimes(1);
    type(box, '۱۲a');
    expect(onChange, 'an impossible text commits nothing').toHaveBeenCalledTimes(1);
    expect(alerts(el)).toEqual([]);
    expect(box.getAttribute('aria-invalid')).toBeNull();
    expect(box.value).toBe('۱۲');
  });

  it('renders arbitrary authored numeric choices as a dropdown', () => {
    const onChange = vi.fn();
    const choices: DynamicField = {
      id: 'score',
      label: 'score',
      required: false,
      type: 'number',
      default: 10,
      allowedValues: [10, 20, 30],
      allowedValueLabels: { '10': 'Low', '20': 'Medium', '30': 'High' },
    };
    const el = mount(createElement(Harness, { onChange, field: choices }));
    const select = el.querySelector<HTMLSelectElement>('select[aria-label="score"]');
    if (select === null) throw new Error('numeric choice dropdown missing');
    expect([...select.options].map((option) => option.textContent)).toEqual([
      'Low',
      'Medium',
      'High',
    ]);
    act(() => {
      select.value = '20';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onChange).toHaveBeenLastCalledWith(['score'], 20);
    expect(el.querySelector('input[aria-label="score"]')).toBeNull();
  });

  it('refuses a numeric value outside the authored range', () => {
    const onChange = vi.fn();
    const whole: DynamicField = {
      id: 'score',
      label: 'score',
      required: false,
      type: 'number',
      default: 5,
      min: 0,
      max: 10,
      step: 1,
    };
    const el = mount(createElement(Harness, { onChange, field: whole }));
    const box = input(el, 'score');
    type(box, '۱۲');
    expect(onChange).not.toHaveBeenCalled();
    expect(alerts(el)).toEqual(['Must be at most 10.']);
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

  it('a number column keeps `۳` on screen and stores 3; `۳x` cannot enter the box', () => {
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
    expect(cell.getAttribute('aria-invalid')).toBeNull();
    expect(cell.value).toBe('۳');
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

  it('uses an equal-width wrapper for a numeric choice beside populated text/number cells', () => {
    const onItems = vi.fn();
    const el = mount(
      createElement(ListItemsEditor, {
        items: [{ id: 'i1', city: 'Tehran', temperature: 22, weather: 0 }],
        label: 'rows',
        columns: [
          { key: 'city', label: 'City' },
          { key: 'temperature', label: 'Temperature', kind: 'number' },
          {
            key: 'weather',
            label: 'Weather',
            kind: 'number',
            allowedValues: [0, 2, 5],
            allowedValueLabels: { '0': 'Rain', '2': 'Sun', '5': 'Cloud' },
          },
        ],
        onChange: onItems,
      }),
    );
    expect(input(el, 'rows item 1 City').value).toBe('Tehran');
    expect(input(el, 'rows item 1 Temperature').value).toBe('22');
    const select = el.querySelector<HTMLSelectElement>('select[aria-label="rows item 1 Weather"]');
    if (select === null) throw new Error('numeric choice row dropdown missing');
    expect([...select.options].map((option) => option.textContent)).toEqual([
      'Rain',
      'Sun',
      'Cloud',
    ]);
    expect(select.parentElement?.classList.contains(listStyles.itemControl)).toBe(true);
    act(() => {
      select.value = '5';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onItems).toHaveBeenLastCalledWith([
      { id: 'i1', city: 'Tehran', temperature: 22, weather: 5 },
    ]);
  });
});

describe('the Inspector’s number field default ("Value")', () => {
  it('`as-typed` keeps `۱۲`, commits 12, and rejects the letter in `۱۲a`', () => {
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
    expect(alerts(el)).toEqual([]);
    expect(box.value).toBe('۱۲');
    // Leaving the box keeps the committed value in the author's digits.
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
