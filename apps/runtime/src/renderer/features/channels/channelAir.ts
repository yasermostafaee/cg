import { isUnlicensedPlaylist, type ChannelOutput } from '@cg/shared-ipc';

/**
 * 🔴 `UI-POLISH-01` G — **A CHANNEL'S AIR, AS THE PLAYOUT STATES IT: two facts, and only one of
 * them gives the colour.** (`docs/integration/playout/PLAYOUT-CG-RESPONSE-V13-STATE-v1.md` §1.)
 *
 * The owner's question settled the shape: during a multi-box live segment the Playout's playlist
 * may be STOPPED while the channel is STILL ON AIR. A colour that followed the playlist would show
 * that channel off air, or disconnected, at exactly that moment. So:
 *
 * - `output` alone decides the colour — on air, off, or unknown. `unknown` is the Playout's own
 *   third value, and a missing field, a value we do not know, or a failed read all read the same
 *   (the bridge drops what it cannot read; the discovery answer then carries no `output`);
 * - `playlist` is INFORMATION: a neutral tag in the Playout's words, never a colour — with the one
 *   exception below, `unlicensed`, whose consequence reaches our air.
 *
 * One source only: the Playout's D4. Nothing here is inferred from CasparCG's layers, and nothing
 * here is about THIS console's own link — the dot never means the bridge or the Playout link, which
 * keep their own indicators. A Playout we cannot reach gives no dot, never a grey ring.
 */
export interface ChannelAir {
  /** `on-air` / `off` from the Playout; everything else is `unknown`. */
  readonly output: ChannelOutput;
  /** The playlist state in the Playout's word, or `null` when it sent none. */
  readonly playlist: string | null;
  /**
   * `PLAYOUT-FEATURES-01` D — D4's `cgLicensed` (Playout `2.9.2`): may CG command this channel. ABSENT
   * when the Playout did not say; read with the license through `cgUnlicensedReason`, never alone.
   */
  readonly cgLicensed?: boolean;
}

/** What the console knows when the Playout has said nothing about a channel. */
export const NO_AIR: ChannelAir = { output: 'unknown', playlist: null };

/** A discovery or catalogue row's two optional fields, read as a {@link ChannelAir}. */
export function airFrom(fields: {
  readonly output?: ChannelOutput | undefined;
  readonly playlist?: string | undefined;
  readonly cgLicensed?: boolean | undefined;
}): ChannelAir {
  return {
    output: fields.output ?? 'unknown',
    playlist: fields.playlist ?? null,
    ...(fields.cgLicensed !== undefined ? { cgLicensed: fields.cgLicensed } : {}),
  };
}

/**
 * The ten playlist values (V13 §1.2), in the Playout's order, and the neutral tag each shows. A
 * `Map` rather than an object literal, so a word like `constructor` can never find a prototype key.
 */
export const PLAYLIST_TAGS: ReadonlyMap<string, string> = new Map([
  ['offline', 'Playout offline'],
  ['unlicensed', 'Unlicensed'],
  ['cued', 'Cued'],
  ['stopped', 'Playlist stopped'],
  ['paused', 'Paused'],
  ['hold', 'Hold'],
  ['live', 'Live'],
  ['playing', 'Playing'],
  ['waiting', 'Waiting'],
  ['idle', 'Idle'],
]);

/** The tag for a playlist state: the table's words, or — a value not in it — the word itself. */
export function playlistTag(playlist: string): string {
  return PLAYLIST_TAGS.get(playlist) ?? playlist;
}

/**
 * What a channel's dot says, to a screen reader and on hover: `On air` / `Off air` /
 * `Output unknown`, then the playlist's tag when there is one (`On air · Playlist stopped`).
 */
export function airLabel(air: ChannelAir): string {
  const output =
    air.output === 'on-air' ? 'On air' : air.output === 'off' ? 'Off air' : 'Output unknown';
  return air.playlist === null ? output : `${output} · ${playlistTag(air.playlist)}`;
}

/**
 * 🔴 **THE ONE PLAYLIST STATE THAT IS NOT JUST INFORMATION.** An unlicensed channel is cleared by
 * the Playout every minute — `CLEAR <ch>`, which takes OUR layers with it (V13 §1.2). That reaches
 * our air, so the channel gets the AMBER strip mark (`MULTI-CHANNEL-01` L) and one channel-scoped
 * line. We have asked the Playout whether clearing our layers is intended; if they stop, this
 * becomes an ordinary neutral tag and this predicate goes.
 *
 * `CENTRAL-BRIDGE-01` (D12) — through the ONE predicate the bridge's take refusal asks too.
 */
export function isUnlicensed(air: ChannelAir): boolean {
  return isUnlicensedPlaylist(air.playlist);
}

/** The channel-scoped line an unlicensed channel's view carries. */
export const UNLICENSED_LINE = 'Unlicensed in the Playout — this channel is cleared every minute.';

/** The channels whose view carries {@link UNLICENSED_LINE} — the strip marks the same set. */
export function unlicensedChannels(airs: ReadonlyMap<number, ChannelAir>): number[] {
  return [...airs.entries()].filter(([, air]) => isUnlicensed(air)).map(([channel]) => channel);
}
