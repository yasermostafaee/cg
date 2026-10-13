import { useCallback, useState } from 'react';

/**
 * Open/close state for a `ContextMenu`, so a surface that wants one only has to say WHERE it
 * was opened and WHAT it was opened ON — not re-hand-roll the position bookkeeping.
 *
 * `open` calls `preventDefault` itself. That is what stops the browser's own menu from
 * appearing over ours; the app-wide suppressor in `App.tsx` handles everywhere else.
 * `stopPropagation` keeps a right-click on a child surface from ALSO opening an ancestor's
 * menu, so the innermost surface wins — the one the operator actually pointed at.
 *
 * `T` is the thing the menu acts on (a template, a stack item). It is captured at open time
 * rather than read from a selection, so the menu always acts on the row that was right-clicked
 * — right-click does not move the selection, and never silently retargets the Inspector.
 *
 * ── `RUNTIME-REDESIGN-01` PHASE 6 — THE KEYBOARD REACHES THE SAME MENU ─────────────
 *
 * `openAt` is the keyboard's door: the `ContextMenu` key and `Shift+F10` (the two the reference
 * wires, and the two every desktop OS reserves for exactly this) open the menu anchored on the
 * focused element's box rather than on a pointer. `isContextMenuKey` is the ONE predicate for
 * that pair, so a surface cannot honour one of the two keys and forget the other. Matched on
 * `e.key`, not `e.code`: `F10` and `ContextMenu` are layout-stable names, not printable
 * characters, so the physical-key rule (`CLAUDE.md`) does not apply and there is no `code` for
 * the menu key on every keyboard.
 */
export function isContextMenuKey(e: { key: string; shiftKey: boolean }): boolean {
  return e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10');
}

export function useContextMenu<T>(): {
  menu: { target: T; x: number; y: number } | null;
  open: (e: React.MouseEvent, target: T) => void;
  /** The keyboard's `open`: anchor the menu on `anchor`'s box and stop the key going further. */
  openAt: (e: React.KeyboardEvent, anchor: Element, target: T) => void;
  close: () => void;
} {
  const [menu, setMenu] = useState<{ target: T; x: number; y: number } | null>(null);

  const open = useCallback((e: React.MouseEvent, target: T): void => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ target, x: e.clientX, y: e.clientY });
  }, []);

  const openAt = useCallback((e: React.KeyboardEvent, anchor: Element, target: T): void => {
    e.preventDefault();
    e.stopPropagation();
    // A hand's width in from the anchor's top-left, where a pointer-opened menu would sit for a
    // right-click on the row's name — so the two doors put the menu in the same place.
    const rect = anchor.getBoundingClientRect();
    setMenu({ target, x: rect.left + Math.min(24, rect.width / 2), y: rect.top + rect.height / 2 });
  }, []);

  const close = useCallback((): void => setMenu(null), []);

  return { menu, open, openAt, close };
}
