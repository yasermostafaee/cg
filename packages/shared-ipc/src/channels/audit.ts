import { z } from 'zod';
import { AuditEntrySchema } from '@cg/shared-schema';
import { defineChannel } from '../channel.js';
import { definePublishChannel } from '../publish.js';

/**
 * Audit log read channel (Phase 8 §11 / M8.5).
 *
 * The writer side has been live since M5; this is the operator-facing
 * tail. Both apps register it — the Designer surfaces only its own
 * import/export rows, the Runtime surfaces stack + lock + failover.
 */

/**
 * B-141 — WHAT THE PANEL NEEDS TO STOP ASSERTING A FACT IT CANNOT KNOW.
 *
 * "No audit entries yet." cannot tell _nothing happened_ from _nothing is
 * recorded_ from _this build has no writer_, and the operator reading it
 * concludes the session was quiet. That is this project's own recurring error
 * written into the product: a negative observation is not a result until a
 * positive control proves the instrument is live.
 *
 * This channel IS the positive control. `configured` says whether a writer
 * exists at all, `errorCount` / `lastError` say whether it is failing, and only
 * a configured, non-failing, genuinely empty read may be reported as quiet.
 */
export const AuditHealthChannel = defineChannel(
  'audit.health',
  z.object({}),
  z.object({
    /** A writer is configured — without one, nothing was ever going to be recorded. */
    configured: z.boolean(),
    /** Where the NDJSON lives, so the operator can be told where to look. */
    path: z.string().nullable(),
    /** Failed appends since boot. Non-zero means entries are MISSING, not absent. */
    errorCount: z.number().int().nonnegative(),
    /** The most recent write failure's message, or null. */
    lastError: z.string().nullable(),
  }),
);

export const AuditRecentChannel = defineChannel(
  'audit.recent',
  z.object({
    limit: z.number().int().positive().max(1000).optional(),
    /**
     * Optional exact-match filters. Server-side filtering avoids
     * round-tripping a huge payload when the operator filters by
     * a rare action.
     */
    action: AuditEntrySchema.shape.action.optional(),
    actor: z.string().min(1).optional(),
  }),
  z.array(AuditEntrySchema),
);

/**
 * 🔴 `CONSOLE-POLISH-01` (`R-083`) — **WHAT THE LOG IS NARROWED TO.** Every field optional; each
 * stated one must hold (`auditMatches`). `channel` — the CasparCG channel a row is about;
 * `actor` — exact, as the record writes it; `search` — what the row SHOWS, case-folded.
 */
export const AuditFilterSchema = z.object({
  channel: z.number().int().positive().optional(),
  actor: z.string().min(1).max(200).optional(),
  action: AuditEntrySchema.shape.action.optional(),
  outcome: AuditEntrySchema.shape.outcome.optional(),
  search: z.string().min(1).max(200).optional(),
});
export type AuditFilter = z.infer<typeof AuditFilterSchema>;

/**
 * Where the next page starts: the record FILE, named by the time of its first row (a rotated file
 * keeps that name, so a rotation between two pages loses nothing), and the byte the next page ends
 * before. Opaque to the console — it hands back what it was given.
 */
export const AuditCursorSchema = z.object({
  file: z.string().min(1).max(64),
  before: z.number().int().nonnegative(),
});
export type AuditCursor = z.infer<typeof AuditCursorSchema>;

/** The most rows one page carries. */
export const AUDIT_PAGE_SIZE = 100;

/**
 * 🔴 `CONSOLE-POLISH-01` (`R-083`) — **THE LOG, A PAGE AT A TIME, NEWEST FIRST.** The owner's record
 * is long, and `audit.recent` read the whole file to keep 200. A page is the next (up to) 100 rows
 * before `cursor` — from the newest without one — that pass `filter` AND that this console's sign-in
 * may be told (its channel grant), both applied by CG Bridge BEFORE the page is cut. `next` is `null`
 * when nothing older is left.
 */
export const AuditPageChannel = defineChannel(
  'audit.page',
  z.object({
    cursor: AuditCursorSchema.optional(),
    filter: AuditFilterSchema.optional(),
  }),
  z.object({
    entries: z.array(AuditEntrySchema).max(AUDIT_PAGE_SIZE),
    next: AuditCursorSchema.nullable(),
  }),
);

/**
 * `R-083` — a row CG Bridge has just recorded, pushed to every console that may be told its channel,
 * so an open Log shows it at the top without being asked.
 */
export const AuditAppendedChannel = definePublishChannel('audit.appended', AuditEntrySchema);
