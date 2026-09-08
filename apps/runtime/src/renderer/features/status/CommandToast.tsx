import { useEffect, useState } from 'react';
import { colors, cssVars } from '../../theme.js';
import { onCommandError, onCommandSuccess } from './commandFeedback.js';

/*
  `RUNTIME-REDESIGN-01` Phase 9 — the reference's `.global-toast` as rendered (`TOAST_PX` in the
  token home): 42 px off the foot, `12px 17px`, radius 9, 14 px, its own shadow. The OK pair is
  the reference's; the reference draws NO error toast (its toast has no command-refusal path),
  so that half keeps `colors.error` with the fill ink. Weight stays 700 on both: a refusal at
  400 reads as a caption, and the two must weigh the same (`design.md` §16.3).
*/
const styles = {
  base: {
    position: 'fixed' as const,
    bottom: cssVars['--r-toast-bottom'],
    left: '50%',
    transform: 'translateX(-50%)',
    maxWidth: 'calc(100vw - 30px)',
    padding: cssVars['--r-toast-pad'],
    borderRadius: cssVars['--r-toast-radius'],
    fontSize: cssVars['--r-toast-fs'],
    fontWeight: 700,
    zIndex: 50,
    boxShadow: cssVars['--r-toast-shadow'],
  },
  error: {
    background: colors.error,
    color: cssVars['--r-ink-on-fill'],
    border: `1px solid ${cssVars['--r-danger-strong']}`,
  },
  success: {
    background: cssVars['--r-toast-ok-bg'],
    color: cssVars['--r-toast-ok-ink'],
    border: `1px solid ${cssVars['--r-toast-ok-line']}`,
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
