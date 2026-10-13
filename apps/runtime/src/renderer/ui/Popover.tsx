import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from './focusTrap.js';

/**
 * 🔴 `PLAYOUT-SOURCES-01` §2.A — **THE ANCHORED PANEL: a surface that hangs from a field and is not
 * a modal.** The console had none (§0.6 found no popover), so this is the ONE, in `renderer/ui/`,
 * and no feature carries a local copy.
 *
 * ── WHY IT IS NOT A MODAL ───────────────────────────────────────────────────────────────
 *
 * Two of its three first callers are dialogs already (`TemplateDefaultsDialog`, the swap dialog):
 * a modal over a modal is a second scrim, a second title and a second place the operator's eye
 * has to travel to. An anchored panel keeps the choice at the field it belongs to.
 *
 * ── WHY IT IS ON THE TRAP STACK ANYWAY ──────────────────────────────────────────────────
 *
 * It is portalled to `body` (a dialog's body scrolls and would clip it), so it is NOT inside the
 * dialog beneath it — the same position a sub-dialog is in (`focusTrap.ts`, `STATION-CHROME-01`
 * §6). It therefore ARMS A LAYER: while it is open the keyboard is its own — Tab stays inside it,
 * and Escape closes IT, not the dialog under it — and when it closes, focus goes back to the field
 * that opened it. One notion of "which surface owns the keyboard", not a second one here.
 *
 * ⚠ A React portal bubbles SYNTHETIC events through the React tree, not the DOM tree: a click in
 * here would reach the dialog's scrim handler and close the dialog, and a key would reach whatever
 * the field sits in (a layer row opens its menu on Shift+F10). The backdrop — the panel's parent —
 * stops the click, the key and the right-press, so nothing the operator does in here is also done
 * to the surface beneath.
 *
 * ── WHERE IT GOES ───────────────────────────────────────────────────────────────────────
 *
 * Below the field, at least `minWidth` wide and at most `maxHeight` tall; ABOVE it when there is
 * no room below; clamped inside the viewport. It closes on a press outside, on Escape, and when
 * the page under it scrolls or resizes (a panel chasing a field that moved is a panel pointing
 * at the wrong thing — `ContextMenu`'s reasoning) — but never for a scroll INSIDE itself.
 */

const EDGE = 8;
const GAP = 4;

export interface PopoverProps {
  /** The field the panel hangs from. Focus returns to it on close. */
  anchor: RefObject<HTMLElement>;
  onClose: () => void;
  /** `id` of the panel, for the field's `aria-controls`. */
  id: string;
  'aria-label': string;
  /** At least this wide (px), or the field's width when that is wider. */
  minWidth: number;
  /** At most this tall (px), or less when the viewport has less room. */
  maxHeight: number;
  /** Where focus lands inside the panel when it opens (a CSS selector). */
  initialFocusSelector?: string | undefined;
  children: ReactNode;
}

interface Placement {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  above: boolean;
}

export function Popover({
  anchor,
  onClose,
  id,
  'aria-label': ariaLabel,
  minWidth,
  maxHeight,
  initialFocusSelector,
  children,
}: PopoverProps): JSX.Element {
  const panel = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const layer = useFocusTrap(panel, true, {
    // Focus goes back to the FIELD, not to whatever held it when the panel opened: a pointer press
    // does not focus a button everywhere (Safari), and the field is where the operator came from.
    restoreFocus: false,
    ...(initialFocusSelector !== undefined ? { initialFocusSelector } : {}),
  });
  useEffect(() => {
    const field = anchor.current;
    return () => {
      field?.focus();
    };
  }, [anchor]);

  // Measured, then placed: the panel's own height decides whether it fits below.
  useLayoutEffect(() => {
    const field = anchor.current;
    const el = panel.current;
    if (field === null || el === null) return;
    const rect = field.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(Math.max(rect.width, minWidth), Math.max(vw - EDGE * 2, 0));
    const left = Math.max(EDGE, Math.min(rect.left, vw - width - EDGE));
    const roomBelow = vh - rect.bottom - GAP - EDGE;
    const roomAbove = rect.top - GAP - EDGE;
    const wanted = Math.min(el.scrollHeight, maxHeight);
    const above = roomBelow < wanted && roomAbove > roomBelow;
    const room = Math.max(above ? roomAbove : roomBelow, 0);
    const height = Math.min(maxHeight, room);
    setPlacement({
      left,
      width,
      maxHeight: height,
      above,
      top: above ? Math.max(EDGE, rect.top - GAP - Math.min(wanted, height)) : rect.bottom + GAP,
    });
    // Placed once per open: a re-measure on every render would move the panel under the pointer.
  }, [anchor, minWidth, maxHeight]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || !layer.isTop()) return;
      e.stopPropagation();
      e.preventDefault();
      onClose();
    };
    const onScroll = (e: Event): void => {
      if (e.target instanceof Node && panel.current?.contains(e.target) === true) return;
      onClose();
    };
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose, layer]);

  return createPortal(
    <div
      className="cg-popover-backdrop"
      role="presentation"
      data-popover-backdrop=""
      onPointerDown={onClose}
      // Nothing done up here is also done to the surface beneath (see the header).
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        // A right-press OUTSIDE has already closed the panel on its pointerdown; one inside it
        // (a right-click in the search field) must not close it, and opens no menu.
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div
        ref={panel}
        id={id}
        role="dialog"
        aria-label={ariaLabel}
        className="cg-popover"
        data-popover=""
        data-popover-side={placement?.above === true ? 'above' : 'below'}
        style={{
          left: placement?.left ?? 0,
          top: placement?.top ?? 0,
          width: placement?.width ?? minWidth,
          maxHeight: placement?.maxHeight ?? maxHeight,
          // Hidden for the measuring pass, so it never flashes at the corner.
          visibility: placement === null ? 'hidden' : 'visible',
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
