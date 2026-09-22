import type { AuthSessionState } from '../../../shared/runtime-bridge.js';
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
export function channelIds(
  bank: FixedLayerBank | null,
  settings: ChannelSettingsState,
  auth: AuthSessionState = { kind: 'off' },
): number[] {
  const declared = new Set<number>(settings.settings.map((s) => s.channel));
  if (bank !== null) declared.add(bank.channel);
  // The documented default (`FixedLayerBankSchema`): before any snapshot arrives, and when no
  // bank is declared at all, the surface still belongs to SOME channel.
  if (declared.size === 0) declared.add(1);

  /*
    🔴 `C-038` / `R-066` bullet 3 — **THE PRINCIPAL NARROWS THE LIST, AND THE BANK'S CHANNEL
    SURVIVES THE NARROWING.**

    Two rules, and the second is the one that keeps the first honest:

      · the strip lists the channels this principal may OPERATE — not every channel the
        station declares, because a strip full of channels somebody cannot use is a strip
        that lies about what this console is for;
      · EXCEPT the bank's own channel, which is shown even when it is not granted — READ-ONLY,
        never hidden. It is the channel this console has always shown, it owns the layer bank
        the whole surface is built around, and a console that silently dropped it would leave
        the operator looking at an empty app with nothing saying why.

    ⚠ Auth OFF and the pre-answer states narrow NOTHING. With no principal there is nothing to
    scope to, and a console that hid channels while waiting for the bridge would be `B-153`'s
    defect mirrored — a surface asserting a restriction the system has not stated.
  */
  const permitted = permittedSet(auth);
  if (permitted === null) return [...declared].sort((a, b) => a - b);

  const visible = new Set<number>([...declared].filter((c) => permitted.has(c)));
  if (bank !== null && declared.has(bank.channel)) visible.add(bank.channel);
  /*
    A principal granted nothing on a station with no bank still needs a surface to stand on.
    The channel is shown READ-ONLY (`operableChannels` returns none of it), which is a console
    that says "not yours" rather than one that says nothing at all.
  */
  if (visible.size === 0) visible.add([...declared][0] ?? 1);
  return [...visible].sort((a, b) => a - b);
}

/**
 * The principal's permitted channels as a set, or `null` when there is NO PRINCIPAL TO SCOPE
 * TO — which is every state but `signed-in`.
 *
 * 🔴 **`signed-out` AND `expired` RETURN `null`, AND THE FIRST DRAFT HAD THEM RETURN AN EMPTY
 * SET. That was a defect, and it was found by looking at the page rather than at the code.**
 *
 * An empty set means "granted nothing", so every tab came up marked `CHANNEL 1 · READ ONLY`
 * on a console that had not signed in yet — underneath the sign-in overlay, in the one glance
 * before anybody types. That is a surface asserting a restriction the system has not stated:
 * the operator has not been refused a channel, they have not yet said who they are. Same for a
 * lapsed session, where the honest fact is "your session ended" and the identity pill says it.
 *
 * ⚠ **This loosens nothing.** It is about what the STRIP SAYS, not about what may be pressed:
 * `useCanOperate` keeps its own switch and answers `false` for both states, so the controls
 * stay absent and the bridge refuses regardless. Two different questions, deliberately
 * answered in two different places.
 */
function permittedSet(auth: AuthSessionState): ReadonlySet<number> | null {
  return auth.kind === 'signed-in' ? new Set(auth.permittedChannels) : null;
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

/**
 * 🔴 `C-038` / `R-066` bullet 3 — **WHICH OF THIS STATION'S CHANNELS THE SIGNED-IN PRINCIPAL
 * MAY OPERATE.** The permitted-channel strip's one read, beside {@link channelIds} because
 * the principal belongs in the channel list at its SOURCE — not applied as a filter by each
 * surface that happens to remember.
 *
 * ⭐ **READ-ONLY CHANNELS ARE SHOWN, NOT HIDDEN — and that is the requirement, not a default.**
 * A channel missing from the strip is indistinguishable from a station that does not have it,
 * so an operator who has lost access cannot tell "not mine" from "not there" and will look for
 * the fault in the wrong place. The strip therefore lists every channel the STATION declares
 * and says which are theirs.
 *
 * ⚠ **It does not compute the verdict; it reads the bridge's.** `permittedChannels` arrives on
 * `auth.state`, resolved by the same predicate the request gate asks. A console re-deriving it
 * would need the connection config and a second copy of `configuredCasparHosts` — `B-162`'s
 * hole — and could offer a control the bridge then refuses.
 *
 * Auth OFF and the pre-answer states return EVERY channel: with no principal there is nothing
 * to scope to, and a console that greyed the station out while waiting for the bridge would be
 * `B-153`'s defect in the other direction.
 */
export function operableChannels(
  channels: readonly number[],
  auth: AuthSessionState,
): readonly number[] {
  const permitted = permittedSet(auth);
  return permitted === null ? channels : channels.filter((c) => permitted.has(c));
}
