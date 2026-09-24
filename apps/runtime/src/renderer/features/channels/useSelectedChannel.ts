import { bankForChannel, firstBank, type FixedLayerBank } from '@cg/shared-ipc';
import { useAuthSession } from '../../hooks/useAuthSession.js';
import { useChannelSettings } from '../../hooks/useChannelSettings.js';
import { useFixedBanksState } from '../../hooks/useFixedLayers.js';
import { useStationChannels } from '../../hooks/useStationChannels.js';
import {
  channelIds,
  channelNames,
  operableChannels,
  resolveSelectedChannel,
} from './channelList.js';
import { useChannelChoice } from './channelStore.js';

/**
 * `RUNTIME-REDESIGN-01` Phase 7 — the ONE read of "which channels, and which one is selected",
 * shared by the channel strip and by Station setup's per-channel tab so the two cannot disagree
 * about the channel the console is scoped to.
 *
 * 🔴 `C-038` — and now of "which of them may this principal OPERATE". The permission enters
 * HERE, at the one place the channel list is derived, so no surface downstream has to remember
 * to ask. A control that forgot would be a control the bridge then refuses — which is the whole
 * failure mode `R-066` bullet 4 exists to remove.
 *
 * 🔴 `MULTI-CHANNEL-01` — **AND OF "WHICH BANK IS THE SELECTED CHANNEL'S".** A station declares
 * one bank per channel; this hook holds the list, picks the selected channel's bank out of it, and
 * is the only place that does — every per-channel surface (the layer table, the monitors, the
 * Layers section of Station setup) reads `bank` from here, so switching channels switches every
 * one of them together, and none can show one channel's rows under another channel's tab.
 */
export function useSelectedChannel(): {
  channels: number[];
  selected: number;
  /**
   * The subset of `channels` this principal may act on. Every OTHER channel in the list is
   * READ-ONLY and still shown — a channel missing from the strip cannot be told apart from a
   * station that does not have it.
   */
  operable: readonly number[];
  /** Whether the CURRENTLY SELECTED channel is one this principal may act on. */
  canOperateSelected: boolean;
  /**
   * `C-039` — the Playout's catalogue name for a listed channel, where one joined. A LABEL: no
   * decision anywhere reads it.
   */
  names: ReadonlyMap<number, string>;
  /** `MULTI-CHANNEL-01` — every declared bank, in channel order. */
  banks: readonly FixedLayerBank[];
  /** `MULTI-CHANNEL-01` — the SELECTED channel's bank, or `null` when it declares none. */
  bank: FixedLayerBank | null;
  /** Whether the banks have ARRIVED (an empty list before that is not an answer). */
  banksReady: boolean;
  /** `DELTA A` §A2 — the bridge answered the banks pull, and the answer was a refusal. */
  banksFailed: boolean;
} & ChannelView {
  const { banks, ready: banksReady, failed: banksFailed } = useFixedBanksState();
  const settings = useChannelSettings();
  const choice = useChannelChoice();
  const auth = useAuthSession();
  // `R-062` gap 2 — read FIRST once it has arrived; until then the banks and settings stand.
  const discovery = useStationChannels();
  const discovered = discovery.ready ? discovery.value : null;

  const channels = channelIds(banks, settings, auth, discovered);
  const operable = operableChannels(channels, auth);
  // The first declared channel is where the console opens (`channelStore`: A13, known over
  // remembered) — the lowest-numbered, the order every bank list is in.
  const selected = resolveSelectedChannel(channels, choice, firstBank(banks)?.channel ?? null);

  return {
    channels,
    selected,
    operable,
    canOperateSelected: operable.includes(selected),
    names: channelNames(discovered),
    banks,
    bank: bankForChannel(banks, selected),
    banksReady,
    banksFailed,
    ...channelView(banks, selected),
  };
}

/**
 * 🔴 `MULTI-CHANNEL-01` — **WHICH CHANNEL A PER-CHANNEL SURFACE SHOWS, AND WHICH ONE A SCOPED VERB
 * NAMES.** One reading of both (golden rule 6), for every surface that filters by channel and every
 * verb that can be scoped to one.
 */
export interface ChannelView {
  /** The station declares two or more banks — the ONE reading of "multi-channel". */
  multiChannel: boolean;
  /**
   * The channel the per-channel surfaces filter by. On a multi-channel station it is the
   * SELECTED channel whether or not its bank has arrived, so a view of one channel of several
   * never falls back to showing — or counting — all of them. With one bank it is that bank's
   * channel, or `null` when the selected channel declares none: nothing filtered, as before.
   */
  viewChannel: number | null;
  /**
   * The channel a scoped verb names: the selected one on a multi-channel station, `null`
   * otherwise — where the verb goes out BARE, byte-identical to what it always sent.
   */
  verbScope: number | null;
}

export function channelView(banks: readonly FixedLayerBank[], selected: number): ChannelView {
  const multiChannel = banks.length > 1;
  return {
    multiChannel,
    viewChannel: multiChannel ? selected : (bankForChannel(banks, selected)?.channel ?? null),
    verbScope: multiChannel ? selected : null,
  };
}

/**
 * 🔴 `MULTI-CHANNEL-01` — **THE SELECTED CHANNEL'S BANK, WITH ITS READINESS.** What every
 * per-channel surface reads, in the shape the single-bank `useFixedBankState` had, so the layer
 * table's "not arrived is not empty" rule carries over unchanged — and the {@link ChannelView}
 * beside it, so a surface that filters or scopes reads the same answer the bank came from.
 */
export function useChannelBankState(): {
  bank: FixedLayerBank | null;
  ready: boolean;
  failed: boolean;
} & ChannelView {
  const { bank, banksReady, banksFailed, multiChannel, viewChannel, verbScope } =
    useSelectedChannel();
  return {
    bank,
    ready: banksReady,
    failed: banksFailed,
    multiChannel,
    viewChannel,
    verbScope,
  };
}
