import { useEffect, useRef, useState } from 'react';
import { colors } from '../../theme.js';

interface Props {
  engaged: boolean;
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
export function LockOverlay({ engaged, onRelease }: Props): JSX.Element | null {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (engaged) {
      setPin('');
      setError(null);
      inputRef.current?.focus();
    }
  }, [engaged]);

  if (!engaged) return null;

  const submit = async (): Promise<void> => {
    const result = await onRelease(pin);
    if (!result.ok) {
      setError(result.reason === 'pin-mismatch' ? 'Incorrect PIN.' : 'Could not release lock.');
      setPin('');
      inputRef.current?.focus();
    }
  };

  return (
    <div style={styles.scrim} role="dialog" aria-label="Lock screen" aria-modal="true">
      <div style={styles.card}>
        <h2 style={styles.title}>RUNTIME LOCKED</h2>
        <p style={styles.sub}>Enter PIN to resume.</p>
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
