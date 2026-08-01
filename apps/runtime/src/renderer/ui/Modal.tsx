import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { colors } from '../theme.js';
import { Button, type ButtonVariant } from './Button.js';
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
 *
 * ── EVERY DIALOG'S CHROME COMES FROM HERE ───────────────────────────────────
 *
 * Header, close affordance, scrolling body, MESSAGE REGION and action row — all
 * five, so a dialog supplies a title, its content and its actions and nothing else.
 * Five dialogs had drifted into five designs (three close affordances, two title
 * cases, three action-row layouts) and a primitive four of them use while a fifth
 * hand-rolls is WORSE than no primitive: it reads as consistent while not being
 * consistent, which is exactly how those five arrived.
 *
 * THE ONE TITLE TREATMENT is `styles.title`, and the string a caller passes is
 * rendered verbatim — there is no `text-transform` here on purpose. So the
 * treatment is enforced by the primitive and the CASE is the caller's: dialogs use
 * SENTENCE case, which is what the majority already did. Do not pass a SHOUTING
 * title; `SERVER CONNECTION` and `AUDIT LOG` were the two exceptions and both were
 * brought to the majority rather than a third style being invented for them.
 *
 * WHAT IS DELIBERATELY *NOT* BUILT ON THIS PRIMITIVE, and must not be "finished"
 * later: `LockOverlay`. It is a full-screen LOCK, not a dialog. This primitive
 * gives every dialog a visible ✕, Escape-to-close and backdrop-click-to-close —
 * three ways out — and a lock screen with a way out is not a lock. Its scrim is
 * hand-rolled for that reason and that reason only.
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
  /**
   * §3 — THE MESSAGE REGION, PINNED TO THE ACTION ROW.
   *
   * A refusal explaining why an action did not happen must appear where the
   * operator is LOOKING when he takes the action. `Candidate layers` appended its
   * refusal to the bottom of the scrolling list, so with the list scrolled to the
   * top the operator pressed Apply, nothing happened, and the reason was below the
   * fold — he had to go looking for it. A refusal reported where nobody looks is,
   * in practice, a SILENT refusal, and that one guards an occupied layer.
   *
   * So it lives in the PRIMITIVE, outside `body`, immediately above `footer`. That
   * placement is the whole mechanism: being outside the scroll container is what
   * makes it unmissable, and being in the primitive is what stops a dialog putting
   * it somewhere unseen again.
   *
   * `flexShrink: 0` so a long body can never squeeze it away, and its OWN
   * `overflowY` so a long message cannot push the action row off the bottom
   * instead — the failure this fixes, one element over.
   *
   * It does NOT move the body's scroll position when it appears: the body is a
   * separate scroll container, so its `scrollTop` is untouched by a sibling
   * appearing. The operator is told something without losing his place.
   */
  message: {
    flexShrink: 0,
    maxHeight: '30vh',
    overflowY: 'auto' as const,
    fontSize: '0.85rem',
  },
  footer: {
    display: 'flex',
    gap: '0.5rem',
    justifyContent: 'flex-end',
    alignItems: 'center',
    flexShrink: 0,
  },
} as const;

/**
 * §2 — WHAT A DIALOG'S BUTTON IS FOR, not what colour someone picked for it.
 *
 * Three roles, and the ROLE decides the treatment. The dialogs had been choosing
 * colours per dialog, which is how `SERVER CONNECTION`'s `APPLY` came to wear the
 * solid amber that means *this will interrupt something* while being an ordinary
 * save — and a signal spent on a non-destructive action is a signal drained
 * everywhere it is real.
 *
 * ── WHY `destructive` IS THE SOLID AMBER AND NOT THE RED OUTLINE ───────────
 *
 * Both existed: `caution-strong` is a SOLID amber fill, `danger` is a transparent
 * red OUTLINE that only fills on hover. The solid one is the louder of the two at
 * rest, which is what matters for a button the operator's eye must land on.
 *
 * Picking `danger` would have made `Clear all` quieter — turning a filled button
 * into an outline — which is precisely the "neutralising it in the name of
 * consistency" the owner forbade. Picking the solid amber leaves `Clear all`
 * EXACTLY as it is and makes the `Remove` confirms LOUDER than their old outline.
 * So no safety signal weakens in either direction, which is the tie-breaker.
 *
 * `cancel` is `neutral` and never `ghost`: neutral must not mean INVISIBLE. A
 * ghost has no fill and no border and reads as a line of static text — the picker's
 * Cancel was one, and an operator could not tell it was pressable.
 */
export type ModalActionRole = 'primary' | 'destructive' | 'cancel';

const ROLE_VARIANT: Record<ModalActionRole, ButtonVariant> = {
  primary: 'primary',
  destructive: 'caution-strong',
  cancel: 'neutral',
};

/**
 * The variant for a role, for the few actions that cannot be a plain `Button` —
 * `AsyncButton`, which owns its own busy/success/error rendering. Exported so those
 * callers resolve the treatment from the SAME table rather than re-picking a colour,
 * which is the drift this whole section exists to end.
 */
export function modalActionVariant(role: ModalActionRole): ButtonVariant {
  return ROLE_VARIANT[role];
}

/**
 * One action button in a dialog's action row.
 *
 * `data-modal-role` is emitted so a test can assert that a role resolves to ONE
 * treatment across every dialog — on the role and the class, never on a hex value,
 * for the same reason `data-row-state` exists on the layer row.
 */
export function ModalAction({
  /*
    NAMED `actionRole` AND NOT `role`, deliberately. `role` is the ARIA attribute:
    a prop of that name on a component that spreads the rest of its props onto a
    real `<button>` is one refactor away from emitting `role="cancel"` — an invalid,
    non-abstract ARIA role — and the a11y lint flags every call site meanwhile.
    The concept is still THE ROLE; only the prop name gets out of ARIA's way.
  */
  actionRole,
  children,
  ...rest
}: {
  actionRole: ModalActionRole;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>): JSX.Element {
  return (
    <Button variant={ROLE_VARIANT[actionRole]} data-modal-role={actionRole} {...rest}>
      {children}
    </Button>
  );
}

interface ModalProps {
  /**
   * SENTENCE case, not shouting — see the module note. The primitive supplies the
   * one treatment; the string supplies the words.
   */
  title: string;
  /**
   * The action buttons, built from {@link ModalAction} so the role decides the
   * treatment. CANCEL first in DOM order — the row is right-aligned, so first in
   * DOM is LEFTMOST and the primary/destructive action lands in the same corner of
   * every dialog. It is also the safe default for focus and for Tab order.
   */
  footer: ReactNode;
  /**
   * §3 — WHY THE LAST ACTION DID NOT HAPPEN, pinned beside the action row.
   *
   * Never rendered into `children`: that is the scrolling body, and a refusal the
   * operator has to scroll to find is a silent one. See `styles.message`.
   */
  message?: ReactNode;
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
  message,
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
        {children !== undefined && (
          <div style={styles.body} className="cg-modal-body" data-modal-body="">
            {children}
          </div>
        )}
        {/*
          §3 — OUTSIDE `body`, ABOVE `footer`. The order of these two elements IS
          the fix: a message rendered into `children` above would scroll away with
          the content, which is the defect. `role="alert"` because it is always the
          consequence of something the operator just did.
        */}
        {message !== undefined && message !== null && message !== false && (
          <div
            style={styles.message}
            className="cg-modal-message"
            data-modal-message=""
            role="alert"
          >
            {message}
          </div>
        )}
        <div style={styles.footer} className="cg-modal-footer">
          {footer}
        </div>
      </div>
    </div>,
    document.body,
  );
}
