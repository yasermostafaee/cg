import { z } from 'zod';
import { IdSchema, ISODateSchema } from '../primitives.js';
import { LayerSlotSchema } from './item-state.js';

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/i, 'Expected sha256 hex');

/** One row of the always-on audit log. NDJSON on disk. */
export const AuditEntrySchema = z.object({
  ts: ISODateSchema,
  actor: z.string().min(1),
  action: z.enum([
    'load',
    'take',
    'update',
    'out',
    'remove',
    'failover',
    'reconnect',
    'import',
    'export',
    // C-012 — the graceful stop, distinct from `out`'s destroying CLEAR.
    'stop',
    // R-028 (5.4) — advancing a template's sequence (`CG NEXT`).
    'next',
    'lock-engage',
    'lock-release',
    'update-deferred',
    'update-installed',
  ]),
  itemId: IdSchema.optional(),
  templateId: IdSchema.optional(),
  templateHash: Sha256Schema.optional(),
  dataHash: Sha256Schema.optional(),
  server: z.enum(['primary', 'backup', 'both']).optional(),
  slot: LayerSlotSchema.optional(),
  ackMs: z.number().nonnegative().optional(),
  oscConfirmMs: z.number().nonnegative().optional(),
  outcome: z.enum(['ok', 'failed', 'timeout']),
  errorCode: z.string().optional(),
  /**
   * `B-209` — the AMCP line CasparCG answered with the code above, payload elided.
   *
   * `amcp-404` alone says the server refused SOMETHING; a take sends up to five
   * commands and the code is the same whichever one failed. Recorded beside the
   * code so the record can say WHICH verb on WHICH layer was refused — the one
   * fact the station could not produce for itself on 2026-09-04, when fourteen
   * takes in a row answered `amcp-404` and nothing anywhere had kept the line.
   * Absent on an accepted action and on a refusal that never reached the wire.
   */
  command: z.string().max(256).optional(),
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;
