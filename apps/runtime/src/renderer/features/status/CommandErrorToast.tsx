import { useEffect, useState } from 'react';
import { colors } from '../../theme.js';
import { onCommandError } from './commandFeedback.js';

const styles = {
  toast: {
    position: 'fixed' as const,
    bottom: '3rem',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '0.5rem 1rem',
    borderRadius: '0.35rem',
    background: colors.error,
    color: '#FEF2F2',
    border: `1px solid ${colors.error}`,
    fontSize: '0.85rem',
    fontWeight: 700,
    zIndex: 50,
    boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
  },
} as const;

const DISMISS_MS = 4000;

/** Transient, accessible error surface for rejected playout commands (C-001). */
export function CommandErrorToast(): JSX.Element | null {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = onCommandError((msg) => {
      setMessage(msg);
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => setMessage(null), DISMISS_MS);
    });
    return () => {
      if (timer !== null) clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  if (message === null) return null;
  return (
    <div style={styles.toast} role="alert">
      {message}
    </div>
  );
}
