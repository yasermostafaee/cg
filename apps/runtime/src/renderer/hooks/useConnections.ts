import { useEffect, useState } from 'react';
import type { ConnectionHealth } from '@cg/shared-ipc';

/** Subscribes to connections.health-changed; emits the latest snapshot. */
export function useConnections(): ConnectionHealth | null {
  const [health, setHealth] = useState<ConnectionHealth | null>(null);

  useEffect(() => {
    let cancelled = false;
    void window.cg.connections.health().then((h) => {
      if (!cancelled) setHealth(h);
    });
    const unsubscribe = window.cg.connections.onHealthChanged((next) => {
      setHealth(next);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return health;
}
