import { z } from 'zod';
import { definePublishChannel } from '../publish.js';

/**
 * 🔴 `PLAYOUT-FEATURES-01` E (`R-076`) — **THE PROGRAMME'S LEVELS, AS THE PLAYOUT METERS THEM.**
 *
 * Playout `2.9.2` serves `GET /api/cg/meters` (`PLAYOUT-CG-RESPONSE-PLAYLIST-AUDIO-v1.md` §2.3): a
 * `text/event-stream` behind the CG token, carrying only the token's `cg_channels`. CG Bridge reads it
 * ONCE, with its own session, and relays each reading over the control socket — told to a console only
 * for a channel that console's sign-in holds (the channel scope, `C-038`). Nothing here is computed from
 * the sound: the level is the Playout's own number (§2.2), the same one its VU meter draws.
 *
 * - `audio` — every 50 ms per channel with data: one dBFS value per bus, in the core's order (16 today),
 *   rounded to 0.1, floor −60. While the core is down the stream stays open and sends the floor.
 * - `loudness` — every 150 ms when at least one value is known: EBU R128 momentary and short-term, in
 *   LUFS, and the true-peak limiter's gain reduction in dB (≤ 0). An unknown value is `null`.
 *
 * ⚠ The Playout's `t` is its own clock at publish time — not the sound's time, and not this console's
 * clock. It is not relayed: a console judges a reading stale by when IT received it.
 */

/** The meter's floor, and what a missing or stale reading reads as (their §2.2). */
export const METER_FLOOR_DBFS = -60;

/** Bus levels per channel the wire may carry. The core sends 16 today; more is refused, not trimmed. */
const MAX_BUSES = 64;

const Channel = z.number().int().positive();

/** One channel's bus levels, relayed. */
export const PgmAudioLevelsSchema = z.object({
  kind: z.literal('audio'),
  channel: Channel,
  dbfs: z.array(z.number().finite()).max(MAX_BUSES),
});

export type PgmAudioLevels = z.infer<typeof PgmAudioLevelsSchema>;

/** One channel's loudness and limiter, relayed. `null` — the Playout does not know it now. */
export const PgmLoudnessSchema = z.object({
  kind: z.literal('loudness'),
  channel: Channel,
  momentary: z.number().finite().nullable(),
  shortterm: z.number().finite().nullable(),
  limiterGrDb: z.number().finite().nullable(),
});

export type PgmLoudness = z.infer<typeof PgmLoudnessSchema>;

export const PgmMeterReadingSchema = z.discriminatedUnion('kind', [
  PgmAudioLevelsSchema,
  PgmLoudnessSchema,
]);

export type PgmMeterReading = z.infer<typeof PgmMeterReadingSchema>;

/**
 * The readings that arrived together (one read of the Playout's stream — at its 50 ms tick, every channel's
 * `audio` at once), never empty: a console is sent only the ones on channels its sign-in holds, and nothing
 * when that leaves none.
 */
export const PgmMeterReadingListSchema = z.array(PgmMeterReadingSchema).min(1);

/** Pushed as the Playout's readings arrive, to every console holding their channels. */
export const PgmMetersChangedChannel = definePublishChannel(
  'meters.changed',
  PgmMeterReadingListSchema,
);

/** A reading as the Playout spells it — its CasparCG host and channel, before the station's join. */
export type PlayoutMeterEvent =
  | {
      readonly kind: 'audio';
      readonly casparHost: string;
      readonly casparChannel: number;
      readonly dbfs: readonly number[];
    }
  | {
      readonly kind: 'loudness';
      readonly casparHost: string;
      readonly casparChannel: number;
      readonly momentary: number | null;
      readonly shortterm: number | null;
      readonly limiterGrDb: number | null;
    };

const Located = z.object({
  casparHost: z.string().min(1),
  casparChannel: Channel,
});

/** A value the Playout sends as a number, or `null` for unknown. Anything else reads as unknown. */
const Known = z.number().finite().nullable().catch(null);

const AudioEventSchema = Located.extend({
  dbfs: z.array(z.number().finite()).max(MAX_BUSES),
});

const LoudnessEventSchema = Located.extend({
  momentary: Known,
  shortterm: Known,
  limiterGrDb: Known,
});

/**
 * One SSE event from `/api/cg/meters` (`event:` name and `data:` JSON), or `null` — an event we do
 * not know, or a body we cannot read. Lenient in what it keeps: an unknown field is ignored.
 */
export function parsePlayoutMeterEvent(event: string, data: string): PlayoutMeterEvent | null {
  let body: unknown;
  try {
    body = JSON.parse(data);
  } catch {
    return null;
  }
  if (event === 'audio') {
    const parsed = AudioEventSchema.safeParse(body);
    if (!parsed.success) return null;
    const { casparHost, casparChannel, dbfs } = parsed.data;
    return { kind: 'audio', casparHost, casparChannel, dbfs };
  }
  if (event === 'loudness') {
    const parsed = LoudnessEventSchema.safeParse(body);
    if (!parsed.success) return null;
    const { casparHost, casparChannel, momentary, shortterm, limiterGrDb } = parsed.data;
    return { kind: 'loudness', casparHost, casparChannel, momentary, shortterm, limiterGrDb };
  }
  return null;
}
