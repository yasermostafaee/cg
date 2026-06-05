import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { colors } from '../../theme.js';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Shared modal shell so every dialog looks and behaves the same: a dimmed
 * backdrop, a centered card with a title + close (✕) icon header, an optional
 * scrolling body, and an optional right-aligned footer for action buttons
 * (built with {@link ModalButton}). Closes on Escape, backdrop click, and the
 * ✕ icon. Rendered through a portal so it escapes any stacking context.
 */

const styles = {
  backdrop: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0, 0, 0, 0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5000,
    padding: '1rem',
  },
  modal: {
    display: 'flex',
    flexDirection: 'column' as const,
    minHeight: 0,
    maxHeight: '82vh',
    background: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.5rem',
    boxShadow: '0 16px 48px rgba(0,0,0,0.55)',
    color: colors.text,
    fontSize: '0.84rem',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    padding: '0.7rem 0.9rem',
    borderBottom: `1px solid ${colors.border}`,
  },
  title: { fontSize: '0.95rem', fontWeight: 700, margin: 0 },
  close: {
    background: 'transparent',
    color: colors.textMuted,
    border: 'none',
    borderRadius: '0.2rem',
    width: 26,
    height: 26,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    fontSize: '1.05rem',
    lineHeight: 1,
    padding: 0,
    flexShrink: 0,
  },
  body: {
    minHeight: 0,
    overflowY: 'auto' as const,
    padding: '0.9rem',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.6rem',
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.4rem',
    padding: '0.7rem 0.9rem',
    borderTop: `1px solid ${colors.border}`,
  },
} as const;

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Right-aligned action buttons (e.g. Cancel / Save). Omit for a close-only dialog. */
  footer?: ReactNode;
  /** Card width. Defaults to a responsive ~440px. */
  width?: number | string;
  /** Accessible label; defaults to `title`. */
  ariaLabel?: string;
  /** Dismiss when the backdrop is clicked (default true). */
  closeOnBackdrop?: boolean;
  /** Minimum height of the scrolling body, so short dialogs aren't cramped. */
  minBodyHeight?: number | string;
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  width = 'min(440px, 92vw)',
  ariaLabel,
  closeOnBackdrop = true,
  minBodyHeight,
}: ModalProps): JSX.Element {
  const boxRef = useRef<HTMLDivElement>(null);

  // Escape closes; Tab is trapped inside the dialog so focus never leaves it.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const box = boxRef.current;
      if (box === null) return;
      const items = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) {
        e.preventDefault();
        box.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!box.contains(active)) {
        e.preventDefault();
        first?.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first?.focus();
      }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  // Move focus into the dialog on open (unless an inner control auto-focused);
  // restore it to the previously-focused element on close.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const box = boxRef.current;
    if (box !== null && !box.contains(document.activeElement)) {
      const firstFocusable = box.querySelector<HTMLElement>(FOCUSABLE);
      (firstFocusable ?? box).focus();
    }
    return () => previous?.focus?.();
  }, []);

  return createPortal(
    <div
      style={styles.backdrop}
      onPointerDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={boxRef}
        tabIndex={-1}
        style={{ ...styles.modal, width, outline: 'none' }}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? title}
      >
        <div style={styles.header}>
          <h2 style={styles.title}>{title}</h2>
          <button
            type="button"
            style={styles.close}
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >
            ✕
          </button>
        </div>
        <div
          style={{
            ...styles.body,
            ...(minBodyHeight !== undefined ? { minHeight: minBodyHeight } : {}),
          }}
        >
          {children}
        </div>
        {footer !== undefined && <div style={styles.footer}>{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Consistent modal action button. `variant` styles it primary / secondary /
 * danger. The visual styling + hover live in `.cg-modal-btn*` rules in
 * index.css (a class so `:hover` can paint over the flat resting state); only
 * the per-variant text colour is inline.
 */
export function ModalButton({
  children,
  onClick,
  variant = 'secondary',
  disabled = false,
  autoFocus = false,
}: {
  children: ReactNode;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  autoFocus?: boolean;
}): JSX.Element {
  const color = variant === 'primary' ? '#06121F' : variant === 'danger' ? '#fda4af' : colors.text;
  return (
    <button
      type="button"
      className={`cg-modal-btn cg-modal-btn-${variant}`}
      style={{ color }}
      onClick={onClick}
      disabled={disabled}
      autoFocus={autoFocus}
    >
      {children}
    </button>
  );
}
