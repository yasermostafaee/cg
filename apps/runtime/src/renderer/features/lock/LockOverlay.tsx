import { useEffect, useRef, useState } from 'react';
import { colors } from '../../theme.js';

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
    background: 'rgba(15, 23, 42, 0.94)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    fontFamily: 'inherit',
    color: colors.text,
  },
  card: {
    background: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.5rem',
    padding: '2rem 2.5rem',
    width: 360,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '1rem',
  },
  title: { margin: 0, fontSize: '1.4rem', fontWeight: 700, letterSpacing: '0.05em' },
  sub: { margin: 0, color: colors.textMuted, fontSize: '0.9rem' },
  metaRow: {
    display: 'flex',
    gap: '0.5rem',
    fontSize: '0.75rem',
    color: colors.textMuted,
  },
  chip: {
    padding: '0.1rem 0.5rem',
    borderRadius: '0.7rem',
    border: `1px solid ${colors.border}`,
    background: colors.panelMuted,
    letterSpacing: '0.05em',
  },
  input: {
    background: colors.panelMuted,
    color: colors.text,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.25rem',
    padding: '0.6rem 0.75rem',
    fontSize: '1.2rem',
    letterSpacing: '0.5em',
    textAlign: 'center' as const,
    width: '100%',
  },
  button: {
    background: colors.ready,
    color: '#FFF',
    border: 'none',
    padding: '0.6rem 1.25rem',
    borderRadius: '0.25rem',
    cursor: 'pointer',
    fontSize: '0.95rem',
    fontWeight: 700,
    letterSpacing: '0.05em',
  },
  error: { color: colors.error, fontSize: '0.85rem', minHeight: '1rem' },
} as const;

/**
 * Full-window lock overlay per Phase 6 §8. Renders on top of every
 * region when `LockState.engaged === true`. Operators release with a
 * PIN; mismatch shows a banner but never locks them out — they may
 * retry indefinitely.
 *
 * Air-safety contract: while engaged, all input is captured by the
 * overlay; the stack rows underneath cannot receive clicks. The 🔒
 * chip in the status bar mirrors this state for situational awareness.
 */
export function LockOverlay({ engaged, engagedAt, reason, onRelease }: Props): JSX.Element | null {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [elapsed, setElapsed] = useState<string>(formatElapsed(engagedAt));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (engaged) {
      setPin('');
      setError(null);
      setWrongAttempts(0);
      inputRef.current?.focus();
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
    const result = await onRelease(pin);
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
      <div style={styles.card}>
        <h2 style={styles.title}>RUNTIME LOCKED</h2>
        <p style={styles.sub}>Enter PIN to resume.</p>
        <div style={styles.metaRow}>
          {reason !== undefined && <span style={styles.chip}>{reason.toUpperCase()}</span>}
          {elapsed !== '' && (
            <span style={styles.chip} aria-label="Locked for">
              {elapsed}
            </span>
          )}
        </div>
        <input
          ref={inputRef}
          style={styles.input}
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit();
          }}
          aria-label="PIN"
        />
        <button style={styles.button} onClick={() => void submit()}>
          UNLOCK
        </button>
        <div style={styles.error}>{error}</div>
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
