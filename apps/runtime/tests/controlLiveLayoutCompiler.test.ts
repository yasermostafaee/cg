import { describe, expect, it } from 'vitest';
import {
  aggregateBoundCompositionFields,
  ControlLiveLayoutSchema,
  calculateLiveSourceAutoLayout,
  controlLiveLayoutFocusLookId,
  controlLiveLayoutFocusTarget,
  controlLiveLayoutRects,
  type ControlLiveLayout,
  type ControlLiveLayoutPreset,
} from '@cg/shared-schema';
import { buildTemplateLiveSources, unpack } from '@cg/vcg-format';
import {
  buildControlLiveLayoutScene,
  compileControlLiveLayout,
  createControlLiveLayout,
  labelControlLiveLayoutFieldGroups,
  readControlLiveLayout,
} from '../src/renderer/features/liveLayouts/controlLiveLayoutCompiler.js';
import { sharedFrameTitlesOf } from '../src/renderer/features/inspector/sharedFrameTitles.js';

function layoutFixture(): ControlLiveLayout {
  const layout = createControlLiveLayout();
  const wide: ControlLiveLayoutPreset = {
    id: 'preset-wide',
    name: 'News panel',
    frameIds: ['frame-anchor', 'frame-left', 'frame-right'],
    arrangement: 'grid-top',
    horizontalGap: 24,
    verticalGap: 48,
    reverse: true,
    hiddenTitles: ['frame-anchor'],
    hiddenFocusTitles: ['frame-left'],
  };
  return {
    ...layout,
    frames: [
      { id: 'frame-anchor', title: 'مجری', sourceId: 'studio' },
      { id: 'frame-left', title: 'مهمان اول', sourceId: 'remote' },
      { id: 'frame-right', title: 'Guest 2', sourceId: 'remote' },
    ],
    presets: [
      wide,
      { ...wide, id: 'preset-pair', name: 'Interview', frameIds: ['frame-left', 'frame-right'] },
    ],
    defaultPresetId: wide.id,
  };
}

describe('CG Control authored live layouts', () => {
  it('saves grid direction, order and gap using the existing Auto layout geometry', () => {
    const layout = layoutFixture();
    const preset = layout.presets[0]!;
    const rects = controlLiveLayoutRects(layout, preset);
    const shared = calculateLiveSourceAutoLayout(
      preset.frameIds.map((id) => ({ id, aspect: 16 / 9 })),
      layout.resolution,
      'more-top',
      { horizontalGap: preset.horizontalGap, verticalGap: preset.verticalGap, reverse: true },
    );
    expect(rects).toEqual(Object.fromEntries(shared.map(({ id, ...rect }) => [id, rect])));
    expect(controlLiveLayoutRects(layout, { ...preset, arrangement: 'grid-bottom' })).not.toEqual(
      rects,
    );
    expect(
      controlLiveLayoutRects(layout, { ...preset, arrangement: 'host-and-guests' })['frame-right']!
        .width,
    ).toBeGreaterThan(
      controlLiveLayoutRects(layout, { ...preset, arrangement: 'host-and-guests' })['frame-left']!
        .width,
    );
  });

  it('authors normal presets and verified Focus looks with the same plate and title identity', () => {
    const layout = layoutFixture();
    const scene = buildControlLiveLayoutScene(layout);
    const live = buildTemplateLiveSources(scene);
    const lookId = controlLiveLayoutFocusLookId('preset-pair', 'frame-anchor');
    const focus = live.looks?.find(({ id }) => id === lookId);
    const wide = live.looks?.find(({ id }) => id === layout.defaultPresetId);
    const pair = live.looks?.find(({ id }) => id === 'preset-pair');
    expect(controlLiveLayoutFocusTarget(layout, lookId)).toEqual({
      presetId: 'preset-pair',
      frameId: 'frame-anchor',
    });
    expect(controlLiveLayoutFocusTarget(layout, layout.defaultPresetId)).toBeUndefined();
    expect(live.looks).toHaveLength(layout.presets.length * (layout.frames.length + 1));
    expect(live.sources.map(({ sourceId }) => sourceId)).toEqual(layout.frames.map(({ id }) => id));
    expect(live.defaultLookId).toBe(layout.defaultPresetId);
    expect(pair?.rects['frame-anchor']).toBeUndefined();
    const authoredRects = controlLiveLayoutRects(layout, layout.presets[0]!);
    expect(Object.keys(wide?.rects ?? {}).sort()).toEqual(Object.keys(authoredRects).sort());
    for (const [id, rect] of Object.entries(authoredRects)) {
      expect(wide?.rects[id]).toEqual({
        x: expect.closeTo(rect.x, 8),
        y: expect.closeTo(rect.y, 8),
        width: expect.closeTo(rect.width, 8),
        height: expect.closeTo(rect.height, 8),
      });
    }
    expect(focus?.allowOperatorAutoLayout).toBe(false);
    expect(focus?.rects).toEqual({
      'frame-anchor': { x: 0, y: 0, width: 1920, height: 1080 },
    });
    expect(focus?.transitionFrames?.['frame-anchor']).toMatchObject({
      elementId: wide?.transitionFrames?.['frame-anchor']?.elementId,
      artworkId: wide?.transitionFrames?.['frame-anchor']?.artworkId,
    });
    expect(focus?.transitionFrames?.['frame-anchor']).toBeDefined();
    expect(live.foregroundOverlay).toBe(true);
    const soloWithTitleHidden = scene.compositions?.find(
      ({ id }) =>
        id ===
        'layout-look-' + controlLiveLayoutFocusLookId('preset-wide', 'frame-left') + '-contents',
    );
    expect(soloWithTitleHidden?.layers[0]?.children[0]).toMatchObject({
      hiddenTextIds: ['frame-left-title'],
    });
    expect(sharedFrameTitlesOf(scene)).toContainEqual(
      expect.arrayContaining([
        ['preset-wide', 'frame-left', 'title'],
        ['preset-pair', 'frame-left', 'title'],
        [controlLiveLayoutFocusLookId('preset-wide', 'frame-left'), 'frame-left', 'title'],
      ]),
    );
    const groups = labelControlLiveLayoutFieldGroups(
      layout,
      aggregateBoundCompositionFields(scene, scene).groups,
    );
    expect(groups[0]).toMatchObject({ name: 'preset-wide', label: 'News panel' });
    expect(groups[0]?.aggregate.groups[0]).toMatchObject({
      name: 'frame-anchor',
      label: 'مجری',
    });
  });

  it.each([
    { kind: 'image', name: 'studio.png', mime: 'image/png' },
    { kind: 'video', name: 'studio.webm', mime: 'video/webm', durationMs: 2_000 },
  ] satisfies ControlLiveLayout['background'][])(
    'keeps $kind background bytes with the verified editable .vcg',
    async (background) => {
      const assetBytes = new Uint8Array([12, 34, 56]);
      const layout = { ...layoutFixture(), background };
      const packageBytes = await compileControlLiveLayout(
        layout,
        new Blob([assetBytes], { type: background.mime }),
      );
      const reopened = await readControlLiveLayout(packageBytes);
      expect(reopened.layout).toEqual(layout);
      expect(reopened.asset?.type).toBe(background.mime);
      expect(new Uint8Array((await reopened.asset?.arrayBuffer()) ?? new ArrayBuffer(0))).toEqual(
        assetBytes,
      );
      const { scene } = await unpack(packageBytes);
      expect(scene.layers[0]?.children[1]).toMatchObject({
        type: background.kind,
        liveForeground: false,
      });
      if (background.kind === 'video') {
        expect(scene.playout).toMatchObject({ mode: 'static', holdBehavior: 'loop' });
        expect(scene.layers[0]?.children[1]).toMatchObject({
          phases: { introEnd: 0, idle: { start: 0, end: background.durationMs } },
        });
      }
    },
  );

  it('rejects references to removed frames, missing defaults and layouts without room for their gaps', () => {
    const layout = layoutFixture();
    expect(
      ControlLiveLayoutSchema.safeParse({ ...layout, frames: layout.frames.slice(1) }).success,
    ).toBe(false);
    expect(
      ControlLiveLayoutSchema.safeParse({ ...layout, defaultPresetId: 'deleted-preset' }).success,
    ).toBe(false);
    const preset = { ...layout.presets[0]!, arrangement: 'side-by-side', horizontalGap: 100_000 };
    expect(ControlLiveLayoutSchema.safeParse({ ...layout, presets: [preset] }).success).toBe(false);
  });
});
