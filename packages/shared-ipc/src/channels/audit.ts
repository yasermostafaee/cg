import { z } from 'zod';
import { AuditEntrySchema } from '@cg/shared-schema';
import { defineChannel } from '../channel.js';

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
