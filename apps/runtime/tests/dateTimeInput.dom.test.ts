// @vitest-environment jsdom
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isoOfInstant } from '@cg/text-shaping';
import { DateTimeInput } from '../src/renderer/ui/DateTimeInput.js';
import {
  CALENDAR_CHOICE_KEY,
  __resetCalendarChoiceForTest,
} from '../src/renderer/ui/calendarChoice.js';
import { clearPortals } from './support/dialog.js';
import { installMemoryStorage } from './support/localStorage.js';

/**
 * `DELTA-RUN-NEXT-VERSION-01-B` §2 / `-C` §1 — **the date and time control, driven as an operator
 * drives it**: typed segments in any digit set, Up / Down, a paste, the calendar choice (remembered
 * in this browser), the same day in the other two calendars as facts, the `Now + …` shortcuts and
 * the month grid. What reaches `onChange` is what the Inspector stages, so every assertion is on the
 * STORED value — ISO for a date and time, `HH:mm[:ss]` for a time of day.
 *
 * jsdom has no layout, so nothing here is about how the control LOOKS (golden rule 12 (c)); the
 * e2e `countdown-target.spec.ts` drives it in a real browser.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  installMemoryStorage();
  __resetCalendarChoiceForTest();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  clearPortals();
});

const at = (y: number, m: number, d: number, h = 0, mi = 0, s = 0): string =>
  isoOfInstant(new Date(y, m - 1, d, h, mi, s).getTime());

/** A host that STAGES what the control emits, the way the Inspector does. */
function Host(props: {
  mode: 'datetime' | 'timeofday';
  initial: string;
  onChange: (v: string) => void;
  now?: () => number;
  lunarAdjust?: number;
}): JSX.Element {
  const [value, setValue] = useState(props.initial);
  return createElement(DateTimeInput, {
    mode: props.mode,
    value,
    onChange: (v: string) => {
      setValue(v);
      props.onChange(v);
    },
    digits: 'as-typed',
    lunarAdjust: props.lunarAdjust ?? 0,
    'aria-label': 'targetTime',
    now: props.now,
  });
}

async function render(el: ReturnType<typeof createElement>): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(el);
    await Promise.resolve();
  });
  return container;
}

const seg = (name: string): HTMLInputElement => {
  const el = container?.querySelector<HTMLInputElement>(`[data-datetime-segment="${name}"]`);
  if (el === null || el === undefined) throw new Error(`no ${name} segment`);
  return el;
};

async function type(el: HTMLInputElement, text: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    el.focus();
    setter?.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await Promise.resolve();
  });
}

async function key(el: HTMLInputElement, k: string): Promise<void> {
  await act(async () => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
}

async function click(el: Element): Promise<void> {
  await act(async () => {
    (el as HTMLElement).click();
    await Promise.resolve();
  });
}

const button = (selector: string): HTMLButtonElement => {
  const el = document.querySelector<HTMLButtonElement>(selector);
  if (el === null) throw new Error(`no ${selector}`);
  return el;
};

describe('typed segments', () => {
  it('six segments typed in Jalali (Latin keys) store ONE ISO, shown in Persian digits', async () => {
    const onChange = vi.fn();
    await render(createElement(Host, { mode: 'datetime', initial: '', onChange }));
    await type(seg('year'), '1405');
    await type(seg('month'), '07');
    await type(seg('day'), '23');
    await type(seg('hour'), '21');
    expect(onChange).not.toHaveBeenCalled(); // half a date and time stores nothing
    await type(seg('minute'), '45');
    // Seconds may be left out: the date and time is whole, at :00.
    expect(onChange).toHaveBeenLastCalledWith(at(2026, 10, 15, 21, 45, 0));
    await type(seg('second'), '30');
    expect(onChange).toHaveBeenLastCalledWith(at(2026, 10, 15, 21, 45, 30));
    expect(seg('year').value).toBe('۱۴۰۵');
    expect(seg('month').value).toBe('۰۷');
  });

  it('Persian and Arabic-Indic keys read the same', async () => {
    const onChange = vi.fn();
    await render(createElement(Host, { mode: 'datetime', initial: '', onChange }));
    await type(seg('year'), '۱۴۰۵');
    await type(seg('month'), '٠٧');
    await type(seg('day'), '۲۳');
    await type(seg('hour'), '٢١');
    await type(seg('minute'), '۴۵');
    await type(seg('second'), '۰۰');
    expect(onChange).toHaveBeenLastCalledWith(at(2026, 10, 15, 21, 45, 0));
  });

  it('an impossible segment is marked and stores nothing', async () => {
    const onChange = vi.fn();
    await render(
      createElement(Host, { mode: 'datetime', initial: at(2026, 10, 15, 21, 45), onChange }),
    );
    await type(seg('month'), '13');
    expect(seg('month').getAttribute('aria-invalid')).toBe('true');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('Up / Down step the focused segment by one, wrapping', async () => {
    const onChange = vi.fn();
    await render(
      createElement(Host, { mode: 'datetime', initial: at(2026, 10, 15, 23, 45), onChange }),
    );
    await key(seg('hour'), 'ArrowUp');
    expect(onChange).toHaveBeenLastCalledWith(at(2026, 10, 15, 0, 45));
    await key(seg('minute'), 'ArrowDown');
    expect(onChange).toHaveBeenLastCalledWith(at(2026, 10, 15, 0, 44));
  });

  it('a pasted date and time fills every segment', async () => {
    const onChange = vi.fn();
    await render(createElement(Host, { mode: 'datetime', initial: '', onChange }));
    await act(async () => {
      const ev = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(ev, 'clipboardData', {
        value: { getData: () => '2026-10-15 21:45' },
      });
      seg('day').dispatchEvent(ev);
      await Promise.resolve();
    });
    expect(onChange).toHaveBeenLastCalledWith(at(2026, 10, 15, 21, 45, 0));
    expect(seg('day').value).toBe('۲۳');
  });
});

describe('three calendars', () => {
  it('Jalali by default; the other two calendars stand beside the field as facts', async () => {
    await render(
      createElement(Host, {
        mode: 'datetime',
        initial: at(2026, 10, 15, 21, 45),
        onChange: () => undefined,
      }),
    );
    expect(button('[data-calendar-choice="solar-hijri"]').getAttribute('aria-pressed')).toBe(
      'true',
    );
    // 🔴 `RUN-NEXT-VERSION-03` 2.3 — the owner's word: Jalali (the stored choice stays `solar-hijri`).
    expect(
      [...document.querySelectorAll('[data-calendar-choice]')].map((b) => b.textContent),
    ).toEqual(['Jalali', 'Gregorian', 'Lunar Hijri']);
    const facts = container?.querySelector('[data-datetime-facts]')?.textContent ?? '';
    expect(facts).toContain('Gregorian');
    expect(facts).toContain('15 October 2026');
    expect(facts).toContain('Lunar Hijri');
    expect(facts).toContain('۱۴۴۸');
    expect(facts).not.toContain('Jalali');
  });

  it('switching to Gregorian re-reads the SAME instant and is remembered in this browser', async () => {
    const onChange = vi.fn();
    await render(
      createElement(Host, { mode: 'datetime', initial: at(2026, 10, 15, 21, 45), onChange }),
    );
    await click(button('[data-calendar-choice="gregorian"]'));
    expect([seg('year').value, seg('month').value, seg('day').value]).toEqual(['2026', '10', '15']);
    expect(window.localStorage.getItem(CALENDAR_CHOICE_KEY)).toBe('gregorian');
    const facts = container?.querySelector('[data-datetime-facts]')?.textContent ?? '';
    expect(facts).toContain('۲۳ مهر ۱۴۰۵');
    expect(facts).toContain('Jalali');
    // Reading in another calendar stores nothing.
    expect(onChange).not.toHaveBeenCalled();
  });

  it('Lunar Hijri reads and enters through the station adjustment', async () => {
    window.localStorage.setItem(CALENDAR_CHOICE_KEY, 'lunar-hijri');
    __resetCalendarChoiceForTest();
    const onChange = vi.fn();
    await render(
      createElement(Host, {
        mode: 'datetime',
        initial: at(2026, 10, 15, 21, 45),
        onChange,
        lunarAdjust: 1,
      }),
    );
    expect([seg('year').value, seg('month').value, seg('day').value]).toEqual(['۱۴۴۸', '۰۵', '۰۵']);
    await type(seg('day'), '06');
    expect(onChange).toHaveBeenLastCalledWith(at(2026, 10, 16, 21, 45));
  });
});

describe('Now + … and the month grid', () => {
  it('+5 min sets now plus five minutes, to the second', async () => {
    const onChange = vi.fn();
    const now = new Date(2026, 9, 15, 21, 40, 30, 600).getTime();
    await render(createElement(Host, { mode: 'datetime', initial: '', onChange, now: () => now }));
    await click(button('[data-now-plus="+5 min"]'));
    expect(onChange).toHaveBeenLastCalledWith(at(2026, 10, 15, 21, 45, 30));
    expect(seg('minute').value).toBe('۴۵');
  });

  it('the calendar button opens the month the field holds; a day keeps the time', async () => {
    const onChange = vi.fn();
    await render(
      createElement(Host, { mode: 'datetime', initial: at(2026, 10, 15, 21, 45), onChange }),
    );
    await click(button('[data-datetime-grid-button]'));
    const grid = document.querySelector('[data-datetime-grid="solar-hijri"]');
    expect(grid?.getAttribute('dir')).toBe('rtl');
    expect(grid?.querySelectorAll('[data-datetime-day]')).toHaveLength(30);
    expect(button('[data-datetime-day="23"]').getAttribute('aria-pressed')).toBe('true');
    await click(button('[data-datetime-day="25"]'));
    expect(onChange).toHaveBeenLastCalledWith(at(2026, 10, 17, 21, 45));
    expect(document.querySelector('[data-datetime-grid]')).toBeNull();
  });
});

describe('a time of day', () => {
  it('shows the time segments only and stores HH:mm, seconds optional', async () => {
    const onChange = vi.fn();
    await render(createElement(Host, { mode: 'timeofday', initial: '', onChange }));
    expect(container?.querySelector('[data-datetime-segment="year"]')).toBeNull();
    expect(container?.querySelector('[data-calendar-choice]')).toBeNull();
    await type(seg('hour'), '12');
    await type(seg('minute'), '05');
    expect(onChange).toHaveBeenLastCalledWith('12:05');
    await type(seg('second'), '30');
    expect(onChange).toHaveBeenLastCalledWith('12:05:30');
  });
});
