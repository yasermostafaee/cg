/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { isoOfParts, partsOfIso } from '@cg/text-shaping';
import { DateTimeInput } from '../src/renderer/ui/DateTimeInput.js';

/**
 * 🔴 `DELTA-RUN-NEXT-VERSION-01-B` §2 / `-C` §1, `RUN-NEXT-VERSION-03` 2.1 — the shared date and time
 * control: ONE masked date input and ONE masked time input, typed in any digit set, an impossible value
 * REFUSED with its reason, ↑ / ↓ on the part under the caret, a pasted date, three calendars that change
 * what is SHOWN and never what is STORED, the other calendars as facts, the pickers and the Now +
 * shortcuts. (Layout, 200 % text and RTL are measured in a real browser —
 * `tests/e2e/date-time-input.spec.ts`.)
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;
/** A storage of this test's own — the control keeps the calendar choice in this browser. */
const stored = new Map<string, string>();
beforeEach(() => {
  stored.clear();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => stored.get(k) ?? null,
      setItem: (k: string, v: string) => void stored.set(k, v),
      removeItem: (k: string) => void stored.delete(k),
      clear: () => stored.clear(),
    },
  });
});
afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.useRealTimers();
  document.body.innerHTML = '';
});

/** 2026-10-15 21:30:00 on THIS machine's clock, as the control stores it. */
const VALUE = isoOfParts(
  { year: 2026, month: 10, day: 15, hour: 21, minute: 30, second: 0 },
  'gregorian',
);
if (VALUE === null) throw new Error('no ISO');

function mount(props: Parameters<typeof DateTimeInput>[0]): HTMLDivElement {
  if (container === null) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }
  act(() => root?.render(createElement(DateTimeInput, props)));
  return container;
}

const mask = (host: ParentNode, kind: 'date' | 'time'): HTMLInputElement => {
  const el = host.querySelector<HTMLInputElement>(`input[aria-label="Target ${kind}"]`);
  if (el === null) throw new Error(`no ${kind}`);
  return el;
};

/** Focus, put the caret at `from`, then press each key. */
function type(input: HTMLInputElement, keys: string, from = 0): void {
  act(() => {
    input.focus();
    input.setSelectionRange(from, from);
  });
  for (const k of keys) {
    act(() => {
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }),
      );
    });
  }
}

const refusal = (host: ParentNode): string =>
  host.querySelector('[data-datetime-refusal]')?.textContent ?? '';

describe('🔴 2.1 — one masked date input and one masked time input', () => {
  it('🔴 shows Jalali by default, in the digits asked for, with the two other calendars as facts', () => {
    const host = mount({
      mode: 'datetime',
      value: VALUE,
      onCommit: () => undefined,
      ariaLabel: 'Target',
    });
    // 🔴 `RUN-NEXT-VERSION-03` 2.3 — the owner's word: Jalali (the stored choice stays `solar-hijri`).
    expect(
      [...host.querySelectorAll('[data-testid="datetime-calendar"] option')].map((o) => [
        o.getAttribute('value'),
        o.textContent,
      ]),
    ).toEqual([
      ['solar-hijri', 'Jalali'],
      ['gregorian', 'Gregorian'],
      ['lunar-hijri', 'Lunar Hijri'],
    ]);
    // Two inputs — not six boxes.
    expect(host.querySelectorAll('input')).toHaveLength(2);
    expect([mask(host, 'date').value, mask(host, 'time').value]).toEqual([
      '1405/07/23',
      '21:30:00',
    ]);
    expect(host.querySelector('[data-testid="datetime-fact-gregorian"]')?.textContent).toContain(
      '2026/10/15',
    );
    expect(host.querySelector('[data-testid="datetime-fact-lunar-hijri"]')).not.toBeNull();
    mount({
      mode: 'datetime',
      value: VALUE,
      onCommit: () => undefined,
      ariaLabel: 'Target',
      digits: 'persian',
    });
    expect(mask(host, 'date').value).toBe('۱۴۰۵/۰۷/۲۳');
  });

  it('🔴 a digit typed in Persian commits the ISO instant; an impossible one is REFUSED with its reason', () => {
    const onCommit = vi.fn();
    const host = mount({ mode: 'datetime', value: VALUE, onCommit, ariaLabel: 'Target' });
    type(mask(host, 'date'), '۴', 9);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(partsOfIso(onCommit.mock.calls[0]?.[0] as string, 'gregorian')).toEqual(
      expect.objectContaining({ year: 2026, month: 10, day: 16, hour: 21, minute: 30 }),
    );
    type(mask(host, 'date'), '13', 5);
    expect(refusal(host)).toBe('There is no month 13.');
    type(mask(host, 'time'), '24', 0);
    expect(refusal(host)).toBe('Hours run from 00 to 23.');
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('↑ / ↓ step the part under the caret inside its own range', () => {
    const onCommit = vi.fn();
    const host = mount({ mode: 'datetime', value: VALUE, onCommit, ariaLabel: 'Target' });
    const time = mask(host, 'time');
    type(time, '', 4);
    act(() => {
      time.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }),
      );
    });
    expect(partsOfIso(onCommit.mock.calls[0]?.[0] as string, 'gregorian')).toEqual(
      expect.objectContaining({ hour: 21, minute: 31 }),
    );
    type(time, '', 1);
    act(() => {
      time.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
      );
    });
    // This host does not take the value back (a bare spy): the hour steps from the STORED 21:30.
    expect(partsOfIso(onCommit.mock.calls[1]?.[0] as string, 'gregorian')).toEqual(
      expect.objectContaining({ hour: 20, minute: 30 }),
    );
  });

  it('a pasted date and time fills both inputs', () => {
    const onCommit = vi.fn();
    const host = mount({ mode: 'datetime', value: VALUE, onCommit, ariaLabel: 'Target' });
    act(() => {
      const ev = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(ev, 'clipboardData', { value: { getData: () => '۱۴۰۵/۰۸/۰۱ ۰۸:۱۵' } });
      mask(host, 'date').dispatchEvent(ev);
    });
    // 1 Aban 1405 = 23 October 2026.
    expect(partsOfIso(onCommit.mock.calls[0]?.[0] as string, 'gregorian')).toEqual(
      expect.objectContaining({ year: 2026, month: 10, day: 23, hour: 8, minute: 15, second: 0 }),
    );
  });
});

describe('-C §1 — three calendars: what is shown, never what is stored', () => {
  it('🔴 switching the calendar re-reads the date, commits NOTHING, and is remembered', () => {
    const onCommit = vi.fn();
    const host = mount({ mode: 'datetime', value: VALUE, onCommit, ariaLabel: 'Target' });
    const calendar = host.querySelector<HTMLSelectElement>('[data-testid="datetime-calendar"]');
    if (calendar === null) throw new Error('no calendar');
    act(() => {
      calendar.value = 'gregorian';
      calendar.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(mask(host, 'date').value).toBe('2026/10/15');
    expect(onCommit).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('cg.designer.calendar.v1')).toBe('gregorian');
    // A day typed now is a GREGORIAN day.
    type(mask(host, 'date'), '20', 8);
    expect(partsOfIso(onCommit.mock.calls[0]?.[0] as string, 'gregorian')).toEqual(
      expect.objectContaining({ year: 2026, month: 10, day: 20 }),
    );
  });

  it('the Lunar Hijri reading offers the day adjustment −2 … +2', () => {
    window.localStorage.setItem('cg.designer.calendar.v1', 'lunar-hijri');
    const host = mount({
      mode: 'datetime',
      value: VALUE,
      onCommit: () => undefined,
      ariaLabel: 'Target',
    });
    const adjust = host.querySelector<HTMLSelectElement>('[data-testid="datetime-lunar-adjust"]');
    expect([...(adjust?.options ?? [])].map((o) => o.value)).toEqual(['-2', '-1', '0', '1', '2']);
    const before = mask(host, 'date').value;
    act(() => {
      if (adjust === null) return;
      adjust.value = '1';
      adjust.dispatchEvent(new Event('change', { bubbles: true }));
    });
    // The same instant reads one Lunar day later.
    expect(mask(host, 'date').value).not.toBe(before);
  });
});

describe('🔴 2.1 — the pickers', () => {
  it('the calendar icon opens the month the date holds, right to left in Jalali; a day keeps the time', () => {
    const onCommit = vi.fn();
    const host = mount({ mode: 'datetime', value: VALUE, onCommit, ariaLabel: 'Target' });
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Pick a date"]')?.click());
    const panel = document.querySelector('[data-cg-popover]');
    expect(panel?.getAttribute('dir')).toBe('rtl');
    expect(panel?.querySelectorAll('[data-datetime-day]')).toHaveLength(30);
    expect(panel?.querySelector('[data-datetime-day="23"]')?.getAttribute('aria-pressed')).toBe(
      'true',
    );
    act(() => panel?.querySelector<HTMLButtonElement>('[data-datetime-day="25"]')?.click());
    expect(partsOfIso(onCommit.mock.calls[0]?.[0] as string, 'gregorian')).toEqual(
      expect.objectContaining({ year: 2026, month: 10, day: 17, hour: 21, minute: 30 }),
    );
    expect(document.querySelector('[data-cg-popover]')).toBeNull();
  });

  it('the clock icon opens hours, minutes, seconds — the time held pressed — and Now', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 15, 8, 9, 10));
    const onCommit = vi.fn();
    const host = mount({ mode: 'datetime', value: VALUE, onCommit, ariaLabel: 'Target' });
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Pick a time"]')?.click());
    const panel = document.querySelector('[data-cg-popover]');
    expect(
      [...(panel?.querySelectorAll('[role="group"]') ?? [])].map((g) =>
        g.getAttribute('aria-label'),
      ),
    ).toEqual(['Hours', 'Minutes', 'Seconds']);
    expect(panel?.querySelector('[aria-label="Hours 21"]')?.getAttribute('aria-pressed')).toBe(
      'true',
    );
    act(() => panel?.querySelector<HTMLButtonElement>('[aria-label="Minutes 05"]')?.click());
    expect(partsOfIso(onCommit.mock.calls[0]?.[0] as string, 'gregorian')).toEqual(
      expect.objectContaining({ hour: 21, minute: 5 }),
    );
    act(() => panel?.querySelector<HTMLButtonElement>('[data-datetime-clock-now]')?.click());
    expect(partsOfIso(onCommit.mock.calls[1]?.[0] as string, 'gregorian')).toEqual(
      expect.objectContaining({ day: 15, hour: 8, minute: 9, second: 10 }),
    );
    expect(document.querySelector('[data-cg-popover]')).toBeNull();
  });
});

describe('-B §2 — the Now + shortcuts and the time of day', () => {
  it('+5 min sets the target five minutes from now, to the whole second', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 15, 21, 30, 12, 700));
    const onCommit = vi.fn();
    const host = mount({ mode: 'datetime', value: VALUE, onCommit, ariaLabel: 'Target' });
    const plus5 = [...host.querySelectorAll('button')].find((b) => b.textContent === '+5 min');
    act(() => plus5?.click());
    expect(Date.parse(onCommit.mock.calls[0]?.[0] as string)).toBe(
      new Date(2026, 9, 15, 21, 35, 12, 0).getTime(),
    );
  });

  it('a time of day shows the time input only, offers no calendar, and stores HH:mm', () => {
    const onCommit = vi.fn();
    const host = mount({ mode: 'timeofday', value: '20:32', onCommit, ariaLabel: 'Target' });
    expect(host.querySelectorAll('input')).toHaveLength(1);
    expect(mask(host, 'time').value).toBe('20:32:00');
    expect(host.querySelector('[data-testid="datetime-calendar"]')).toBeNull();
    type(mask(host, 'time'), '45', 3);
    expect(onCommit).toHaveBeenCalledWith('20:45');
  });
});
