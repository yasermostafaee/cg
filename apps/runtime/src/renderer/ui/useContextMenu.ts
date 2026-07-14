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
 */
export function useContextMenu<T>(): {
  menu: { target: T; x: number; y: number } | null;
  open: (e: React.MouseEvent, target: T) => void;
  close: () => void;
} {
  const [menu, setMenu] = useState<{ target: T; x: number; y: number } | null>(null);

  const open = useCallback((e: React.MouseEvent, target: T): void => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ target, x: e.clientX, y: e.clientY });
  }, []);

  const close = useCallback((): void => setMenu(null), []);

  return { menu, open, close };
}
