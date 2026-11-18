import { expect, it, vi } from 'vitest';
import {
  broadcastCustomGuideLines,
  broadcastGuideFrame,
  broadcastSafeAreas,
  createBroadcastGuideStore,
  DEFAULT_BROADCAST_GUIDE_PROFILE,
  DEFAULT_BROADCAST_GUIDE_COLOR,
  broadcastGuideColor,
  normalizeBroadcastGuideColor,
  parseBroadcastGuideProfile,
  type BroadcastGuideProfile,
} from '../src/index.js';

const profile: BroadcastGuideProfile = {
  version: 1,
  aspect: '4:3',
  standardVisible: false,
  color: DEFAULT_BROADCAST_GUIDE_COLOR,
  lines: [
    { id: 'h', name: 'زیرنویس', axis: 'y', position: 75, visible: true },
    { id: 'v', name: 'Logo', axis: 'x', position: 25, visible: true },
    { id: 'hidden', name: '', axis: 'y', position: 50, visible: false },
  ],
};

it('upgrades older v1 preferences to white without changing their reference or named H/V set', () => {
  const { color: _oldMissingColor, ...old } = profile;
  expect(parseBroadcastGuideProfile(old)).toEqual(profile);
  expect(old.lines).toEqual(profile.lines);
  expect(broadcastGuideColor(DEFAULT_BROADCAST_GUIDE_PROFILE)).toBe('#ffffff');
});

it('normalizes saved colours and preserves per-line overrides and inheritance independently', () => {
  const saved = parseBroadcastGuideProfile({
    ...profile,
    color: '#AABBCC',
    lines: [{ ...profile.lines[0], color: '#12EF34' }, profile.lines[1]],
  });
  expect(saved?.color).toBe('#aabbcc');
  expect(saved?.lines[0]?.color).toBe('#12ef34');
  expect(saved?.lines[1]).not.toHaveProperty('color');
  if (saved === null) throw new Error('Expected validated profile');
  expect(broadcastGuideColor(saved, saved.lines[0])).toBe('#12ef34');
  expect(broadcastGuideColor(saved, saved.lines[1])).toBe('#aabbcc');
});

it.each(['#fff', '#12345678', 'rgb(255,255,255)', 'url(javascript:bad)', 'red', '', null, 123])(
  'rejects invalid present guide colour %s',
  (color) => {
    expect(normalizeBroadcastGuideColor(color)).toBeNull();
    expect(parseBroadcastGuideProfile({ ...profile, color })).toBeNull();
    expect(
      parseBroadcastGuideProfile({ ...profile, lines: [{ ...profile.lines[0], color }] }),
    ).toBeNull();
  },
);

it('contains the landscape reference in either landscape or portrait active pictures', () => {
  expect(broadcastGuideFrame(1920, 1080, '4:3')).toEqual({
    x: 240,
    y: 0,
    width: 1440,
    height: 1080,
  });
  expect(broadcastGuideFrame(1080, 1920, '16:9')).toEqual({
    x: 0,
    y: 656.25,
    width: 1080,
    height: 607.5,
  });
  expect(broadcastGuideFrame(1920, 1080, 'auto')).toEqual({
    x: 0,
    y: 0,
    width: 1920,
    height: 1080,
  });
  expect(broadcastSafeAreas(1920, 1080, '4:3')[1]).toMatchObject({
    x: 312,
    y: 54,
    width: 1296,
    height: 972,
  });
});

it('positions H/V guides as percentages inside the chosen reference and omits hidden lines', () => {
  expect(broadcastCustomGuideLines(1920, 1080, profile)).toEqual([
    { ...profile.lines[0], x1: 240, y1: 810, x2: 1680, y2: 810 },
    { ...profile.lines[1], x1: 600, y1: 0, x2: 600, y2: 1080 },
  ]);
});

it.each([
  { ...profile, version: 2 },
  { ...profile, aspect: '3:4' },
  { ...profile, lines: [{ ...profile.lines[0], position: -1 }] },
  { ...profile, lines: [{ ...profile.lines[0], position: 101 }] },
  { ...profile, lines: [{ ...profile.lines[0], position: NaN }] },
  { ...profile, lines: [{ ...profile.lines[0], position: Infinity }] },
  { ...profile, lines: [profile.lines[0], profile.lines[0]] },
  {
    ...profile,
    lines: Array.from({ length: 65 }, (_, index) => ({ ...profile.lines[0], id: String(index) })),
  },
])('rejects invalid/future saved guide data %#', (value) => {
  expect(parseBroadcastGuideProfile(value)).toBeNull();
});

it('reopens one saved app-wide set without changing the independent other app', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  const designer = createBroadcastGuideStore('designer-guides', () => storage);
  const runtime = createBroadcastGuideStore('runtime-guides', () => storage);
  const changed = vi.fn();
  const stop = designer.subscribe(changed);
  expect(designer.getSnapshot()).toBe(DEFAULT_BROADCAST_GUIDE_PROFILE);
  designer.set(profile);
  designer.set({ ...profile });
  expect(changed).toHaveBeenCalledTimes(1);
  expect(designer.getSnapshot()).toBe(designer.getSnapshot());
  expect(createBroadcastGuideStore('designer-guides', () => storage).getSnapshot()).toEqual(
    profile,
  );
  expect(runtime.getSnapshot()).toBe(DEFAULT_BROADCAST_GUIDE_PROFILE);
  stop();
  designer.set({ ...profile, standardVisible: true });
  expect(changed).toHaveBeenCalledTimes(1);
});

it.each(['{invalid', JSON.stringify({ ...profile, version: 2 }), 'x'.repeat(32_769)])(
  'uses defaults for unreadable storage without overwriting it',
  (raw) => {
    const setItem = vi.fn();
    const store = createBroadcastGuideStore('guides', () => ({ getItem: () => raw, setItem }));
    expect(store.getSnapshot()).toBe(DEFAULT_BROADCAST_GUIDE_PROFILE);
    store.refresh();
    expect(setItem).not.toHaveBeenCalled();
  },
);

it('keeps editing usable when browser storage access or writes fail', () => {
  const denied = createBroadcastGuideStore('guides', () => {
    throw new Error('Storage blocked');
  });
  expect(denied.getSnapshot()).toBe(DEFAULT_BROADCAST_GUIDE_PROFILE);
  expect(() => denied.set(profile)).not.toThrow();
  expect(denied.getSnapshot()).toEqual(profile);
  const quota = createBroadcastGuideStore('guides', () => ({
    getItem: () => null,
    setItem: () => {
      throw new Error('Quota');
    },
  }));
  quota.set(profile);
  expect(quota.getSnapshot()).toEqual(profile);
});
