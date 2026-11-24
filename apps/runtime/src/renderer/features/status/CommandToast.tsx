import { localeDirection, useFeedbackText, useLanguages } from '../../i18n/locale.js';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Info } from 'lucide-react';
import { cssVars } from '../../theme.js';
import { Icon } from '../../ui/Icon.js';
import { onCommandNotice, onCommandSuccess } from './commandFeedback.js';

/*
  `RUNTIME-REDESIGN-01` Phase 9 — the reference's `.global-toast` as rendered (`TOAST_PX` in the
  token home): 42 px off the foot, `12px 17px`, radius 9, 14 px, its own shadow. The OK pair is
  the reference's; the reference draws NO error toast (its toast has no command-refusal path),
  so that half keeps `colors.alarmFill` with the fill ink. Weight stays 700 on both: a refusal at
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
  success: {
    background: cssVars['--r-toast-ok-bg'],
    color: cssVars['--r-toast-ok-ink'],
    border: `1px solid ${cssVars['--r-toast-ok-line']}`,
  },
  notice: {
    background: cssVars['--r-surface-raised'],
    color: cssVars['--r-text'],
    border: `1px solid ${cssVars['--r-border-strong']}`,
    pointerEvents: 'none' as const,
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

/*
  🔴 **WHAT HAPPENS WHEN A SECOND CONFIRMATION ARRIVES WHILE THE FIRST IS STILL UP — the rule,
  written here because leaving it to whichever call site fires last is how a message gets
  erased.**

  **IT REPLACES, and the timer restarts.** Not queue, not merge:

  - QUEUEING would show the operator a stale confirmation of something they have moved on from,
    and the second action's result — the one they are waiting for — would arrive late.
  - MERGING would concatenate two unrelated sentences into one line whenever two acts happened
    to fall within 3.2 s, and the line would grow without a natural end.

  Replacement is right because the NEWER result is the one the operator just caused. But it is
  only safe under a corollary, and the corollary is the actual rule:

  🔴 **EVERY CONFIRMATION MUST STAND ALONE. One completed action makes exactly ONE call, and its
  sentence may never depend on an earlier toast still being visible.**

  That is the rule DELTA 8's first cut broke and the defect is worth keeping: importing a
  package and loading it are two presses in one picker session, so `Imported · X` was replaced
  by `Row 1 loaded.` moments later — a sentence that had quietly delegated "what arrived" to a
  message that was already gone. The load's line names the template now, so whichever survives
  says both halves. See `LayerRow`'s `load`.
*/

type Feedback =
  | { kind: 'success'; message: string }
  | { kind: 'notice'; message: string; owner: Document };

/**
 * Transient feedback for completed actions and explanations of local state.
 * Command refusals use their own persistent banner.
 */
export function CommandToast(): JSX.Element | null {
  const message = useFeedbackText();
  const { feedback: feedbackLanguage } = useLanguages();
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const show = (next: Feedback): void => {
      setFeedback(next);
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => setFeedback(null), DISMISS_MS);
    };
    const unsubscribeSuccess = onCommandSuccess((message) => show({ kind: 'success', message }));
    const unsubscribeNotice = onCommandNotice((message, owner) =>
      show({ kind: 'notice', message, owner }),
    );
    return () => {
      if (timer !== null) clearTimeout(timer);
      unsubscribeSuccess();
      unsubscribeNotice();
    };
  }, []);

  if (feedback === null) return null;
  const toast = (
    <div
      style={{ ...styles.base, ...styles[feedback.kind] }}
      dir={localeDirection(feedbackLanguage)}
      role="status"
      aria-live="polite"
      aria-label={message(feedback.kind === 'success' ? 'Command success' : 'Command notice')}
    >
      <Icon icon={feedback.kind === 'success' ? Check : Info} size={TOAST_ICON_PX} />
      <span>{message(feedback.message)}</span>
    </div>
  );
  return feedback.kind === 'notice' && feedback.owner !== document
    ? createPortal(toast, feedback.owner.body)
    : toast;
}
