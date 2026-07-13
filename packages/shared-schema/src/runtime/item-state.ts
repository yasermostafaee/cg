import { z } from 'zod';
import { IdSchema, ISODateSchema } from '../primitives.js';
import { FieldValuesSchema } from '../fields.js';
import { PositionSchema } from '../scene.js';

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
  // B-044 — explicit bounded-timeout state: the bridge sent the intent's
  // command and no AMCP ack arrived within the bound; the on-air result is
  // unknown. A resting state (never a spinner); the next intent overwrites it.
  'unconfirmed',
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
  /**
   * B-072 — the operator's APPLIED on-air position override, published so the
   * UI can show what is actually on air. The bridge owns it (R-011); this is
   * the read-back. ABSENT means no override — the consumer falls back to the
   * template's manifest default, exactly as before the field existed.
   */
  position: PositionSchema.optional(),
});
export type StackItemState = z.infer<typeof StackItemStateSchema>;
