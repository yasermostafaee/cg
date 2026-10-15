import { useSyncExternalStore } from 'react';
import type { CalendarSettings } from '@cg/shared-ipc';
import { clampLunarAdjust } from '@cg/text-shaping';
import { BRIDGE_SKEW_MESSAGE, isBridgeSkewMessage } from '../../../shared/bridgeSkew.js';

/**
 * `DELTA-RUN-NEXT-VERSION-01-C` §1 — the renderer's view of the station's Lunar Hijri day
 * adjustment (−2 … +2), the `delimiterStore` pattern exactly.
 *
 * THE BRIDGE OWNS THE VALUE (`calendar.get` / `calendar.set` / `calendar.changed`, persisted as
 * `calendar.json`); this is a cache of it, so the date and time control can read it synchronously.
 * Until the first answer lands it holds 0 — the calculation itself — and a bridge that is down at
 * boot leaves 0 standing until the first push after reconnect corrects it.
 *
 * The adjustment moves the Lunar Hijri READING and ENTRY of a date only. The stored value of every
 * date is ISO whatever calendar is shown, so this changes nothing anyone has already staged.
 */

let adjust = 0;
let version = 0;
const listeners = new Set<() => void>();

function publish(next: CalendarSettings): void {
  const clamped = clampLunarAdjust(next.lunarAdjustDays);
  if (clamped === adjust) return;
  adjust = clamped;
  version += 1;
  for (const l of [...listeners]) l();
}

/** The station's Lunar Hijri adjustment in days, as last told. */
export function lunarAdjustDays(): number {
  return adjust;
}

export function subscribeCalendar(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function calendarVersion(): number {
  return version;
}

/** The adjustment, re-rendering when the station's changes. */
export function useLunarAdjustDays(): number {
  useSyncExternalStore(subscribeCalendar, calendarVersion, calendarVersion);
  return adjust;
}

/** Pull the setting and stay subscribed to the bridge's pushes. Called once from the app shell. */
export function initCalendar(bridge: {
  calendar: {
    get: () => Promise<CalendarSettings>;
    onChanged: (handler: (settings: CalendarSettings) => void) => () => void;
  };
}): () => void {
  const unsubscribe = bridge.calendar.onChanged(publish);
  void bridge.calendar
    .get()
    .then(publish)
    .catch(() => {
      // Bridge down, or older than this channel: the calculation stands until a push says otherwise.
    });
  return unsubscribe;
}

/**
 * Set the station's adjustment. Returns the operator-facing refusal, or `null` once ACCEPTED — the
 * cache moves only on the bridge's yes, never optimistically (`delimiterStore`'s reason).
 */
export async function setLunarAdjustDays(days: number): Promise<string | null> {
  try {
    const res = await window.cg.calendar.set({ lunarAdjustDays: days });
    if (!res.ok) return res.message ?? 'The Lunar Hijri adjustment could not be saved.';
    publish({ lunarAdjustDays: days });
    return null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isBridgeSkewMessage(message)) {
      return `${BRIDGE_SKEW_MESSAGE} The Lunar Hijri adjustment can be read, but not changed.`;
    }
    return message === '' ? 'The Lunar Hijri adjustment could not be saved.' : message;
  }
}

/** Test seam — restore the pre-boot state. */
export function __resetCalendarForTest(): void {
  adjust = 0;
  version += 1;
}
