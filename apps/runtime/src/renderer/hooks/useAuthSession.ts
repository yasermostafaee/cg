import { useEffect, useState } from 'react';
import type { AuthSessionState } from '../../shared/runtime-bridge.js';

/**
 * `R-066` — the console's auth state, subscribed the same way `useLink` subscribes the link.
 *
 * ⭐ Re-read on mount as well as subscribed, for `useLink`'s reason: the bridge answers
 * `bridge.capabilities` at connect and a component mounting after that would otherwise wait
 * for the next change that may never come.
 */
export function useAuthSession(): AuthSessionState {
  const [state, setState] = useState<AuthSessionState>(() => window.cg.auth.state());

  useEffect(() => {
    setState(window.cg.auth.state());
    return window.cg.auth.onStateChanged(setState);
  }, []);

  return state;
}
