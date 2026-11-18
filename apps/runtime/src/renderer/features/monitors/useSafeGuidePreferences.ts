import { useEffect, useSyncExternalStore } from 'react';
import type { BroadcastGuideProfile } from '@cg/ui';
import {
  createRuntimeSafeGuideStore,
  RUNTIME_SAFE_GUIDES_KEY,
  type RuntimeSafeGuidePreferences,
} from './safeGuidePreferences.js';

/** App-local view preferences only; never part of a template, station request or PGM command. */
const store = createRuntimeSafeGuideStore();

export function useSafeGuidePreferences(): {
  profile: BroadcastGuideProfile;
  visible: boolean;
  setProfile: (profile: BroadcastGuideProfile) => void;
  setVisible: (visible: boolean) => void;
  restore: (preferences: RuntimeSafeGuidePreferences) => void;
} {
  const preferences = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => {
    const changed = (event: StorageEvent): void => {
      if (event.key === RUNTIME_SAFE_GUIDES_KEY || event.key === null) store.refresh();
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);
  return {
    ...preferences,
    setProfile: store.setProfile,
    setVisible: store.setVisible,
    restore: store.restore,
  };
}
