import { z } from 'zod';
import { IdSchema } from '../primitives.js';
import { FieldValuesSchema } from '../fields.js';

/** Operator intents — the inputs to the Reconciler. */
export const IntentSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('load'),
    itemId: IdSchema,
    templateId: IdSchema,
    fields: FieldValuesSchema,
  }),
  z.object({
    kind: z.literal('take'),
    itemId: IdSchema,
    mode: z.enum(['direct', 'pvw-pgm']).optional(),
  }),
  z.object({
    kind: z.literal('update'),
    itemId: IdSchema,
    // FieldValuesSchema is a record — partial subsets are valid by construction.
    fields: FieldValuesSchema,
    mergeMode: z.enum(['merge', 'replace']),
  }),
  z.object({
    kind: z.literal('out'),
    itemId: IdSchema,
    immediate: z.boolean().optional(),
  }),
  z.object({ kind: z.literal('remove'), itemId: IdSchema }),
  z.object({
    kind: z.literal('failover'),
    reason: z.enum(['manual', 'auto']),
  }),
  z.object({ kind: z.literal('reconnect') }),
]);
export type Intent = z.infer<typeof IntentSchema>;
