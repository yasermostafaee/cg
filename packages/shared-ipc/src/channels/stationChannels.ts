import { z } from 'zod';
import { defineChannel } from '../channel.js';
import { definePublishChannel } from '../publish.js';

/**
 * 🔴 `CHANNEL-AUTHORITY-01` — **WHICH CHANNELS THIS STATION WRITES TO, and what a request is told
 * when it names one it does not.**
 *
 * Three facts about a channel live in three places, and exactly one of them decides where the
 * bridge writes:
 *
 * | Fact                                  | Who says it                   | What it decides              |
 * | ------------------------------------- | ----------------------------- | ---------------------------- |
 * | the channel EXISTS and has a NAME     | the Playout's catalogue (D4)  | labels, and the join key     |
 * | a principal MAY OPERATE it            | the grant (`cg_channels`)     | authorisation (`C-038`)      |
 * | THIS STATION OPERATES it              | the declared bank             | what we write to — only this |
 *
 * ⚠ **A grant is not a declaration, and a catalogue row is not one either.** The test Playout's
 * real `cg-op2` grant names channel 1 — the Playout's own live programme output — beside channel
 * 2. The grant is TRUE: that person may operate channel 1, from the Playout. It says nothing about
 * whether THIS station does, and a bridge that read it that way would put a graphic on somebody
 * else's output with a permission gate's blessing.
 */

/**
 * 🔴 **WHAT A REQUEST IS TOLD WHEN IT NAMES A CHANNEL THIS STATION DOES NOT OPERATE.**
 *
 * The refusal behind it is the same fact the restore door skips a row for — `not-declared`,
 * whose own doctrine names this hazard: re-homing such a row "would have meant putting a graphic
 * on somebody else's output". One reason in two shapes: a SKIP where a restore carries many rows
 * and must keep the rest, a REFUSAL where a request carries one coordinate.
 *
 * ⚠ **Not `authzChannelRefusal`, and the difference is the remedy.** That one tells a
 * signed-in operator their GRANT does not cover a channel, and a person can change that. This one
 * is true for every principal and with auth OFF: no grant makes this station operate a channel it
 * does not declare. An operator granted channel 1 and refused here must not be sent to ask for
 * channel 1 — they already have it.
 *
 * ⭐ The remedy names the case that actually produces it. The console never offers a channel the
 * station does not declare, so a console that sends one is working from an old picture of the
 * station — a tab left open against a different bridge was the 2026-09-22 incident — and a reload
 * gives it the current one. It NAMES THE CHANNEL (golden rule 11's ⭐ clause), says nothing was
 * sent (`R-006`), and is built once here so the bridge and any surface quoting it cannot drift
 * (`R-017`). It must not open like a skew message: `bridgeErrorFrom` rewrites those.
 */
export function channelNotDeclaredRefusal(channel: number): string {
  return (
    `This station does not operate channel ${String(channel)}, so that command was refused — ` +
    `nothing was sent to CasparCG. Reload this console to see the channels it operates.`
  );
}

/** Where a discovered channel came from, in the order the sources are consulted. */
export const STATION_CHANNEL_SOURCES = ['catalogue', 'bank', 'channel-settings'] as const;
export type StationChannelSource = (typeof STATION_CHANNEL_SOURCES)[number];

/**
 * 🔴 `R-062` gap 2 / `C-039` — **ONE CHANNEL, WITH ITS THREE FACTS KEPT APART.**
 *
 * ⚠ **Three fields, never one verdict.** Folding them into a single "usable" flag is how a
 * catalogue row would come to look like a channel this station writes to — the exact mistake the
 * station fence exists to make impossible. A reader wanting "may I offer a verb here" asks
 * `declared` AND `permitted`; a reader wanting a LABEL asks `named`; and nothing asks `named` for
 * anything else.
 */
export const StationChannelSchema = z.object({
  /** The CasparCG channel number, on this station's server(s). */
  channel: z.number().int().positive(),
  /**
   * The Playout's catalogue row (D4) that JOINED this channel — its `casparHost` is one this
   * bridge drives and its `casparChannel` is this number. `null` when the catalogue is ABSENT, or
   * answered without a row for it. A LABEL and a join key, never an authority.
   */
  named: z.object({ id: z.string().min(1), name: z.string().min(1) }).nullable(),
  /**
   * THIS STATION OPERATES IT — `#declaredChannels()`. The one fact that decides what the bridge
   * writes to (the station fence reads the same predicate).
   */
  declared: z.boolean(),
  /**
   * This principal's grant covers it — `C-038`'s `grantsChannel`, with the host rule. ABSENT with
   * auth OFF (there is no principal to scope to); `false` for a session that has stopped holding.
   * ⚠ A permitted channel that is not `declared` is still not one this station writes to.
   */
  permitted: z.boolean().optional(),
  /** Which sources listed it, in source order. Never empty. */
  sources: z.array(z.enum(STATION_CHANNEL_SOURCES)).min(1),
});
export type StationChannel = z.infer<typeof StationChannelSchema>;

/**
 * The discovery answer: every channel any source knows of, catalogue rows first, then the bank,
 * then channel settings. A catalogue-only channel — the partner Playout's programme channel, say —
 * IS returned, with `declared: false`, for the future; what a console OPERATES is the `declared`
 * subset.
 */
export const StationChannelsSchema = z.object({
  channels: z.array(StationChannelSchema),
});
export type StationChannels = z.infer<typeof StationChannelsSchema>;

/**
 * 🔴 `R-062` gap 2 — **THE CHANNEL-DISCOVERY CALL.** A read: it answers for the asking socket
 * (`permitted` is per principal) and changes nothing.
 */
export const StationChannelsListChannel = defineChannel(
  'channels.list',
  z.void(),
  StationChannelsSchema,
);

/**
 * Pushed to each socket, computed for that socket's principal, when an input to its answer moves:
 * the Playout's catalogue, the bank, channel settings, the server list, or that socket's sign-in.
 */
export const StationChannelsChangedChannel = definePublishChannel(
  'channels.changed',
  StationChannelsSchema,
);
