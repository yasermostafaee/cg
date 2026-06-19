import { useCallback, useState } from 'react';

/**
 * D-067 — tracks in-flight asset imports so a panel can show a loading
 * indicator. `begin()` marks one import as started (incrementing the pending
 * count) and returns an idempotent `end()` to clear it. Callers start it only
 * once a file is actually selected (the bridge's `onPicked`), and call `end()`
 * in a `finally` so it clears on success AND error — and never shows at all when
 * the file picker is cancelled (`begin` is never called). The count supports
 * concurrent imports.
 */
export function useImportPending(): { pending: number; begin: () => () => void } {
  const [pending, setPending] = useState(0);
  const begin = useCallback((): (() => void) => {
    setPending((n) => n + 1);
    let ended = false;
    return () => {
      if (ended) return;
      ended = true;
      setPending((n) => n - 1);
    };
  }, []);
  return { pending, begin };
}
