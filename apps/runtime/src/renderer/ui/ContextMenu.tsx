import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { colors } from '../theme.js';

/**
 * The Runtime's right-click menu.
 *
 * The browser's own context menu is suppressed app-wide (see `App.tsx`): in a playout console
 * its entries — Back, Reload, View Source, Save As — are at best noise and at worst a way to
 * navigate away from a live show by accident. Right-click therefore does NOTHING except where
 * the app puts a menu of its own.
 *
 * A menu here is a SHORTCUT, never a new capability: every item mirrors a control that is
 * already on the surface, and carries that control's `disabled` state with it. That is
 * load-bearing — a stack row's PLAY/UPDATE/CLEAR are refused while the bridge link is down
 * (R-006), and a menu that let the operator issue them anyway would be a second, unguarded
 * door onto air. The menu re-uses the buttons' own gates rather than re-deriving them.
 *
 * Rendered into a portalled full-viewport backdrop, so a click or Escape anywhere outside
 * closes it; the menu clamps itself inside the viewport.
 */

export interface ContextMenuItem {
  label: string;
  onSelect: () => void;
  /** Mirrors the source button's variant, so the menu is colored like the thing it triggers. */
  variant?: 'default' | 'caution' | 'danger';
  /** Mirrors the source button's `disabled`. A disabled item is inert and not focusable. */
  disabled?: boolean;
  /** Why it is disabled, or what it does — the source button's tooltip. */
  title?: string;
}

interface Props {
  items: readonly ContextMenuItem[];
  /** Viewport coordinates of the right-click. */
  x: number;
  y: number;
  ariaLabel: string;
  onClose: () => void;
}

const MENU_WIDTH = 208;
const ITEM_HEIGHT = 30;
const PADDING = 8;
const EDGE = 8;

const styles = {
  backdrop: { position: 'fixed' as const, inset: 0, zIndex: 900 },
  menu: {
    position: 'fixed' as const,
    minWidth: MENU_WIDTH,
    background: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.3rem',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.45)',
    padding: `${String(PADDING / 2)}px 0`,
    color: colors.text,
    fontSize: '0.85rem',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    height: ITEM_HEIGHT,
    padding: '0 0.75rem',
    cursor: 'pointer',
    userSelect: 'none' as const,
    outline: 'none',
  },
  itemDisabled: { opacity: 0.45, cursor: 'not-allowed' },
  hover: { background: 'rgba(56, 189, 248, 0.16)' },
} as const;

function variantColor(variant: ContextMenuItem['variant']): string | undefined {
  switch (variant) {
    case 'danger':
      return colors.error;
    case 'caution':
      return colors.pending;
    default:
      return undefined;
  }
}

export function ContextMenu({ items, x, y, ariaLabel, onClose }: Props): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);

  // The indices an operator can actually land on. A disabled item is skipped by the arrow
  // keys rather than focused-and-inert.
  const enabled = items.flatMap((item, i) => (item.disabled === true ? [] : [i]));

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        // The menu is the top-most surface: Escape belongs to it, not to whatever is under it.
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      if (enabled.length === 0) return;
      e.preventDefault();

      const current = active === null ? -1 : enabled.indexOf(active);
      const step = e.key === 'ArrowDown' ? 1 : -1;
      const next = enabled[(current + step + enabled.length) % enabled.length];
      if (next !== undefined) setActive(next);
    }

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [onClose, active, enabled]);

  // Keep the arrow-key selection actually focused, so Enter/Space land on it.
  useEffect(() => {
    if (active === null) return;
    ref.current?.querySelector<HTMLElement>(`[data-index="${String(active)}"]`)?.focus();
  }, [active]);

  function run(item: ContextMenuItem): void {
    if (item.disabled === true) return;
    // Close FIRST: the action may unmount the very row this menu hangs off (Remove), and a
    // menu outliving its subject is a menu pointing at nothing.
    onClose();
    item.onSelect();
  }

  // Clamp inside the viewport — a menu opened near the bottom-right edge must not spill off.
  const height = items.length * ITEM_HEIGHT + PADDING;
  const left = Math.max(EDGE, Math.min(x, window.innerWidth - MENU_WIDTH - EDGE));
  const top = Math.max(EDGE, Math.min(y, window.innerHeight - height - EDGE));

  return createPortal(
    <div
      style={styles.backdrop}
      role="presentation"
      onPointerDown={onClose}
      // Right-clicking outside closes this menu; it does not open the browser's.
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        ref={ref}
        role="menu"
        aria-label={ariaLabel}
        // Programmatically focusable, never a Tab stop: the arrow keys move focus onto the
        // items themselves, which is where Enter has to land.
        tabIndex={-1}
        style={{ ...styles.menu, left, top }}
        onPointerDown={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        {items.map((item, i) => {
          const disabled = item.disabled === true;
          const color = variantColor(item.variant);
          return (
            <div
              key={item.label}
              data-index={i}
              role="menuitem"
              tabIndex={disabled ? -1 : 0}
              aria-disabled={disabled}
              {...(item.title !== undefined ? { title: item.title } : {})}
              style={{
                ...styles.item,
                ...(disabled ? styles.itemDisabled : {}),
                ...(active === i && !disabled ? styles.hover : {}),
                ...(color !== undefined ? { color } : {}),
              }}
              onMouseEnter={() => !disabled && setActive(i)}
              onMouseLeave={() => setActive(null)}
              onClick={() => run(item)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  run(item);
                }
              }}
            >
              {item.label}
            </div>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
