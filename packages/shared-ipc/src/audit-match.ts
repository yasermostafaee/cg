import type { AuditEntry } from '@cg/shared-schema';
import type { BankSet } from './channels/fixedLayers.js';
import type { AuditFilter } from './channels/audit.js';
import { commandForDisplay, placeName, timingClause } from './operator-naming.js';

/**
 * 🔴 `CONSOLE-POLISH-01` (`R-083`) — **WHICH AUDIT ROWS A FILTER KEEPS: ONE PREDICATE.**
 *
 * CG Bridge asks it while it pages the record (the filters and the search run THERE, before a page
 * is cut, so a page of 100 is 100 matching rows), and the console asks it for a row pushed while the
 * Log is open (`audit.appended`), so a live row joins the list only if a page would have held it. Two
 * readers, one answer (golden rule 6).
 */

/** The CasparCG channel a row is about: its layer's, else the channel a refusal was about. */
export function auditChannelOf(entry: AuditEntry): number | undefined {
  return entry.slot?.channel ?? entry.refused?.casparChannel;
}

/** How a reader names a row's place and template — the bank set and the template list it holds. */
export interface AuditNaming {
  readonly bank: BankSet;
  /** The template's display name, as the row shows it; `null` — a template the reader does not hold. */
  readonly templateLabel: (templateId: string) => string | null;
}

/**
 * The words a row SHOWS, for the search: its place and template by name, the actor, the action, the
 * outcome, the ids, the code, the refused line as displayed (a stream's address is not on the row, so
 * it is not a hit either) and the timing clause. A hit is always something visible.
 */
export function auditShownWords(entry: AuditEntry, naming: AuditNaming): string[] {
  return [
    placeName(entry.slot, naming.bank),
    entry.templateId === undefined ? null : naming.templateLabel(entry.templateId),
    entry.actor,
    entry.action,
    entry.outcome,
    entry.itemId,
    entry.templateId,
    entry.errorCode,
    entry.command === undefined ? undefined : commandForDisplay(entry.command),
    timingClause(entry.timing),
  ].filter((v): v is string => typeof v === 'string' && v !== '');
}

/** Does `entry` pass `filter`? Each stated field must hold; the search is case-folded over {@link auditShownWords}. */
export function auditMatches(entry: AuditEntry, filter: AuditFilter, naming: AuditNaming): boolean {
  if (filter.channel !== undefined && auditChannelOf(entry) !== filter.channel) return false;
  if (filter.actor !== undefined && entry.actor !== filter.actor) return false;
  if (filter.action !== undefined && entry.action !== filter.action) return false;
  if (filter.outcome !== undefined && entry.outcome !== filter.outcome) return false;
  const q = filter.search?.trim().toLocaleLowerCase() ?? '';
  if (q === '') return true;
  return auditShownWords(entry, naming).join(' ').toLocaleLowerCase().includes(q);
}
