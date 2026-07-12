import { useEffect, useState } from 'react';
import type { OwnedOccupancyWarning } from '@cg/shared-ipc';

/** B-056 — subscribes to layers.owned-occupancy-changed; emits the current set. */
export function useOwnedOccupancy(): OwnedOccupancyWarning[] {
  const [warnings, setWarnings] = useState<OwnedOccupancyWarning[]>([]);

  useEffect(() => {
    let cancelled = false;
    void window.cg.layers.ownedOccupancy().then((initial) => {
      if (!cancelled) setWarnings(initial);
    });
    const unsubscribe = window.cg.layers.onOwnedOccupancyChanged((next) => {
      setWarnings(next);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return warnings;
}
