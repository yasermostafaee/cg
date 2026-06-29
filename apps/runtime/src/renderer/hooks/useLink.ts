import { useEffect, useState } from 'react';
import type { BridgeLinkStatus } from '../../shared/runtime-bridge.js';

/**
 * Subscribes to the bridge link status (C-001). Drives the connection
 * indicator: `live` / `offline-mock` / `disconnected`.
 */
export function useLink(): BridgeLinkStatus {
  const [status, setStatus] = useState<BridgeLinkStatus>(() => window.cg.link.status());

  useEffect(() => {
    setStatus(window.cg.link.status());
    const unsubscribe = window.cg.link.onStatusChanged(setStatus);
    return unsubscribe;
  }, []);

  return status;
}
