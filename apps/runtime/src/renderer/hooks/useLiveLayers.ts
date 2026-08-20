import type { LiveLayerState } from '@cg/shared-ipc';
import type { Unsubscribe } from '../../shared/runtime-bridge.js';
import { useBridgeSnapshotState, type BridgeSnapshot } from './useBridgeSnapshot.js';

const EMPTY: LiveLayerState[] = [];

const fetchLiveLayers = (): Promise<LiveLayerState[]> => window.cg.liveLayers.state();

const subscribeLiveLayers = (handler: (next: LiveLayerState[]) => void): Unsubscribe =>
  window.cg.liveLayers.onStateChanged(handler);

/**
 * `B-145` acceptance 1, display half (`tasks.md` 2.8) — the Live Source layers the
 * bridge has seated.
 *
 * Bridge-owned, so it keeps the DEFAULT `pullWhileDisconnected: false`: this ledger
 * exists only in the bridge process, so asking for it while the link is down is the
 * refused round-trip `useBridgeSnapshot` exists to avoid. With the link down the
 * snapshot freezes at its last value and the panel masks every row as unknown
 * (`B-087`) rather than presenting a stale claim as current — which matters more here
 * than on most snapshots, because a frozen ledger read against a frozen stack would
 * manufacture a STRANDED verdict out of two stale facts.
 *
 * PUSH-DRIVEN, not polled. The bridge publishes this off the `liveLayersChanged`
 * emitter that `B-145` already fires from the ledger's ONE write path, so a seat, a
 * release, a hold and the boot adoption all reach the list by the same call that
 * persists them to disk.
 *
 * 🔴 **THE `{ value, ready }` FORM, NOT THE PLAIN VALUE, AND THAT IS LOAD-BEARING.**
 *
 * With the link down this hook never pulls (see above), so the value sits at the
 * module-level `EMPTY` — indistinguishable, from the value alone, from a bridge that
 * really has nothing seated. The panel’s zero-row branch is the one place that speaks
 * for the WHOLE list, and reading the plain value there let it print a confident
 * *“the bridge has no live sources seated”* while two guests were composited on air
 * and the persisted ledger knew their coordinates. `ready` is what keeps that branch
 * honest (`B-094`).
 */
export function useLiveLayers(): BridgeSnapshot<LiveLayerState[]> {
  return useBridgeSnapshotState(fetchLiveLayers, subscribeLiveLayers, EMPTY);
}
