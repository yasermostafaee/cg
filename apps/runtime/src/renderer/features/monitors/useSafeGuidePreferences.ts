import { useEffect, useSyncExternalStore } from 'react';
import { createBroadcastGuideStore, type BroadcastGuideProfile } from '@cg/ui';

/** App-local view preferences only; never part of a template, station request or PGM command. */
const KEY = 'cg.runtime.safe-guides.v1';
const store = createBroadcastGuideStore(KEY);

export function useSafeGuidePreferences(): {
  profile: BroadcastGuideProfile;
  setProfile: (profile: BroadcastGuideProfile) => void;
} {
  const profile = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => {
    const changed = (event: StorageEvent): void => {
      if (event.key === KEY || event.key === null) store.refresh();
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);
  return { profile, setProfile: store.set };
}
