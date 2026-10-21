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
 * `DELTA-RUN-NEXT-VERSION-01-B` §2 / `-C` §1, `RUN-NEXT-VERSION-03` 2.1 — **the date and time control,
 * driven as an operator drives it**: ONE masked date input and ONE masked time input (the owner: six
 * boxes were not good), typed in any digit set, an impossible value refused with its reason, Up / Down,
 * a paste, the calendar choice (remembered in this browser), the same day in the other two calendars
 * as facts, the `Now + …` shortcuts, the month grid and the time picker. What reaches `onChange` is
 * what the Inspector stages, so every assertion is on the STORED value.
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

const mask = (kind: 'date' | 'time'): HTMLInputElement => {
  const el = container?.querySelector<HTMLInputElement>(`[data-datetime-mask="${kind}"]`);
  if (el === null || el === undefined) throw new Error(`no ${kind} input`);
  return el;
};

/** Focus, put the caret at `from` (or select `[from, to)`), then press each key. */
async function type(el: HTMLInputElement, keys: string, from = 0, to = from): Promise<void> {
  await act(async () => {
    el.focus();
    el.setSelectionRange(from, to);
    await Promise.resolve();
  });
  for (const k of keys) {
    await act(async () => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
  }
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

const refusal = (): string =>
  container?.querySelector('[data-datetime-refusal]')?.textContent ?? '';

describe('🔴 2.1 — one masked date input and one masked time input', () => {
  it('a Jalali date and a time typed with Latin keys store ONE ISO, shown in Persian digits', async () => {
    const onChange = vi.fn();
    await render(createElement(Host, { mode: 'datetime', initial: '', onChange }));
    // Two inputs — not six boxes — each with its picker.
    expect(container?.querySelectorAll('input')).toHaveLength(2);
    expect(mask('date').placeholder).toBe('YYYY/MM/DD');
    expect(mask('time').placeholder).toBe('HH:MM:SS');
    await type(mask('date'), '14050723');
    expect(mask('date').value).toBe('۱۴۰۵/۰۷/۲۳');
    expect(onChange).not.toHaveBeenCalled(); // half a date and time stores nothing
    await type(mask('time'), '2145');
    // Seconds may be left out: the date and time is whole, at :00.
    expect(onChange).toHaveBeenLastCalledWith(at(2026, 10, 15, 21, 45, 0));
    await type(mask('time'), '30', 6);
    expect(onChange).toHaveBeenLastCalledWith(at(2026, 10, 15, 21, 45, 30));
    expect(mask('time').value).toBe('۲۱:۴۵:۳۰');
  });

  it('Persian and Arabic-Indic keys read the same', async () => {
    const onChange = vi.fn();
    await render(createElement(Host, { mode: 'datetime', initial: '', onChange }));
    await type(mask('date'), '۱۴۰۵٠٧۲۳');
    await type(mask('time'), '٢١۴۵۰۰');
    expect(onChange).toHaveBeenLastCalledWith(at(2026, 10, 15, 21, 45, 0));
  });

  it('🔴 an impossible value is REFUSED, its reason said, nothing stored: month 13, Mehr 31, 25 o’clock', async () => {
    const onChange = vi.fn();
    await render(
      createElement(Host, { mode: 'datetime', initial: at(2026, 10, 15, 21, 45), onChange }),
    );
    await type(mask('date'), '13', 5);
    expect(refusal()).toBe('There is no month 13.');
    expect(mask('date').value).toBe('۱۴۰۵/۱M/۲۳');
    await type(mask('date'), '0731', 5);
    expect(refusal()).toBe('This month has 30 days.');
    await type(mask('time'), '25', 0);
    expect(refusal()).toBe('Hours run from 00 to 23.');
    expect(onChange).not.toHaveBeenCalled();
    // The refusal is said where a reader of the field finds it.
    expect(mask('time').getAttribute('aria-describedby')).toBe(
      container?.querySelector('[data-datetime-refusal]')?.id,
    );
  });

  it('typing in the middle of a value overwrites that digit', async () => {
    const onChange = vi.fn();
    await render(
      createElement(Host, { mode: 'datetime', initial: at(2026, 10, 15, 21, 45), onChange }),
    );
    await type(mask('date'), '4', 9);
    expect(onChange).toHaveBeenLastCalledWith(at(2026, 10, 16, 21, 45));
  });

  it('Up / Down step the part under the caret by one, wrapping', async () => {
    const onChange = vi.fn();
    await render(
      createElement(Host, { mode: 'datetime', initial: at(2026, 10, 15, 23, 45), onChange }),
    );
    await type(mask('time'), '', 1);
    await act(async () => {
      mask('time').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }),
      );
      await Promise.resolve();
    });
    expect(onChange).toHaveBeenLastCalledWith(at(2026, 10, 15, 0, 45));
  });

  it('a pasted date and time fills both inputs', async () => {
    const onChange = vi.fn();
    await render(createElement(Host, { mode: 'datetime', initial: '', onChange }));
    await act(async () => {
      const ev = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(ev, 'clipboardData', {
        value: { getData: () => '2026-10-15 21:45' },
      });
      mask('date').dispatchEvent(ev);
      await Promise.resolve();
    });
    expect(onChange).toHaveBeenLastCalledWith(at(2026, 10, 15, 21, 45, 0));
    expect(mask('date').value).toBe('۱۴۰۵/۰۷/۲۳');
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
    expect(mask('date').value).toBe('2026/10/15');
    expect(window.localStorage.getItem(CALENDAR_CHOICE_KEY)).toBe('gregorian');
    const facts = container?.querySelector('[data-datetime-facts]')?.textContent ?? '';
    expect(facts).toContain('۲۳ مهر ۱۴۰۵');
    expect(facts).toContain('Jalali');
    // Reading in another calendar stores nothing.
    expect(onChange).not.toHaveBeenCalled();
  });

  /*
    🔴 `RUN-NEXT-VERSION-03` 2.2 — the owner: "switching to Solar Hijri takes a long time". Measured
    with real clicks: the switch BACK to the first calendar shown (Jalali, the default) did not show at
    all until something else re-rendered the control — the countdown field's 15-second refresh. The
    control set state DURING render (its re-seed) beside `useSyncExternalStore` (the calendar choice),
    and React 18 then never records the store's new snapshot: a switch back to the first value compares
    equal and nothing renders.
  */
  it('🔴 2.2 — every switch shows at once, back to Jalali included', async () => {
    const onChange = vi.fn();
    await render(
      createElement(Host, { mode: 'datetime', initial: at(2026, 10, 15, 21, 45), onChange }),
    );
    const pressed = (): string | null =>
      document
        .querySelector('[data-calendar-choice][aria-pressed="true"]')
        ?.getAttribute('data-calendar-choice') ?? null;
    for (const system of ['gregorian', 'lunar-hijri', 'solar-hijri', 'gregorian', 'solar-hijri']) {
      await click(button(`[data-calendar-choice="${system}"]`));
      expect(pressed(), `after choosing ${system}`).toBe(system);
    }
    expect(mask('date').value).toBe('۱۴۰۵/۰۷/۲۳');
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
    expect(mask('date').value).toBe('۱۴۴۸/۰۵/۰۵');
    await type(mask('date'), '06', 8);
    expect(onChange).toHaveBeenLastCalledWith(at(2026, 10, 16, 21, 45));
  });
});

describe('Now + …, the month grid and the time picker', () => {
  it('+5 min sets now plus five minutes, to the second', async () => {
    const onChange = vi.fn();
    const now = new Date(2026, 9, 15, 21, 40, 30, 600).getTime();
    await render(createElement(Host, { mode: 'datetime', initial: '', onChange, now: () => now }));
    await click(button('[data-now-plus="+5 min"]'));
    expect(onChange).toHaveBeenLastCalledWith(at(2026, 10, 15, 21, 45, 30));
    expect(mask('time').value).toBe('۲۱:۴۵:۳۰');
  });

  it('the calendar icon opens the month the field holds, right to left in Jalali; a day keeps the time', async () => {
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

  it('🔴 the clock icon opens hours, minutes and seconds — the time held pressed — and Now', async () => {
    const onChange = vi.fn();
    const now = new Date(2026, 9, 15, 8, 9, 10).getTime();
    await render(
      createElement(Host, {
        mode: 'datetime',
        initial: at(2026, 10, 15, 21, 45),
        onChange,
        now: () => now,
      }),
    );
    await click(button('[data-datetime-clock-button]'));
    const clock = document.querySelector('[data-datetime-clock]');
    expect(
      [...(clock?.querySelectorAll('[role="group"]') ?? [])].map((g) =>
        g.getAttribute('aria-label'),
      ),
    ).toEqual(['Hours', 'Minutes', 'Seconds']);
    expect(button('[aria-label="Hours 21"]').getAttribute('aria-pressed')).toBe('true');
    expect(button('[aria-label="Minutes 45"]').getAttribute('aria-pressed')).toBe('true');
    await click(button('[aria-label="Hours 06"]'));
    expect(onChange).toHaveBeenLastCalledWith(at(2026, 10, 15, 6, 45));
    await click(button('[aria-label="Seconds 30"]'));
    expect(onChange).toHaveBeenLastCalledWith(at(2026, 10, 15, 6, 45, 30));
    await click(button('[data-datetime-clock-now]'));
    expect(onChange).toHaveBeenLastCalledWith(at(2026, 10, 15, 8, 9, 10));
    expect(document.querySelector('[data-datetime-clock]')).toBeNull();
  });
});

describe('a time of day', () => {
  it('shows the time input only and stores HH:mm, seconds optional', async () => {
    const onChange = vi.fn();
    await render(createElement(Host, { mode: 'timeofday', initial: '', onChange }));
    expect(container?.querySelector('[data-datetime-mask="date"]')).toBeNull();
    expect(container?.querySelector('[data-calendar-choice]')).toBeNull();
    await type(mask('time'), '1205');
    expect(onChange).toHaveBeenLastCalledWith('12:05');
    await type(mask('time'), '30', 6);
    expect(onChange).toHaveBeenLastCalledWith('12:05:30');
  });
});
