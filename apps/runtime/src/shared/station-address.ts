import { normaliseBridgeAddress, splitHostPort } from '@cg/shared-ipc';

export interface PlayoutStationAddress {
  readonly playoutAddress: string;
  readonly bridgeAddress?: string;
}

export interface StandaloneStationAddress {
  readonly mode: 'standalone';
  readonly bridgeAddress: string;
}

export type StationAddress = PlayoutStationAddress | StandaloneStationAddress;

export const STANDALONE_BRIDGE_HOST = '127.0.0.1';
export const STANDALONE_BRIDGE_ADDRESS_ERROR =
  'Use 127.0.0.1 or localhost and a valid port for CG Bridge on this computer.';

/** The installed standalone service listens only on IPv4 loopback. */
export function standaloneBridgeAddress(address: string): string | null {
  const normal = normaliseBridgeAddress(address);
  if (normal === null || normal === '') return null;
  const parts = splitHostPort(normal);
  if (parts === null) return null;
  const host = parts.host.toLowerCase();
  if (host !== STANDALONE_BRIDGE_HOST && host !== 'localhost') return null;
  return parts.port === null ? STANDALONE_BRIDGE_HOST : `${STANDALONE_BRIDGE_HOST}:${parts.port}`;
}
