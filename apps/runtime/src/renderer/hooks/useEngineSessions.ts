import { useEffect, useState } from 'react';
import type { EngineSessions } from '@cg/shared-ipc';
import { useAuthSession } from './useAuthSession.js';

/**
 * 🔴 `RELEASE-0112-01` (`R-085`) — **EACH ENGINE'S CG BRIDGE SESSION**, as the bridge decided it (one word
 * per engine: `engineState`, bridge-side). `null` — not read yet, or a bridge too old to know the channel:
 * every surface then shows the primary alone, from `bridgeSession.state`, as before this release.
 *
 * Asked once this console is signed in (or auth is off) — a socket that has not signed in asks the bridge
 * nothing but the capabilities and `auth.*` — and asked again when a sign-in lands. The push is listened to
 * always.
 */
export function useEngineSessions(): EngineSessions | null {
  const auth = useAuthSession();
  const [sessions, setSessions] = useState<EngineSessions | null>(null);
  const mayAsk = auth.kind === 'signed-in' || auth.kind === 'off';

  useEffect(() => window.cg.bridgeSession.onEnginesChanged(setSessions), []);
  useEffect(() => {
    if (!mayAsk) return;
    let live = true;
    window.cg.bridgeSession
      .engines()
      .then((s) => {
        if (live) setSessions(s);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [mayAsk]);
  return sessions;
}
