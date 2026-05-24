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
