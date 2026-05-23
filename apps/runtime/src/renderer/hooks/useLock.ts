import { useEffect, useState } from 'react';
import type { LockState } from '@cg/shared-ipc';

/** Subscribes to lock.state-changed; emits the current state. */
export function useLock(): LockState {
  const [state, setState] = useState<LockState>({ engaged: false });

  useEffect(() => {
    let cancelled = false;
    void window.cg.lock.state().then((s) => {
      if (!cancelled) setState(s);
    });
    const unsubscribe = window.cg.lock.onStateChanged((next) => {
      setState(next);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return state;
}
