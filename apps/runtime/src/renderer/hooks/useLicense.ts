import { useEffect, useState } from 'react';
import type { PlayoutLicense } from '@cg/shared-ipc';
import { useAuthSession } from './useAuthSession.js';

/**
 * 🔴 `PLAYOUT-FEATURES-01` D (`R-077`) — **THE CG LICENSE, AS CG BRIDGE LAST READ IT** (`license.state`,
 * pushed on `license.state-changed`). `null` while nothing is read — auth off, a Playout before `2.9.2`,
 * CG Control switched off there — and nothing is marked for it.
 *
 * Asked only once this console is signed in (a socket that has not signed in asks the bridge nothing but
 * its capabilities and `auth.*` — `readsAfterSignIn.dom`), and asked again when a sign-in lands; the
 * pushes are listened to always. The bridge-session banner's rule, for the same reason.
 */
export function useLicense(): PlayoutLicense | null {
  const auth = useAuthSession();
  const [license, setLicense] = useState<PlayoutLicense | null>(null);
  const mayAsk = auth.kind === 'signed-in' || auth.kind === 'off';

  useEffect(() => window.cg.license.onChanged((state) => setLicense(state.license)), []);
  useEffect(() => {
    if (!mayAsk) return;
    let live = true;
    // A bridge too old to answer says nothing.
    window.cg.license
      .state()
      .then((state) => {
        if (live) setLicense(state.license);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [mayAsk]);

  return license;
}
