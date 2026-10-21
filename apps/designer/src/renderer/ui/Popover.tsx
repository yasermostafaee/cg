import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import * as s from './Popover.css.js';

/**
 * `RUN-NEXT-VERSION-03` 2.1 — **THE ANCHORED PANEL**, the Designer's primitive for a surface that hangs
 * from a control and is not a dialog: the date and time control's month and time pickers. The Inspector's
 * colour, fill and text-settings popovers each carry their own copy of the same mechanics; this is the
 * one a new caller uses.
 *
 * Portalled to `body` (a scrolling panel would clip it) and marked `data-cg-popover`, so a Modal it is
 * opened from leaves Escape and Tab to it (`Modal.tsx`). Below the control, ABOVE it when there is no
 * room below, clamped inside the window. It closes on a press outside it (the control that opened it
 * toggles it with its own click), on Escape, and when the window resizes; focus goes back to the control.
 */
export interface PopoverProps {
  /** The control the panel hangs from; focus returns to it on close. */
  anchor: RefObject<HTMLElement>;
  onClose: () => void;
  id?: string | undefined;
  'aria-label': string;
  /** Where focus lands inside the panel when it opens (a CSS selector). */
  initialFocusSelector?: string | undefined;
  /** The panel reads right to left (a Hijri month). */
  dir?: 'ltr' | 'rtl' | undefined;
  children: ReactNode;
}

const EDGE = 8;
const GAP = 4;

export function Popover({
  anchor,
  onClose,
  id,
  'aria-label': ariaLabel,
  initialFocusSelector,
  dir,
  children,
}: PopoverProps): JSX.Element {
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Measured, then placed: the panel's own size decides whether it fits below.
  useLayoutEffect(() => {
    const el = panel.current;
    const rect = anchor.current?.getBoundingClientRect();
    if (el === null || rect === undefined) return;
    const h = el.offsetHeight;
    const w = el.offsetWidth;
    const below = rect.bottom + GAP;
    const top = below + h <= window.innerHeight - EDGE ? below : Math.max(EDGE, rect.top - GAP - h);
    const left = Math.max(EDGE, Math.min(rect.left, window.innerWidth - w - EDGE));
    setPos({ top, left });
  }, [anchor]);

  useEffect(() => {
    const field = anchor.current;
    const target =
      initialFocusSelector === undefined
        ? null
        : panel.current?.querySelector<HTMLElement>(initialFocusSelector);
    (target ?? panel.current)?.focus();
    return () => field?.focus();
  }, [anchor, initialFocusSelector]);

  useEffect(() => {
    const onDown = (e: PointerEvent): void => {
      if (e.target instanceof Node && panel.current?.contains(e.target) === true) return;
      // The control that opened it toggles it with its own click.
      if (e.target instanceof Node && anchor.current?.contains(e.target) === true) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onClose);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={panel}
      id={id}
      role="dialog"
      aria-label={ariaLabel}
      tabIndex={-1}
      dir={dir}
      data-cg-popover=""
      className={s.panel}
      style={{
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        visibility: pos === null ? 'hidden' : 'visible',
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
