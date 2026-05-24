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
    'lock-engage',
    'lock-release',
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
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;
