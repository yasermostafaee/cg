import { useEffect, useState } from 'react';
import type { AuthCapabilities } from '../../shared/runtime-bridge.js';

/**
 * What the bridge advertised at connect — the auth mode, the sign-in address, and
 * (`DESKTOP-APPS-01`) the first-run phase — subscribed like `useAuthSession`, and re-read on mount
 * for its reason: the answer lands at connect, and a component mounting after that would
 * otherwise wait for a change that may never come.
 */
export function useAuthCapabilities(): AuthCapabilities | null {
  const [caps, setCaps] = useState<AuthCapabilities | null>(() => window.cg.auth.capabilities());

  useEffect(() => {
    setCaps(window.cg.auth.capabilities());
    return window.cg.auth.onCapabilitiesChanged(setCaps);
  }, []);

  return caps;
}
