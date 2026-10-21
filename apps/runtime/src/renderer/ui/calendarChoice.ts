import { useSyncExternalStore } from 'react';
import { DEFAULT_CALENDAR, isCalendarSystem, type CalendarSystem } from '@cg/text-shaping';

/**
 * `DELTA-RUN-NEXT-VERSION-01-C` §1 — **WHICH CALENDAR THIS VIEWER READS DATES IN**: Jalali by
 * default, Gregorian or Lunar Hijri by choice, remembered per browser.
 *
 * A per-viewer CONVENIENCE and nothing more, which is why browser storage is the right home: the
 * stored value of every date is ISO whatever calendar is shown, so two operators reading one row in
 * two calendars are reading the same instant. Every read and write is guarded — storage can be
 * absent or refuse (a private window, cleared site data), and then the default simply stands.
 *
 * One module-level value with a subscription, so every date and time control on the screen switches
 * together when one of them is switched.
 */

export const CALENDAR_CHOICE_KEY = 'cg.runtime.calendar.v1';

let current: CalendarSystem | null = null;
const listeners = new Set<() => void>();

function stored(): CalendarSystem {
  try {
    const raw = window.localStorage.getItem(CALENDAR_CHOICE_KEY);
    if (isCalendarSystem(raw)) return raw;
  } catch {
    // No storage here: the default stands.
  }
  return DEFAULT_CALENDAR;
}

/** The calendar this viewer reads dates in. */
export function calendarChoice(): CalendarSystem {
  current ??= stored();
  return current;
}

/** Choose the calendar; remembered in this browser when it can be. */
export function setCalendarChoice(next: CalendarSystem): void {
  current = next;
  try {
    window.localStorage.setItem(CALENDAR_CHOICE_KEY, next);
  } catch {
    // Not remembered — still in force for this page.
  }
  for (const l of [...listeners]) l();
}

export function subscribeCalendarChoice(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The choice and its setter, re-rendering when any control switches it. */
export function useCalendarChoice(): [CalendarSystem, (next: CalendarSystem) => void] {
  const value = useSyncExternalStore(subscribeCalendarChoice, calendarChoice, calendarChoice);
  return [value, setCalendarChoice];
}

/** Test seam — forget the cached choice so the next read goes back to storage. */
export function __resetCalendarChoiceForTest(): void {
  current = null;
}
