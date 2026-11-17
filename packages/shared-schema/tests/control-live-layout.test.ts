import { describe, expect, it } from 'vitest';
import {
  CONTROL_LIVE_LAYOUT_DEFAULT_EFFECTS,
  CONTROL_LIVE_LAYOUT_FOCUS_ALIAS_MAX_LENGTH,
  ControlLiveLayoutSchema,
  controlLiveLayoutAttachments,
  controlLiveLayoutBorderHidden,
  controlLiveLayoutFrameAttachments,
  controlLiveLayoutMovePresetFrame,
  controlLiveLayoutPlateAspect,
  controlLiveLayoutPlateCropFocus,
  controlLiveLayoutPlateFit,
  controlLiveLayoutPresetFrameIds,
  controlLiveLayoutRects,
  type ControlLiveLayoutArrangement,
  type ControlLiveLayoutFrameAttachment,
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

describe('live layout preset and plate shape', () => {
  const mixed = {
    ...preset,
    plateAspectRatio: 4 / 3,
    plateFitMode: 'cover' as const,
    plateOverrides: {
      'guest-c': { aspectRatio: 9 / 16, fitMode: 'contain' as const },
      'guest-a': { aspectRatio: 16 / 9 },
    },
  };

  it('uses the preset defaults and the selected plate overrides independently', () => {
    const host = { id: 'host', fitMode: 'contain' as const };
    const guest = { id: 'guest-c', fitMode: 'cover' as const };
    expect(controlLiveLayoutPlateAspect(mixed, host.id, resolution)).toBe(4 / 3);
    expect(controlLiveLayoutPlateAspect(mixed, guest.id, resolution)).toBe(9 / 16);
    expect(controlLiveLayoutPlateFit(mixed, host)).toBe('cover');
    expect(controlLiveLayoutPlateFit(mixed, guest)).toBe('contain');
    expect(controlLiveLayoutPlateFit(preset, guest)).toBe('cover');
    expect(controlLiveLayoutPlateFit(preset, { id: 'host' })).toBe('contain');
  });

  it('keeps preset and Focus borders independent and resolves authored crop from the most specific scope', () => {
    const authored: ControlLiveLayoutPreset = {
      ...mixed,
      frameIds: ['host'],
      hiddenBorders: ['host'],
      hiddenFocusBorders: ['guest-c'],
      plateCropFocus: { x: 0.1, y: 0.9, zoom: 2 },
      plateOverrides: { host: { cropFocus: { x: 0.85, y: 0.25 } } },
    };
    expect(controlLiveLayoutBorderHidden(authored, 'host', false)).toBe(true);
    expect(controlLiveLayoutBorderHidden(authored, 'host', true)).toBe(false);
    expect(controlLiveLayoutBorderHidden(authored, 'guest-c', false)).toBe(false);
    expect(controlLiveLayoutBorderHidden(authored, 'guest-c', true)).toBe(true);
    expect(controlLiveLayoutBorderHidden(preset, 'host', false)).toBe(false);
    expect(controlLiveLayoutPlateCropFocus(preset, 'host')).toBeUndefined();
    expect(controlLiveLayoutPlateCropFocus(authored, 'host')).toEqual({ x: 0.85, y: 0.25 });
    expect(controlLiveLayoutPlateCropFocus(authored, 'guest-c')).toEqual(authored.plateCropFocus);
  });

  it('centres a solo portrait plate and keeps a legacy solo plate full frame', () => {
    const solo = { ...preset, frameIds: ['guest-c'] };
    expect(controlLiveLayoutRects({ resolution }, solo)['guest-c']).toEqual({
      x: 0,
      y: 0,
      ...resolution,
    });
    const portrait = { ...mixed, frameIds: solo.frameIds };
    expect(controlLiveLayoutRects({ resolution }, portrait)['guest-c']).toEqual({
      x: 656.25,
      y: 0,
      width: 607.5,
      height: 1080,
    });
  });

  it.each([
    ['side-by-side', 4],
    ['top-and-bottom', 2],
    ['grid-top', 3],
    ['grid-bottom', 3],
    ['grid-top', 4],
    ['host-and-guests', 4],
  ] satisfies [ControlLiveLayoutArrangement, number][])(
    'preserves individual aspect ratios within the canvas for %s with %s plates',
    (arrangement, count) => {
      const candidate = { ...mixed, arrangement, frameIds: mixed.frameIds.slice(0, count) };
      const rects = Object.entries(controlLiveLayoutRects({ resolution }, candidate));
      expect(rects).toHaveLength(count);
      for (const [index, [id, rect]] of rects.entries()) {
        expect(rect.width / rect.height).toBeCloseTo(
          controlLiveLayoutPlateAspect(candidate, id, resolution),
          8,
        );
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.y).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.width).toBeLessThanOrEqual(resolution.width);
        expect(rect.y + rect.height).toBeLessThanOrEqual(resolution.height);
        for (const [, other] of rects.slice(index + 1)) {
          const horizontal =
            Math.max(rect.x, other.x) - Math.min(rect.x + rect.width, other.x + other.width);
          const vertical =
            Math.max(rect.y, other.y) - Math.min(rect.y + rect.height, other.y + other.height);
          expect(
            horizontal >= mixed.horizontalGap - 1e-8 || vertical >= mixed.verticalGap - 1e-8,
          ).toBe(true);
        }
      }
    },
  );

  it('keeps the requested fuller row for narrow plates and rejects an impossible gap', () => {
    const narrow = { ...preset, plateAspectRatio: 9 / 16, frameIds: preset.frameIds.slice(0, 3) };
    const rows = (arrangement: ControlLiveLayoutArrangement) =>
      Object.values(controlLiveLayoutRects({ resolution }, { ...narrow, arrangement })).map(
        ({ y }) => y,
      );
    const [topFirst, topSecond, topThird] = rows('grid-top');
    const [bottomFirst, bottomSecond, bottomThird] = rows('grid-bottom');
    if (topFirst === undefined || bottomFirst === undefined)
      throw new Error('Both grid modes must place their first plate');
    expect(topFirst).toBe(topSecond);
    expect(topThird).toBeGreaterThan(topFirst);
    expect(bottomSecond).toBe(bottomThird);
    expect(bottomSecond).toBeGreaterThan(bottomFirst);
    expect(
      controlLiveLayoutRects({ resolution }, { ...mixed, horizontalGap: resolution.width }),
    ).toEqual({});
  });

  it('round-trips settings and rejects invalid aspects and overrides for excluded plates', () => {
    const create = (candidate: ControlLiveLayoutPreset) => ({
      id: 'mixed-layout',
      name: 'Panel',
      resolution,
      frameRate: 25,
      frames: preset.frameIds.map((id) => ({ id, title: id })),
      presets: [candidate],
      defaultPresetId: candidate.id,
      background: { kind: 'none' },
      effects: CONTROL_LIVE_LAYOUT_DEFAULT_EFFECTS,
    });
    expect(ControlLiveLayoutSchema.parse(create(mixed)).presets).toEqual([mixed]);
    for (const plateAspectRatio of [0, 1 / 5, 5, Infinity]) {
      expect(
        ControlLiveLayoutSchema.safeParse(create({ ...mixed, plateAspectRatio })).success,
      ).toBe(false);
    }
    expect(
      ControlLiveLayoutSchema.safeParse(create({ ...mixed, frameIds: ['host'] })).success,
    ).toBe(false);
  });
});

describe('authored frame graphics', () => {
  const rect = { x: 0.1, y: 0.2, width: 0.5, height: 0.4 };
  const attachment = (id: string, frameId: string): ControlLiveLayoutFrameAttachment => ({
    id,
    frameId,
    name: id,
    sourceId: '0'.repeat(64),
    rect,
  });
  const logo = attachment('logo', 'host');
  const guestBug = attachment('guest-bug', 'guest-a');
  const legacy = attachment('legacy-caption', 'host');
  const pane = { ...preset, frameAttachments: [legacy] };
  const solo = { ...preset, id: 'solo-a', frameIds: ['host'] };
  const layout = {
    id: 'test-layout',
    name: 'Panel',
    resolution,
    frameRate: 25,
    frames: preset.frameIds.map((id) => ({ id, title: id })),
    presets: [pane, solo],
    defaultPresetId: pane.id,
    background: { kind: 'none' },
    frameAttachments: [logo, guestBug],
    effects: CONTROL_LIVE_LAYOUT_DEFAULT_EFFECTS,
  };

  it('persists a Playout replica media catalogue id on a frame', () => {
    const sourceId = 'md-replica-43564423a0707662019d6630a6ced3a60e0260707a31081dee4d5f76bf6eecf8';
    const withSourceId = (id: string) => ({
      ...layout,
      frames: layout.frames.map((frame) => ({ ...frame, sourceId: id })),
    });
    expect(ControlLiveLayoutSchema.parse(withSourceId(sourceId)).frames[0]?.sourceId).toBe(
      sourceId,
    );
    expect(ControlLiveLayoutSchema.safeParse(withSourceId('in-' + 'a'.repeat(70))).success).toBe(
      false,
    );
  });

  it('returns shared and preset-local graphics in the order the player uses', () => {
    const saved = ControlLiveLayoutSchema.parse(layout);
    expect(controlLiveLayoutAttachments(saved)).toEqual([logo, guestBug, legacy]);
    expect(controlLiveLayoutFrameAttachments(saved, pane, 'host')).toEqual([logo, legacy]);
    expect(controlLiveLayoutFrameAttachments(saved, solo, 'host')).toEqual([logo]);
    expect(controlLiveLayoutFrameAttachments(saved, undefined, 'guest-a')).toEqual([guestBug]);
  });

  it('validates that a shared attachment has a unique id and belongs to a frame in the layout', () => {
    const parsed = ControlLiveLayoutSchema.safeParse({
      ...layout,
      frameAttachments: [logo, { ...logo, frameId: 'missing' }],
    });
    if (parsed.success) throw new Error('Invalid frame attachments were accepted');
    expect(parsed.error.issues).toMatchObject([
      { path: ['frameAttachments'], message: 'Frame attachments must have distinct ids.' },
      {
        path: ['frameAttachments'],
        message: 'Frame attachments must belong to a frame in this layout.',
      },
    ]);
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
