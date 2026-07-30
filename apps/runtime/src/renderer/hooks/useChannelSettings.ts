import type { ChannelSettingsState } from '@cg/shared-ipc';
import type { Unsubscribe } from '../../shared/runtime-bridge.js';
import { useBridgeSnapshot } from './useBridgeSnapshot.js';

/**
 * R-030 — the bridge-owned channel raster, plus what the SERVER reports about
 * it.
 *
 * The empty state is EMPTY, not a reference-raster placeholder. Before the
 * snapshot arrives the SPA genuinely does not know the channel's geometry, and
 * `rasterVerdict` reads an absent settings entry as `unconfigured` — so nothing
 * claims agreement on evidence that has not arrived yet. Seeding it with
 * 1920×1080 would have made the boot state indistinguishable from a real,
 * confirmed 1080 channel.
 */
const NONE: ChannelSettingsState = { settings: [], observed: [] };

const fetchState = (): Promise<ChannelSettingsState> => window.cg.channelSettings.get();

const subscribe = (handler: (next: ChannelSettingsState) => void): Unsubscribe =>
  window.cg.channelSettings.onChanged(handler);

/** B-080 — re-pulled whenever the link becomes usable, like every other snapshot. */
export function useChannelSettings(): ChannelSettingsState {
  return useBridgeSnapshot(fetchState, subscribe, NONE);
}
