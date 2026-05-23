import { z } from 'zod';
import { AuditEntrySchema } from './audit.js';
import { TallyEventSchema } from './tally.js';

/** Effects — the state-machine's outputs. Consumed by the Runtime services. */
export const EffectSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('amcp.send'),
    target: z.enum(['primary', 'backup', 'both']),
    line: z.string(),
    seq: z.number().int().nonnegative(),
    expectAck: z.boolean(),
  }),
  z.object({
    kind: z.literal('audit.append'),
    entry: AuditEntrySchema,
  }),
  z.object({
    kind: z.literal('journal.append'),
    // Forward-declared shape — journal records reference Intents/OSC/Effects
    // themselves, so we accept `unknown` here and validate via JournalRecord
    // at the journal-write boundary instead. Avoids a circular schema.
    record: z.unknown(),
  }),
  z.object({
    kind: z.literal('ui.notify'),
    severity: z.enum(['info', 'warn', 'error']),
    message: z.string(),
  }),
  z.object({
    kind: z.literal('tally.emit'),
    event: TallyEventSchema,
  }),
  z.object({
    kind: z.literal('reconciler.requestResync'),
  }),
]);
export type Effect = z.infer<typeof EffectSchema>;
