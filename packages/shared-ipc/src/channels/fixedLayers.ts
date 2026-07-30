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
  /**
   * R-028 — the FIXED CEILING of candidate layers. Immutable mid-session
   * (validator-enforced: `resize-refused`); changing it means editing the
   * persisted install config and restarting the bridge. The 89 layer ceiling
   * is validator-enforced. Replaces R-021's mutable, grow-at-end `count`.
   */
  count: z.number().int().min(1).max(30).default(10),
  /** Optional display aliases, keyed by layer number (as a numeric string). */
  aliases: z.record(z.string().regex(/^\d+$/), z.string().min(1)).optional(),
  /**
   * R-028 — per-layer visibility ticks, keyed by layer number (as a numeric
   * string). An ABSENT key means VISIBLE (the default). Visibility controls
   * ONLY whether the row is DISPLAYED: every candidate layer stays fenced
   * from automatic allocation regardless of its tick (fencing derives from
   * `start`/`count`, never from this record), and unticking an occupied — or
   * unknown-occupancy — layer is refused by the validator (fail closed).
   */
  visibility: z.record(z.string().regex(/^\d+$/), z.boolean()).optional(),
});
export type FixedLayerBank = z.infer<typeof FixedLayerBankSchema>;

/**
 * R-028 — THE canonical visibility predicate: is this candidate layer's row
 * displayed? An absent `visibility` entry means VISIBLE. Bridge validator and
 * renderer both read THIS function — a second local copy of the default is how
 * "absent means visible" would drift.
 */
export function isLayerVisible(bank: FixedLayerBank, layer: number): boolean {
  return bank.visibility?.[String(layer)] !== false;
}

/**
 * THE canonical position of a candidate layer within its bank: 1-based, counting
 * DOWN from the bank's HIGHEST layer. For a 70–73 bank, layer 73 is 1 and layer 70
 * is 4.
 *
 * WHY FROM THE TOP. The higher CasparCG layer draws OVER the ones beneath it, so it
 * is the higher-priority graphic — and the operator's "Layer 1" should mean the most
 * prominent one, not the bottom-most. The list is displayed descending by layer for
 * the same reason (it mirrors on-air z-order), so position 1 is also the top row on
 * screen: the `#` column reads 1, 2, 3, 4 downwards, which is what anyone expects a
 * row number to do.
 *
 * THIS IS THE ALIAS'S NUMBER, NOT THE `#` COLUMN'S. The two are different questions
 * and the owner settled them separately:
 *
 *   - the default alias (`Layer 1`, `Layer 2`, …) uses THIS — the layer's fixed place
 *     in the bank;
 *   - the `#` column is plain DISPLAY ORDER, 1 at the top of the rendered list.
 *
 * With the shipped bank (70–99 declared, the top five ticked) they read identically,
 * because the shown rows are the top five in order: `#1` is layer 99, which is
 * `Layer 1`. They can diverge only if a NON-CONTIGUOUS set is ticked — untick 97 and
 * the third visible row is `#3` but still `Layer 4`. That is the accepted trade, and
 * it falls out of the constraint below.
 *
 * IT IS BOUND TO THE BANK, NOT TO WHAT IS DISPLAYED, and that is the property that
 * makes the alias safe to say out loud. Ticking and unticking change what is shown;
 * neither may renumber anything. `Layer 1` is always the bank's highest layer whether
 * or not it is currently ticked. If unticking a row renumbered the ones past it,
 * "Layer 2" would mean different rows on different days — a positional handle that
 * silently renumbers is worse than none at all. This matters more with thirty declared
 * and five shown than it did with four of four.
 */
export function bankPosition(bank: FixedLayerBank, layer: number): number {
  return bank.start + bank.count - 1 - layer + 1;
}

/** The default display name for an unaliased candidate layer — `Layer 1`, `Layer 2`, … */
export function defaultLayerAlias(bank: FixedLayerBank, layer: number): string {
  return `Layer ${String(bankPosition(bank, layer))}`;
}

/**
 * R-028 / C-015 — the RESERVED playout layers: the layer numbers the
 * company's playout system owns (it binds templates to playlist videos and
 * drives them over AMCP directly). Declared as inclusive ranges in install
 * config; NEVER inferred from the wire (OSC reports producer kind, not
 * identity, so a playout graphic and one of ours are indistinguishable
 * there). The candidate ceiling must never intersect these layers —
 * validator-enforced at load and at every change (`overlaps-reserved`) — and
 * automatic allocation is fenced off them entirely.
 */
/**
 * Upper bound for a declared reserved layer. CasparCG layers in practice sit
 * well under 1000; the cap exists so a typo'd range (`{ from: 0, to: 2e9 }`)
 * is a LEGIBLE schema refusal at boot, never an out-of-memory expansion.
 */
export const MAX_RESERVED_LAYER = 9999;

export const ReservedLayersSchema = z.object({
  /** Inclusive reserved ranges, e.g. `[{ "from": 60, "to": 69 }]`. */
  ranges: z.array(
    z
      .object({
        from: z.number().int().nonnegative().max(MAX_RESERVED_LAYER),
        to: z.number().int().nonnegative().max(MAX_RESERVED_LAYER),
      })
      .refine((r) => r.to >= r.from, { message: '`to` must be >= `from`' }),
  ),
});
export type ReservedLayers = z.infer<typeof ReservedLayersSchema>;

/** Expand the declared reserved ranges to a flat, de-duplicated layer list. */
export function reservedLayerNumbers(reserved: ReservedLayers): number[] {
  const out = new Set<number>();
  for (const { from, to } of reserved.ranges) {
    for (let layer = from; layer <= to; layer++) out.add(layer);
  }
  return [...out].sort((a, b) => a - b);
}

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
  'visibility-out-of-bank',
  'renumber-refused',
  'channel-change-refused',
  // R-028 — the ceiling is FIXED at install: grow and shrink are BOTH refused
  // mid-session (replaces R-021's grow-at-end allowance and its
  // `shrink-occupied` rule, which only a mutable count needed).
  'resize-refused',
  // R-028 — unticking a row is refused while its layer is OCCUPIED (a bound
  // item, retained intent, or an observed producer) …
  'untick-occupied',
  // … AND while its occupancy is UNKNOWN (no healthy primary / no fresh OSC).
  // Fail closed: unknown is never treated as empty — hiding a row that may be
  // on air would leave the operator no surface for a live graphic.
  'untick-unknown',
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
    z.object({
      itemId: z.string().min(1),
      templateType: z.string().min(1),
      /**
       * R-028 (3.1) — WHICH template is on this row, resolved by the BRIDGE
       * (the item's `templateId` joined with its own registry), so every
       * browser gets the same answer — an item another browser loaded is not
       * foreign. Optional and additive: absent when the bridge cannot
       * establish identity (e.g. after ITS restart, until the item is
       * reloaded) — absence is the honest "unknown", never a guess.
       */
      templateId: z.string().min(1).optional(),
      /**
       * The registry's raw manifest/scene name for `templateId`, when it has
       * one. RAW facts, not a resolved label: the renderer resolves the
       * display label with its ONE canonical rule (`templateDisplayName` —
       * file name first, then this), never a second bridge-side copy.
       */
      templateName: z.string().min(1).optional(),
      /** The imported `.vcg` file name, verbatim (display resolution input). */
      sourceFileName: z.string().min(1).optional(),
    }),
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
/**
 * The refusal codes for the BANK-SCOPED layer clear, as ONE shared const (the
 * `FIXED_LAYERS_SET_CONFIG_REASONS` pattern) so the wire contract, the bridge and the
 * renderer cannot drift.
 *
 * - `not-in-bank` — the coordinate is not a layer of the DECLARED bank (on the bank's
 *   channel). Also the answer when no bank is declared at all: with no bank, no layer
 *   is in it. This is the guard that keeps the channel from becoming a
 *   clear-anything door.
 * - `reserved` — the layer is inside the reserved playout range. ABSOLUTE, and checked
 *   FIRST so it wins even if a bank were ever to overlap the reservation.
 * - `amcp-error` — the guard passed and CasparCG refused or the send failed.
 */
export const FIXED_LAYERS_CLEAR_LAYER_REASONS = ['not-in-bank', 'reserved', 'amcp-error'] as const;

/**
 * Clear ONE layer of the declared bank, addressed by LAYER and permitted by
 * STRUCTURE — never by observation.
 *
 * WHY THIS EXISTS AS A THIRD DOOR. The owner's requirement is that a graphic can
 * always be taken off, including when something is wrong in a way nobody predicted.
 * Neither existing channel delivers that:
 *
 *   - `stack.out` is ITEM-scoped. With no bound item there is nothing to address, so
 *     enabling it on an empty row produces a no-op that REPORTS SUCCESS — the exact
 *     lie this capability exists to prevent.
 *   - `layers.clear` refuses a `foreign` layer without a fresh `html` observation,
 *     which is precisely the `unknown`-occupancy case being asked about. It declines
 *     exactly when it is needed.
 *
 * So this one consults NEITHER occupancy NOR item status — that indifference is the
 * whole point, because those are the things that may be wrong. Its permission comes
 * from two structural facts, both required, both derived from CONFIG so no UI state
 * can bypass them: the layer is in the declared bank, and it is not reserved.
 *
 * "DECLARED BANK" MEANS THE BANK AS CONFIGURED, NOT THE ROWS CURRENTLY SHOWN. A
 * ticked/unticked row is a display concern; membership is not. Computing membership
 * from visible rows would mean unticking a row silently removed it from the guard's
 * world — so the predicate is the LayerManager's config-derived `isFixed`, which
 * enumerates every declared layer regardless of its tick.
 *
 * THIS ADDS A CAPABILITY, IT DOES NOT WIDEN AN EXISTING ONE. `layers.clear` keeps
 * refusing foreign layers, the orphan sweep keeps skipping the reservation, and the
 * playout tab keeps its html-only rule. All three are untouched.
 */
export const FixedLayersClearLayerChannel = defineChannel(
  'fixedLayers.clear-layer',
  z.object({
    channel: z.number().int().positive(),
    layer: z.number().int().nonnegative(),
  }),
  z.object({
    ok: z.boolean(),
    reason: z.enum(FIXED_LAYERS_CLEAR_LAYER_REASONS).optional(),
    /** Human wording for the refusal, so the toast can name which guard fired. */
    message: z.string().optional(),
  }),
);

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
