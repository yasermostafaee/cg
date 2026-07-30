import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { colors } from '../theme.js';
import { Button } from './Button.js';
import { Icon } from './Icon.js';

/**
 * The Runtime's modal primitive.
 *
 * Before this, four destructive/blocking decisions were asked with `window.confirm` and
 * `window.prompt`. A native dialog is the wrong instrument in a playout console: it is
 * chrome, not app — it renders in the browser's font at the browser's position, it cannot
 * carry the consequence of the act ("this clears anything on air") in the app's own
 * language, and on a machine running the Runtime full-screen it can land off the operator's
 * eyeline entirely. It also blocks the main thread, which stalls the OSC/state feed behind
 * it.
 *
 * This is the app's own surface: portalled to `document.body`, `role="dialog"` +
 * `aria-modal`, Escape to cancel, focus moved in on open and restored on close, and Tab
 * cycling trapped inside so the operator cannot tab onto an on-air button behind the scrim.
 * Backdrop click cancels, which is why the CANCEL path must always be the safe one.
 */

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

const styles = {
  scrim: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '1rem',
  },
  dialog: {
    background: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.4rem',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
    padding: '1rem 1.25rem',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.75rem',
    color: colors.text,
    /**
     * Bounded by the VIEWPORT, so a dialog whose content grows with config —
     * thirty candidate layers rather than four — is capped by the screen and
     * scrolls inside itself, instead of running off the bottom where its Apply
     * button cannot be reached.
     */
    maxHeight: '88vh',
    minHeight: 0,
  },
  /** The title row: heading on one side, the close affordance on the other. */
  titleRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '0.75rem',
    flexShrink: 0,
  },
  title: { fontSize: '1rem', fontWeight: 700, margin: 0 },
  /**
   * The body SCROLLS; the title and the footer do not. A dialog that asks a
   * destructive question must keep its buttons visible however long the content
   * is — scrolling the whole dialog would push Cancel off-screen.
   */
  body: {
    fontSize: '0.9rem',
    lineHeight: 1.5,
    color: colors.textMuted,
    overflowY: 'auto' as const,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.75rem',
  },
  footer: {
    display: 'flex',
    gap: '0.5rem',
    justifyContent: 'flex-end',
    alignItems: 'center',
    flexShrink: 0,
  },
} as const;

interface ModalProps {
  title: string;
  /** The action buttons. The CANCEL/safe action belongs first in DOM order. */
  footer: ReactNode;
  /** Cancel — Escape, backdrop click, and the dialog's own dismiss all route here. */
  onClose: () => void;
  children?: ReactNode;
  ariaLabel?: string;
  /**
   * How wide the dialog is. `prose` (the default) is the ~460px column that reads
   * well for a confirm question; `wide` is for dialogs carrying a TABLE of
   * per-row controls, which at prose width wrap into an unreadable stack.
   */
  size?: 'prose' | 'wide';
}

const WIDTHS: Record<'prose' | 'wide', string> = {
  prose: 'min(460px, 92vw)',
  wide: 'min(720px, 94vw)',
};

export function Modal({
  title,
  footer,
  onClose,
  children,
  ariaLabel,
  size = 'prose',
}: ModalProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        // Capture-phase + stop: Escape belongs to the top-most dialog, not to whatever is
        // behind the scrim.
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const nodes = [...(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (first === undefined || last === undefined) return;

      // Wrap at the ends, so focus can never escape the dialog onto an on-air control.
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      previous?.focus();
    };
  }, [onClose]);

  return createPortal(
    <div
      style={styles.scrim}
      role="presentation"
      onClick={onClose}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* The scrim cancels; a click INSIDE the dialog must not. */}
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? title}
        style={{ ...styles.dialog, width: WIDTHS[size] }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={styles.titleRow}>
          <h2 style={styles.title}>{title}</h2>
          {/*
            THE CLOSE AFFORDANCE, in the primitive so EVERY modal has one.

            Escape and a backdrop click already dismissed, but neither is visible: an
            operator who does not know them had to find the Cancel button, and a dialog
            with no obvious way out is one somebody force-reloads the console to escape.

            It routes to `onClose`, which is the CANCEL path — the same one Escape and
            the backdrop take. That is why it is safe for it to be the first focusable
            element in the dialog (the focus-on-open below lands here now): the thing
            focus lands on is the harmless one, which is exactly the invariant the
            footer's "cancel first in DOM order" rule was protecting.
          */}
          <Button
            variant="ghost"
            aria-label="Close"
            title="Close (Escape)"
            onClick={onClose}
            className="cg-modal-close"
          >
            <Icon icon={X} size={16} />
          </Button>
        </div>
        {children !== undefined && <div style={styles.body}>{children}</div>}
        <div style={styles.footer} className="cg-modal-footer">
          {footer}
        </div>
      </div>
    </div>,
    document.body,
  );
}
