import { z } from 'zod';
import { defineChannel } from '../channel.js';
import { definePublishChannel } from '../publish.js';

/**
 * 🔴 `DESKTOP-APPS-01-D` j — **AN ITEM OF OURS ON A CHANNEL THIS STATION DOES NOT DECLARE.**
 *
 * The owner's rule: a channel's messages never appear in another channel's view. So an item of
 * ours that is on air on a channel this station does not declare — the logo left on channel 1
 * when the owner moved the station to channel 2 — is shown ONLY in Station setup, to a
 * station-admin, with its channel, layer and template and ONE action: take it off air. Nothing
 * ever offers to load it again, and one with nothing on air (a hearing tap reads its layer empty)
 * is dropped, not shown.
 *
 * `observed` is what the tap says of that exact layer: `producer` (something is there) or
 * `unknown` (the tap is not hearing). A stray the tap reads EMPTY is never published.
 */
export const StationStraySchema = z.object({
  itemId: z.string().min(1),
  templateId: z.string().min(1),
  /** The template's display name when the registry holds it — golden rule 11. */
  templateName: z.string().min(1).optional(),
  casparChannel: z.number().int().positive(),
  layer: z.number().int().positive(),
  observed: z.enum(['producer', 'unknown']),
});

export type StationStray = z.infer<typeof StationStraySchema>;

export const StationStraysChannel = defineChannel(
  'station.strays',
  z.void(),
  z.array(StationStraySchema),
);

export const StationStraysChangedChannel = definePublishChannel(
  'station.strays-changed',
  z.array(StationStraySchema),
);

/**
 * 🔴 **TAKE IT OFF AIR** — `CG <ch>-<layer> STOP 0`, then `CLEAR <ch>-<layer>`, on that exact
 * layer and nothing else, for a coordinate that IS a current stray and nothing else.
 *
 * ⚠ The coordinate is `casparChannel`, deliberately NOT a top-level `channel`: the station fence
 * refuses a route naming a channel the station does not declare, and this is the one verb whose
 * whole purpose is a channel the station does not declare. Its own guard is narrower than the
 * fence — the exact coordinate must be a stray the bridge recorded, on a layer at or above 50 —
 * so exempting it by field name is a narrowing, never an open door.
 */
export const StationTakeOffAirChannel = defineChannel(
  'station.take-off-air',
  z.object({
    casparChannel: z.number().int().positive(),
    layer: z.number().int().positive(),
  }),
  z.object({
    ok: z.boolean(),
    message: z.string().optional(),
  }),
);
