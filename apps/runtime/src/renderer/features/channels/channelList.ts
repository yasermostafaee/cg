import type { ChannelSettingsState, FixedLayerBank } from '@cg/shared-ipc';

/**
 * `RUNTIME-REDESIGN-01` Phase 7 (`PROMPT.md` §7) — **THE CHANNEL LIST IS A LIST.**
 *
 * The reference's console carries a channel switcher whose options come from a catalogue
 * (`CH 1 · News`, `CH 2 · Sports`, …), and §7 asks that the app's list be _"shaped to be filled
 * from an API"_ — a UI shape, not a schema migration. This is the shape: ONE function that
 * answers "which channels does this station have", from every source the bridge already
 * publishes, so a channel-discovery call — when one exists — is one more input here and nothing
 * downstream changes.
 *
 * ── THE TWO SOURCES, AND WHY NEITHER IS INVENTED ─────────────────────────────
 *
 * 1. The fixed bank's `channel` (`FixedLayerBankSchema`, one bank, one channel, documented
 *    _"one channel per bank, v1"_). Until this phase it was the app's ONLY channel authority
 *    (`ChannelScope` read `bank?.channel ?? 1` into a one-element array).
 * 2. `channelSettings.settings` — _"one entry per declared channel"_, whose own header says the
 *    list is channel-keyed precisely so that _"when the channel list arrives from an API, these
 *    properties come with it"_.
 *
 * ⚠ `observed` is deliberately NOT a source. It is what the server reported for a channel the
 * bridge asked about; reading a server observation as a declaration would let a reading invent a
 * tab. The list is what is DECLARED.
 *
 * 🔴 **No multi-channel contract is invented here** (owner answer A3, `design.md` §4). The three
 * real gaps — the five `z.void()` bulk verbs, no channel-discovery call, and the bank as the one
 * channel authority — are filed as `R-062`; this function is what a discovery call would feed.
 */
export function channelIds(bank: FixedLayerBank | null, settings: ChannelSettingsState): number[] {
  const ids = new Set<number>(settings.settings.map((s) => s.channel));
  if (bank !== null) ids.add(bank.channel);
  // The documented default (`FixedLayerBankSchema`): before any snapshot arrives, and when no
  // bank is declared at all, the surface still belongs to SOME channel.
  if (ids.size === 0) ids.add(1);
  return [...ids].sort((a, b) => a - b);
}

/**
 * Which channel the console is scoped to, from the operator's CHOICE (a channel id, or none
 * yet), the bank's channel, and the list — in that order of authority.
 *
 * The choice is keyed by ID, so it survives the list changing around it; a choice the list no
 * longer carries falls back rather than stranding the surface on a stale id. The bank comes
 * before the first entry because it is the channel the console has always shown by default,
 * and a station that gains a second channel must not silently move the operator off the first.
 */
export function resolveSelectedChannel(
  channels: readonly number[],
  choice: number | null,
  bankChannel: number | null,
): number {
  if (choice !== null && channels.includes(choice)) return choice;
  if (bankChannel !== null && channels.includes(bankChannel)) return bankChannel;
  return channels[0] ?? 1;
}
