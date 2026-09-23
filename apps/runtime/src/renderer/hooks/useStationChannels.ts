import type { StationChannels } from '@cg/shared-ipc';
import type { Unsubscribe } from '../../shared/runtime-bridge.js';
import { useBridgeSnapshotState, type BridgeSnapshot } from './useBridgeSnapshot.js';

/**
 * 🔴 `R-062` gap 2 — the bridge's channel-discovery answer, kept live.
 *
 * Returned WITH `ready`, because "not arrived" and "arrived empty" must stay apart here: the
 * channel list falls back to the bank and settings until an answer has actually arrived, and a
 * console that read the empty initial value as the answer would draw a strip with nothing on it.
 */
const NONE: StationChannels = { channels: [] };

const fetchState = (): Promise<StationChannels> => window.cg.stationChannels.list();

const subscribe = (handler: (next: StationChannels) => void): Unsubscribe =>
  window.cg.stationChannels.onChanged(handler);

export function useStationChannels(): BridgeSnapshot<StationChannels> {
  return useBridgeSnapshotState(fetchState, subscribe, NONE);
}
