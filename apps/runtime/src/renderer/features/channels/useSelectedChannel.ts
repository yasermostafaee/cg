import { useChannelSettings } from '../../hooks/useChannelSettings.js';
import { useFixedBank } from '../../hooks/useFixedLayers.js';
import { channelIds, resolveSelectedChannel } from './channelList.js';
import { useChannelChoice } from './channelStore.js';

/**
 * `RUNTIME-REDESIGN-01` Phase 7 — the ONE read of "which channels, and which one is selected",
 * shared by the channel strip and by Station setup's per-channel tab so the two cannot disagree
 * about the channel the console is scoped to.
 */
export function useSelectedChannel(): { channels: number[]; selected: number } {
  const bank = useFixedBank();
  const settings = useChannelSettings();
  const choice = useChannelChoice();
  const channels = channelIds(bank, settings);
  return { channels, selected: resolveSelectedChannel(channels, choice, bank?.channel ?? null) };
}
