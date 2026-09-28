import { useCallback } from 'react';
import type { MediaPlateState } from '@cg/shared-ipc';
import type { Unsubscribe } from '../../shared/runtime-bridge.js';
import { useBridgeSnapshot } from './useBridgeSnapshot.js';

const NONE: MediaPlateState[] = [];

const fetchMediaState = (): Promise<MediaPlateState[]> => window.cg.liveLayers.mediaState();

const subscribeMediaState = (handler: (next: MediaPlateState[]) => void): Unsubscribe =>
  window.cg.liveLayers.onMediaStateChanged(handler);

export type MediaStateLookup = (itemId: string, plateId: string) => MediaPlateState | undefined;

/**
 * 🔴 `MEDIA-PLATES-01` §1.E — **EACH SEATED MEDIA PLATE'S TRANSPORT STATE, AS THE BRIDGE STATES IT.**
 *
 * Standing bridge state (pulled on connect, pushed when what a console shows would change), so the
 * plain `useBridgeSnapshot`: the bootstrap window renders no transport for a frame, and nothing acts
 * on the absence. Which plates are clips at all is the BRIDGE's answer — a plate appears here only
 * when its seat carries a clip — so no surface re-derives it from a catalogue (golden rule 6).
 *
 * ⚠ `remainingMs` is absent whenever the server has not reported the clip's time; a surface then
 * shows no number at all. It is never estimated here either.
 */
export function useMediaState(): MediaStateLookup {
  const states = useBridgeSnapshot(fetchMediaState, subscribeMediaState, NONE);
  return useCallback(
    (itemId: string, plateId: string) =>
      states.find((s) => s.itemId === itemId && s.plateId === plateId),
    [states],
  );
}
