/**
 * 🔴 `MULTI-CHANNEL-01` §2 L — **A CHANNEL'S MESSAGES STAY IN THAT CHANNEL'S VIEW; OTHER CHANNELS
 * SIGNAL ON THE STRIP ONLY.** The owner's rule, 2026-09-23. On his first real run the view of
 * channel 2 showed a notice about channel 1, layer 99 — he was on one channel reading about
 * another.
 *
 * ── THE CLASSIFICATION (reported in `design.md`, and walked, not trusted) ─────────────────
 *
 * CHANNEL — shown only in the view of the channel it concerns:
 *   · the program output alarm (`OutputMissingBanner`)          — ALARM (the air alarms' red)
 *   · the channel raster mismatch (`RasterMismatchBanner`)       — ALARM
 *   · "did not come back" (`EmptiedAirNotice`)                   — WARNING (its amber notice)
 *   · foreign content on a layer, owned-slot occupancy
 *     (`OrphanLayersBanner`)                                     — WARNING
 *   · a refusal (`RefusalBanner`), stamped with the channel on screen when it was raised
 *                                                                — WARNING
 *   · the on-air counts, the table's notices, the plates and playout tabs' dots, and the
 *     per-channel lock — already the channel's (§2 C, D, F, G).
 *
 * STATION — shown whatever channel is selected: the bridge link (`ConnectionBanner`), the bridge
 * version (`BridgeSkewBanner`), the servers and the backup (`FailoverBanner`), the status bar
 * (the Playout link, sign-in, the station lock), sign-in and first-run, the station lock screen.
 *
 * ── THE MARK ─────────────────────────────────────────────────────────────────────────
 *
 * A channel whose view holds a warning or an alarm carries a small mark on its strip tab — AMBER
 * for a warning, RED for an alarm, the colour the message wears in its own view (`design.md` §29:
 * amber is attention; the air alarms stand on the red `alarmFill`). The operator switches to it
 * and reads it there; no text about another channel appears in the current view. An alarm beats a
 * warning, because one mark per tab is all the strip has room to say.
 *
 * With ONE declared channel there is no "other channel" and nothing is filtered or marked — the
 * console is exactly what it was.
 */

export type ChannelSignal = 'warning' | 'alarm';

/** Which channels each class of message concerns, gathered from the sources above. */
export interface ChannelMessages {
  readonly alarms: readonly number[];
  readonly warnings: readonly number[];
}

/** The mark each channel's tab carries, if any. */
export function channelSignals(messages: ChannelMessages): ReadonlyMap<number, ChannelSignal> {
  const out = new Map<number, ChannelSignal>();
  for (const channel of messages.warnings) out.set(channel, 'warning');
  for (const channel of messages.alarms) out.set(channel, 'alarm');
  return out;
}

/** What a screen reader hears for a tab's mark — the colour is never the only channel. */
export function signalLabel(signal: ChannelSignal): string {
  return signal === 'alarm' ? 'This channel has an alarm' : 'This channel has a warning';
}

/**
 * Keep only what concerns the channel on screen. `scope === null` is a station that declares one
 * channel (or has not said yet): nothing is filtered, exactly as before. An entry with NO channel
 * belongs to every view — the `onChannel` rule for a slot-less item.
 */
export function inScope<T>(
  entries: readonly T[],
  channelOf: (entry: T) => number | null | undefined,
  scope: number | null,
): readonly T[] {
  if (scope === null) return entries;
  return entries.filter((e) => {
    const channel = channelOf(e);
    return channel === null || channel === undefined || channel === scope;
  });
}
