import {
  DEFAULT_BROADCAST_GUIDE_PROFILE,
  parseBroadcastGuideProfile,
  type BroadcastGuideProfile,
} from '@cg/ui';

export const RUNTIME_SAFE_GUIDES_KEY = 'cg.runtime.safe-guides.v1';

export interface RuntimeSafeGuidePreferences {
  readonly profile: BroadcastGuideProfile;
  readonly visible: boolean;
}

const DEFAULT_PREFERENCES: RuntimeSafeGuidePreferences = {
  profile: DEFAULT_BROADCAST_GUIDE_PROFILE,
  visible: false,
};

/** Keep the existing v1 guide data shape; older settings simply start hidden. */
export function parseRuntimeSafeGuides(value: unknown): RuntimeSafeGuidePreferences | null {
  const profile = parseBroadcastGuideProfile(value);
  if (profile === null || value === null || typeof value !== 'object') return null;
  const visible = 'visible' in value ? value.visible : false;
  return typeof visible === 'boolean' ? { profile, visible } : null;
}

export function portableRuntimeSafeGuides(preferences: RuntimeSafeGuidePreferences) {
  return { ...preferences.profile, visible: preferences.visible };
}

type GuideStorage = Pick<Storage, 'getItem' | 'setItem'>;

function browserStorage(): GuideStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function createRuntimeSafeGuideStore(storage: () => GuideStorage | null = browserStorage) {
  let snapshot: RuntimeSafeGuidePreferences | undefined;
  const listeners = new Set<() => void>();
  const read = (): RuntimeSafeGuidePreferences => {
    try {
      const raw = storage()?.getItem(RUNTIME_SAFE_GUIDES_KEY);
      if (raw == null || raw.length > 32_768) return DEFAULT_PREFERENCES;
      return parseRuntimeSafeGuides(JSON.parse(raw) as unknown) ?? DEFAULT_PREFERENCES;
    } catch {
      return DEFAULT_PREFERENCES;
    }
  };
  const getSnapshot = (): RuntimeSafeGuidePreferences => (snapshot ??= read());
  const publish = (next: RuntimeSafeGuidePreferences): boolean => {
    if (JSON.stringify(next) === JSON.stringify(getSnapshot())) return false;
    snapshot = next;
    for (const listener of listeners) listener();
    return true;
  };
  const restore = (value: RuntimeSafeGuidePreferences): void => {
    const next = parseRuntimeSafeGuides(portableRuntimeSafeGuides(value));
    if (next === null || !publish(next)) return;
    try {
      storage()?.setItem(RUNTIME_SAFE_GUIDES_KEY, JSON.stringify(portableRuntimeSafeGuides(next)));
    } catch {
      // A denied or full store still leaves both views usable in this session.
    }
  };
  return {
    getSnapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setProfile: (profile: BroadcastGuideProfile) => restore({ profile, visible: true }),
    setVisible: (visible: boolean) => restore({ ...getSnapshot(), visible }),
    restore,
    refresh: () => {
      publish(read());
    },
  };
}
