import { useEffect, useRef, useState } from 'react';
import { Lock } from 'lucide-react';
import { colors, cssVars, LOCK_PX } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { useFocusTrap } from '../../ui/focusTrap.js';
import { normalizeDigits } from '../../ui/NumericInput.js';

interface Props {
  engaged: boolean;
  /** ISO timestamp of when the lock engaged; absent if state pre-dates M8.4 wire format. */
  engagedAt?: string;
  /** Reason carried by LockState; surfaced as a chip on the overlay. */
  reason?: 'operator' | 'auto-idle' | 'system';
  onRelease: (
    pin: string,
  ) => Promise<{ ok: boolean; reason?: 'pin-mismatch' | 'not-engaged' | undefined }>;
}

const styles = {
  scrim: {
    position: 'fixed' as const,
    inset: 0,
    background: cssVars['--r-lock-scrim'],
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    fontFamily: 'inherit',
    color: colors.text,
  },
  /*
    `RUNTIME-REDESIGN-01` PHASE 9 — the reference's `unlock-dialog` LOOK (`design.md` §16.3):
    a 480 px card, a body padded `32px 24px 23px`, an icon box, a centred title and copy, the
    PIN field, and one full-width submit in a ruled foot. The LOOK and nothing else: this is
    the app's own scrim and card, still not a `<dialog>` and still without a way out (the
    header below says why). The reference draws its box in the Station-setup shadow root's
    teal; this console has one accent and the box takes it.
  */
  card: {
    background: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: cssVars['--r-radius-lg'],
    width: cssVars['--r-lock-card-w'],
    maxWidth: 'calc(100vw - 32px)',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  },
  body: {
    padding: cssVars['--r-lock-card-pad'],
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'stretch',
  },
  iconBox: {
    width: cssVars['--r-lock-icon-box'],
    height: cssVars['--r-lock-icon-box'],
    margin: '0 auto 20px',
    display: 'grid',
    placeItems: 'center',
    background: cssVars['--r-accent-fill'],
    border: `1px solid ${colors.border}`,
    borderRadius: cssVars['--r-lock-icon-radius'],
    color: cssVars['--r-accent'],
  },
  title: {
    margin: '0 0 8px',
    fontSize: cssVars['--r-lock-title-fs'],
    fontWeight: 650,
    letterSpacing: '-0.035em',
    lineHeight: 1.3,
    textAlign: 'center' as const,
  },
  sub: {
    margin: '0 0 23px',
    color: colors.textMuted,
    fontSize: cssVars['--r-lock-copy-fs'],
    textAlign: 'center' as const,
  },
  metaRow: {
    display: 'flex',
    justifyContent: 'center',
    gap: '0.5rem',
    fontSize: cssVars['--r-text-xs'],
    color: colors.textMuted,
    margin: '0 0 16px',
  },
  chip: {
    padding: '0.1rem 0.5rem',
    borderRadius: cssVars['--r-radius-full'],
    border: `1px solid ${colors.border}`,
    background: colors.panelMuted,
    letterSpacing: '0.05em',
  },
  label: {
    fontSize: cssVars['--r-text-sm'],
    fontWeight: 500,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  input: {
    fontFamily: cssVars['--r-font-mono'],
    fontSize: cssVars['--r-lock-pin-fs'],
    letterSpacing: '0.3em',
    height: cssVars['--r-lock-pin-h'],
    padding: '10px 12px',
  },
  error: {
    color: colors.errorText,
    fontSize: cssVars['--r-text-sm'],
    minHeight: '1.25rem',
    marginTop: 8,
  },
  foot: {
    padding: '16px 24px',
    borderTop: `1px solid ${colors.border}`,
    background: colors.panelMuted,
  },
  submit: { width: '100%', minHeight: cssVars['--r-lock-submit-h'] },
} as const;

/**
 * Full-window lock overlay per Phase 6 §8. Renders on top of every
 * region when `LockState.engaged === true`. Operators release with a
 * PIN; mismatch shows a banner but never locks them out — they may
 * retry indefinitely.
 *
 * Air-safety contract: while engaged, all input is captured by the
 * overlay; the stack rows underneath can receive neither clicks NOR the
 * KEYBOARD. The LOCKED chip in the status bar mirrors this state for
 * situational awareness.
 *
 * 🔴 `B-229` — THE SECOND HALF OF THAT SENTENCE IS NEW, AND IT USED TO BE FALSE.
 *
 * "All input is captured" was written when only the pointer was considered. The scrim is
 * `position: fixed; inset: 0`, so a click genuinely cannot reach through it — but this
 * component handled no key at all, nothing in the app sets `inert`, and the stack rows
 * stayed in the document's sequential focus order. Tab walked straight through a
 * 94 %-opaque lock screen onto a TAKE, where Space presses it.
 *
 * The containment comes from {@link useFocusTrap}, the SAME implementation `Modal` uses.
 * `Modal`'s own note explains why this component does not use the modal primitive — it
 * would hand a lock screen three ways out, and a lock with a way out is not a lock. That
 * reasoning is about the EXITS and was always right; it never applied to the trap, which
 * is the opposite kind of mechanism, and reading the one as the other is why this
 * overlay inherited neither.
 *
 * ⚠ The RENDERER half is only half. A lock the executing side ignores is not a lock
 * either, so the bridge refuses every operator intent while `#lock.engaged` — see
 * `LOCK_ENGAGED_REFUSAL` in `@cg/shared-ipc`. Neither half is sufficient alone: this one
 * stops the press, and that one stops anything that got past it (another browser on the
 * LAN, a dialog left open over the scrim, a stale render).
 */
export function LockOverlay({ engaged, engagedAt, reason, onRelease }: Props): JSX.Element | null {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [elapsed, setElapsed] = useState<string>(formatElapsed(engagedAt));
  const cardRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /*
    The trap arms with the lock and disarms with it — `enabled` IS `engaged`, so releasing
    hands the keyboard back to the console immediately and with no reload, which is the
    inverse half of `B-229` and exactly as important as the trap itself.

    It nominates the PIN field, so focus lands where the operator must type rather than on
    whatever happens to be first in the card. That replaces the bare `inputRef.focus()`
    below rather than joining it: two things moving focus on the same commit is the race
    `B-230` is about.
  */
  useFocusTrap(cardRef, engaged, { initialFocusSelector: 'input' });

  useEffect(() => {
    if (engaged) {
      setPin('');
      setError(null);
      setWrongAttempts(0);
    }
  }, [engaged]);

  // Refresh the elapsed-time chip every second while engaged.
  useEffect(() => {
    if (!engaged) return;
    setElapsed(formatElapsed(engagedAt));
    const t = setInterval(() => setElapsed(formatElapsed(engagedAt)), 1000);
    return () => clearInterval(t);
  }, [engaged, engagedAt]);

  if (!engaged) return null;

  const submit = async (): Promise<void> => {
    // R-020 — digits in the PIN normalize to Latin, and StatusBar normalizes
    // the SAME way before `lock.engage`, so a PIN typed ۱۲۳۴ on a Persian
    // layout matches one stored as 1234 (and vice versa). Non-digit
    // characters pass through verbatim.
    const result = await onRelease(normalizeDigits(pin));
    if (!result.ok) {
      if (result.reason === 'pin-mismatch') {
        setWrongAttempts((n) => n + 1);
        setError(
          wrongAttempts === 0
            ? 'Incorrect PIN.'
            : `Incorrect PIN (${String(wrongAttempts + 1)} attempts).`,
        );
      } else {
        setError('Could not release lock.');
      }
      setPin('');
      inputRef.current?.focus();
    }
  };

  return (
    <div style={styles.scrim} role="dialog" aria-label="Lock screen" aria-modal="true">
      <div ref={cardRef} style={styles.card}>
        <div style={styles.body}>
          <div style={styles.iconBox}>
            <Icon icon={Lock} size={LOCK_PX.iconGlyph} />
          </div>
          {/* The reference's own words (`design.md` §16.3). True here as there: the bridge
              refuses every console verb while locked, and air is untouched. */}
          <h2 style={styles.title}>Console locked</h2>
          <p style={styles.sub}>Playout continues. Enter your PIN to use the console.</p>
          {/* Kept, and not drawn by the reference: an auto-idle lock and one an operator set
              are different facts, and the clock says how long the console has been unattended. */}
          {(reason !== undefined || elapsed !== '') && (
            <div style={styles.metaRow}>
              {reason !== undefined && <span style={styles.chip}>{reason.toUpperCase()}</span>}
              {elapsed !== '' && (
                <span style={styles.chip} aria-label="Locked for">
                  {elapsed}
                </span>
              )}
            </div>
          )}
          <label htmlFor="lock-pin" style={styles.label}>
            PIN
          </label>
          <input
            id="lock-pin"
            ref={inputRef}
            className="cg-field"
            style={styles.input}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
            }}
            aria-label="PIN"
          />
          <div style={styles.error} role="status">
            {error}
          </div>
        </div>
        {/* ONE control, and it is the release path. No ✕, no Cancel, nothing that closes. */}
        <div style={styles.foot}>
          <Button variant="primary" style={styles.submit} onClick={() => void submit()}>
            Unlock console
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Render "0:42" / "5:12" / "1:03:04" given an ISO timestamp. Returns
 * empty string when the timestamp is absent — the chip is hidden in
 * that case so older state payloads (pre-M8.4) render cleanly.
 */
export function formatElapsed(engagedAt: string | undefined, nowMs?: number): string {
  if (engagedAt === undefined) return '';
  const start = Date.parse(engagedAt);
  if (Number.isNaN(start)) return '';
  const now = nowMs ?? Date.now();
  const secs = Math.max(0, Math.floor((now - start) / 1000));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) {
    return `${String(h)}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m)}:${String(s).padStart(2, '0')}`;
}
