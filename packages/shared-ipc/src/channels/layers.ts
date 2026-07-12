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
 * Explicit operator Clear of a surfaced layer: sends `CLEAR <ch>-<layer>`.
 * Refused with `reason: 'owned'` when the bridge owns the layer (clearing
 * owned layers is Out/Remove's job). The warning resolves on the next
 * sweep's observed empty — never optimistically.
 */
export const LayersClearChannel = defineChannel(
  'layers.clear',
  z.object({
    channel: z.number().int().positive(),
    layer: z.number().int().nonnegative(),
  }),
  z.object({
    ok: z.boolean(),
    reason: z.enum(['owned', 'amcp-error']).optional(),
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
