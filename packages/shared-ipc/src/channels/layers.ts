import { z } from 'zod';
import { defineChannel } from '../channel.js';
import { definePublishChannel } from '../publish.js';

/**
 * Layer-occupancy channels (R-009) — orphaned/unknown on-air layers.
 *
 * The bridge's periodic occupancy sweep (a passive tap on the OSC producer
 * stream) compares server-side occupancy against the layers it owns and
 * surfaces every mismatch. The operator gets an explicit per-layer Clear;
 * the bridge NEVER clears anything on its own (B-048 on-air safety).
 */

export const OrphanLayerSchema = z.object({
  channel: z.number().int().positive(),
  layer: z.number().int().nonnegative(),
  /** The foreground producer kind as observed (`"html"`, …). */
  producer: z.string().min(1),
  /** When this orphan was first surfaced (ISO). */
  since: z.string().datetime(),
});

export type OrphanLayer = z.infer<typeof OrphanLayerSchema>;

/** Pull the current orphan set (initial state on client connect). */
export const LayersOrphansChannel = defineChannel(
  'layers.orphans',
  z.void(),
  z.array(OrphanLayerSchema),
);

/** Pushed whenever the surfaced orphan set CHANGES (never on idle sweeps). */
export const LayersOrphansChangedChannel = definePublishChannel(
  'layers.orphans-changed',
  z.array(OrphanLayerSchema),
);

/**
 * Every reason `layers.clear` can refuse for — ONE canonical list, so a caller
 * that maps reasons cannot silently miss one that was added later.
 *
 * They are NOT interchangeable, and the distinctions are the point:
 *
 * - `owned` — the bridge holds this layer for a stack item (`#slots`). Clearing
 *   owned layers is Out/Remove's job.
 * - `foreign` — R-015: no FRESH observation of an `html` producer here, so the
 *   layer is provably not ours (or silence is evidence of nothing).
 * - `reserved` — R-028: a DECLARED playout layer. Config is the identity,
 *   because OSC cannot tell a playout html graphic from ours.
 * - `live-source` — C-015 phase 5: a layer in the bridge's own Live Source
 *   ledger. **Deliberately distinct from both `owned` and `foreign`**, so the
 *   operator is told WHAT the layer is and why it is not theirs to clear. It is
 *   not `foreign` (the bridge owns it) and not `owned` (it carries no stack
 *   item's template, and `#slots` is not where it lives). Granting C-015's
 *   exemption as originally worded would have made these layers operator
 *   CLEARABLE — inverting the protection — which is why the answer is a new
 *   refusal and not an exemption (`live-source-multibox` design.md §4, C5).
 * - `amcp-error` — the CLEAR was permitted and the server rejected it.
 *
 * ⚠ **A caller that switches on this must handle `live-source`.** [[B-122]] and
 * [[B-125]] are open items in the same clear path and will have to honour it;
 * this list is exported as a named constant precisely so their fix cannot miss
 * it by matching on an inline string literal.
 */
export const LAYER_CLEAR_REASONS = [
  'owned',
  'foreign',
  'reserved',
  'amcp-error',
  'live-source',
] as const;

/** A refusal reason from {@link LAYER_CLEAR_REASONS}. */
export type LayerClearReason = (typeof LAYER_CLEAR_REASONS)[number];

/**
 * Explicit operator Clear of a surfaced layer: sends `CLEAR <ch>-<layer>`.
 * Refused with `reason: 'owned'` when the bridge owns the layer (clearing
 * owned layers is Out/Remove's job). R-015 — refused with `reason: 'foreign'`
 * unless the current primary's occupancy tap has a FRESH observation of the
 * layer reporting an `html` producer: this system only ever places HTML
 * producers, so a non-`html` kind (a video, or anything unrecognised — "not
 * html" fails safe) is provably not ours, and NO fresh observation is
 * evidence of nothing and cannot license a CLEAR. A graphics operator must
 * never be able to clear a video layer, from any caller — this refusal is
 * the prohibition, not the UI's missing button. The warning resolves on the
 * next sweep's observed empty — never optimistically.
 *
 * R-028 / C-015 — refused with `reason: 'reserved'` for a layer in the
 * DECLARED playout range. OSC cannot distinguish a playout html graphic from
 * ours — that indistinguishability is exactly why the reservation exists in
 * config — so config is the identity, and clearing a reserved layer must be
 * impossible from ANY caller: it would take the company's playout output off
 * air.
 *
 * C-015 phase 5 (R-015) — refused with `reason: 'live-source'` for a layer in
 * the bridge's own Live Source ledger. See {@link LAYER_CLEAR_REASONS}.
 */
export const LayersClearChannel = defineChannel(
  'layers.clear',
  z.object({
    channel: z.number().int().positive(),
    layer: z.number().int().nonnegative(),
  }),
  z.object({
    ok: z.boolean(),
    reason: z.enum(LAYER_CLEAR_REASONS).optional(),
  }),
);

/**
 * B-056 — owned-slot occupancy warnings. Raised at LOAD time when the
 * adopt-CLEAR did not land on the current primary (backup-only success or a
 * failed CLEAR) while the primary's OSC occupancy tap OBSERVED the target
 * layer non-empty: a previous session's producer may be visibly live on the
 * primary under the item's own layer. Semantically distinct from R-009's
 * unowned orphans — the layer IS owned, so there is no direct Clear; the
 * remedy is Out/Remove of the named item. Resolves only on provable events
 * (a CLEAR landing on the primary, the item's removal, a server swap).
 */
export const OwnedOccupancyWarningSchema = z.object({
  channel: z.number().int().positive(),
  layer: z.number().int().nonnegative(),
  /** The stack item whose load raised the warning (the layer's owner). */
  itemId: z.string().min(1),
  /** The foreground producer kind observed on the primary (`"html"`, …). */
  producer: z.string().min(1),
  /** When the warning was raised (ISO). */
  since: z.string().datetime(),
});

export type OwnedOccupancyWarning = z.infer<typeof OwnedOccupancyWarningSchema>;

/** Pull the current owned-slot warning set (initial state on client connect). */
export const LayersOwnedOccupancyChannel = defineChannel(
  'layers.owned-occupancy',
  z.void(),
  z.array(OwnedOccupancyWarningSchema),
);

/** Pushed whenever the owned-slot warning set CHANGES (never idle noise). */
export const LayersOwnedOccupancyChangedChannel = definePublishChannel(
  'layers.owned-occupancy-changed',
  z.array(OwnedOccupancyWarningSchema),
);
