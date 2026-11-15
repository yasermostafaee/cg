import { describe, expect, it } from 'vitest';
import {
  CONTROL_LIVE_LAYOUT_DEFAULT_EFFECTS,
  CONTROL_LIVE_LAYOUT_FOCUS_ALIAS_MAX_LENGTH,
  ControlLiveLayoutSchema,
  controlLiveLayoutMovePresetFrame,
  controlLiveLayoutPresetFrameIds,
  controlLiveLayoutRects,
  type ControlLiveLayoutPreset,
} from '../src/index.js';

const resolution = { width: 1920, height: 1080 };
const preset: ControlLiveLayoutPreset = {
  id: 'preset-a',
  name: 'Panel',
  frameIds: ['host', 'guest-c', 'guest-a', 'guest-b'],
  arrangement: 'side-by-side',
  horizontalGap: 12,
  verticalGap: 20,
  reverse: false,
  hiddenTitles: [],
  hiddenFocusTitles: [],
};

describe('authored live layout frame order', () => {
  it.each([
    {
      reverse: false,
      seat: 0,
      before: ['host', 'guest-c', 'guest-a', 'guest-b'],
      visibleAfter: ['guest-a', 'guest-c', 'host', 'guest-b'],
      storedAfter: ['guest-a', 'guest-c', 'host', 'guest-b'],
    },
    {
      reverse: true,
      seat: 2,
      before: ['guest-b', 'guest-a', 'guest-c', 'host'],
      visibleAfter: ['guest-b', 'guest-c', 'guest-a', 'host'],
      storedAfter: ['host', 'guest-a', 'guest-c', 'guest-b'],
    },
  ])(
    'swaps only the specified seats with Reverse $reverse',
    ({ reverse, seat, before, visibleAfter, storedAfter }) => {
      const current = { ...preset, reverse };
      expect(controlLiveLayoutPresetFrameIds(current)).toEqual(before);
      const frameIds = controlLiveLayoutMovePresetFrame(current, 'guest-a', seat);
      expect(frameIds).toEqual(storedAfter);
      expect(current.frameIds).toEqual(['host', 'guest-c', 'guest-a', 'guest-b']);
      if (frameIds === undefined) throw new Error('The requested seat was unavailable');
      const next = { ...current, frameIds };
      expect(controlLiveLayoutPresetFrameIds(next)).toEqual(visibleAfter);
      const rects = controlLiveLayoutRects({ resolution }, next);
      const renderedOrder = Object.entries(rects)
        .sort(([, a], [, b]) => a.x - b.x)
        .map(([id]) => id);
      expect(renderedOrder).toEqual(visibleAfter);
    },
  );

  it('rejects a frame outside the preset and an unavailable or fractional seat', () => {
    expect(controlLiveLayoutMovePresetFrame(preset, 'unseated', 0)).toBeUndefined();
    for (const seat of [-1, 0.5, 4]) {
      expect(controlLiveLayoutMovePresetFrame(preset, 'host', seat)).toBeUndefined();
    }
  });
});

describe('authored Focus aliases', () => {
  const layout = {
    id: 'layout-a',
    name: 'Studio panel',
    resolution,
    frameRate: 25,
    frames: [
      { id: 'host', title: 'Presenter', focusAlias: '  مجری  ' },
      { id: 'guest-c', title: 'Guest C' },
      { id: 'guest-a', title: 'Guest A', focusAlias: '   ' },
      { id: 'guest-b', title: 'Guest B' },
    ],
    presets: [preset],
    defaultPresetId: preset.id,
    background: { kind: 'color' as const, color: '#000000' },
    effects: CONTROL_LIVE_LAYOUT_DEFAULT_EFFECTS,
  };

  it('trims a short label, keeps blank valid, and retains absent aliases in older layouts', () => {
    const parsed = ControlLiveLayoutSchema.parse(layout);
    const reopened = ControlLiveLayoutSchema.parse(JSON.parse(JSON.stringify(parsed)));
    expect(reopened).toEqual(parsed);
    expect(reopened.frames.map((frame) => frame.focusAlias)).toEqual([
      'مجری',
      undefined,
      '',
      undefined,
    ]);
    expect(reopened.frames[1]).not.toHaveProperty('focusAlias');
  });

  it('bounds the saved button caption length after trimming', () => {
    const alias = 'x'.repeat(CONTROL_LIVE_LAYOUT_FOCUS_ALIAS_MAX_LENGTH);
    const withAlias = (focusAlias: string) => ({
      ...layout,
      frames: layout.frames.map((frame) =>
        frame.id === 'host' ? { ...frame, focusAlias } : frame,
      ),
    });
    expect(ControlLiveLayoutSchema.safeParse(withAlias(` ${alias} `)).success).toBe(true);
    expect(ControlLiveLayoutSchema.safeParse(withAlias(alias + 'x')).success).toBe(false);
  });
});
