import { useSyncExternalStore } from 'react';
import { isCalendarSystem, type CalendarSystem, type DigitSet } from '@cg/text-shaping';
import type { Locale } from '../../i18n/locale.js';

const KEY = 'cg.runtime.audit-calendar.v1';
const DEFAULT_CALENDAR = 'gregorian';
const listeners = new Set<() => void>();
let current: CalendarSystem | undefined;

function readCalendar(): CalendarSystem {
  if (current !== undefined) return current;
  try {
    const stored = localStorage.getItem(KEY);
    if (isCalendarSystem(stored)) return stored;
  } catch {
    // The Gregorian default is also used when browser storage is unavailable.
  }
  return DEFAULT_CALENDAR;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setAuditCalendar(next: CalendarSystem): void {
  if (next === readCalendar()) return;
  current = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // The preference is still usable for the current console session.
  }
  for (const listener of listeners) listener();
}

export function useAuditCalendar(): CalendarSystem {
  return useSyncExternalStore(subscribe, readCalendar, readCalendar);
}

export const AUDIT_DIGITS: Record<Locale, DigitSet> = {
  en: 'latin',
  fa: 'persian',
  ar: 'arabic-indic',
};
