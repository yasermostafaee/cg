import { useEffect, useState } from 'react';
import { Check, TriangleAlert } from 'lucide-react';
import { colors, cssVars } from '../../theme.js';
import { Icon } from '../../ui/Icon.js';
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
    /*
      🔴 `CONSOLE-LOOK-06` DELTA D3 — 50 PUT IT UNDER THE MODAL SCRIM, WHICH IS 1000.

      Measured, not reasoned: `Modal`'s scrim is `z-index: 1000` and its dialog 1001, so every
      toast raised from inside a dialog — `Deleted “…”` from the template picker is the live
      one — painted BEHIND the scrim. Not hidden, which is what made it survive: the element
      was in the DOM, visible to `toBeVisible()`, and dimmed to nothing on screen.

      ⚠ THIS IS THE CHEAP HALF OF THE RIGHT FIX AND IS MARKED AS SUCH. The reference answers
      this with a SECOND family — `.modal-toast`, absolutely positioned inside the dialog just
      above its footer — precisely so a dialog's confirmation does not fly to the window's
      bottom edge. Ours is one family, fixed to the window, so the toast is now visible over a
      dialog but still lands at the foot of the SCREEN rather than of the dialog. Reported as
      the remaining D3 gap rather than left looking finished.
    */
    zIndex: 1100,
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: cssVars['--r-toast-gap'],
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

/*
  The reference dismisses at 3200 ms. Adopted: a toast that carries the subject and its value
  and no second clause is read in a glance, and 800 ms of a four-second dwell was paying for
  sentences that are no longer there.
*/
/** `.global-toast svg{width:17px;height:17px}`, measured. */
const TOAST_ICON_PX = 17;

const DISMISS_MS = 3200;

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
      {/*
        The reference draws a mint check beside the line (`.global-toast svg{width:17px}`).
        Ours draws the check on the OK half and a warning triangle on the refusal half — the
        reference has no refusal toast to copy, and a check beside a failure would be the
        icon contradicting the sentence. Both are decorative: the `aria-label` on the region
        already says which kind this is, and the message says what happened.
      */}
      <Icon icon={isError ? TriangleAlert : Check} size={TOAST_ICON_PX} />
      <span>{feedback.message}</span>
    </div>
  );
}
