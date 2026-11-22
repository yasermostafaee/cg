import { useEffect, useSyncExternalStore } from 'react';
import { DEFAULT_BROADCAST_GUIDE_PROFILE, type BroadcastGuideProfile } from '@cg/ui';
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
  resetProfile: () => void;
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
    resetProfile: () =>
      store.restore({ ...store.getSnapshot(), profile: DEFAULT_BROADCAST_GUIDE_PROFILE }),
    setVisible: store.setVisible,
    restore: store.restore,
  };
}
