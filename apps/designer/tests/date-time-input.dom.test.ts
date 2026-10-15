/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { isoOfParts, partsOfIso } from '@cg/text-shaping';
import { DateTimeInput } from '../src/renderer/ui/DateTimeInput.js';

/**
 * 🔴 `DELTA-RUN-NEXT-VERSION-01-B` §2 / `-C` §1 — the shared date and time control: typed segments
 * in any digit set, ↑ / ↓, a refused out-of-range value, a pasted date, three calendars that change
 * what is SHOWN and never what is STORED, the other calendars as facts, and the Now + shortcuts.
 * (Layout, 200 % text and RTL are measured in a real browser — `tests/e2e/date-time-input.spec.ts`.)
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

const seg = (host: ParentNode, name: string): HTMLInputElement => {
  const el = host.querySelector<HTMLInputElement>(`input[aria-label="Target ${name}"]`);
  if (el === null) throw new Error(`no ${name}`);
  return el;
};

function type(input: HTMLInputElement, value: string): void {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
}

function key(input: HTMLInputElement, k: string): void {
  act(() => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  });
}

const segments = (host: ParentNode): string[] =>
  [...host.querySelectorAll<HTMLInputElement>('[data-testid="datetime-input"] input')].map(
    (i) => i.value,
  );

describe('-B §2 — typed segments', () => {
  it('🔴 shows Solar Hijri by default, in the digits asked for, with the two other calendars as facts', () => {
    const host = mount({
      mode: 'datetime',
      value: VALUE,
      onCommit: () => undefined,
      ariaLabel: 'Target',
    });
    expect(segments(host)).toEqual(['1405', '07', '23', '21', '30', '00']);
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
    expect(segments(host)).toEqual(['۱۴۰۵', '۰۷', '۲۳', '۲۱', '۳۰', '۰۰']);
  });

  it('🔴 a segment typed in Persian digits commits the ISO instant; a value out of range is REFUSED, not clamped', () => {
    const onCommit = vi.fn();
    const host = mount({ mode: 'datetime', value: VALUE, onCommit, ariaLabel: 'Target' });
    type(seg(host, 'day'), '۲۴');
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(partsOfIso(onCommit.mock.calls[0]?.[0] as string, 'gregorian')).toEqual(
      expect.objectContaining({ year: 2026, month: 10, day: 16, hour: 21, minute: 30 }),
    );
    type(seg(host, 'month'), '13');
    type(seg(host, 'hour'), '24');
    expect(onCommit).toHaveBeenCalledTimes(1);
    // The refused segment shows the stored value again.
    expect(seg(host, 'month').value).toBe('07');
  });

  it('↑ / ↓ step a segment inside its own range', () => {
    const onCommit = vi.fn();
    const host = mount({ mode: 'datetime', value: VALUE, onCommit, ariaLabel: 'Target' });
    key(seg(host, 'minute'), 'ArrowUp');
    expect(partsOfIso(onCommit.mock.calls[0]?.[0] as string, 'gregorian')).toEqual(
      expect.objectContaining({ hour: 21, minute: 31 }),
    );
    key(seg(host, 'hour'), 'ArrowDown');
    expect(partsOfIso(onCommit.mock.calls[1]?.[0] as string, 'gregorian')).toEqual(
      expect.objectContaining({ hour: 20, minute: 30 }),
    );
  });

  it('a pasted date and time fills every segment it names', () => {
    const onCommit = vi.fn();
    const host = mount({ mode: 'datetime', value: VALUE, onCommit, ariaLabel: 'Target' });
    const year = seg(host, 'year');
    act(() => {
      const ev = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(ev, 'clipboardData', { value: { getData: () => '۱۴۰۵/۰۸/۰۱ ۰۸:۱۵' } });
      year.dispatchEvent(ev);
    });
    // 1 Aban 1405 = 23 October 2026.
    expect(partsOfIso(onCommit.mock.calls[0]?.[0] as string, 'gregorian')).toEqual(
      expect.objectContaining({ year: 2026, month: 10, day: 23, hour: 8, minute: 15, second: 0 }),
    );
  });
});

describe('-C §1 — three calendars: what is shown, never what is stored', () => {
  it('🔴 switching the calendar re-reads the segments, commits NOTHING, and is remembered', () => {
    const onCommit = vi.fn();
    const host = mount({ mode: 'datetime', value: VALUE, onCommit, ariaLabel: 'Target' });
    const calendar = host.querySelector<HTMLSelectElement>('[data-testid="datetime-calendar"]');
    if (calendar === null) throw new Error('no calendar');
    act(() => {
      calendar.value = 'gregorian';
      calendar.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(segments(host)).toEqual(['2026', '10', '15', '21', '30', '00']);
    expect(onCommit).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('cg.designer.calendar.v1')).toBe('gregorian');
    // A day typed now is a GREGORIAN day.
    type(seg(host, 'day'), '20');
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
    const before = segments(host)[2];
    act(() => {
      if (adjust === null) return;
      adjust.value = '1';
      adjust.dispatchEvent(new Event('change', { bubbles: true }));
    });
    // The same instant reads one Lunar day later.
    expect(Number(segments(host)[2])).not.toBe(Number(before));
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

  it('a time of day shows hour and minute only, offers no calendar, and stores HH:mm', () => {
    const onCommit = vi.fn();
    const host = mount({ mode: 'timeofday', value: '20:32', onCommit, ariaLabel: 'Target' });
    expect(segments(host)).toEqual(['20', '32']);
    expect(host.querySelector('[data-testid="datetime-calendar"]')).toBeNull();
    type(seg(host, 'minute'), '45');
    expect(onCommit).toHaveBeenCalledWith('20:45');
  });
});
