import { useEffect, useRef } from 'react';
import { Control } from '../../ui/Control.js';
import * as s from './AnchorContextMenu.css.js';

export interface AnchorMenuItem {
  label: string;
  onSelect: () => void;
}

interface Props {
  /** Viewport coordinates of the right-click (the menu clamps into the viewport). */
  x: number;
  y: number;
  /** Menu entries in order — future items (Convert to corner/smooth, …) are one entry each. */
  items: readonly AnchorMenuItem[];
  onClose: () => void;
}

const MENU_WIDTH = 148;
const ITEM_HEIGHT = 28;
const EDGE = 8;

/**
 * D-123 — the path-anchor context menu (first item: Delete point). Minimal by
 * design: the app has no shared menu primitive (the timeline's LayerContextMenu is
 * bespoke and mouse-only), so this follows that component's established pattern —
 * a fixed full-viewport backdrop (outside click closes; native menu suppressed) +
 * a viewport-clamped `role="menu"` box — and adds the keyboard support a menu
 * needs: items are real `Control` buttons (focus/Enter/Space for free), focus
 * moves to the first item on open, ArrowUp/Down cycle with wrap, and Esc closes
 * via a CAPTURE-phase window listener that stops the event so it never falls
 * through to the canvas Esc handling (deselect / pen exit — the B-037 ownership
 * pattern, same mechanism as PathEditor's capture-phase Delete). A wheel/scroll
 * also closes (the menu would otherwise float over a scrolled-away anchor).
 */
export function AnchorContextMenu({ x, y, items, onClose }: Props): JSX.Element {
  const firstItemRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    firstItemRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key !== 'Escape') return;
      // The menu OWNS this Esc: capture phase runs before the canvas overlay's
      // bubble-phase window handler, and the stop keeps the close from ALSO
      // deselecting the path or exiting a tool.
      e.preventDefault();
      e.stopImmediatePropagation();
      onClose();
    }
    function onWheel(): void {
      onClose();
    }
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('wheel', onWheel);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('wheel', onWheel);
    };
  }, [onClose]);

  function onMenuKeyDown(e: React.KeyboardEvent): void {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const buttons = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
    );
    if (buttons.length === 0) return;
    const idx = buttons.findIndex((b) => b === document.activeElement);
    const step = e.key === 'ArrowDown' ? 1 : -1;
    const next = buttons[(idx + step + buttons.length) % buttons.length];
    next?.focus();
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = Math.max(EDGE, Math.min(x, vw - MENU_WIDTH - EDGE));
  const top = Math.max(EDGE, Math.min(y, vh - items.length * ITEM_HEIGHT - 2 * EDGE));

  return (
    <div className={s.backdrop} onPointerDown={onClose} onContextMenu={(e) => e.preventDefault()}>
      <div
        ref={menuRef}
        className={s.menu}
        style={{ minWidth: MENU_WIDTH, left, top }}
        role="menu"
        aria-label="Anchor actions"
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={onMenuKeyDown}
      >
        {items.map((item, i) => (
          <Control
            key={item.label}
            ref={i === 0 ? firstItemRef : undefined}
            variant="bare"
            className={s.item}
            role="menuitem"
            aria-label={item.label}
            onClick={() => {
              item.onSelect();
              onClose();
            }}
          >
            {item.label}
          </Control>
        ))}
      </div>
    </div>
  );
}
