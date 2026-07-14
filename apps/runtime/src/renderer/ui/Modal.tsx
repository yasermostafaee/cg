import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { colors } from '../theme.js';

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
    width: 'min(460px, 92vw)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.75rem',
    color: colors.text,
  },
  title: { fontSize: '1rem', fontWeight: 700, margin: 0 },
  body: { fontSize: '0.9rem', lineHeight: 1.5, color: colors.textMuted },
  footer: { display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' },
} as const;

interface ModalProps {
  title: string;
  /** The action buttons. The CANCEL/safe action belongs first in DOM order. */
  footer: ReactNode;
  /** Cancel — Escape, backdrop click, and the dialog's own dismiss all route here. */
  onClose: () => void;
  children?: ReactNode;
  ariaLabel?: string;
}

export function Modal({ title, footer, onClose, children, ariaLabel }: ModalProps): JSX.Element {
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
        style={styles.dialog}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={styles.title}>{title}</h2>
        {children !== undefined && <div style={styles.body}>{children}</div>}
        <div style={styles.footer}>{footer}</div>
      </div>
    </div>,
    document.body,
  );
}
