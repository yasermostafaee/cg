import { useEffect, useState } from 'react';
import { KeyRound, TriangleAlert } from 'lucide-react';
import {
  BRIDGE_NEEDS_ADMIN_LINE,
  BRIDGE_SESSION_DEFAULT_ACCOUNT,
  CG_BRIDGE_ACCOUNT,
  ENGINE_LABEL,
  ENGINE_PASSWORD_WHERE,
  enginePasswordLead,
  engineStateText,
  holdsPermissionClass,
  suggestedBridgeAccount,
  type BridgeSessionState,
  type Engine,
  type EngineLine,
  type EngineSessions,
} from '@cg/shared-ipc';
import { useAuthSession } from '../../hooks/useAuthSession.js';
import { useEngineSessions } from '../../hooks/useEngineSessions.js';
import { useLicense } from '../../hooks/useLicense.js';
import { Tabs } from '../../ui/Tabs.js';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { Modal, ModalAction } from '../../ui/Modal.js';
import { PasswordInput } from '../../ui/PasswordInput.js';
import { AppVersionLine, SignInBrand } from '../../ui/SignInCard.js';
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
  /* `RELEASE-0112-01` — the engines, one fact row each: its name, its address, its state in words. */
  engines: { display: 'grid', gap: 4, margin: '0 0 12px', fontSize: cssVars['--r-text-sm'] },
  engineRow: { display: 'flex', gap: 8, alignItems: 'baseline', minWidth: 0 },
  engineName: { fontWeight: 700, flexShrink: 0 },
  engineAddress: { color: cssVars['--r-text-muted'], flexShrink: 0 },
  engineState: { minWidth: 0 },
  where: { fontSize: cssVars['--r-text-sm'], color: cssVars['--r-text-muted'], margin: '0 0 12px' },
} as const;

/** `RELEASE-0112-01` — the backup engine needs a station admin's sign-in (the banner names it). */
function backupNeedsAdmin(engines: EngineSessions | null): boolean {
  return engines?.backup?.state === 'needs-admin';
}

export function BridgeSessionBanner(): JSX.Element | null {
  const auth = useAuthSession();
  const engines = useEngineSessions();
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

  const primaryNeeds = session?.state === 'needs-admin' || session?.state === 'refused';
  // `RELEASE-0112-01` (`R-085`) — the backup engine needing a sign-in shows the banner too, naming it.
  const backupNeeds = backupNeedsAdmin(engines);
  if (!primaryNeeds && !backupNeeds) return null;
  const admin =
    auth.kind === 'signed-in' && holdsPermissionClass(auth.principal.roles, 'station-admin');

  return (
    <div
      style={styles.banner}
      role="alert"
      data-bridge-session-banner=""
      data-bridge-session-state={primaryNeeds ? session?.state : 'backup-needs-admin'}
      data-tone="caution"
    >
      <Icon icon={TriangleAlert} size={NOTICE_PX.icon} />
      <span style={styles.text}>
        {session?.state === 'refused' ? (
          <>
            CG Bridge: <bdi>{session.message}</bdi>
          </>
        ) : primaryNeeds ? (
          BRIDGE_NEEDS_ADMIN_LINE
        ) : (
          `${BRIDGE_NEEDS_ADMIN_LINE} on the backup engine`
        )}
      </span>
      {admin && (
        <Button variant="neutral" onClick={() => setDialogOpen(true)}>
          Sign in CG Bridge…
        </Button>
      )}
      {admin && dialogOpen && (
        <BridgeSignInDialog
          engines={engines}
          startOn={!primaryNeeds && backupNeeds ? 'backup' : 'primary'}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * 🔴 `PLAYOUT-FEATURES-01` D (`R-077`, LICENSE §4) — **THE PLAYOUT'S LICENSE IN GRACE, SAID ONCE, TO A
 * STATION ADMIN.** The Playout's own license has expired and it runs 48 h on grace; CG Control is still
 * licensed through it. When the grace ends the Playout clears its channels itself (its own rule, not ours),
 * so the person who can renew it is told, with the time. An operator is not: nothing they do changes it.
 *
 * One line, the banner family's treatment; the time is the Playout's `graceUntil`, in this console's
 * local time.
 */
export function LicenseGraceBanner(): JSX.Element | null {
  const auth = useAuthSession();
  const license = useLicense();
  const admin =
    auth.kind === 'signed-in' && holdsPermissionClass(auth.principal.roles, 'station-admin');
  if (!admin || license?.playoutState !== 'grace') return null;
  const until = license.graceUntil ?? null;
  return (
    <div style={styles.banner} role="status" data-license-grace-banner="" data-tone="caution">
      <Icon icon={TriangleAlert} size={NOTICE_PX.icon} />
      <span style={styles.text}>
        {until === null
          ? 'Playout license expired — in grace'
          : `Playout license expired — grace until ${localDateTime(until)}`}
      </span>
    </div>
  );
}

/** `2026-10-01T12:00:00Z` → `2026-10-01 15:30` in this console's zone; an unreadable value as sent. */
export function localDateTime(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  const two = (n: number): string => String(n).padStart(2, '0');
  return (
    `${String(at.getFullYear())}-${two(at.getMonth() + 1)}-${two(at.getDate())} ` +
    `${two(at.getHours())}:${two(at.getMinutes())}`
  );
}

/**
 * A station admin's one-time sign-in for the bridge. Holds the password only while it is open.
 *
 * 🔴 `RELEASE-0112-01` (`R-085`) — **ONE SIGN-IN PER ENGINE.** It lists the station's engines — `Primary
 * engine` and, with a server B, `Backup engine` — each with its address and its state in words, and signs
 * the chosen one in with THAT engine's account and password (each engine has its own random password, on
 * its own «تنظیمات ← اتصال به CG Control»; the one line says so). Delta C3: the account offered is
 * `cg-bridge` when the chosen engine is `2.9.4` or newer, `cg-admin` otherwise — until the admin types one.
 * With no engine lines (a bridge too old to know them) it is the primary's sign-in, exactly as before.
 */
function BridgeSignInDialog({
  engines,
  startOn,
  onClose,
}: {
  engines: EngineSessions | null;
  startOn: Engine;
  onClose: () => void;
}): JSX.Element {
  const lines: readonly EngineLine[] =
    engines === null ? [] : [engines.primary, ...(engines.backup !== null ? [engines.backup] : [])];
  const [engine, setEngine] = useState<Engine>(
    engines?.backup !== null && engines?.backup !== undefined ? startOn : 'primary',
  );
  const chosen = lines.find((l) => l.engine === engine) ?? null;
  const offered =
    chosen === null ? BRIDGE_SESSION_DEFAULT_ACCOUNT : suggestedBridgeAccount(chosen.version);
  const [username, setUsername] = useState(offered);
  const [typed, setTyped] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<{ text: string; marksField: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  // C3 — the account follows the chosen engine's version, until the admin types one of their own.
  useEffect(() => {
    if (!typed) setUsername(offered);
  }, [offered, typed]);

  const choose = (next: Engine): void => {
    setEngine(next);
    setPassword('');
    setError(null);
  };

  const submit = async (): Promise<void> => {
    if (busy || username === '' || password === '') return;
    setBusy(true);
    setError(null);
    try {
      const answer =
        engine === 'backup'
          ? await window.cg.bridgeSession.signInBackup({ username, password })
          : await window.cg.bridgeSession.signIn({ username, password });
      if (answer.ok) {
        onClose();
        return;
      }
      // `CENTRAL-BRIDGE-01-A` A4 — `cg_not_licensed` carries the Playout's own message, shown as it is
      // (the message region renders each line in its own `dir="auto"` isolate).
      const line = signInFailureLine(answer.failure ?? 'unexpected', answer.message ?? null);
      // `RELEASE-0112-01` — with two engines, the line names which one refused.
      const text = lines.length > 1 ? `${ENGINE_LABEL[engine]}: ${line.text}` : line.text;
      setError({ text, marksField: line.marksField });
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
  const onEnter = (e: { key: string }): void => {
    if (e.key === 'Enter') void submit();
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
      {/*
        🔴 `R-082` — **ONE SIGN-IN LOOK.** A `Modal` over the working console (the modal contract: a
        dialog with a way out is the primitive's), carrying the sign-in surfaces' brand and version —
        the mark and the product name above the fields, this build's version under them — a show
        control on the password, and Enter from EITHER field (it used to submit from the password
        alone).
      */}
      <SignInBrand />
      {lines.length > 0 && (
        // `RELEASE-0112-01` — each engine, its address and its state, in words (facts, not controls).
        <div style={styles.engines} aria-label="Engines" data-engines="">
          {lines.map((line) => (
            <div key={line.engine} style={styles.engineRow} data-engine-row={line.engine}>
              <span style={styles.engineName}>{ENGINE_LABEL[line.engine]}</span>
              {line.address !== null && (
                <bdi style={styles.engineAddress} dir="ltr">
                  {line.address}
                </bdi>
              )}
              <span style={styles.engineState} data-engine-state={line.state}>
                {engineStateText(line)}
              </span>
            </div>
          ))}
        </div>
      )}
      {lines.length > 1 ? (
        <Tabs
          tabs={lines.map((line) => ({ id: line.engine, label: ENGINE_LABEL[line.engine] }))}
          activeId={engine}
          onSelect={(id) => choose(id as Engine)}
          ariaLabel="Sign in on"
          idPrefix="cg-bridge-signin-engine"
          level="inner"
        >
          {fields()}
        </Tabs>
      ) : (
        fields()
      )}
      <AppVersionLine />
    </Modal>
  );

  function fields(): JSX.Element {
    return (
      <>
        {lines.length > 0 && (
          /*
            `RELEASE-0113-01` Part D — the Playout team's own sentence, isolated in its `<bdi>`: the line stays
            LTR chrome around it (golden rule 11).
          */
          <p style={styles.where} data-password-where="">
            {enginePasswordLead(offered === CG_BRIDGE_ACCOUNT ? CG_BRIDGE_ACCOUNT : 'cg-admin')}{' '}
            <bdi>{ENGINE_PASSWORD_WHERE}</bdi>
          </p>
        )}
        <label htmlFor="cg-bridge-signin-user" style={styles.field}>
          Account
          <TextInput
            id="cg-bridge-signin-user"
            value={username}
            onChange={(next) => {
              setTyped(true);
              setUsername(next);
            }}
            autoComplete="off"
            // A machine account name (`cg-admin`): LTR is a statement about the CONTENT.
            dir="ltr"
            disabled={busy}
            aria-label="Account"
            onKeyDown={onEnter}
          />
        </label>
        <label htmlFor="cg-bridge-signin-pass" style={styles.field}>
          Password
          <PasswordInput
            id="cg-bridge-signin-pass"
            value={password}
            onChange={setPassword}
            autoComplete="off"
            disabled={busy}
            invalid={error?.marksField === true}
            aria-label="Password"
            onKeyDown={onEnter}
          />
        </label>
      </>
    );
  }
}
