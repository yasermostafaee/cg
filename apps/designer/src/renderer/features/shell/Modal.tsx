import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from '../../ui/Button.js';
import { Control } from '../../ui/Control.js';
import { Icon } from '../../ui/Icon.js';
import * as s from './Modal.css.js';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Shared modal shell so every dialog looks and behaves the same: a dimmed
 * backdrop, a centered card with a title + close (✕) icon header, an optional
 * scrolling body, and an optional right-aligned footer for action buttons
 * (built with {@link ModalButton}). Closes on Escape, backdrop click, and the
 * ✕ icon. Rendered through a portal so it escapes any stacking context.
 */

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
      className={s.backdrop}
      onPointerDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={boxRef}
        tabIndex={-1}
        className={s.modal}
        style={{ width, outline: 'none' }}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? title}
      >
        <div className={s.header}>
          <h2 className={s.title}>{title}</h2>
          <Control
            variant="ghost"
            className={s.close}
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >
            <Icon icon={X} size={16} />
          </Control>
        </div>
        <div
          className={s.body}
          style={minBodyHeight !== undefined ? { minHeight: minBodyHeight } : undefined}
        >
          {children}
        </div>
        {footer !== undefined && <div className={s.footer}>{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Consistent modal action button — a thin wrapper over the shared design-system
 * {@link Button} so dialog actions share the same hover / active / focus-visible /
 * disabled states as the rest of the app. `variant` maps straight through
 * (primary / secondary / danger).
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
  return (
    <Button variant={variant} onClick={onClick} disabled={disabled} autoFocus={autoFocus}>
      {children}
    </Button>
  );
}
