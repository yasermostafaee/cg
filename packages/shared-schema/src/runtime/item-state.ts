import { z } from 'zod';
import { IdSchema, ISODateSchema } from '../primitives.js';
import { FieldValuesSchema } from '../fields.js';

/** A CasparCG (channel, layer) coordinate plus which server it lives on. */
export const LayerSlotSchema = z.object({
  channel: z.number().int().positive(),
  layer: z.number().int().nonnegative(),
  server: z.enum(['primary', 'backup', 'both']),
});
export type LayerSlot = z.infer<typeof LayerSlotSchema>;

export const StackItemStatusSchema = z.enum([
  'idle',
  'loaded',
  'playing',
  'on-air',
  'updating',
  'exiting',
  'error',
  'disconnected',
]);
export type StackItemStatus = z.infer<typeof StackItemStatusSchema>;

/** Reconciled view of one item on the operator's stack. */
export const StackItemStateSchema = z.object({
  itemId: IdSchema,
  templateId: IdSchema,
  fields: FieldValuesSchema,
  status: StackItemStatusSchema,
  pending: z.boolean(),
  lastIntentSeq: z.number().int().nonnegative().optional(),
  lastOscAt: ISODateSchema.optional(),
  slot: LayerSlotSchema.optional(),
  errorCode: z.string().optional(),
});
export type StackItemState = z.infer<typeof StackItemStateSchema>;
