import { useEffect, useState } from 'react';
import { colors } from '../../theme.js';
import { onCommandError, onCommandSuccess } from './commandFeedback.js';

const styles = {
  base: {
    position: 'fixed' as const,
    bottom: '3rem',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '0.5rem 1rem',
    borderRadius: '0.35rem',
    fontSize: '0.85rem',
    fontWeight: 700,
    zIndex: 50,
    boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
  },
  error: {
    background: colors.error,
    color: '#FEF2F2',
    border: `1px solid ${colors.error}`,
  },
  // Green success, mirroring the error toast's dark-bg / light-text weight.
  // `#10B981` is the `--r-success` token (ack / healthy).
  success: {
    background: '#065F46',
    color: '#ECFDF5',
    border: '1px solid #10B981',
  },
} as const;

const DISMISS_MS = 4000;

interface Feedback {
  message: string;
  kind: 'error' | 'success';
}

/**
 * Transient, accessible feedback surface for operator actions (C-001). Errors
 * (rejected commands) render red; successes (a completed local action, e.g.
 * "Imported X") render green. Both come from `commandFeedback` — the single
 * mechanism that replaced inline messages pinned into a row/panel. Last-write
 * wins; auto-dismisses.
 */
export function CommandToast(): JSX.Element | null {
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const show = (message: string, kind: Feedback['kind']): void => {
      setFeedback({ message, kind });
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => setFeedback(null), DISMISS_MS);
    };
    const unsubscribeError = onCommandError((msg) => show(msg, 'error'));
    const unsubscribeSuccess = onCommandSuccess((msg) => show(msg, 'success'));
    return () => {
      if (timer !== null) clearTimeout(timer);
      unsubscribeError();
      unsubscribeSuccess();
    };
  }, []);

  if (feedback === null) return null;
  const isError = feedback.kind === 'error';
  return (
    // R-006 — named, because `role="alert"` is no longer unique: the connection banner is
    // deliberately an alert too ("nothing can reach air" IS an alert). Callers that mean
    // THIS toast must be able to say so — and error vs success are separately addressable.
    <div
      style={{ ...styles.base, ...(isError ? styles.error : styles.success) }}
      role="alert"
      aria-label={isError ? 'Command error' : 'Command success'}
    >
      {feedback.message}
    </div>
  );
}
