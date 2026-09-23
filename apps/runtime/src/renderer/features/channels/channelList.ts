import type { AuthSessionState } from '../../../shared/runtime-bridge.js';
import type { ChannelSettingsState, FixedLayerBank, StationChannels } from '@cg/shared-ipc';

/**
 * `RUNTIME-REDESIGN-01` Phase 7 (`PROMPT.md` §7) — **THE CHANNEL LIST IS A LIST.**
 *
 * The reference's console carries a channel switcher whose options come from a catalogue
 * (`CH 1 · News`, `CH 2 · Sports`, …), and §7 asks that the app's list be _"shaped to be filled
 * from an API"_ — a UI shape, not a schema migration. This is the shape: ONE function that
 * answers "which channels does this station have", from every source the bridge publishes, so
 * that a channel-discovery call was one more input here and nothing downstream changed — which
 * is how it landed (`R-062` gap 2; see the ⭐ note below).
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
 * real gaps — the five `z.void()` bulk verbs, the channel-discovery call, and the bank as the one
 * channel authority — were filed as `R-062`; gap 2, the discovery call, is closed and feeds this
 * function. Gaps 1 and 3 stay open.
 *
 * ⭐ **`CHANNEL-AUTHORITY-01` — the discovery call exists (`R-062` gap 2), and it is read FIRST.**
 * When the bridge's answer has arrived, the list is its `declared` channels — the channels THIS
 * STATION operates, which is also the only set the bridge's station fence lets a verb address. A
 * channel the answer names but the station does not declare — the partner Playout's programme
 * channel, from its catalogue — is NOT on this list: it is somebody else's output, and a strip
 * that offered it would be offering a tab whose every verb the bridge refuses. Until an answer
 * arrives (an older bridge, a refused read, the first frame), the two sources above are the
 * fallback, exactly as before.
 */
export function channelIds(
  bank: FixedLayerBank | null,
  settings: ChannelSettingsState,
  auth: AuthSessionState = { kind: 'off' },
  discovered: StationChannels | null = null,
): number[] {
  const fromDiscovery = (discovered?.channels ?? [])
    .filter((c) => c.declared)
    .map((c) => c.channel);
  /*
    ⚠ An answer that declares NOTHING is not trusted as "no channels": a bridge always declares
    one (`#declaredChannels()` falls back to channel 1), so an empty set can only be a stub or a
    malformed answer, and falling back is the honest reading of it.
  */
  const declared = new Set<number>(
    fromDiscovery.length > 0 ? fromDiscovery : settings.settings.map((s) => s.channel),
  );
  if (fromDiscovery.length === 0 && bank !== null) declared.add(bank.channel);
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
 * 🔴 `C-039` — **THE PLAYOUT'S NAME FOR EACH CHANNEL THIS STATION OPERATES**, from the discovery
 * answer's `named` — a catalogue row joined on this station's host. A LABEL and nothing else.
 *
 * Only `declared` channels are named here, for the same reason only they are listed: a name is
 * shown on a tab this console operates, and a catalogue row for a channel the station does not
 * declare has no tab to sit on. Empty when the catalogue is ABSENT (auth OFF, the Playout
 * unreachable, no answer yet) — and the strip's own `CHANNEL <n>` is then the label, which is
 * always true.
 */
export function channelNames(discovered: StationChannels | null): ReadonlyMap<number, string> {
  const names = new Map<number, string>();
  for (const c of discovered?.channels ?? []) {
    if (c.declared && c.named !== null) names.set(c.channel, c.named.name);
  }
  return names;
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
