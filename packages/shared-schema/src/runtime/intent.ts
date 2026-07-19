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
  /**
   * C-012 — the GRACEFUL stop: the template runs its own outro and the producer
   * stays resident, so a later take resumes it with no re-load. Distinct from
   * `out`, which CLEARs and destroys the producer.
   */
  z.object({ kind: z.literal('stop'), itemId: IdSchema }),
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
