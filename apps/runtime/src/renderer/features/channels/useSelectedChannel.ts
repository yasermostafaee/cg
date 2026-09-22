import { useAuthSession } from '../../hooks/useAuthSession.js';
import { useChannelSettings } from '../../hooks/useChannelSettings.js';
import { useFixedBank } from '../../hooks/useFixedLayers.js';
import { channelIds, operableChannels, resolveSelectedChannel } from './channelList.js';
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
} {
  const bank = useFixedBank();
  const settings = useChannelSettings();
  const choice = useChannelChoice();
  const auth = useAuthSession();

  const channels = channelIds(bank, settings, auth);
  const operable = operableChannels(channels, auth);
  const selected = resolveSelectedChannel(channels, choice, bank?.channel ?? null);

  return { channels, selected, operable, canOperateSelected: operable.includes(selected) };
}
