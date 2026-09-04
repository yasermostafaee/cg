import { useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import { Control } from '../../ui/Control.js';
import { Icon } from '../../ui/Icon.js';
import { Modal } from '../shell/Modal.js';
import * as s from './InfoTip.css.js';

/**
 * ⭐ `DESIGNER-FIX-0905` — **the `i`: where TEACHING and MECHANISM go, at reading size.**
 *
 * The Inspector had grown paragraphs that explained, in prose, what the panel could have
 * said in state — and the paragraphs that were genuinely worth reading (why a plate is
 * static, what the three loops are, how a look is a sub-scene) were set at inspector size
 * in a 320 px column, which is why the owner's report was _"long and small and
 * unreadable"_. This is the other half of the fix: what remains worth reading is read ONCE,
 * ever, behind a small `i` beside the thing it explains, in the shared {@link Modal} — a
 * message surface, set at the app's message size (0.9rem, the owner's 2026-07-22 call),
 * not the inspector's.
 *
 * 🔴 **Nothing that names a remedy, a blocking condition or a refusal goes behind this.**
 * A state and its remedy stay inline beside their control; an export refusal stays inline
 * and loud. The `i` holds only what an author reads once and thereafter knows. When a
 * sentence's kind is unclear, it stays inline — a sentence wrongly hidden is invisible.
 */
export function InfoTip({
  title,
  children,
  ariaLabel,
}: {
  /** The modal's heading — name the thing, not the sentence ("Live plates on air"). */
  title: string;
  /** The teaching, as paragraphs (`<p>`). Set at reading size by the modal. */
  children: ReactNode;
  /** Accessible name for the `i` button. Defaults to `About <title>`. */
  ariaLabel?: string;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const label = ariaLabel ?? `About ${title}`;
  return (
    <>
      <Control
        variant="ghost"
        size="xs"
        className={s.button}
        aria-label={label}
        title={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="info-tip"
        onClick={() => setOpen(true)}
      >
        <Icon icon={Info} size={13} />
      </Control>
      {open && (
        <Modal title={title} onClose={() => setOpen(false)} width="min(520px, 92vw)">
          <div className={s.body} data-testid="info-tip-body">
            {children}
          </div>
        </Modal>
      )}
    </>
  );
}

/**
 * A one-line inline STATE beside a control, with the `i` at its end — the shape most
 * panels reduce to once the teaching has moved: what is true now, what to do about it,
 * and a door to the why. `role="status"` so a state change is announced, never shouted.
 */
export function StateLine({
  children,
  tip,
  testId,
  tone = 'muted',
}: {
  children: ReactNode;
  /** The `i` for this line, when it has a mechanism worth reading once. */
  tip?: ReactNode;
  testId?: string;
  /** `text` for a state the author acts on; `muted` for a caption. */
  tone?: 'text' | 'muted';
}): JSX.Element {
  return (
    <p className={tone === 'text' ? s.stateText : s.stateMuted} data-testid={testId}>
      <span className={s.stateBody}>{children}</span>
      {tip}
    </p>
  );
}
