// @vitest-environment jsdom
import { createElement, useState, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptySlots, isoOfInstant, slotsOfParts, type CalendarSystem } from '@cg/text-shaping';
import {
  masksOfValue,
  useMaskedDateTime,
  valueOfMasks,
  type MaskedDateTime,
  type MaskedMode,
} from '../src/useMaskedDateTime.js';

/**
 * `RUN-NEXT-VERSION-03` 2.1 — the masked date and time inputs, driven as an operator types into two
 * real `<input>`s: keys, Backspace, Delete, a selection, Up / Down, a paste, the input's own change,
 * the pickers' setters. What reaches `onChange` is what the field stores.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let latest: MaskedDateTime | null = null;

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
  latest = null;
});

const at = (y: number, m: number, d: number, h = 0, mi = 0, s = 0): string =>
  isoOfInstant(new Date(y, m - 1, d, h, mi, s).getTime());

function Harness(props: {
  mode: MaskedMode;
  initial: string;
  onChange: (v: string) => void;
  calendar: CalendarSystem;
  digits: 'latin' | 'persian';
  now?: () => number;
}): JSX.Element {
  const [value, setValue] = useState(props.initial);
  const m = useMaskedDateTime({
    mode: props.mode,
    value,
    onChange: (v) => {
      setValue(v);
      props.onChange(v);
    },
    calendar: props.calendar,
    adjust: 0,
    digits: props.digits,
    ...(props.now !== undefined ? { now: props.now } : {}),
  });
  latest = m;
  const field = (kind: 'date' | 'time') =>
    createElement('input', {
      'data-kind': kind,
      value: m[kind].value,
      placeholder: m[kind].placeholder,
      maxLength: m[kind].maxLength,
      onKeyDown: m[kind].onKeyDown,
      onPaste: m[kind].onPaste,
      onChange: (e: { target: { value: string } }) => m[kind].onText(e.target.value),
    });
  return createElement(
    'div',
    null,
    field('date'),
    field('time'),
    createElement('p', { 'data-refusal': '' }, m.refusal ?? ''),
    createElement(
      'p',
      { 'data-greg': '' },
      m.gregorian === null ? '' : JSON.stringify(m.gregorian),
    ),
  );
}

function mount(props: Partial<Parameters<typeof Harness>[0]> & { mode: MaskedMode }): {
  onChange: ReturnType<typeof vi.fn>;
  rerender: (value: string) => void;
} {
  const onChange = vi.fn();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  const render = (initial: string, key: string): void => {
    act(() =>
      root?.render(
        createElement(Harness, {
          key,
          initial,
          calendar: 'solar-hijri',
          digits: 'latin',
          onChange,
          ...props,
          ...(key === 'first' ? {} : { initial }),
        }),
      ),
    );
  };
  render(props.initial ?? '', 'first');
  return { onChange, rerender: (value) => render(value, `v-${value}`) };
}

const input = (kind: 'date' | 'time'): HTMLInputElement => {
  const el = host?.querySelector<HTMLInputElement>(`[data-kind="${kind}"]`);
  if (el === null || el === undefined) throw new Error(`no ${kind}`);
  return el;
};
const refusal = (): string => host?.querySelector('[data-refusal]')?.textContent ?? '';

function key(el: HTMLInputElement, k: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
  act(() => {
    el.dispatchEvent(ev);
  });
  return ev;
}

/** Focus, put the caret at `from` (or select `[from, to)`), then press each key of `keys`. */
function type(el: HTMLInputElement, keys: string, from = 0, to = from): void {
  act(() => {
    el.focus();
    el.setSelectionRange(from, to);
  });
  for (const k of keys) key(el, k);
}

function paste(el: HTMLInputElement, text: string): void {
  act(() => {
    const ev = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'clipboardData', { value: { getData: () => text } });
    el.dispatchEvent(ev);
  });
}

function change(el: HTMLInputElement, text: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  act(() => {
    setter?.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('🔴 typing into the two masks', () => {
  it('a Jalali date and a time typed with Latin keys store ONE ISO; shown in Persian digits', () => {
    const { onChange } = mount({ mode: 'datetime', digits: 'persian' });
    type(input('date'), '14050723');
    expect(input('date').value).toBe('۱۴۰۵/۰۷/۲۳');
    expect(onChange).not.toHaveBeenCalled();
    type(input('time'), '2145');
    // The seconds may be left out: the value is whole at :00.
    expect(onChange).toHaveBeenLastCalledWith(at(2026, 10, 15, 21, 45, 0));
    type(input('time'), '30', 6);
    expect(onChange).toHaveBeenLastCalledWith(at(2026, 10, 15, 21, 45, 30));
    expect(input('time').value).toBe('۲۱:۴۵:۳۰');
    expect(host?.querySelector('[data-greg]')?.textContent).toBe(
      JSON.stringify({ year: 2026, month: 10, day: 15 }),
    );
  });

  it('Persian and Arabic-Indic keys type the same digits; the caret follows the mask', () => {
    const { onChange } = mount({ mode: 'datetime' });
    type(input('date'), '۱۴۰۵٠٧۲۳');
    expect(input('date').value).toBe('1405/07/23');
    type(input('time'), '۲۱۴۵۰۰');
    expect(onChange).toHaveBeenLastCalledWith(at(2026, 10, 15, 21, 45, 0));
    expect(input('time').selectionStart).toBe(8);
  });

  it('🔴 an impossible value is REFUSED, its reason shown, the text unchanged — until the value is whole', () => {
    const { onChange } = mount({ mode: 'datetime', initial: at(2026, 10, 15, 21, 45) });
    const date = input('date');
    expect(date.value).toBe('1405/07/23');
    // The owner's `1405/13/40`: the 3 of the month is refused.
    type(date, '13', 5);
    expect(refusal()).toBe('There is no month 13.');
    expect(date.value).toBe('1405/1M/23');
    expect(onChange).not.toHaveBeenCalled();
    // `25:61`: the 5 of the hour is refused.
    type(input('time'), '25', 0);
    expect(refusal()).toBe('Hours run from 00 to 23.');
    // A whole value again: the reason goes.
    type(date, '2', 6);
    type(input('time'), '1', 1);
    expect(refusal()).toBe('');
    // 23 Esfand 1405 is 14 March 2027.
    expect(onChange).toHaveBeenLastCalledWith(at(2027, 3, 14, 21, 45));
  });

  it('a letter is not typed; a separator moves to the next part', () => {
    mount({ mode: 'datetime', initial: at(2026, 10, 15, 21, 45) });
    const date = input('date');
    const ev = key(date, 'a');
    expect(ev.defaultPrevented).toBe(true);
    expect(date.value).toBe('1405/07/23');
    type(date, '/', 1);
    expect(date.selectionStart).toBe(5);
    // Ctrl / Cmd / Alt combinations are the input's own (copy, select all, paste).
    expect(key(date, 'c', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(key(date, 'Tab').defaultPrevented).toBe(false);
  });

  it('Backspace and Delete empty one position; a selection is replaced by what is typed', () => {
    const { onChange } = mount({ mode: 'datetime', initial: at(2026, 10, 15, 21, 45) });
    const date = input('date');
    act(() => {
      date.focus();
      date.setSelectionRange(10, 10);
    });
    key(date, 'Backspace');
    expect(date.value).toBe('1405/07/2D');
    act(() => date.setSelectionRange(0, 0));
    key(date, 'Delete');
    expect(date.value).toBe('M405/07/2D'.replace('M', 'Y'));
    // Select all and type a whole date over it.
    type(date, '14051229', 0, 10);
    expect(date.value).toBe('1405/12/29');
    expect(onChange).toHaveBeenLastCalledWith(at(2027, 3, 20, 21, 45));
  });

  it('Up / Down step the part under the caret, wrapping, and store', () => {
    const { onChange } = mount({ mode: 'datetime', initial: at(2026, 10, 15, 23, 45) });
    const time = input('time');
    act(() => {
      time.focus();
      time.setSelectionRange(1, 1);
    });
    key(time, 'ArrowUp');
    expect(time.value).toBe('00:45:00');
    expect(onChange).toHaveBeenLastCalledWith(at(2026, 10, 15, 0, 45));
    act(() => time.setSelectionRange(4, 4));
    key(time, 'ArrowDown');
    expect(onChange).toHaveBeenLastCalledWith(at(2026, 10, 15, 0, 44));
  });

  it('an empty date stepped starts from now (the caret of an empty input is at the year)', () => {
    const now = new Date(2026, 9, 15, 10, 0, 0).getTime();
    mount({ mode: 'datetime', now: () => now });
    const date = input('date');
    act(() => date.focus());
    key(date, 'ArrowUp');
    expect(date.value).toBe('1406/07/23');
  });
});

describe('a paste, the input’s own change, and the pickers', () => {
  it('a whole date and time pasted fills both masks; something else is refused', () => {
    const { onChange } = mount({ mode: 'datetime' });
    paste(input('date'), '2026-10-15 21:45');
    expect(onChange).toHaveBeenLastCalledWith(at(2026, 10, 15, 21, 45));
    expect(input('date').value).toBe('1405/07/23');
    paste(input('date'), '1405/13/40');
    expect(refusal()).toBe('That is not a date.');
    paste(input('time'), '25:61');
    expect(refusal()).toBe('That is not a time.');
    // The mask's own text, copied from a field: read back as it is.
    paste(input('date'), '1405/12/29');
    expect(onChange).toHaveBeenLastCalledWith(at(2027, 3, 20, 21, 45));
  });

  it('the input’s own change: empty clears; the mask’s text is read; a whole date is a paste', () => {
    const { onChange } = mount({ mode: 'datetime', initial: at(2026, 10, 15, 21, 45) });
    change(input('date'), '');
    expect(input('date').value).toBe('');
    change(input('date'), '1405/07/24');
    expect(onChange).toHaveBeenLastCalledWith(at(2026, 10, 16, 21, 45));
    change(input('date'), '1405/13/24');
    expect(input('date').value).toBe('1405/07/24');
    change(input('date'), '2026-10-17');
    expect(onChange).toHaveBeenLastCalledWith(at(2026, 10, 17, 21, 45));
    change(input('date'), 'nonsense');
    expect(input('date').value).toBe('1405/07/25');
  });

  it('the pickers’ setters and a shortcut’s whole value', () => {
    const { onChange } = mount({ mode: 'datetime', initial: at(2026, 10, 15, 21, 45) });
    act(() => latest?.setDate({ year: 1405, month: 12, day: 29 }));
    expect(onChange).toHaveBeenLastCalledWith(at(2027, 3, 20, 21, 45));
    act(() => latest?.setTime({ hour: 6, minute: 5, second: 4 }));
    expect(onChange).toHaveBeenLastCalledWith(at(2027, 3, 20, 6, 5, 4));
    expect(latest?.parts).toEqual({
      year: 1405,
      month: 12,
      day: 29,
      hour: 6,
      minute: 5,
      second: 4,
    });
    act(() => latest?.setValue(at(2026, 1, 1, 0, 0)));
    expect(onChange).toHaveBeenLastCalledWith(at(2026, 1, 1, 0, 0));
    expect(input('date').value).toBe('1404/10/11');
  });

  it('a value from OUTSIDE re-seeds the masks; the echo of the operator’s own edit does not', () => {
    const { rerender } = mount({ mode: 'datetime', initial: at(2026, 10, 15, 21, 45) });
    type(input('time'), '1', 3);
    // A half-typed minute stays while the value it would make is not whole.
    expect(input('time').value).toBe('21:1M:00');
    rerender(at(2026, 1, 1, 8, 0));
    expect(input('time').value).toBe('08:00:00');
  });
});

/*
  🔴 `RUN-NEXT-VERSION-03` 2.2 — the hook beside `useSyncExternalStore` in ONE component, as CG Control
  reads its calendar choice. A state update during render (the old re-seed) kept React 18 from recording
  the store's new snapshot, so a switch back to the first calendar rendered nothing.
*/
describe('🔴 2.2 — beside a store read in the same component, every switch renders', () => {
  it('Gregorian, Lunar Hijri, then back to Jalali: each switch shows at once', () => {
    let calendar: CalendarSystem = 'solar-hijri';
    const listeners = new Set<() => void>();
    const store = {
      subscribe: (l: () => void) => {
        listeners.add(l);
        return () => listeners.delete(l);
      },
      get: () => calendar,
      set: (c: CalendarSystem) => {
        calendar = c;
        for (const l of [...listeners]) l();
      },
    };
    function StoreHost(): JSX.Element {
      const cal = useSyncExternalStore(store.subscribe, store.get, store.get);
      const m = useMaskedDateTime({
        mode: 'datetime',
        value: at(2026, 10, 15, 21, 45),
        onChange: () => undefined,
        calendar: cal,
        adjust: 0,
        digits: 'latin',
      });
      return createElement('input', {
        'data-kind': 'date',
        'data-cal': cal,
        value: m.date.value,
        readOnly: true,
      });
    }
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root?.render(createElement(StoreHost)));
    const shown = (): [string | null, string] => [
      input('date').getAttribute('data-cal'),
      input('date').value,
    ];
    act(() => store.set('gregorian'));
    expect(shown()).toEqual(['gregorian', '2026/10/15']);
    act(() => store.set('lunar-hijri'));
    expect(shown()).toEqual(['lunar-hijri', '1448/05/04']);
    act(() => store.set('solar-hijri'));
    expect(shown()).toEqual(['solar-hijri', '1405/07/23']);
  });
});

describe('a time of day', () => {
  it('shows HH:MM:SS, stores HH:mm — or HH:mm:ss when seconds are given', () => {
    const { onChange } = mount({ mode: 'timeofday', initial: '21:45' });
    expect(input('time').value).toBe('21:45:00');
    type(input('time'), '0930', 0);
    expect(onChange).toHaveBeenLastCalledWith('09:30');
    type(input('time'), '15', 6);
    expect(onChange).toHaveBeenLastCalledWith('09:30:15');
    // A date pasted into a time of day is not a time.
    paste(input('time'), '1405/07/23');
    expect(refusal()).toBe('That is not a time.');
  });
});

describe('the value two masks name', () => {
  it('an unreadable value shows empty masks; a time of day may come as ISO', () => {
    expect(masksOfValue('soon', 'datetime', 'gregorian', 0).date).toEqual(emptySlots('date'));
    expect(masksOfValue(at(2026, 10, 15, 7, 8, 9), 'timeofday', 'gregorian', 0).time).toEqual(
      slotsOfParts('time', { hour: 7, minute: 8, second: 9 }),
    );
  });

  it('half-typed seconds name nothing; a missing date names nothing', () => {
    const time = slotsOfParts('time', { hour: 7, minute: 8 });
    const half = [...time.slice(0, 4), 1, null];
    expect(
      valueOfMasks({ date: emptySlots('date'), time: half }, 'timeofday', 'gregorian', 0),
    ).toBe(null);
    expect(valueOfMasks({ date: emptySlots('date'), time }, 'datetime', 'gregorian', 0)).toBe(null);
    expect(
      valueOfMasks(
        { date: emptySlots('date'), time: emptySlots('time') },
        'timeofday',
        'gregorian',
        0,
      ),
    ).toBe(null);
  });
});
