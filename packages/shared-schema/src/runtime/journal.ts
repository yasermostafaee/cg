import { z } from 'zod';
import { IdSchema, ISODateSchema } from '../primitives.js';
import { IntentSchema } from './intent.js';
import { EffectSchema } from './effect.js';
import { OscEventSchema } from './osc.js';
import { StackItemStateSchema } from './item-state.js';

/**
 * Append-only journal. Source of truth for resync on Runtime restart and
 * for split-brain reconciliation (see Phase 5 §7.7).
 */
export const JournalRecordSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('intent'),
    seq: z.number().int().nonnegative(),
    ts: ISODateSchema,
    intent: IntentSchema,
  }),
  z.object({
    kind: z.literal('effect'),
    seq: z.number().int().nonnegative(),
    ts: ISODateSchema,
    effect: EffectSchema,
  }),
  z.object({
    kind: z.literal('osc'),
    seq: z.number().int().nonnegative(),
    ts: ISODateSchema,
    event: OscEventSchema,
  }),
  z.object({
    kind: z.literal('snapshot'),
    seq: z.number().int().nonnegative(),
    ts: ISODateSchema,
    state: z.record(IdSchema, StackItemStateSchema),
  }),
]);
export type JournalRecord = z.infer<typeof JournalRecordSchema>;
