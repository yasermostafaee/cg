/**
 * 🔴 `CENTRAL-BRIDGE-01` (D8) — **WHERE THIS CONSOLE FINDS CG BRIDGE.**
 *
 * CG Bridge is one service on the Playout machine, so the operator still types only the Playout
 * address: the bridge is at that host, port 5280. A station whose CG Bridge runs on a separate
 * server has an admin set the bridge's address once per console (Station setup). Both are this
 * console's own settings — which bridge it connects to — never the station's: the bridge's own
 * Playout comes from its configuration file.
 *
 * ONE key, `cg.runtime.station.v1`, in this console's `localStorage` (the persisted-key census
 * lists it). An unreadable value reads as absent: the console then asks for the Playout address
 * again, which is the safe side. The refusals of what may be typed (`NOT_A_PLAYOUT_ADDRESS`,
 * `NOT_A_BRIDGE_ADDRESS`) live in `@cg/shared-ipc`, beside the normalisations that decide them.
 */

const STATION_KEY = 'cg.runtime.station.v1';

export interface StationAddress {
  /** The Playout address the operator typed (`http://host:8080`, normalised). */
  readonly playoutAddress: string;
  /**
   * CG Bridge's `host` or `host:port` (`normaliseBridgeAddress`), when it is NOT on the Playout's
   * host — a separate server. Absent: CG Bridge is on the Playout's host, at its port.
   */
  readonly bridgeAddress?: string;
}

export function loadStationAddress(): StationAddress | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STATION_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { playoutAddress, bridgeAddress } = parsed as Record<string, unknown>;
    if (typeof playoutAddress !== 'string' || playoutAddress.trim() === '') return null;
    return {
      playoutAddress,
      ...(typeof bridgeAddress === 'string' && bridgeAddress.trim() !== ''
        ? { bridgeAddress: bridgeAddress.trim() }
        : {}),
    };
  } catch {
    return null;
  }
}

/** Save it (or clear it). `false` when the store refused. */
export function saveStationAddress(station: StationAddress | null): boolean {
  try {
    if (station === null) localStorage.removeItem(STATION_KEY);
    else localStorage.setItem(STATION_KEY, JSON.stringify(station));
    return true;
  } catch {
    return false;
  }
}
