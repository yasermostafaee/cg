import { useEffect, useState } from 'react';
import type { OrphanLayer } from '@cg/shared-ipc';

/** R-009 — subscribes to layers.orphans-changed; emits the current orphan set. */
export function useOrphans(): OrphanLayer[] {
  const [orphans, setOrphans] = useState<OrphanLayer[]>([]);

  useEffect(() => {
    let cancelled = false;
    void window.cg.layers.orphans().then((initial) => {
      if (!cancelled) setOrphans(initial);
    });
    const unsubscribe = window.cg.layers.onOrphansChanged((next) => {
      setOrphans(next);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return orphans;
}
