import { z } from 'zod';
import { IdSchema, ISODateSchema } from '../primitives.js';

/**
 * Tally events emitted by the state-machine for downstream adapters
 * (GPO/NDI/MIDI). v1 emits them; v2 routes them. Placeholder shape — will
 * be refined when the TallyAdapter is wired in M9.
 */
export const TallyEventSchema = z.object({
  event: z.enum(['take', 'out', 'failover', 'error']),
  itemId: IdSchema.optional(),
  ts: ISODateSchema,
});
export type TallyEvent = z.infer<typeof TallyEventSchema>;
