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
