import { z } from 'zod';
import { defineChannel } from '../channel.js';
import { definePublishChannel } from '../publish.js';
import { FIRST_ALLOCATABLE_LAYER } from '../layer-bands.js';

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
 * 🔴 `RELEASE-091-01` (DELTA B, B1, `B-292`) — **A LAYER THIS STATION HELD ON AIR THAT SOMETHING ELSE
 * EMPTIED**: another AMCP client, the Playout, or CasparCG itself. The bridge learns it when the
 * layer's OSC stops while its channel still ticks and one `INFO` read shows the layer gone; its row
 * is then off air, and nothing is re-sent or put back. Said in the orphan strips' family:
 * `Layer <layer> on CH <channel> was cleared outside CG Control`.
 */
export const ClearedOutsideLayerSchema = z.object({
  channel: z.number().int().positive(),
  layer: z.number().int().nonnegative(),
  /** When the bridge learned it (ISO). */
  at: z.string().datetime(),
});
export type ClearedOutsideLayer = z.infer<typeof ClearedOutsideLayerSchema>;

/** Pull the layers cleared outside CG Control that are still to be said (initial state on connect). */
export const LayersClearedOutsideChannel = defineChannel(
  'layers.cleared-outside',
  z.void(),
  z.array(ClearedOutsideLayerSchema),
);

/** Pushed whenever that list changes. */
export const LayersClearedOutsideChangedChannel = definePublishChannel(
  'layers.cleared-outside-changed',
  z.array(ClearedOutsideLayerSchema),
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
 *   layer is provably not ours (or silence is evidence of nothing). Inside the
 *   three bands (50–99) only the second half stands — `B-292`, below.
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
 *
 * 🔴 `FOLLOWUPS-01` B (the owner, 2026-09-28) — the layer is 50 or up (`FIRST_ALLOCATABLE_LAYER`).
 * Below it another system's producer is the Playout's and NORMAL (`FIELD-FIXES-01` L), the notice
 * never offers a Clear there, and rule 3 (C5) forbids ours. A request below 50 is refused as a
 * request, before any gate — deliberately NOT a new reason word (`ROUTE-PLATES-01` §5.5).
 *
 * 🔴 `B-292` (`RELEASE-091-01` DELTA B, B3 — the owner, 2026-09-29) — **R-015 NARROWED INSIDE THE
 * BANDS.** "This system only ever places HTML producers" stopped being true with plates: a plate is
 * `ffmpeg`, `route`, `ndi` or `decklink`, and one left in 60–79 by another station or a lost ledger had
 * no surface that could clear it. Inside 50–99 (`inAnyLayerBand`) a FRESH observation of ANY producer
 * clears, when the layer is not reserved, not a stack item's and not in the ledger (`owned`,
 * `reserved` and `live-source` still refuse first). Outside the bands the `html` rule above stands,
 * and no fresh observation still licenses nothing. Never a channel-wide `CLEAR`: one layer per call.
 */
export const LayersClearChannel = defineChannel(
  'layers.clear',
  z.object({
    channel: z.number().int().positive(),
    layer: z.number().int().min(FIRST_ALLOCATABLE_LAYER),
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
