/**
 * `B-210` / `B-211` — how one audit row is READ.
 *
 * The record on disk is right and must stay exactly as it is: an ISO-8601 UTC stamp to
 * the millisecond, and the stable ids of the item and the template. Those are what make
 * it a record. What the operator was shown was the record verbatim, and on 2026-09-04
 * that cost the diagnosis twice over:
 *
 *   - **`2026-09-04T12:18:47.561Z` is 15:48:47 in the control room.** The station is at
 *     UTC+3:30; a `Z` at the end of a 24-character string is the easiest thing on the
 *     screen to miss, and an operator correlating a row with what went out at a wall-clock
 *     time is then three and a half hours off. That is a hazard, not a style point.
 *   - **`item-e602d912-… · f00a5363-…` names nothing the operator has ever typed or seen.**
 *     The row's name is `Bed 1`; the template's is `3ghab`. Two UUIDs per row is a column
 *     an operator cannot read, in a dialog whose whole purpose is to be read after the fact.
 *
 * So the surface shows LOCAL time to the second (the date only where it changes down the
 * list) and the NAMES the operator already sees, and keeps the UTC stamp and the ids one
 * hover or one click away. ⚠ **The ids are not removed.** A name can be renamed or
 * repeated; an id cannot. Shortening a UUID to its first eight characters for DISPLAY is
 * fine — the full id stays in the element's `title` and on the copy button — deleting it
 * would turn a forensic record into a story.
 *
 * Kept React-free so the two facts above are unit-testable: a fixed instant in a fixed
 * zone renders a fixed string, and a fixed pair of records tells the date band when to
 * appear.
 *
 * ── WHAT MOVED OUT, AND WHY THIS FILE STILL EXPORTS IT ──────────────────────
 *
 * `shortId`, `placeName` and `templateName` are no longer defined here: `B-232` found the
 * FOURTH surface printing a raw id at an operator, so the naming rule they implement now
 * lives where a rule belongs — `ui/operatorNaming.ts`, which states it in one place and
 * serves every surface. They are re-exported rather than re-imported at each call site so
 * this file's readers and tests keep one path to them. It is the same implementation; a
 * second copy is precisely what the move exists to prevent.
 *
 * What stays here is what is genuinely the AUDIT LOG's own: the local-clock reading of a
 * record's UTC stamp.
 */

export {
  placeName,
  shortId,
  templateName,
  type NameableSlot,
  type OperatorRowName,
} from '../../ui/operatorNaming.js';

export interface AuditTimeParts {
  /** `YYYY-MM-DD` in the display zone — shown only where it changes down the list. */
  date: string;
  /** `HH:MM:SS`, 24-hour, in the display zone. */
  time: string;
  /** The record's own stamp, untouched — the tooltip and the copy. */
  utc: string;
}

/**
 * The local reading of one ISO stamp. `timeZone` is for tests and for a console that
 * deliberately reads in another zone; the default is the browser's own, which is the
 * control room's wall clock.
 *
 * An unparseable stamp is rendered as itself: the record is never rewritten to look
 * tidier than it is.
 */
export function auditTimeParts(ts: string, timeZone?: string): AuditTimeParts {
  const instant = Date.parse(ts);
  if (!Number.isFinite(instant)) return { date: '', time: ts, utc: ts };
  const parts = new Intl.DateTimeFormat('en-GB', {
    ...(timeZone !== undefined ? { timeZone } : {}),
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant));
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}:${get('second')}`,
    utc: ts,
  };
}
