import { useRef, useState } from 'react';
import { colors, cssVars } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import { PasswordInput } from '../../ui/PasswordInput.js';
import { SignInCard } from '../../ui/SignInCard.js';
import { TextInput } from '../../ui/TextInput.js';
import { directionOf, IsolatedName } from '../../ui/OperatorNames.js';
import { useFocusTrap } from '../../ui/focusTrap.js';
import { useAuthCapabilities } from '../../hooks/useAuthCapabilities.js';
import { useAuthSession } from '../../hooks/useAuthSession.js';
import { PlayoutSignInError } from '../../../platform/playoutSession.js';
import { PlayoutConnection } from '../firstRun/PlayoutConnection.js';
import {
  playoutOriginOf,
  signInBlocker,
  signInCanWork,
  type ShownCheckLine,
} from '../firstRun/firstRunStation.js';
import { signInFailureLine } from './signInMessages.js';

/**
 * 🔴 `R-066` / `C-037` — **THE SIGN-IN, OVER THE LIVE STACK.**
 *
 * Shown when, and only when, the bridge advertised `auth: 'playout'` and this console holds
 * no valid principal. With auth OFF it returns `null` and nothing about the console changes.
 *
 * ── WHY IT BLOCKS, WHEN THE BRIDGE ALREADY REFUSES ──────────────────────────
 *
 * The bridge is the gate — every intent from a socket with no principal is refused with one
 * sentence and nothing reaches CasparCG. This overlay is not a second gate and must never be
 * mistaken for one. It exists because **a console that PRESENTS controls as live when they
 * are not is the defect class this repo keeps paying for**: the operator presses TAKE in the
 * one moment they have least attention, and learns from a toast. A scrim that says what is
 * missing, before anything is pressed, is the honest surface for a state where nothing will
 * work.
 *
 * It is `LockOverlay`'s shape, and deliberately so: the same scrim, the same card, the same
 * focus trap, one control and no way out. Two gates that look alike is not duplication here —
 * an operator meeting either one is in the same situation (nothing will work until I do this
 * one thing), and a second visual language for it would be a second thing to learn.
 *
 * ── THE ORDER WHEN BOTH ARE UP ──────────────────────────────────────────────
 *
 * ⚠ This sits ABOVE `LockOverlay`, and that is not arbitrary: with no principal the bridge
 * refuses `lock.release` too (it is an operator act, and the door ADR 0010 rule 4 leaves open
 * is `bridge.capabilities` and `auth.*`, nothing else). A locked, signed-out console must
 * therefore sign in FIRST and unlock SECOND, which is the order the bridge enforces — so it
 * is the order the screen shows. Neither gate strands the operator: each has its own way
 * through, two seconds apart.
 *
 * ── ONE INTERFACE LANGUAGE ──────────────────────────────────────────────────
 *
 * 🔴 `DELTA-MULTI-CHANNEL-01-B` B3 — the card was `dir="rtl"` and Persian (`R-066`'s scoping);
 * the owner ruled that the interface and every message of ours are English, and Persian appears
 * only in names from the Playout. Operator and Playout NAMES go through {@link IsolatedName},
 * because a name is data whose language we do not control and whose placement beside neutral
 * separators must not be left to the bidi algorithm.
 *
 * ── SIGN-IN ONLY WHEN IT CAN WORK ───────────────────────────────────────────
 *
 * 🔴 `DELTA-MULTI-CHANNEL-01-B` B2 — the connection check is on the gate: the Playout's address,
 * CHECK, and ONE line in the check's own words. The fields and the button are enabled only while
 * that check says a sign-in can work (`signInCanWork`); the check runs once when the gate opens
 * (the unsigned door allows it, for this station's Playout — B1). A sign-in that finds the Playout
 * silent runs it again, so the silence is said under the address, never on a field; and only a
 * wrong username or password marks one.
 *
 * ── WHAT IS NOT ON IT ───────────────────────────────────────────────────────
 *
 * No explanation of what a Playout is, no instruction to call an engineer, no note about
 * tokens or sessions. Labels, values, state facts and one refusal sentence. The design
 * system's rule for an operator surface, and this is the surface an operator meets first.
 */
const styles = {
  // The one state fact the card states: whose session ended (never an explanation).
  sub: {
    margin: '0 0 16px',
    color: colors.textMuted,
    fontSize: cssVars['--r-lock-copy-fs'],
    textAlign: 'center' as const,
    lineHeight: 1.6,
  },
  label: {
    fontSize: cssVars['--r-text-sm'],
    fontWeight: 500,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  field: { marginBottom: 14 },
  // B3 — a message is ATTENTION, never red (`design.md` §29).
  error: {
    color: cssVars['--r-caution-text'],
    fontSize: cssVars['--r-text-sm'],
    minHeight: '1.25rem',
    marginTop: 4,
    lineHeight: 1.6,
  },
  check: { marginBottom: 16 },
} as const;

/** B2 — the gate shows ONE line of the check: the one that decides, or the Playout's own when all is well. */
function decidingLine(lines: readonly ShownCheckLine[]): readonly ShownCheckLine[] {
  const blocker = signInBlocker(lines);
  if (blocker !== null) return [blocker];
  const api = lines.find((l) => l.id === 'api');
  return api === undefined ? [] : [api];
}

export function SignInOverlay(): JSX.Element | null {
  const auth = useAuthSession();
  const capabilities = useAuthCapabilities();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<{
    text: string;
    marksField: boolean;
    fromPlayout?: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  // B2 — the check's lines, which decide whether a sign-in can work; and the one re-check.
  const [lines, setLines] = useState<readonly ShownCheckLine[] | null>(null);
  const [recheck, setRecheck] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  /*
    `off` and `unknown` show NOTHING. `unknown` is the connect window before
    `bridge.capabilities` lands, and a sign-in that flashed there on every reload would be a
    gate reporting its own latency — the state is "we have not asked yet", not "you are out".
  */
  const gated = auth.kind === 'signed-out' || auth.kind === 'expired';
  /*
    🔴 **WHAT THE BRIDGE SAID, WHEN THIS SURFACE DID NOT ASK.**

    A token can be refused by the bridge without anyone pressing anything — on a reload, on a
    reconnect. Without this the operator met a form that silently did nothing: on a bridge whose
    `playout.issuer` carries a typo, the credentials are right, the Playout mints a token, the
    bridge answers "that sign-in is not for this station", and the card came back blank.

    ⚠ This attempt's own error WINS. The operator has just pressed the button; answering them
    with a sentence about a token they presented ten seconds ago would be answering the wrong
    question. And neither is a field's fault unless it is a wrong username or password (B2).
  */
  const bridgeReason = auth.kind === 'signed-out' ? auth.reason : undefined;
  const message =
    error ?? (bridgeReason !== undefined ? { text: bridgeReason, marksField: false } : null);

  /*
    The trap arms and disarms WITH the gate, exactly as `LockOverlay`'s does with the lock:
    signing in hands the keyboard back to the console immediately and with no reload. It
    nominates the first field, so focus lands where the operator must type.

    ⚠ Called unconditionally, before the early return — a hook cannot sit behind a branch, and
    `enabled` is what makes it inert. Passing the flag rather than skipping the call is also
    what lets the trap release cleanly on the transition that matters.
  */
  useFocusTrap(cardRef, gated, { initialFocusSelector: 'input' });

  if (!gated) return null;

  const canWork = lines !== null && signInCanWork(lines);
  const locked = busy || !canWork;

  const submit = async (): Promise<void> => {
    if (busy || !canWork || username === '' || password === '') return;
    setBusy(true);
    setError(null);
    try {
      await window.cg.auth.signIn(username, password);
      // Nothing to reset on success: the state flips to `signed-in` and this unmounts.
    } catch (err) {
      /*
        ⚠ The CODE is mapped to this console's own sentence — the contract says the Playout's
        free-text `message` is never shown verbatim (it goes to the station's log instead), with
        ONE exception the owner decided (`CENTRAL-BRIDGE-01-A` A4): `cg_not_licensed` shows the
        Playout's message as it is, marks no field and keeps the form. A Playout that did not answer
        is the CHECK's to say, under the address (B2).
      */
      const code = err instanceof PlayoutSignInError ? err.code : 'unexpected';
      const line = signInFailureLine(
        code,
        err instanceof PlayoutSignInError ? err.playoutMessage : null,
      );
      if (code === 'unreachable') setRecheck((n) => n + 1);
      else setError(line);
      if (!line.keepsForm) setPassword('');
    } finally {
      setBusy(false);
      /*
        ⚠ **PUT THE CURSOR BACK.** Both fields carry `disabled`, and a disabled element loses
        focus to `document.body` in every browser — so after a failed attempt the retry
        keystrokes went nowhere and the operator had to reach for the mouse to answer a wrong
        password. The focus trap does not re-run: its dependency is `enabled`, which has not
        changed. Deferred one frame because the field is still disabled in this tick.
      */
      requestAnimationFrame(() => passwordRef.current?.focus());
    }
  };

  /*
    🔴 `R-082` — **ONE SIGN-IN LOOK** (`SignInCard`): the splash's ground, the APASAI mark and the
    product name, the version at the foot. The sentence that explained the gate ("The broadcast
    continues. Until you sign in, this console sends nothing.") went with it — an operator surface
    carries no explanatory prose. The one STATE FACT stays: whose session ended.
  */
  return (
    <SignInCard
      label="Playout sign-in"
      ground="gate"
      title="Sign in"
      cardRef={cardRef}
      footer={
        // The one way through. No ✕, no Cancel — there is nothing behind this to go back to.
        <Button
          variant="primary"
          className="cg-gate-submit"
          disabled={locked || username === '' || password === ''}
          onClick={() => void submit()}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      }
    >
      {auth.kind === 'expired' && (
        <p style={styles.sub} data-session-ended="">
          The session of <IsolatedName>{auth.name}</IsolatedName> has ended.
        </p>
      )}

      {/* B2 — the check, on the gate: the Playout, CHECK, and the one line that decides. */}
      <div style={styles.check} data-sign-in-check="">
        <PlayoutConnection
          origin={playoutOriginOf(capabilities?.signInUrl ?? null)}
          startEditing={false}
          mayChange={false}
          checkOnOpen
          onLines={setLines}
          recheck={recheck}
          lineFilter={decidingLine}
        />
      </div>

      <label htmlFor="cg-signin-user" style={styles.label}>
        Username
      </label>
      <div style={styles.field}>
        <TextInput
          id="cg-signin-user"
          value={username}
          onChange={setUsername}
          autoComplete="username"
          // The username is a machine account name (`cg-op1`), not prose: LTR is a
          // statement about the CONTENT, which is what the primitive's header asks for.
          dir="ltr"
          disabled={locked}
          aria-label="Username"
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit();
          }}
        />
      </div>

      <label htmlFor="cg-signin-pass" style={styles.label}>
        Password
      </label>
      <div style={styles.field}>
        <PasswordInput
          id="cg-signin-pass"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          disabled={locked}
          ref={passwordRef}
          // B2 — only a wrong username or password marks the field.
          invalid={message?.marksField === true}
          aria-label="Password"
          aria-describedby="cg-signin-error"
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit();
          }}
        />
      </div>

      {/*
            `role="status"` and not `alert`: the sentence appears where the operator is already
            looking, immediately under the field they just used, and an assertive announcement
            on every mistyped password is noise. It keeps its height when empty so the card
            does not jump under the pointer as the message arrives.
          */}
      {/*
            A4 — the Playout's own words sit in their own isolate (golden rule 11). `R-082` — and the
            line takes THEIR direction: a Persian refusal (`cg_not_licensed`) reads, and aligns, right
            to left, as the Playout sent it.
          */}
      <div
        id="cg-signin-error"
        style={styles.error}
        role="status"
        dir={message?.fromPlayout === true ? directionOf(message.text) : undefined}
      >
        {message?.fromPlayout === true ? <bdi>{message.text}</bdi> : message?.text}
      </div>
    </SignInCard>
  );
}
