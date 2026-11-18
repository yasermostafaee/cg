export const BROADCAST_GUIDE_ASPECTS = ['auto', '16:9', '4:3', 'custom'] as const;
export type BroadcastGuideAspect = (typeof BROADCAST_GUIDE_ASPECTS)[number];
export const MAX_BROADCAST_GUIDE_LINES = 64;
export const DEFAULT_BROADCAST_GUIDE_COLOR = '#ffffff';
export const MAX_BROADCAST_GUIDE_ASPECT_PART = 16_384;

export interface BroadcastGuideCustomAspect {
  readonly width: number;
  readonly height: number;
}

export const DEFAULT_BROADCAST_GUIDE_CUSTOM_ASPECT: BroadcastGuideCustomAspect = {
  width: 3,
  height: 4,
};

/** Ratio parts are bounded positive integers, never dimensions of the authored picture. */
export function normalizeBroadcastGuideCustomAspect(
  value: unknown,
): BroadcastGuideCustomAspect | null {
  if (value === null || typeof value !== 'object') return null;
  const ratio = value as Record<string, unknown>;
  const width = ratio['width'];
  const height = ratio['height'];
  const valid = (part: unknown): part is number =>
    typeof part === 'number' &&
    Number.isInteger(part) &&
    part >= 1 &&
    part <= MAX_BROADCAST_GUIDE_ASPECT_PART;
  return valid(width) && valid(height) ? { width, height } : null;
}

export interface BroadcastGuideLine {
  readonly id: string;
  readonly name: string;
  /** x = vertical line positioned across the frame; y = horizontal line down the frame. */
  readonly axis: 'x' | 'y';
  readonly position: number;
  readonly visible: boolean;
  /** Absent means inherit the profile's common line colour. */
  readonly color?: string;
}

export interface BroadcastGuideProfile {
  readonly version: 1;
  readonly aspect: BroadcastGuideAspect;
  /** Optional in older v1 preferences; retained while a preset ratio is selected. */
  readonly customAspect?: BroadcastGuideCustomAspect;
  readonly standardVisible: boolean;
  readonly color: string;
  readonly lines: readonly BroadcastGuideLine[];
}

export const DEFAULT_BROADCAST_GUIDE_PROFILE: BroadcastGuideProfile = {
  version: 1,
  aspect: 'auto',
  standardVisible: true,
  color: DEFAULT_BROADCAST_GUIDE_COLOR,
  lines: [],
};

/** Preferences contain only bounded display data. Invalid/future versions are not interpreted. */
export function parseBroadcastGuideProfile(value: unknown): BroadcastGuideProfile | null {
  if (value === null || typeof value !== 'object') return null;
  const profile = value as Record<string, unknown>;
  const customAspect = normalizeBroadcastGuideCustomAspect(profile['customAspect']);
  const color =
    profile['color'] === undefined
      ? DEFAULT_BROADCAST_GUIDE_COLOR
      : normalizeBroadcastGuideColor(profile['color']);
  if (
    profile['version'] !== 1 ||
    !BROADCAST_GUIDE_ASPECTS.some((aspect) => aspect === profile['aspect']) ||
    typeof profile['standardVisible'] !== 'boolean' ||
    color === null ||
    !Array.isArray(profile['lines']) ||
    profile['lines'].length > MAX_BROADCAST_GUIDE_LINES
  )
    return null;
  const lines: BroadcastGuideLine[] = [];
  const ids = new Set<string>();
  for (const value of profile['lines'] as unknown[]) {
    if (value === null || typeof value !== 'object') return null;
    const line = value as Record<string, unknown>;
    const lineColor =
      line['color'] === undefined ? undefined : normalizeBroadcastGuideColor(line['color']);
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
      typeof line['visible'] !== 'boolean' ||
      lineColor === null
    )
      return null;
    ids.add(line['id']);
    lines.push({
      id: line['id'],
      name: line['name'],
      axis: line['axis'],
      position: line['position'],
      visible: line['visible'],
      ...(lineColor === undefined ? {} : { color: lineColor }),
    });
  }
  return {
    version: 1,
    // Invalid custom metadata must not discard otherwise valid named/coloured guides.
    aspect:
      profile['aspect'] === 'custom' && customAspect === null
        ? 'auto'
        : (profile['aspect'] as BroadcastGuideAspect),
    ...(customAspect === null ? {} : { customAspect }),
    standardVisible: profile['standardVisible'],
    color,
    lines,
  };
}

/** Opaque sRGB line colours only; never arbitrary CSS or alpha-bearing values. */
export function normalizeBroadcastGuideColor(value: unknown): string | null {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null;
}

export function broadcastGuideColor(
  profile: BroadcastGuideProfile,
  line?: BroadcastGuideLine,
): string {
  return line?.color ?? profile.color ?? DEFAULT_BROADCAST_GUIDE_COLOR;
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
