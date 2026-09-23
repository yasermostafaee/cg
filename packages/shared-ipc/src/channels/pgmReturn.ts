import { z } from 'zod';
import { defineChannel } from '../channel.js';
import { definePublishChannel } from '../publish.js';

/**
 * 🔴 **`C-016` / `PGM-RETURN-01` — THE PROGRAMME RETURN: what the Playout is putting on air, as a
 * picture, relayed by the bridge.**
 *
 * The Playout's core serves every programme channel as HTTP MJPEG (its `pgm` consumer —
 * `docs/integration/playout/PLAYOUT-CG-RESPONSE-PGM-FEED-v1.md`). The bridge reads it as ONE
 * well-behaved client per channel and re-serves it on the console's own origin at
 * {@link pgmReturnPath}; an `<img>` shows it natively. The picture never travels over the control
 * socket — only its STATE does, on the two channels below.
 *
 * ── WHAT A STATE CLAIMS ─────────────────────────────────────────────────────
 *
 * It is a statement about the FEED, never about AIR. `connecting` is not "nothing is on air":
 * the Playout is very probably transmitting while the bridge cannot see it, which is why the
 * PROGRAM strip keeps the rows-on-air count beside the signal (`MONITORS-01`).
 */

/**
 * - `connecting` — dialling, waiting for the response head, or waiting out a backoff.
 * - `live` — a frame arrived within the stall bound. The only state a picture is shown in.
 * - `stalled` — the connection is up and no frame arrived within the stall bound. The last
 *   frame is stale, and the console must never show it as if it were live.
 * - `unavailable` — this channel has no programme feed the Playout opens to the network
 *   (channels ≥ 21 map outside its firewall rule). Never dialled; the bridge log says why.
 */
export const PGM_RETURN_STATES = ['connecting', 'live', 'stalled', 'unavailable'] as const;

export type PgmReturnState = (typeof PGM_RETURN_STATES)[number];

/** One WATCHED channel's return. A channel nobody is watching has no entry at all. */
export const PgmReturnStatusSchema = z.object({
  channel: z.number().int().positive(),
  state: z.enum(PGM_RETURN_STATES),
});

export type PgmReturnStatus = z.infer<typeof PgmReturnStatusSchema>;

/** Every watched channel's state, in channel order. Empty when nothing is watched. */
export const PgmReturnStatusListSchema = z.array(PgmReturnStatusSchema);

/** Pull the current states (a console's initial read). */
export const PgmReturnStatusChannel = defineChannel(
  'pgmReturn.status',
  z.void(),
  PgmReturnStatusListSchema,
);

/** Pushed whenever a watched channel's state changes, or a channel starts or stops being watched. */
export const PgmReturnStatusChangedChannel = definePublishChannel(
  'pgmReturn.status-changed',
  PgmReturnStatusListSchema,
);

/**
 * The relay's path on the console's origin — the ONE spelling both the bridge's route and the
 * console's `<img>` use, so the two cannot come to disagree about where the picture is.
 */
export const PGM_RETURN_PATH_PREFIX = '/pgm/';

export function pgmReturnPath(channel: number): string {
  return `${PGM_RETURN_PATH_PREFIX}${String(channel)}`;
}
