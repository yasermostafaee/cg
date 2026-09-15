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
/**
 * 🔴 `TIMING-WIRE-22 · DELTA B · R3` — a `set-pass-timing` row's VALUE, as one clause.
 *
 * ── WHY THE WORDING IS HERE AND NOT IN THE RECORD ───────────────────────────
 *
 * The entry stores DATA (`{ passes?, delayMs? }`) and this turns it into words, which is
 * `B-211`'s rule applied to a value rather than a name: the record keeps what cannot be
 * re-derived, the surface does the wording. A stored sentence could not be re-worded, could not
 * be translated, and would be a fourth copy of a vocabulary the console already owns.
 *
 * ⚠ **`Until stop`, NOT `∞`.** The Inspector's two-state control says `Until stop`, and a log
 * answering in a different vocabulary from the control that set it is the label-in-two-places
 * defect one surface along. The glyph came off that control for being unreadable.
 *
 * ⚠ `0` is a real answer and must survive: it is the instruction "out after the current pass",
 * so the tests below are written against `0` and not only against a truthy count.
 *
 * Returns `null` when there is nothing to state, so a caller renders no empty element.
 */
export function timingClause(
  timing: { passes?: number | 'infinite' | undefined; delayMs?: number | undefined } | undefined,
): string | null {
  if (timing === undefined) return null;
  const parts: string[] = [];
  if (timing.passes !== undefined) {
    parts.push(timing.passes === 'infinite' ? 'until stop' : `${String(timing.passes)} passes`);
  }
  if (timing.delayMs !== undefined) {
    parts.push(`gap ${String(Math.round(timing.delayMs / 100) / 10)} s`);
  }
  return parts.length === 0 ? null : parts.join(' · ');
}

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
