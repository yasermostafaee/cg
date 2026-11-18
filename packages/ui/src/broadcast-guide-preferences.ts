export const BROADCAST_GUIDE_ASPECTS = ['auto', '16:9', '4:3'] as const;
export type BroadcastGuideAspect = (typeof BROADCAST_GUIDE_ASPECTS)[number];
export const MAX_BROADCAST_GUIDE_LINES = 64;

export interface BroadcastGuideLine {
  readonly id: string;
  readonly name: string;
  /** x = vertical line positioned across the frame; y = horizontal line down the frame. */
  readonly axis: 'x' | 'y';
  readonly position: number;
  readonly visible: boolean;
}

export interface BroadcastGuideProfile {
  readonly version: 1;
  readonly aspect: BroadcastGuideAspect;
  readonly standardVisible: boolean;
  readonly lines: readonly BroadcastGuideLine[];
}

export const DEFAULT_BROADCAST_GUIDE_PROFILE: BroadcastGuideProfile = {
  version: 1,
  aspect: 'auto',
  standardVisible: true,
  lines: [],
};

/** Preferences contain only bounded display data. Invalid/future versions are not interpreted. */
export function parseBroadcastGuideProfile(value: unknown): BroadcastGuideProfile | null {
  if (value === null || typeof value !== 'object') return null;
  const profile = value as Record<string, unknown>;
  if (
    profile['version'] !== 1 ||
    !BROADCAST_GUIDE_ASPECTS.some((aspect) => aspect === profile['aspect']) ||
    typeof profile['standardVisible'] !== 'boolean' ||
    !Array.isArray(profile['lines']) ||
    profile['lines'].length > MAX_BROADCAST_GUIDE_LINES
  )
    return null;
  const lines: BroadcastGuideLine[] = [];
  const ids = new Set<string>();
  for (const value of profile['lines'] as unknown[]) {
    if (value === null || typeof value !== 'object') return null;
    const line = value as Record<string, unknown>;
    if (
      typeof line['id'] !== 'string' ||
      line['id'].length === 0 ||
      line['id'].length > 80 ||
      ids.has(line['id']) ||
      typeof line['name'] !== 'string' ||
      line['name'].length > 80 ||
      (line['axis'] !== 'x' && line['axis'] !== 'y') ||
      typeof line['position'] !== 'number' ||
      !Number.isFinite(line['position']) ||
      line['position'] < 0 ||
      line['position'] > 100 ||
      typeof line['visible'] !== 'boolean'
    )
      return null;
    ids.add(line['id']);
    lines.push({
      id: line['id'],
      name: line['name'],
      axis: line['axis'],
      position: line['position'],
      visible: line['visible'],
    });
  }
  return {
    version: 1,
    aspect: profile['aspect'] as BroadcastGuideAspect,
    standardVisible: profile['standardVisible'],
    lines,
  };
}

type GuideStorage = Pick<Storage, 'getItem' | 'setItem'>;

function browserGuideStorage(): GuideStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** App-local settings survive project switches; storage failure leaves the session usable. */
export function createBroadcastGuideStore(
  key: string,
  storage: () => GuideStorage | null = browserGuideStorage,
): {
  getSnapshot(): BroadcastGuideProfile;
  subscribe(listener: () => void): () => void;
  set(profile: BroadcastGuideProfile): void;
  refresh(): void;
} {
  let snapshot: BroadcastGuideProfile | undefined;
  const listeners = new Set<() => void>();
  const read = (): BroadcastGuideProfile => {
    try {
      const raw = storage()?.getItem(key);
      if (raw == null || raw.length > 32_768) return DEFAULT_BROADCAST_GUIDE_PROFILE;
      return (
        parseBroadcastGuideProfile(JSON.parse(raw) as unknown) ?? DEFAULT_BROADCAST_GUIDE_PROFILE
      );
    } catch {
      return DEFAULT_BROADCAST_GUIDE_PROFILE;
    }
  };
  const getSnapshot = (): BroadcastGuideProfile => (snapshot ??= read());
  const publish = (next: BroadcastGuideProfile): void => {
    if (JSON.stringify(next) === JSON.stringify(getSnapshot())) return;
    snapshot = next;
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set: (value) => {
      const profile = parseBroadcastGuideProfile(value);
      if (profile === null) return;
      const changed = JSON.stringify(profile) !== JSON.stringify(getSnapshot());
      publish(profile);
      if (changed) {
        try {
          storage()?.setItem(key, JSON.stringify(profile));
        } catch {
          /* A denied/quota-limited store does not stop local guide editing. */
        }
      }
    },
    refresh: () => publish(read()),
  };
}
