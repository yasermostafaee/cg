import { z } from 'zod';
import { defineChannel } from '../channel.js';
import { definePublishChannel } from '../publish.js';

/**
 * `DELTA-RUN-NEXT-VERSION-01-C` §1 — **THE STATION'S CALENDAR SETTINGS**: today, the Lunar Hijri day
 * adjustment alone.
 *
 * The officially announced Lunar Hijri date in Iran is decided by sighting, and can differ from any
 * calculation (`@cg/text-shaping` uses `Intl`'s `islamic-umalqura`) by a day. The adjustment moves
 * the Lunar Hijri READING and ENTRY of a date by whole days — never the stored value, which is ISO
 * whatever calendar is shown — so the operators of one station must all read the same lunar day.
 * That makes it the station's, owned by CG Bridge and persisted beside the templates, for the
 * reasons the delimiter list is (`delimiters.ts`): one gallery, one answer, and it survives a
 * restart.
 *
 * ⚠ The range is spelled here as `-2 … +2` because this package does not depend on
 * `@cg/text-shaping`; its `LUNAR_ADJUST_MIN` / `LUNAR_ADJUST_MAX` are the same two numbers, and CG
 * Control's calendar store test pins that they agree.
 */
export const LUNAR_ADJUST_DAYS_MIN = -2;
export const LUNAR_ADJUST_DAYS_MAX = 2;

export const CalendarSettingsSchema = z.object({
  /** Whole days added to the calculated Lunar Hijri date; 0 is the calculation itself. */
  lunarAdjustDays: z.number().int().min(LUNAR_ADJUST_DAYS_MIN).max(LUNAR_ADJUST_DAYS_MAX),
});
export type CalendarSettings = z.infer<typeof CalendarSettingsSchema>;

/** What a station that never set anything answers: the calculation, unadjusted. */
export const DEFAULT_CALENDAR_SETTINGS: CalendarSettings = { lunarAdjustDays: 0 };

/** The settings in force. A read: every console needs them to read a lunar date. */
export const CalendarGetChannel = defineChannel('calendar.get', z.void(), CalendarSettingsSchema);

/**
 * Replace the settings — a `station-admin` route, as `delimiters.set` is. The request schema IS the
 * range check, so a value outside `-2 … +2` never reaches the store from any client.
 */
export const CalendarSetChannel = defineChannel(
  'calendar.set',
  CalendarSettingsSchema,
  z.object({ ok: z.boolean(), message: z.string().optional() }),
);

/** Pushed with the full settings whenever they change, so every console converges. */
export const CalendarChangedChannel = definePublishChannel(
  'calendar.changed',
  CalendarSettingsSchema,
);
