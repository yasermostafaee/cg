import { useCallback, useState } from 'react';

/**
 * D-067 — tracks in-flight asset imports so a panel can show a loading
 * indicator. `track(promise)` increments the pending count immediately and
 * decrements it when the promise settles — resolve OR reject — so the indicator
 * always clears (no stuck spinner on cancel/error). The import logic is unchanged;
 * this only surfaces pending state. The count supports concurrent imports.
 */
export function useImportPending(): {
  pending: number;
  track: <T>(promise: Promise<T>) => Promise<T>;
} {
  const [pending, setPending] = useState(0);
  const track = useCallback(<T>(promise: Promise<T>): Promise<T> => {
    setPending((n) => n + 1);
    return promise.finally(() => setPending((n) => n - 1));
  }, []);
  return { pending, track };
}
