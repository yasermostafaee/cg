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
import { signInMarksField, signInMessage } from '../auth/signInMessages.js';
import { ConnectionCheckList } from './ConnectionCheckList.js';
import { PlayoutConnection } from './PlayoutConnection.js';
import {
  declareFirstRunChannels,
  groupByHost,
  onAirWarning,
  playoutOriginOf,
  signInBlocker,
  signInCanWork,
  writeFirstRunConnection,
  type ChannelChoice,
  type ShownCheckLine,
} from './firstRunStation.js';

/**
 * 🔴 `DESKTOP-APPS-01` §2E — **FIRST-RUN: one field, then the station sets itself up.**
 *
 * Shown by an INSTALLED CG Control whose bridge says it is still in first-run, over everything,
 * in the sign-in gate's own shape (same scrim, same card family, one focus trap). In order, on one
 * screen:
 *
 *   1. the Playout's ADDRESS — the one thing typed — and the connection check's lines; CONNECT
 *      writes it through CG Control itself (`setup.setPlayoutAddress`, never the control socket).
 *      The AMCP line says "waiting for sign-in" here (`DESKTOP-APPS-01-B`) — while the Playout
 *      answers; while it does not, only the Playout's line says so (`CHECK-RERUN-01`);
 *   2. SIGN IN with a `station-admin` account — the bridge learns the Playout's issuer from it
 *      (`DESKTOP-APPS-01-A`), so no issuer is ever typed, and a Playout 2.8.54 opens AMCP to this
 *      machine on it — so the check runs again and JUDGES the AMCP line (`-01-B` B2);
 *   3. the Playout's CHANNELS in that account's grant, grouped by the CasparCG host they play on —
 *      ONE OR MORE of them, on one host (`MULTI-CHANNEL-01` §2 E);
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
  /*
    `DELTA-MULTI-CHANNEL-01-B` B3 — a message on this screen is ATTENTION, never red (`design.md`
    §29): red belongs to controls that destroy. The owner met a red line here twice.
  */
  error: { fontSize: cssVars['--r-text-sm'], color: cssVars['--r-caution-text'], lineHeight: 1.6 },
  // `DESKTOP-APPS-01-D` d — the on-air warning: the console's caution ink, one line.
  warning: {
    fontSize: cssVars['--r-text-sm'],
    color: cssVars['--r-caution-text'],
    lineHeight: 1.6,
  },
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
  // B2 — the AMCP line is judged after the sign-in, and the channels come after that.
  const [amcpJudged, setAmcpJudged] = useState(false);
  /*
    `DELTA-MULTI-CHANNEL-01-B` B2 — the check's lines, which decide whether a sign-in can work;
    and the one re-check a sign-in asks for when it finds the Playout silent.
  */
  const [checkLines, setCheckLines] = useState<readonly ShownCheckLine[] | null>(null);
  const [recheck, setRecheck] = useState(0);
  useFocusTrap(cardRef, !done, { initialFocusSelector: 'input' });
  if (done) return null;

  const signedIn = phase === 'channel' && auth.kind === 'signed-in';
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
          <PlayoutStep
            phase={phase}
            origin={origin}
            judgeNow={signedIn}
            onJudged={() => {
              setAmcpJudged(true);
            }}
            // B2 — the sign-in below needs a verdict before anybody types: one check on open.
            checkOnOpen={phase === 'channel' && auth.kind !== 'signed-in'}
            onLines={setCheckLines}
            recheck={recheck}
          />
          {phase === 'channel' && auth.kind !== 'signed-in' && (
            <SignInStep
              reason={auth.kind === 'signed-out' ? auth.reason : undefined}
              lines={checkLines}
              onPlayoutSilent={() => {
                setRecheck((n) => n + 1);
              }}
            />
          )}
          {signedIn && amcpJudged && (
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

function PlayoutStep({
  phase,
  origin,
  judgeNow,
  onJudged,
  checkOnOpen,
  onLines,
  recheck,
}: {
  phase: SetupPhase;
  origin: string | null;
  judgeNow: boolean;
  onJudged: () => void;
  checkOnOpen: boolean;
  onLines: (lines: readonly ShownCheckLine[] | null) => void;
  recheck: number;
}): JSX.Element {
  return (
    <section style={styles.step} aria-label="Playout">
      <h3 style={styles.stepHead}>Playout</h3>
      <PlayoutConnection
        origin={origin}
        startEditing={phase === 'target'}
        mayChange
        judgeNow={judgeNow}
        onJudged={onJudged}
        checkOnOpen={checkOnOpen}
        onLines={onLines}
        recheck={recheck}
      />
    </section>
  );
}

// ── 2 · Sign in with a station-admin account ─────────────────────────────────

function SignInStep({
  reason,
  lines,
  onPlayoutSilent,
}: {
  reason: string | undefined;
  /** The connection check's lines, which decide whether a sign-in can work (B2). */
  lines: readonly ShownCheckLine[] | null;
  /** B2 — the Playout did not answer the sign-in: the check says so, under the address. */
  onPlayoutSilent: () => void;
}): JSX.Element {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<{ text: string; marksField: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  /*
    🔴 `DELTA-MULTI-CHANNEL-01-B` B2 — **A SIGN-IN IS OFFERED ONLY WHEN IT CAN WORK.** The owner,
    with the Playout down, could type and press Sign in, and got his Password field turned red over
    a Playout that was not answering. The fields and the button are enabled only while the check
    says a sign-in can work (the one predicate, `signInCanWork`), and while it does not, ONE line
    says why in the check's own words. Check stays where it is, above.
  */
  const canWork = lines !== null && signInCanWork(lines);
  const blocker = canWork ? null : signInBlocker(lines);

  const submit = async (): Promise<void> => {
    if (busy || !canWork || username === '' || password === '') return;
    setBusy(true);
    setError(null);
    try {
      await window.cg.auth.signIn(username, password);
    } catch (err) {
      const code = err instanceof PlayoutSignInError ? err.code : 'unexpected';
      if (code === 'unreachable') {
        // B2 — the Playout stopped answering since the check: the CHECK says so, under the
        // address, in its own words. Never a sentence on a field.
        onPlayoutSilent();
      } else {
        setError({ text: signInMessage(code), marksField: signInMarksField(code) });
      }
      setPassword('');
    } finally {
      setBusy(false);
    }
  };
  // What the BRIDGE said about the token it was shown — "not set up yet" for an account that
  // cannot set the station up, "not for this station" for another Playout's. Never a field's fault.
  const shown = error ?? (reason !== undefined ? { text: reason, marksField: false } : null);
  const locked = busy || !canWork;

  return (
    <section style={styles.step} aria-label="Sign in">
      <h3 style={styles.stepHead}>Sign in</h3>
      {blocker !== null && (
        <div data-sign-in-blocker="">
          <ConnectionCheckList lines={[blocker]} />
        </div>
      )}
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
            disabled={locked}
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
            disabled={locked}
            // B2 — only a wrong username or password marks the field.
            invalid={shown?.marksField === true}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
            }}
          />
        </div>
      </div>
      {shown !== null && (
        <div style={styles.error} role="status">
          {shown.text}
        </div>
      )}
      <div style={styles.row}>
        <Button
          variant="primary"
          disabled={locked || username === '' || password === ''}
          onClick={() => void submit()}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </div>
    </section>
  );
}

// ── 3 · The channels, 4 · the serve address ──────────────────────────────────

/** How long first-run waits for the Playout's list before offering the two fields instead. */
const CATALOGUE_TRIES = 12;

type Catalogue =
  | { state: 'reading' }
  | { state: 'rows'; rows: readonly CatalogueChannel[] }
  | { state: 'absent' }
  | { state: 'refused'; message: string };

/** A channel as a declaration names it: the CasparCG host, and the channel on it. */
export interface ChannelCoordinate {
  readonly casparHost: string;
  readonly casparChannel: number;
}

/**
 * A row the step shows: a row of the Playout's list, or — `unnamed` — a channel the station
 * already declares that the list does not name, shown as its number so it is never left out of the
 * set on screen.
 */
type ShownRow = CatalogueChannel & { readonly unnamed?: true };

const sameCoordinate = (a: ChannelCoordinate, b: ChannelCoordinate): boolean =>
  a.casparHost === b.casparHost && a.casparChannel === b.casparChannel;

/**
 * `DELTA-MULTI-CHANNEL-01-A` A8 — the commit's label FOLLOWS THE COUNT: `Use this channel` for one,
 * `Use these channels` for two or more. `count` is the channels picked — or, while none is, the
 * channels offered, so a list of two never reads "this channel" before anything is chosen (the
 * owner's first-run, 2026-09-25).
 */
function commitLabel(count: number, warned: boolean): string {
  const what = count > 1 ? 'Use these channels' : 'Use this channel';
  return warned ? `${what} anyway` : what;
}

/** One occupied channel's line of the on-air warning (d). */
interface OnAirLine {
  readonly channel: number;
  readonly name: string;
  readonly layers: readonly number[];
}

/**
 * 🔴 `DESKTOP-APPS-01-D` — **THE CHANNEL CHOICE, first-run's and Station setup's alike.**
 *
 * a — NOTHING IS PRESELECTED in first-run: `initial` is empty there, and the commit stays disabled
 *     until the admin clicks a row. Each row names the Playout's channel AND its number
 *     (`… · CH 1`).
 * d — before the channels are DECLARED, `prepare` puts in force what the reading needs (first-run:
 *     the connection), each ADDED channel's occupancy is read, and a channel already on air with
 *     somebody else's content earns ONE line and a second press — a warning, never a block.
 * e — Station setup's Change channel… passes its own `prepare`/`declare` and reuses the rest.
 *
 * ⭐ `MULTI-CHANNEL-01` §2 E / M — **ONE OR MORE.** Every row is a toggle, and the choice is a SET
 * of channels on ONE CasparCG host — a station drives one server — so a row on another host starts
 * the set again there. First-run declares the set it is given. Station setup opens on the
 * station's own set (`initial`) and applies the edit — add, remove, replace — through the same
 * doors, whose refusal is kept: nothing of ours may be on air on a channel leaving the set. A
 * declared channel the Playout's list does not name is still shown, as its number, so the set on
 * screen is the whole set and nothing leaves it unseen. The fallback fields (no list) name ONE
 * channel, as they always did.
 */
export function ChannelStep({
  playoutHost,
  onDone,
  prepare = (choice) => writeFirstRunConnection(window.cg, choice),
  declare = (choices) => declareFirstRunChannels(window.cg, choices),
  showServeAddress = true,
  fixedServeHost = '',
  initial = [],
}: {
  playoutHost: string;
  onDone: () => void;
  /** Put in force what the occupancy read needs, before the declaration. `null` or a refusal. */
  prepare?: (choice: ChannelChoice) => Promise<string | null>;
  /** Declare the chosen channels. `null` or the bridge's refusal sentence. */
  declare?: (choices: readonly ChannelChoice[]) => Promise<string | null>;
  /** First-run asks for the serve address; Station setup keeps the station's own. */
  showServeAddress?: boolean;
  fixedServeHost?: string;
  /** `MULTI-CHANNEL-01` §2 M — the set the step opens on: the station's own, or none (a). */
  initial?: readonly ChannelCoordinate[];
}): JSX.Element {
  const [catalogue, setCatalogue] = useState<Catalogue>({ state: 'reading' });
  const [picked, setPicked] = useState<readonly ChannelCoordinate[]>(initial);
  const [manualHost, setManualHost] = useState(playoutHost);
  const [manualChannel, setManualChannel] = useState('');
  const [serveHost, setServeHost] = useState(fixedServeHost);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // d — the warning, keyed to the choice it is about: changing the set withdraws it.
  const [warning, setWarning] = useState<{ key: string; lines: readonly OnAirLine[] } | null>(null);

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
  /*
    The rows on screen: the Playout's, then every channel of the station's own set the list does
    not name (§2 M), so a deselect is the only way anything leaves the set.
  */
  const listed: readonly CatalogueChannel[] = catalogue.state === 'rows' ? catalogue.rows : [];
  const rows: readonly ShownRow[] = [
    ...listed,
    ...initial
      .filter((d) => !listed.some((r) => sameCoordinate(r, d)))
      .map((d) => ({
        id: `declared-${d.casparHost}-${String(d.casparChannel)}`,
        name: '',
        casparHost: d.casparHost,
        casparChannel: d.casparChannel,
        unnamed: true as const,
      })),
  ];
  const isPicked = (row: ChannelCoordinate): boolean => picked.some((p) => sameCoordinate(p, row));
  const toggle = (row: ShownRow): void => {
    setPicked((current) => {
      // One CasparCG host per station: a row on another host starts the set again there.
      if (current.some((p) => p.casparHost !== row.casparHost)) return [row];
      return current.some((p) => sameCoordinate(p, row))
        ? current.filter((p) => !sameCoordinate(p, row))
        : [...current, row];
    });
  };
  const host = manual ? manualHost.trim() : (picked[0]?.casparHost ?? '');
  const channels = manual
    ? [Number(manualChannel)]
    : [...picked].map((p) => p.casparChannel).sort((a, b) => a - b);
  const choiceKey = `${host}:${channels.map(String).join(',')}`;
  const warned = warning !== null && warning.key === choiceKey;
  // Station setup opens on the station's set; pressing Use on the SAME set would change nothing.
  const unchanged =
    initial.length > 0 &&
    !manual &&
    picked.length === initial.length &&
    initial.every((d) => isPicked(d));
  const nameOf = (channel: number): string => {
    const row = rows.find((r) => r.casparHost === host && r.casparChannel === channel);
    return row === undefined || row.unnamed === true ? `CH ${String(channel)}` : row.name;
  };

  // The serve address: this machine's address on the route to the CasparCG host, detected, then
  // the admin's to edit.
  useEffect(() => {
    if (host === '' || !showServeAddress) return;
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
  }, [host, showServeAddress]);

  const ready =
    host !== '' &&
    channels.length > 0 &&
    channels.every((c) => Number.isInteger(c) && c > 0) &&
    !unchanged &&
    !busy;
  const commit = async (): Promise<void> => {
    const [first] = channels;
    if (!ready || first === undefined) return;
    setBusy(true);
    setError(null);
    const choices: ChannelChoice[] = channels.map((channel) => ({
      channel,
      casparHost: host,
      serveHost,
    }));
    try {
      if (!warned) {
        const refused = await prepare({ channel: first, casparHost: host, serveHost });
        if (refused !== null) {
          setError(refused);
          return;
        }
        // d — only a channel JOINING the set is read: one already in it carries our own content.
        const lines: OnAirLine[] = [];
        for (const channel of channels) {
          if (initial.some((d) => d.casparHost === host && d.casparChannel === channel)) continue;
          const occupancy = await window.cg.setup
            .channelOccupancy({ casparChannel: channel })
            .catch(() => ({ state: 'unknown' as const, layers: [] }));
          if (occupancy.state === 'occupied') {
            lines.push({
              channel,
              name: nameOf(channel),
              layers: occupancy.layers.map((l) => l.layer),
            });
          }
        }
        if (lines.length > 0) {
          setWarning({ key: choiceKey, lines });
          return;
        }
      }
      const refused = await declare(choices);
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
        {!manual &&
          groupByHost(rows).map((group, _i, all) => (
            <div key={group.host} data-caspar-host={group.host}>
              {all.length > 1 && (
                <h4 style={styles.hostHead} dir="ltr">
                  {group.host}
                </h4>
              )}
              {/* A8 — `cg-channel-choice`: a picked chip wears the console's one "chosen, not on
                  air" treatment (`controls.css`); a secondary `Button` alone gets no fill for it. */}
              <div style={styles.channels} className="cg-channel-choice">
                {(group.rows as readonly ShownRow[]).map((row) => {
                  const on = isPicked(row);
                  return (
                    <Button
                      key={`${row.casparHost}-${row.id}`}
                      variant="secondary"
                      active={on}
                      aria-pressed={on}
                      data-channel={row.casparChannel}
                      onClick={() => {
                        toggle(row);
                      }}
                    >
                      {row.unnamed === true ? (
                        `CH ${String(row.casparChannel)}`
                      ) : (
                        <>
                          <IsolatedName>{row.name}</IsolatedName>
                          {` · CH ${String(row.casparChannel)}`}
                        </>
                      )}
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

      {host !== '' && showServeAddress && (
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

      {warned &&
        warning.lines.map((line) => (
          <div
            key={line.channel}
            style={styles.warning}
            role="alert"
            data-channel-on-air={String(line.channel)}
          >
            <IsolatedName>{line.name}</IsolatedName>
            {onAirWarning(line.channel, line.layers)}
          </div>
        ))}
      {error !== null && (
        <div style={styles.error} role="status">
          {error}
        </div>
      )}
      <div style={styles.row}>
        <Button variant="primary" disabled={!ready} onClick={() => void commit()}>
          {busy
            ? 'Setting up…'
            : commitLabel(channels.length > 0 ? channels.length : rows.length, warned)}
        </Button>
      </div>
    </>
  );
}
