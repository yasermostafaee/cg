import type { AuditEntry } from '@cg/shared-schema';
import {
  defaultLayerAlias,
  isFixedBankLayer,
  layerAlias,
  type FixedLayerBank,
  type TemplateInfo,
} from '@cg/shared-ipc';
import { templateDisplayName } from '../library/templateName.js';

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
 */

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

/**
 * A UUID-shaped id, shortened for display: an `item-` prefix is kept (it says what KIND
 * of id this is), then the first eight hex characters, then an ellipsis. Anything short
 * enough to read is left alone. The full id always travels beside it — see the header.
 */
export function shortId(id: string): string {
  const match = /^(item-)?([0-9a-f]{8})-[0-9a-f-]{20,}$/i.exec(id);
  if (match === null) return id.length > 20 ? `${id.slice(0, 19)}…` : id;
  return `${match[1] ?? ''}${match[2] ?? ''}…`;
}

/**
 * What the operator calls the layer an entry names.
 *
 * A layer inside the declared bank is the ROW the operator sees — its configured alias,
 * else the default `Layer N` / `Bed N`, through the SAME two functions the layer table
 * uses (never a second spelling of the naming rule). A layer outside every bank is named
 * as CasparCG names it, with the fact that it is not a row said out loud: the two items
 * on layers 60 and 61 on 2026-09-04 were exactly that, and every surface that called them
 * "stack items" sent the operator to look for rows that did not exist.
 */
export function placeName(slot: AuditEntry['slot'], bank: FixedLayerBank | null): string | null {
  if (slot === undefined) return null;
  if (bank !== null && isFixedBankLayer(bank, slot.channel, slot.layer)) {
    return layerAlias(bank, slot.layer) ?? defaultLayerAlias(bank, slot.layer);
  }
  const channel = bank === null || bank.channel !== slot.channel ? `${String(slot.channel)}-` : '';
  return `layer ${channel}${String(slot.layer)} (not a row)`;
}

/** The template's display name — the one rule every surface uses — or null when unknown. */
export function templateName(
  templateId: string | undefined,
  templates: ReadonlyMap<string, TemplateInfo>,
): string | null {
  if (templateId === undefined) return null;
  const info = templates.get(templateId);
  return info === undefined ? null : templateDisplayName(info);
}
