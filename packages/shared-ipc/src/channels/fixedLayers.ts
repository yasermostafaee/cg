import { z } from 'zod';
import { defineChannel } from '../channel.js';
import { definePublishChannel } from '../publish.js';

/**
 * R-021 — the fixed operator layer bank: the BANK shape (stage 1) and the
 * wire contract (stage 2a: config read/update + per-slot state publish).
 * Exact-slot LOAD and layer VERB channels arrive with stages 3/4.
 *
 * The bank declares a contiguous run of operator-designated layers on one
 * channel (default TEN at 70–79), each optionally aliased for display.
 * Numeric bounds that depend on OTHER config live in the VALIDATOR
 * (`tools/caspar-bridge/src/fixed-layers-store.ts`) — deliberately not here —
 * so refusals can name the ceiling and both offending ranges (design.md (a)/(e):
 * conflicts resolve loudly at config time). The schema carries only the
 * shape-local constraints.
 */
export const FixedLayerBankSchema = z.object({
  /** CasparCG channel the bank lives on (one channel per bank, v1). */
  channel: z.number().int().positive(),
  /** First layer of the bank. Immutable mid-session (validator-enforced). */
  start: z.number().int().positive().default(70),
  /** Bank size. Extendable ONLY at the end; the 89 layer ceiling is validator-enforced. */
  count: z.number().int().min(1).max(20).default(10),
  /** Optional display aliases, keyed by layer number (as a numeric string). */
  aliases: z.record(z.string().regex(/^\d+$/), z.string().min(1)).optional(),
});
export type FixedLayerBank = z.infer<typeof FixedLayerBankSchema>;

/**
 * R-021 stage 2a — the validator's refusal codes, as ONE shared const so the
 * wire contract and `fixed-layers-store.ts`'s `FixedLayersErrorCode` cannot
 * drift: the store DERIVES its type from this array (single source — the
 * repo's one-canonical-predicate rule applied to an error union).
 */
export const FIXED_LAYERS_SET_CONFIG_REASONS = [
  'exceeds-ceiling',
  'overlaps-policy',
  'overlaps-reserved',
  'alias-out-of-bank',
  'renumber-refused',
  'channel-change-refused',
  'shrink-occupied',
] as const;

/**
 * R-021 stage 2a — what the wire says about ONE fixed slot's occupancy. FACTS
 * ONLY, never a computed row state: verb derivation stays ONE function of
 * `(localItem, observation)` in the renderer (design (f)/(g)) — a
 * bridge-computed row state would be a second derivation that can drift.
 *
 * - `unknown` — the primary session is not healthy OR the occupancy tap has
 *   no fresh OSC. NEVER shown as empty (B-094 honesty: silence is not
 *   emptiness).
 * - `empty` — the tap is hearing and the layer is absent from occupancy
 *   (B-053: on a HEARING tap, silence for a layer IS empty).
 * - `producer` — the tap observed a foreground producer; `producer` is the
 *   kind verbatim (`"html"`, `"ffmpeg"`, …).
 */
export const FixedSlotObservationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('unknown') }),
  z.object({ kind: z.literal('empty') }),
  z.object({ kind: z.literal('producer'), producer: z.string().min(1) }),
]);
export type FixedSlotObservation = z.infer<typeof FixedSlotObservationSchema>;

export const FixedSlotStateSchema = z.object({
  channel: z.number().int().positive(),
  layer: z.number().int().nonnegative(),
  /** The bank's display alias for this layer, when configured. */
  alias: z.string().min(1).optional(),
  observed: FixedSlotObservationSchema,
  /**
   * The item bound to this slot. ALWAYS null until stage 3 lands the
   * exact-slot load chain — the field ships NOW so stage 2b's renderer never
   * has to amend the wire. Stage 4 extends this field additively
   * (`restore-blocked` rides on the binding, never as a bridge-computed row
   * state).
   */
  binding: z.union([
    z.null(),
    z.object({ itemId: z.string().min(1), templateType: z.string().min(1) }),
  ]),
});
export type FixedSlotState = z.infer<typeof FixedSlotStateSchema>;

/** Pull the configured bank; null when no bank is declared. */
export const FixedLayersConfigChannel = defineChannel(
  'fixedLayers.config',
  z.void(),
  z.union([FixedLayerBankSchema, z.null()]),
);

/**
 * R-021 stage 2a — apply a bank change to the RUNNING bridge. Validation is
 * `validateFixedBankChange` (the store's validators, never re-derived here):
 * grow-at-end and alias changes apply LIVE (design (e) — there is no on-air
 * block); renumber/channel-change and shrink-with-residents refuse with the
 * validator's own code in `reason`. Order on success: validate → apply →
 * persist (non-fatal) → publish. On refusal nothing is applied, persisted, or
 * published.
 */
export const FixedLayersSetConfigChannel = defineChannel(
  'fixedLayers.set-config',
  FixedLayerBankSchema,
  z.object({
    ok: z.boolean(),
    reason: z.enum(FIXED_LAYERS_SET_CONFIG_REASONS).optional(),
    message: z.string().optional(),
  }),
);

/** Pushed when a bank change is applied (null = no bank declared). */
export const FixedLayersConfigChangedChannel = definePublishChannel(
  'fixedLayers.config-changed',
  z.union([FixedLayerBankSchema, z.null()]),
);

/** Pull the current per-slot state ([] when no bank is declared). */
export const FixedLayersStateChannel = defineChannel(
  'fixedLayers.state',
  z.void(),
  z.array(FixedSlotStateSchema),
);

/** Pushed when the per-slot state CHANGES (never on idle sweeps; never with no bank). */
export const FixedLayersStateChangedChannel = definePublishChannel(
  'fixedLayers.state-changed',
  z.array(FixedSlotStateSchema),
);
