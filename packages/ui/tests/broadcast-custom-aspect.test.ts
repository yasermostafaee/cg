import { expect, it } from 'vitest';
import {
  broadcastCustomGuideLines,
  broadcastGuideFrame,
  broadcastSafeAreas,
  createBroadcastGuideStore,
  DEFAULT_BROADCAST_GUIDE_PROFILE,
  parseBroadcastGuideProfile,
  type BroadcastGuideCustomAspect,
} from '../src/index.js';

const custom = {
  ...DEFAULT_BROADCAST_GUIDE_PROFILE,
  aspect: 'custom' as const,
  customAspect: { width: 3, height: 4 },
  color: '#123456',
  lines: [
    { id: 'h', name: 'عنوان', axis: 'y' as const, position: 75, visible: true },
    { id: 'v', name: 'Logo', axis: 'x' as const, position: 25, visible: true },
  ],
};

it('contains a custom portrait reference without changing the active picture', () => {
  expect(broadcastGuideFrame(1920, 1080, 'custom', custom.customAspect)).toEqual({
    x: 555,
    y: 0,
    width: 810,
    height: 1080,
  });
  expect(broadcastGuideFrame(720, 576, 'custom', { width: 9, height: 16 })).toEqual({
    x: 198,
    y: 0,
    width: 324,
    height: 576,
  });
  const unusual = broadcastGuideFrame(1920, 1080, 'custom', { width: 7, height: 3 });
  expect(unusual?.width).toBe(1920);
  expect(unusual?.height).toBeCloseTo(1920 * (3 / 7), 10);
  expect(unusual?.y).toBeCloseTo((1080 - 1920 * (3 / 7)) / 2, 10);
});

it('uses the same custom reference for standard boxes and named percentage guides', () => {
  expect(broadcastSafeAreas(1920, 1080, 'custom', custom.customAspect)).toEqual([
    { kind: 'action', label: 'Action 93%', x: 583.5, y: 38, width: 753, height: 1004 },
    { kind: 'graphics', label: 'Graphics 90%', x: 595.5, y: 54, width: 729, height: 972 },
  ]);
  expect(broadcastCustomGuideLines(1920, 1080, custom)).toEqual([
    { ...custom.lines[0], x1: 555, y1: 810, x2: 1365, y2: 810 },
    { ...custom.lines[1], x1: 757.5, y1: 0, x2: 757.5, y2: 1080 },
  ]);
});

it('round-trips a custom ratio through the existing v1 app-local store', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
  const store = createBroadcastGuideStore('cg.runtime.safe-guides.v1', () => storage);
  store.set(custom);
  expect(JSON.parse(values.get('cg.runtime.safe-guides.v1') ?? '{}')).toEqual(custom);
  expect(
    createBroadcastGuideStore('cg.runtime.safe-guides.v1', () => storage).getSnapshot(),
  ).toEqual(custom);
  expect(values.size).toBe(1);
});

it.each([
  undefined,
  null,
  {},
  { width: 3 },
  { width: 0, height: 4 },
  { width: -3, height: 4 },
  { width: 3, height: 0 },
  { width: 3.5, height: 4 },
  { width: '3', height: 4 },
  { width: NaN, height: 4 },
  { width: 3, height: Infinity },
  { width: 16_385, height: 4 },
])('falls back only the malformed custom reference, preserving valid named guides %#', (ratio) => {
  const parsed = parseBroadcastGuideProfile({ ...custom, customAspect: ratio });
  const { customAspect: _invalid, ...expected } = custom;
  expect(parsed).toEqual({ ...expected, aspect: 'auto' });
  expect(
    broadcastGuideFrame(1920, 1080, 'custom', ratio as BroadcastGuideCustomAspect | undefined),
  ).toEqual(broadcastGuideFrame(1920, 1080));
});

it('keeps legacy profile shapes and remembers an inactive valid custom ratio', () => {
  for (const aspect of ['auto', '16:9', '4:3'] as const) {
    const legacy = { ...DEFAULT_BROADCAST_GUIDE_PROFILE, aspect };
    expect(parseBroadcastGuideProfile(legacy)).toEqual(legacy);
    expect(parseBroadcastGuideProfile({ ...legacy, customAspect: custom.customAspect })).toEqual({
      ...legacy,
      customAspect: custom.customAspect,
    });
  }
});

it('keeps extreme valid custom ratios finite and contained', () => {
  for (const customAspect of [
    { width: 1, height: 16_384 },
    { width: 16_384, height: 1 },
  ]) {
    const frame = broadcastGuideFrame(1920, 1080, 'custom', customAspect);
    expect(frame).not.toBeNull();
    if (frame === null) throw new Error('Valid ratio has no frame');
    for (const value of Object.values(frame)) expect(Number.isFinite(value)).toBe(true);
    expect(frame.x).toBeGreaterThanOrEqual(0);
    expect(frame.y).toBeGreaterThanOrEqual(0);
    expect(frame.x + frame.width).toBeLessThanOrEqual(1920);
    expect(frame.y + frame.height).toBeLessThanOrEqual(1080);
    for (const area of broadcastSafeAreas(1920, 1080, 'custom', customAspect)) {
      expect(area.width).toBeLessThanOrEqual(frame.width);
      expect(area.height).toBeLessThanOrEqual(frame.height);
    }
  }
});
