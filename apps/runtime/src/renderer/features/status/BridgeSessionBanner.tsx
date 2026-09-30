import { useEffect, useState } from 'react';
import { KeyRound, TriangleAlert } from 'lucide-react';
import {
  BRIDGE_NEEDS_ADMIN_LINE,
  BRIDGE_SESSION_DEFAULT_ACCOUNT,
  holdsPermissionClass,
  type BridgeSessionState,
} from '@cg/shared-ipc';
import { useAuthSession } from '../../hooks/useAuthSession.js';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { Modal, ModalAction } from '../../ui/Modal.js';
import { TextInput } from '../../ui/TextInput.js';
import { cssVars, NOTICE_PX } from '../../theme.js';
import { signInFailureLine, signInMessage } from '../auth/signInMessages.js';

/**
 * 🔴 `CENTRAL-BRIDGE-01` (D7, the Playout team's rule 8) — **CG BRIDGE HAS NO PLAYOUT SESSION OF ITS
 * OWN, SAID IN ONE LINE ON EVERY CONSOLE.**
 *
 * CG Bridge signs in to the Playout as the station's own account and keeps the rotating refresh
 * token. When it has none — a fresh install, or the Playout refused the saved one (a new password
 * for that account revokes all of its tokens) — every console says so, and a station admin gets the
 * one control that fixes it: the account's password, given once. The bridge keeps the refresh token
 * and drops the password; this dialog forgets it when it closes.
 *
 * Amber, as the skew banner beside it is: nothing on air is affected by this line, and the
 * station's reads fall back to a signed-in console's own session meanwhile.
 *
 * `CENTRAL-BRIDGE-01-A` A2 — `refused`: the Playout refused to renew the bridge's session BEFORE
 * using its token (`cg_not_licensed`, `no_cg_access`, a disabled account). Nothing is lost — the
 * bridge keeps the token and asks again every minute — so the line is the Playout's own reason,
 * after "CG Bridge:", isolated (it is the Playout's language, not ours). A station admin still gets
 * the sign-in: an account that lost its access is fixed by signing the bridge in as another.
 */

const styles = {
  banner: {
    display: 'flex',
    alignItems: 'center',
    gap: cssVars['--r-notice-gap'],
    padding: cssVars['--r-notice-pad'],
    fontSize: cssVars['--r-notice-fs'],
    lineHeight: cssVars['--r-notice-lh'],
    color: cssVars['--r-caution-text'],
    background: cssVars['--r-caution-bg'],
    borderBottom: `1px solid ${cssVars['--r-notice-line']}`,
    flexShrink: 0,
  },
  text: { flex: 1, minWidth: 0, fontWeight: 700, letterSpacing: '0.04em' },
  field: { display: 'grid', gap: 6, marginBottom: 12 },
} as const;

export function BridgeSessionBanner(): JSX.Element | null {
  const auth = useAuthSession();
  const [session, setSession] = useState<BridgeSessionState | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  /*
    Asked only once this console is signed in — a socket that has not signed in asks the bridge
    NOTHING but the capabilities and `auth.*` (`DELTA-MULTI-CHANNEL-01-A` A4, pinned by
    `readsAfterSignIn.dom`) — and asked again when a sign-in lands. With auth OFF the bridge has no
    Playout and so no session: `off`, asked like any other read. The pushes are listened to always.
  */
  const mayAsk = auth.kind === 'signed-in' || auth.kind === 'off';

  useEffect(() => window.cg.bridgeSession.onChanged(setSession), []);
  useEffect(() => {
    if (!mayAsk) return;
    let live = true;
    // A bridge too old to answer says nothing.
    window.cg.bridgeSession
      .state()
      .then((s) => {
        if (live) setSession(s);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [mayAsk]);

  if (session?.state !== 'needs-admin' && session?.state !== 'refused') return null;
  const admin =
    auth.kind === 'signed-in' && holdsPermissionClass(auth.principal.roles, 'station-admin');

  return (
    <div
      style={styles.banner}
      role="alert"
      data-bridge-session-banner=""
      data-bridge-session-state={session.state}
      data-tone="caution"
    >
      <Icon icon={TriangleAlert} size={NOTICE_PX.icon} />
      <span style={styles.text}>
        {session.state === 'refused' ? (
          <>
            CG Bridge: <bdi>{session.message}</bdi>
          </>
        ) : (
          BRIDGE_NEEDS_ADMIN_LINE
        )}
      </span>
      {admin && (
        <Button variant="neutral" onClick={() => setDialogOpen(true)}>
          Sign in CG Bridge…
        </Button>
      )}
      {admin && dialogOpen && <BridgeSignInDialog onClose={() => setDialogOpen(false)} />}
    </div>
  );
}

/** A station admin's one-time sign-in for the bridge. Holds the password only while it is open. */
function BridgeSignInDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const [username, setUsername] = useState(BRIDGE_SESSION_DEFAULT_ACCOUNT);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<{ text: string; marksField: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    if (busy || username === '' || password === '') return;
    setBusy(true);
    setError(null);
    try {
      const answer = await window.cg.bridgeSession.signIn({ username, password });
      if (answer.ok) {
        onClose();
        return;
      }
      // `CENTRAL-BRIDGE-01-A` A4 — `cg_not_licensed` carries the Playout's own message, shown as it is
      // (the message region renders each line in its own `dir="auto"` isolate).
      const line = signInFailureLine(answer.failure ?? 'unexpected', answer.message ?? null);
      setError({ text: line.text, marksField: line.marksField });
    } catch (err) {
      setError({
        text: err instanceof Error ? err.message : signInMessage('unexpected'),
        marksField: false,
      });
    } finally {
      // The password is never kept, not even for a retry after a refusal.
      setPassword('');
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Sign in CG Bridge"
      emblem={KeyRound}
      onClose={onClose}
      {...(error !== null ? { message: { role: 'refusal' as const, text: error.text } } : {})}
      footer={
        <>
          <ModalAction actionRole="cancel" onClick={onClose}>
            Cancel
          </ModalAction>
          <ModalAction
            actionRole="primary"
            disabled={busy || username === '' || password === ''}
            onClick={() => void submit()}
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </ModalAction>
        </>
      }
    >
      <label htmlFor="cg-bridge-signin-user" style={styles.field}>
        Account
        <TextInput
          id="cg-bridge-signin-user"
          value={username}
          onChange={setUsername}
          autoComplete="off"
          // A machine account name (`cg-admin`): LTR is a statement about the CONTENT.
          dir="ltr"
          disabled={busy}
          aria-label="Account"
        />
      </label>
      <label htmlFor="cg-bridge-signin-pass" style={styles.field}>
        Password
        <TextInput
          id="cg-bridge-signin-pass"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="off"
          dir="ltr"
          disabled={busy}
          invalid={error?.marksField === true}
          aria-label="Password"
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit();
          }}
        />
      </label>
    </Modal>
  );
}
