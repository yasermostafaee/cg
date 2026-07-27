import { z } from 'zod';
import { FieldValuesSchema, IdSchema } from '@cg/shared-schema';
import { defineChannel } from '../channel.js';
import { definePublishChannel } from '../publish.js';

/**
 * R-021 — the fixed operator layer bank: the BANK shape (stage 1), the
 * wire contract (stage 2a: config read/update + per-slot state publish) and
 * the exact-slot LOAD (stage 3). Layer VERB channels arrive with stage 4.
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
   * The item bound to this slot (stage 3 — `fixedLayers.load` is the only
   * thing that can produce a non-null value; `null` while the slot is
   * unbound). The field shipped in stage 2a so stage 2b's renderer never had
   * to amend the wire. Stage 4 extends it additively (`restore-blocked` rides
   * on the binding, never as a bridge-computed row state).
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

/**
 * R-021 stage 3 — the refusal codes for an EXACT-SLOT load, as ONE shared
 * const (the `FIXED_LAYERS_SET_CONFIG_REASONS` pattern) so the wire contract,
 * the bridge and the renderer's wording map cannot drift.
 *
 * - `unknown-template` — the id is not in the bridge's registry (re-import).
 *   Shared spelling with `stack.load`, deliberately: it is the same fact.
 * - `not-fixed` — the coordinate is not a slot of the declared bank. The
 *   exact-slot path is for the OPERATOR BANK only; a dynamic layer is
 *   `stack.load`'s business and this channel must never become a second,
 *   unfenced door onto an arbitrary layer.
 * - `slot-bound` — that fixed slot already carries an item. Rebinding is
 *   Remove-then-load, two explicit operator steps (the d1 rule: a compound
 *   verb must never hide a destructive step behind a constructive label).
 */
export const FIXED_LAYERS_LOAD_REASONS = ['unknown-template', 'not-fixed', 'slot-bound'] as const;

/**
 * R-021 stage 3 — create an item bound to an EXACT fixed slot and pre-roll it
 * (`CG ADD`, never `CG PLAY` — B-039: the operator's take puts it on air).
 *
 * It is a SEPARATE channel from `stack.load` because the two resolve a layer
 * by opposite rules and must not share one: `stack.load` ALLOCATES from the
 * dynamic policy ranges, while this one binds the exact coordinate the
 * operator's row names, through `LayerManager.bindFixed` — the fixed path.
 * `reserve()` refuses fixed slots by construction, so there is no way to reach
 * a fixed slot through the dynamic path, and no way to reach a dynamic layer
 * through this one (`not-fixed`).
 *
 * The created item is an ORDINARY stack item: it appears on the stack, carries
 * the same C-012 verbs there, and is removed the same way — the fixed row is
 * an additional, permanent surface onto it, not a parallel item kind.
 */
export const FixedLayersLoadChannel = defineChannel(
  'fixedLayers.load',
  z.object({
    channel: z.number().int().positive(),
    layer: z.number().int().nonnegative(),
    itemId: IdSchema,
    templateId: IdSchema,
    fields: FieldValuesSchema,
  }),
  z.object({
    accepted: z.boolean(),
    /** Free-form so an AMCP/`stack.load` code can pass through verbatim (B-070). */
    errorCode: z.string().optional(),
  }),
);
