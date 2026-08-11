import { useEffect, useState } from 'react';
import type { StorageState } from '../../../shared/designer-bridge.js';
import { Button } from '../../ui/Button.js';
import { Callout } from '../../ui/Callout.js';
import * as s from './StorageNotice.css.js';

/**
 * D-150 / B-104 — the storage root, said out loud.
 *
 * 🔴 **The bug this exists to end is a SILENCE, not a crash.** `initWorkspace()` had
 * two bare `catch {}` legs: a connected folder whose permission did not survive a
 * browser restart dropped the author onto a different storage root without a word, and
 * `projects/<id>/assets/...` then resolved somewhere the bytes were not. The project
 * opened. The scene was intact. Every asset was gone. Nothing said why.
 *
 * So the rule this component enforces: **the author is never silently moved to a
 * different storage root, and session-only storage is never an unannounced state.**
 * A healthy root shows nothing — a notice that appears when everything is fine is a
 * notice people learn to ignore.
 */
export function StorageNotice(): JSX.Element | null {
  const [state, setState] = useState<StorageState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void window.cg.storage.state().then((next) => {
      if (alive) setState(next);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (state === null || !state.degraded) return null;

  async function reconnect(): Promise<void> {
    setBusy(true);
    try {
      // The CLICK is the point: Chromium requires a user gesture for
      // `requestPermission()`, and app startup has none. This is why the lost-folder
      // state cannot be repaired at boot no matter how the startup code is written.
      await window.cg.storage.reconnectFolder();
      setState(await window.cg.storage.state());
    } catch {
      // The author cancelled the picker, or the grant was refused. Leave the notice
      // exactly as it is: the state is unchanged, so saying anything new would be
      // saying something false.
    } finally {
      setBusy(false);
    }
  }

  const canReconnect =
    state.canConnectFolder &&
    (state.reason === 'folder-permission-lost' || state.reason === 'folder-restore-failed');

  return (
    <div className={s.wrap}>
      <Callout
        variant={state.sessionOnly ? 'danger' : 'caution'}
        // A session-only store is an ALERT: work in progress is being written nowhere.
        // A displaced folder is a caution — real, recoverable, not an emergency.
        role={state.sessionOnly ? 'alert' : 'status'}
      >
        <span className={s.body}>
          <strong>{headline(state)}</strong> <span className={s.detail}>{explain(state)}</span>
        </span>
      </Callout>
      {canReconnect && (
        <Button variant="secondary" onClick={() => void reconnect()} disabled={busy}>
          {busy ? 'Reconnecting…' : 'Reconnect folder'}
        </Button>
      )}
    </div>
  );
}

function headline(state: StorageState): string {
  if (state.sessionOnly) return 'Session-only storage.';
  if (state.reason === 'folder-permission-lost' || state.reason === 'folder-restore-failed') {
    return `Your project folder ${state.folderName ?? ''} is not connected.`.replace('  ', ' ');
  }
  return 'Storage is not where you left it.';
}

/**
 * Say what is actually true, in words, including the consequence. "Storage degraded"
 * is not a sentence an author can act on; "closing this tab discards everything" is.
 */
function explain(state: StorageState): string {
  switch (state.reason) {
    case 'forced-memory':
      return 'This tab was opened with ?storage=memory. Nothing is written to disk, and closing the tab discards everything not saved to a project file.';
    case 'opfs-unavailable':
      return `This browser context has no persistent storage${
        state.detail !== undefined ? ` (${state.detail})` : ''
      }. Nothing is saved, and closing the tab discards everything not saved to a project file.`;
    case 'folder-permission-lost':
      return `The browser drops a folder's permission when it restarts, and permission can only be re-granted from a click — not at startup. Working in ${state.label} until you reconnect. Saved project files are unaffected: a project carries its own assets.`;
    case 'folder-restore-failed':
      return `Reopening it failed${
        state.detail !== undefined ? `: ${state.detail}` : ''
      }. Working in ${state.label} until you reconnect. Saved project files are unaffected: a project carries its own assets.`;
    default:
      return `Working in ${state.label}.`;
  }
}
