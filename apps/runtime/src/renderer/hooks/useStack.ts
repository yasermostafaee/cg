import { useEffect, useState } from 'react';
import type { StackItemState } from '@cg/shared-schema';

/**
 * Snapshot the stack on mount and re-render on every push from Main.
 *
 * `window.cg.stack.onStateChanged` returns an unsubscribe handle that's
 * tied to the React effect's cleanup. The first frame is filled from
 * `stack.snapshot()` so the UI never starts empty.
 */
export function useStack(): readonly StackItemState[] {
  const [items, setItems] = useState<readonly StackItemState[]>([]);

  useEffect(() => {
    let cancelled = false;
    void window.cg.stack.snapshot().then((snap) => {
      if (!cancelled) setItems(snap);
    });
    const unsubscribe = window.cg.stack.onStateChanged((next) => {
      setItems(next);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return items;
}
