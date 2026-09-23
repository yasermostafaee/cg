import { useEffect, useRef, useState } from 'react';
import type { CatalogueChannel, SetupPhase } from '@cg/shared-ipc';
import { colors, cssVars } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import { NumericInput } from '../../ui/NumericInput.js';
import { TextInput } from '../../ui/TextInput.js';
import { IsolatedName } from '../../ui/OperatorNames.js';
import { useFocusTrap } from '../../ui/focusTrap.js';
import { useAuthSession } from '../../hooks/useAuthSession.js';
import { PlayoutSignInError } from '../../../platform/playoutSession.js';
import { signInMessage } from '../auth/signInMessages.js';
import { PlayoutConnection } from './PlayoutConnection.js';
import { commitFirstRun, groupByHost, playoutOriginOf } from './firstRunStation.js';

/**
 * 🔴 `DESKTOP-APPS-01` §2E — **FIRST-RUN: one field, then the station sets itself up.**
 *
 * Shown by an INSTALLED CG Control whose bridge says it is still in first-run, over everything,
 * in the sign-in gate's own shape (same scrim, same card family, one focus trap). In order, on one
 * screen:
 *
 *   1. the Playout's ADDRESS — the one thing typed — and the connection check's lines; CONNECT
 *      writes it through CG Control itself (`setup.setPlayoutAddress`, never the control socket);
 *   2. SIGN IN with a `station-admin` account — the bridge learns the Playout's issuer from it
 *      (`DESKTOP-APPS-01-A`), so no issuer is ever typed;
 *   3. the Playout's CHANNELS in that account's grant, grouped by the CasparCG host they play on;
 *   4. the SERVE ADDRESS, auto-detected and editable — then the station is written through the
 *      existing doors and first-run ends.
 *
 * If the Playout's list is unreachable, step 3 becomes two fields: the CasparCG host (prefilled
 * with the Playout's host) and the channel. No IP is hard-coded anywhere.
 *
 * Labels, values, state facts and refusal sentences — no explanation (the design system's rule for
 * an operator surface). The Playout's names are data and go through {@link IsolatedName}.
 */
const styles = {
  scrim: {
    position: 'fixed' as const,
    inset: 0,
    background: cssVars['--r-lock-scrim'],
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1002,
    color: colors.text,
  },
  card: {
    background: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: cssVars['--r-radius-lg'],
    width: 640,
    maxWidth: 'calc(100vw - 32px)',
    maxHeight: 'calc(100vh - 32px)',
    overflowY: 'auto' as const,
    display: 'flex',
    flexDirection: 'column' as const,
  },
  body: {
    padding: cssVars['--r-lock-card-pad'],
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 20,
  },
  title: { margin: 0, fontSize: cssVars['--r-lock-title-fs'], fontWeight: 650, lineHeight: 1.4 },
  step: { display: 'flex', flexDirection: 'column' as const, gap: 10 },
  stepHead: {
    margin: 0,
    fontSize: cssVars['--r-text-sm'],
    fontWeight: 600,
    color: colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
  },
  row: { display: 'flex', gap: 8, alignItems: 'center' },
  grow: { flex: 1, minWidth: 0 },
  label: { fontSize: cssVars['--r-text-sm'], color: colors.textSecondary, minWidth: 120 },
  fact: { fontSize: cssVars['--r-text-md'] },
  note: { fontSize: cssVars['--r-text-sm'], color: colors.textMuted },
  error: { fontSize: cssVars['--r-text-sm'], color: colors.errorText, lineHeight: 1.6 },
  hostHead: {
    margin: '6px 0 0',
    fontSize: cssVars['--r-text-sm'],
    color: colors.textSecondary,
  },
  channels: { display: 'flex', flexWrap: 'wrap' as const, gap: 8 },
} as const;

function hostOf(origin: string | null): string {
  if (origin === null) return '';
  try {
    return new URL(origin).hostname.replace(/^\[|\]$/g, '');
  } catch {
    return '';
  }
}

export function FirstRunScreen({
  phase,
  signInUrl,
}: {
  phase: SetupPhase;
  signInUrl: string | null;
}): JSX.Element | null {
  const auth = useAuthSession();
  const cardRef = useRef<HTMLDivElement>(null);
  const [done, setDone] = useState(false);
  useFocusTrap(cardRef, !done, { initialFocusSelector: 'input' });
  if (done) return null;

  const origin = playoutOriginOf(signInUrl);
  return (
    <div
      style={styles.scrim}
      role="dialog"
      aria-label="Set up CG Control"
      aria-modal="true"
      data-first-run={phase}
    >
      <div ref={cardRef} style={styles.card}>
        <div style={styles.body}>
          <h2 style={styles.title}>Set up CG Control</h2>
          <PlayoutStep phase={phase} origin={origin} />
          {phase === 'channel' && auth.kind !== 'signed-in' && (
            <SignInStep reason={auth.kind === 'signed-out' ? auth.reason : undefined} />
          )}
          {phase === 'channel' && auth.kind === 'signed-in' && (
            <ChannelStep
              playoutHost={hostOf(origin)}
              onDone={() => {
                setDone(true);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── 1 · The Playout, and the connection check ─────────────────────────────────

function PlayoutStep({ phase, origin }: { phase: SetupPhase; origin: string | null }): JSX.Element {
  return (
    <section style={styles.step} aria-label="Playout">
      <h3 style={styles.stepHead}>Playout</h3>
      <PlayoutConnection origin={origin} startEditing={phase === 'target'} mayChange />
    </section>
  );
}

// ── 2 · Sign in with a station-admin account ─────────────────────────────────

function SignInStep({ reason }: { reason: string | undefined }): JSX.Element {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<{ text: string; rtl: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    if (busy || username === '' || password === '') return;
    setBusy(true);
    setError(null);
    try {
      await window.cg.auth.signIn(username, password);
    } catch (err) {
      // The Playout's own refusals keep the sign-in gate's sentences (Persian, right to left).
      setError({
        text: signInMessage(err instanceof PlayoutSignInError ? err.code : 'unexpected'),
        rtl: true,
      });
      setPassword('');
    } finally {
      setBusy(false);
    }
  };
  // What the BRIDGE said about the token it was shown — "not set up yet" for an account that
  // cannot set the station up, "not for this station" for another Playout's.
  const shown = error ?? (reason !== undefined ? { text: reason, rtl: false } : null);

  return (
    <section style={styles.step} aria-label="Sign in">
      <h3 style={styles.stepHead}>Sign in</h3>
      <div style={styles.row}>
        <label htmlFor="cg-first-run-user" style={styles.label}>
          Username
        </label>
        <div style={styles.grow}>
          <TextInput
            id="cg-first-run-user"
            value={username}
            onChange={setUsername}
            autoComplete="username"
            dir="ltr"
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
            }}
          />
        </div>
      </div>
      <div style={styles.row}>
        <label htmlFor="cg-first-run-pass" style={styles.label}>
          Password
        </label>
        <div style={styles.grow}>
          <TextInput
            id="cg-first-run-pass"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            dir="ltr"
            disabled={busy}
            invalid={shown !== null}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
            }}
          />
        </div>
      </div>
      {shown !== null && (
        <div style={styles.error} role="status" dir={shown.rtl ? 'rtl' : 'ltr'}>
          {shown.text}
        </div>
      )}
      <div style={styles.row}>
        <Button
          variant="primary"
          disabled={busy || username === '' || password === ''}
          onClick={() => void submit()}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </div>
    </section>
  );
}

// ── 3 · The channel, 4 · the serve address ───────────────────────────────────

/** How long first-run waits for the Playout's list before offering the two fields instead. */
const CATALOGUE_TRIES = 12;

type Catalogue =
  | { state: 'reading' }
  | { state: 'rows'; rows: readonly CatalogueChannel[] }
  | { state: 'absent' }
  | { state: 'refused'; message: string };

function ChannelStep({
  playoutHost,
  onDone,
}: {
  playoutHost: string;
  onDone: () => void;
}): JSX.Element {
  const [catalogue, setCatalogue] = useState<Catalogue>({ state: 'reading' });
  const [picked, setPicked] = useState<CatalogueChannel | null>(null);
  const [manualHost, setManualHost] = useState(playoutHost);
  const [manualChannel, setManualChannel] = useState('');
  const [serveHost, setServeHost] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The Playout's list arrives a moment after the sign-in (the bridge reads it then).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      for (let attempt = 0; attempt < CATALOGUE_TRIES && !cancelled; attempt++) {
        try {
          const { rows } = await window.cg.setup.catalogue();
          if (rows !== null) {
            if (!cancelled) setCatalogue({ state: 'rows', rows });
            return;
          }
        } catch (err) {
          if (!cancelled) {
            setCatalogue({
              state: 'refused',
              message: err instanceof Error ? err.message : String(err),
            });
          }
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      if (!cancelled) setCatalogue({ state: 'absent' });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const manual =
    catalogue.state === 'absent' || (catalogue.state === 'rows' && catalogue.rows.length === 0);
  const host = manual ? manualHost.trim() : (picked?.casparHost ?? '');
  const channel = manual ? Number(manualChannel) : (picked?.casparChannel ?? 0);

  // The serve address: this machine's address on the route to the CasparCG host, detected, then
  // the admin's to edit.
  useEffect(() => {
    if (host === '') return;
    let cancelled = false;
    void window.cg.setup
      .routeAddress({ host })
      .then(({ address }) => {
        if (!cancelled && address !== null) setServeHost(address);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [host]);

  const ready = host !== '' && Number.isInteger(channel) && channel > 0 && !busy;
  const commit = async (): Promise<void> => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const refused = await commitFirstRun(window.cg, { channel, casparHost: host, serveHost });
      if (refused === null) onDone();
      else setError(refused);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section style={styles.step} aria-label="Channel">
        <h3 style={styles.stepHead}>Channel</h3>
        {catalogue.state === 'reading' && (
          <div style={styles.note}>Reading the Playout's channels…</div>
        )}
        {catalogue.state === 'refused' && (
          <div style={styles.error} role="status">
            {catalogue.message}
          </div>
        )}
        {catalogue.state === 'rows' && catalogue.rows.length === 0 && (
          <div style={styles.note}>The Playout lists no channel for this account.</div>
        )}
        {catalogue.state === 'rows' &&
          groupByHost(catalogue.rows).map((group, _i, all) => (
            <div key={group.host} data-caspar-host={group.host}>
              {all.length > 1 && (
                <h4 style={styles.hostHead} dir="ltr">
                  {group.host}
                </h4>
              )}
              <div style={styles.channels}>
                {group.rows.map((row) => {
                  const on = picked?.id === row.id && picked.casparHost === row.casparHost;
                  return (
                    <Button
                      key={`${row.casparHost}-${row.id}`}
                      variant="secondary"
                      active={on}
                      aria-pressed={on}
                      data-channel={row.casparChannel}
                      onClick={() => {
                        setPicked(row);
                      }}
                    >
                      <IsolatedName>{row.name}</IsolatedName>
                      {` · CH ${String(row.casparChannel)}`}
                    </Button>
                  );
                })}
              </div>
            </div>
          ))}
        {manual && (
          <>
            <div style={styles.row}>
              <label htmlFor="cg-first-run-host" style={styles.label}>
                CasparCG host
              </label>
              <div style={styles.grow}>
                <TextInput
                  id="cg-first-run-host"
                  value={manualHost}
                  onChange={setManualHost}
                  dir="ltr"
                  disabled={busy}
                />
              </div>
            </div>
            <div style={styles.row}>
              <label htmlFor="cg-first-run-channel" style={styles.label}>
                Channel
              </label>
              <div style={styles.grow}>
                <NumericInput
                  id="cg-first-run-channel"
                  value={manualChannel}
                  onValueChange={setManualChannel}
                  disabled={busy}
                />
              </div>
            </div>
          </>
        )}
      </section>

      {host !== '' && (
        <section style={styles.step} aria-label="Serve address">
          <h3 style={styles.stepHead}>Serve address</h3>
          <div style={styles.row}>
            <label htmlFor="cg-first-run-serve" style={styles.label}>
              This machine
            </label>
            <div style={styles.grow}>
              <TextInput
                id="cg-first-run-serve"
                value={serveHost}
                onChange={setServeHost}
                dir="ltr"
                disabled={busy}
              />
            </div>
          </div>
        </section>
      )}

      {error !== null && (
        <div style={styles.error} role="status">
          {error}
        </div>
      )}
      <div style={styles.row}>
        <Button variant="primary" disabled={!ready} onClick={() => void commit()}>
          {busy ? 'Setting up…' : 'Use this channel'}
        </Button>
      </div>
    </>
  );
}
