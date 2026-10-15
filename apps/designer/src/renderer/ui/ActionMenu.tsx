import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Control } from './Control.js';
import { Icon } from './Icon.js';
import * as s from './ContextMenu.css.js';

export interface ActionMenuItem {
  /** The words on the row (`Delete step`). */
  label: string;
  /** The row's accessible name when the words alone do not name the object (`Delete step "30 min"`). */
  ariaLabel?: string;
  onSelect: () => void;
}

const MENU_WIDTH = 168;
const ITEM_HEIGHT = 26;
const EDGE = 8;

/**
 * `DELTA-RUN-NEXT-VERSION-01-H` — the `⋯` button with a menu OF WORDS: an action that removes
 * something is never a bare icon whose object the reader has to guess. The trigger's accessible name
 * and tooltip name its object (`Actions for step "30 min"`); each row says what it does.
 *
 * Keyboard-complete like the canvas anchor menu (B-058's shared chrome): focus moves to the first row
 * on open, ↑ / ↓ wrap, Enter / Space choose, Esc closes and returns focus to the trigger. The menu
 * lives inside its host's DOM, so a dialog's focus trap keeps it, and the dialog's own Esc stands
 * aside while it is open (`Modal`).
 */
export function ActionMenu({
  label,
  items,
  testId,
}: {
  /** Names the menu's object — the trigger's accessible name and its tooltip. */
  label: string;
  items: readonly ActionMenuItem[];
  testId?: string;
}): JSX.Element {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (at === null) return;
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }, [at]);

  const close = (): void => {
    setAt(null);
    triggerRef.current?.focus();
  };

  const onMenuKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const rows = [
      ...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []),
    ];
    if (rows.length === 0) return;
    const idx = rows.findIndex((b) => b === document.activeElement);
    rows[(idx + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length]?.focus();
  };

  const left =
    at === null
      ? 0
      : Math.max(EDGE, Math.min(at.x - MENU_WIDTH, window.innerWidth - MENU_WIDTH - EDGE));
  const top =
    at === null
      ? 0
      : Math.max(EDGE, Math.min(at.y, window.innerHeight - items.length * ITEM_HEIGHT - 2 * EDGE));

  return (
    <>
      <Control
        ref={triggerRef}
        variant="ghost"
        size="sm"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={at !== null}
        data-testid={testId}
        onClick={() => {
          const r = triggerRef.current?.getBoundingClientRect();
          setAt(r === undefined ? { x: 0, y: 0 } : { x: r.right, y: r.bottom + 2 });
        }}
      >
        <Icon icon={MoreHorizontal} size={14} />
      </Control>
      {at !== null && (
        <div
          className={s.backdrop}
          onPointerDown={() => setAt(null)}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div
            ref={menuRef}
            className={s.menu}
            style={{ minWidth: MENU_WIDTH, left, top }}
            role="menu"
            tabIndex={-1}
            aria-label={label}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={onMenuKeyDown}
          >
            {items.map((item) => (
              <Control
                key={item.label}
                variant="bare"
                className={s.item}
                role="menuitem"
                aria-label={item.ariaLabel ?? item.label}
                onClick={() => {
                  close();
                  item.onSelect();
                }}
              >
                {item.label}
              </Control>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
