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
  // B-086 — the CasparCG LINK is down, so an ON AIR claim can no longer be
  // verified: the item WAS on air but the wire no longer backs it. Distinct from
  // `unconfirmed` (one command's ack timed out on a LIVE link) — this is the
  // whole link. Rendered muted "WAS ON AIR" (never red, never amber). On
  // reconnect it restores to on-air (producer still there) or resets to idle
  // (layer empty), per the occupancy check.
  'unverified',
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

/**
 * B-092 — one stack item's INTENT as retained by the browser, so the stack
 * survives a restart of the bridge process (the stack otherwise lives only in
 * the bridge's in-memory Reconciler and dies with it).
 *
 * This is intent, NOT reconciled state: it carries what the operator asked for
 * (template + fields + placement) plus the single bit the restore needs to
 * reconstruct the record — whether the item had been TAKEN to air. The
 * restored item's actual status is decided by the bridge against real OSC
 * occupancy, never by this record: an occupied layer restores ON AIR, a silent
 * one comes back `loaded`.
 *
 * `slot` is the layer the item occupied. It must be restored EXACTLY (not
 * re-allocated) — it is the layer the surviving producer is actually on, so it
 * is what the occupancy check has to consult.
 */
export const RetainedStackItemSchema = z.object({
  itemId: IdSchema,
  templateId: IdSchema,
  fields: FieldValuesSchema,
  /**
   * Play evidence: the item had been taken to air when last observed. Derived
   * from the last published status; ambiguous statuses (`unconfirmed`,
   * `exiting`, `unverified`) resolve to TRUE deliberately — the occupancy check
   * demotes an over-claim to `loaded` on a silent layer, whereas an
   * under-claim would hide a genuinely live graphic.
   */
  played: z.boolean(),
  slot: LayerSlotSchema.optional(),
  position: PositionSchema.optional(),
});
export type RetainedStackItem = z.infer<typeof RetainedStackItemSchema>;
