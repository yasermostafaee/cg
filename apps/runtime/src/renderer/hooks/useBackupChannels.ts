import { useEffect, useState } from 'react';
import type { BackupChannelsState } from '@cg/shared-ipc';
import { useAuthSession } from './useAuthSession.js';

/**
 * 🔴 `RELEASE-0113-01` (`B-316`, `R-089`) — **WHERE EACH CHANNEL'S LINES GO ON THE BACKUP ENGINE**, as CG Bridge
 * decided it: on the mirror's OWN channel number, or nowhere. `null` — not read yet, or a bridge too old to
 * know the channel: every surface then says nothing about it.
 *
 * Asked once this console is signed in (or auth is off) and again when a sign-in lands; the push is listened
 * to always — the same rule as {@link useEngineSessions}.
 */
export function useBackupChannels(): BackupChannelsState | null {
  const auth = useAuthSession();
  const [state, setState] = useState<BackupChannelsState | null>(null);
  const mayAsk = auth.kind === 'signed-in' || auth.kind === 'off';

  useEffect(() => window.cg.backupChannels.onChanged(setState), []);
  useEffect(() => {
    if (!mayAsk) return;
    let live = true;
    window.cg.backupChannels
      .state()
      .then((s) => {
        if (live) setState(s);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [mayAsk]);
  return state;
}
