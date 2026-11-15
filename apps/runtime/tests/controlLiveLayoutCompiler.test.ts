import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  aggregateBoundCompositionFields,
  ControlLiveLayoutSchema,
  calculateLiveSourceAutoLayout,
  controlLiveLayoutFocusLookId,
  controlLiveLayoutFocusTarget,
  controlLiveLayoutFontFamily,
  controlLiveLayoutRects,
  elementDigitsOf,
  fieldDigitsOf,
  type ControlLiveLayout,
  type ControlLiveLayoutPreset,
  type ControlLiveLayoutTitleStyle,
  type LivePlateMask,
} from '@cg/shared-schema';
import { buildTemplateLiveSources, sha256Hex, unpack } from '@cg/vcg-format';
import {
  buildControlLiveLayoutScene,
  compileControlLiveLayout,
  controlLiveLayoutFrameTexts,
  controlLiveLayoutTitleGeometry,
  createControlLiveLayout,
  labelControlLiveLayoutFieldGroups,
  readControlLiveLayout,
} from '../src/renderer/features/liveLayouts/controlLiveLayoutCompiler.js';
import { sharedFrameTitlesOf } from '../src/renderer/features/inspector/sharedFrameTitles.js';
import { produceTemplateDelivery } from '../src/renderer/features/library/templateDelivery.js';

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

  it('preserves the original title geometry for saved layouts without a title style', () => {
    const { resolution } = layoutFixture();
    const { width, height } = resolution;
    const inset = height * 0.035;
    const bandHeight = height * 0.085;
    expect(controlLiveLayoutTitleGeometry(resolution)).toMatchObject({
      x: inset,
      y: height - bandHeight - inset,
      width: width * 0.66,
      height: bandHeight,
      fontSize: height * 0.042,
      fontFamily: 'Vazirmatn',
      backgroundColor: '#101B28DE',
      padding: height * 0.012,
    });
  });

  it('exports the same authored mask and frame permissions in each preset and Focus', async () => {
    const base = layoutFixture();
    const liveMask: LivePlateMask = {
      mode: 'inside',
      rects: [
        { x: 0.125, y: 0.25, width: 0.5, height: 0.5 },
        { x: 0.75, y: 0.125, width: 0.125, height: 0.125 },
      ],
    };
    const layout: ControlLiveLayout = {
      ...base,
      frames: base.frames.map((frame) => {
        if (frame.id === 'frame-left') {
          return {
            ...frame,
            fitMode: 'cover',
            operatorMove: false,
            operatorPlacement: 'proportional',
            liveMask,
            allowOperatorMaskEdit: true,
          };
        }
        if (frame.id === 'frame-right') return { ...frame, operatorPlacement: 'locked' };
        return frame;
      }),
    };
    const bytes = await compileControlLiveLayout(layout);
    expect((await readControlLiveLayout(bytes)).layout).toEqual(layout);
    const { template } = await produceTemplateDelivery(bytes);
    const look = (id: string) => template.liveSources?.looks?.find((entry) => entry.id === id);
    for (const id of [
      'preset-wide',
      'preset-pair',
      controlLiveLayoutFocusLookId('preset-wide', 'frame-left'),
      controlLiveLayoutFocusLookId('preset-pair', 'frame-left'),
    ]) {
      expect(look(id)).toMatchObject({
        fits: { 'frame-left': 'cover' },
        masks: { 'frame-left': liveMask },
        maskElementIds: { 'frame-left': 'frame-left-plate' },
        operatorMaskEdits: ['frame-left'],
        operatorFrames: {
          'frame-left': {
            artworkKey: expect.stringMatching(/\/instance-frame-left$/),
            resize: 'proportional',
            move: false,
          },
        },
      });
    }
    const wide = look('preset-wide');
    expect(wide?.fits?.['frame-anchor']).toBe('contain');
    expect(wide?.operatorFrames?.['frame-anchor']).toMatchObject({ resize: 'free' });
    expect(wide?.operatorFrames?.['frame-anchor']).not.toHaveProperty('move');
    expect(wide?.operatorFrames?.['frame-right']).toMatchObject({ resize: 'move-only' });
    expect(look(controlLiveLayoutFocusLookId('preset-wide', 'frame-right'))).not.toHaveProperty(
      'operatorMaskEdits',
    );
  });

  it('inherits common title styling and allows an individual frame to disable part of it', () => {
    const layout = layoutFixture();
    const shadow = { offsetX: 3, offsetY: 4, blur: 6, color: '#00000099' };
    const titleStyle: ControlLiveLayoutTitleStyle = {
      widthPercent: 100,
      heightPercent: 100,
      padding: 24,
      textOffsetY: -8,
      verticalAlign: 'bottom',
      align: 'center',
      color: '#DDEEFF',
      fontWeight: 700,
      fontStyle: 'italic',
      backgroundColor: '#001122CC',
      stroke: { width: 2, color: '#33BB88' },
      textShadow: shadow,
      boxShadow: { ...shadow, spread: 4 },
      borderRadius: 12,
      wrap: true,
    };
    const override = { stroke: null, boxShadow: null, wrap: false, color: '#FFFFFF' };
    const scene = buildControlLiveLayoutScene({
      ...layout,
      titleStyle,
      frames: layout.frames.map((frame) =>
        frame.id === 'frame-right' ? { ...frame, titleStyle: override } : frame,
      ),
    });
    expect(controlLiveLayoutTitleGeometry(layout.resolution, titleStyle)).toMatchObject({
      x: 0,
      y: 0,
      xPercent: 0,
      yPercent: 0,
      width: 1920,
      height: 1080,
    });
    const getTitle = (frameId: string) =>
      scene.compositions?.find(({ id }) => id === `layout-frame-${frameId}`)?.layers[0]
        ?.children[1];
    const shared = getTitle('frame-left');
    expect(shared).toMatchObject({
      transform: { position: { x: 0, y: 0 }, size: { w: 1920, h: 1080 } },
      font: { weight: 700, style: 'italic' },
      color: '#DDEEFF',
      backgroundColor: '#001122CC',
      stroke: { width: 2, color: '#33BB88' },
      textShadow: shadow,
      shadow: { ...shadow, spread: 4 },
      cornerRadius: 12,
      padding: 24,
      textOffsetY: -8,
      verticalAlign: 'bottom',
      align: 'center',
      wrap: true,
      overflow: 'clip',
    });
    expect(shared).not.toHaveProperty('maxLines');
    const individual = getTitle('frame-right');
    expect(individual).toMatchObject({
      color: '#FFFFFF',
      textOffsetY: -8,
      textShadow: shadow,
      maxLines: 1,
      wrap: false,
      overflow: 'ellipsis',
    });
    expect(individual).not.toHaveProperty('stroke');
    expect(individual).not.toHaveProperty('shadow');
  });

  it('keeps uploaded fonts editable and inlines their bytes into the programme page', async () => {
    const base = layoutFixture();
    const mime = 'font/woff2' as const;
    const fonts = new Map<string, Blob>();
    const assets = await Promise.all(
      ['vazirmatn-arabic-400-normal.woff2', 'vazirmatn-latin-700-normal.woff2'].map(
        async (name) => {
          const bytes = new Uint8Array(
            await readFile(new URL(`../public/fonts/vazirmatn/${name}`, import.meta.url)),
          );
          const id = sha256Hex(bytes);
          fonts.set(id, new Blob([bytes], { type: mime }));
          return { id, name, mime };
        },
      ),
    );
    const primaryFamily = controlLiveLayoutFontFamily(assets[0]!.id);
    const secondaryFamily = controlLiveLayoutFontFamily(assets[1]!.id);
    const layout: ControlLiveLayout = {
      ...base,
      fonts: assets,
      titleStyle: { fontFamily: primaryFamily },
      frames: base.frames.map((frame) =>
        frame.id === 'frame-right'
          ? { ...frame, titleStyle: { fontFamily: secondaryFamily } }
          : frame,
      ),
    };
    expect(
      ControlLiveLayoutSchema.safeParse({ ...layout, fonts: assets.slice(0, 1) }).success,
    ).toBe(false);
    await expect(compileControlLiveLayout(layout)).rejects.toThrow('Choose the font file');
    const bytes = await compileControlLiveLayout(layout, undefined, fonts);
    const reopened = await readControlLiveLayout(bytes);
    expect(reopened.layout).toEqual(layout);
    const { manifest, files } = await unpack(bytes);
    const indexHtml = new TextDecoder().decode(files.get('index.html'));
    const { html } = await produceTemplateDelivery(bytes);
    for (const asset of assets) {
      expect(manifest.assetIndex).toContainEqual(
        expect.objectContaining({ id: asset.id, kind: 'font', mime, sha256: asset.id }),
      );
      const reopenedFont = reopened.fonts.get(asset.id);
      expect(reopenedFont?.type).toBe(mime);
      expect(sha256Hex(new Uint8Array(await reopenedFont!.arrayBuffer()))).toBe(asset.id);
      expect(indexHtml).toContain(`font-family: "${controlLiveLayoutFontFamily(asset.id)}"`);
      expect(html).toContain(
        `font-family:"${controlLiveLayoutFontFamily(asset.id)}";font-display:swap;src:url(data:${mime};base64,`,
      );
    }
  });

  it('uses each frame’s digit choice for both authored and operator-entered titles', async () => {
    const base = layoutFixture();
    const typed = 'استودیو 12/۳٤';
    const overrides = [undefined, 'latin', 'arabic-indic', 'as-typed'] as const;
    const layout: ControlLiveLayout = {
      ...base,
      titleStyle: { digits: 'persian' },
      frames: [...base.frames, { id: 'frame-spare', title: typed }].map((frame, index) => ({
        ...frame,
        title: typed,
        ...(overrides[index] !== undefined && { titleStyle: { digits: overrides[index] } }),
      })),
    };
    const bytes = await compileControlLiveLayout(layout);
    expect((await readControlLiveLayout(bytes)).layout).toEqual(layout);
    const { scene } = await unpack(bytes);
    for (const [index, frame] of layout.frames.entries()) {
      const composition = scene.compositions?.find(({ id }) => id === `layout-frame-${frame.id}`);
      const title = composition?.layers[0]?.children[1];
      const field = composition?.fields?.[0];
      if (title?.type !== 'text' || field?.type !== 'text')
        throw new Error('Expected a bound title');
      expect(title.text).toBe(typed);
      expect(field.default).toBe(typed);
      const digits = overrides[index] ?? 'persian';
      expect(elementDigitsOf(title)).toBe(digits);
      expect(fieldDigitsOf(field)).toBe(digits);
    }
  });

  it('exports independent caption fields and hides every caption together in presets and Focus', async () => {
    const base = layoutFixture();
    const layout: ControlLiveLayout = {
      ...base,
      titleStyle: { digits: 'persian', align: 'center' },
      frames: base.frames.map((frame) => {
        if (frame.id === 'frame-left') {
          return {
            ...frame,
            titleStyle: { color: '#CAAC22', digits: 'latin' },
            additionalTexts: [
              { id: 'role', text: 'Expert 24', style: { yPercent: 10, digits: 'arabic-indic' } },
              { id: 'spare', text: '  ' },
              { id: 'location', text: 'Studio 8', style: { yPercent: 20 } },
            ],
          };
        }
        if (frame.id === 'frame-right') {
          return { ...frame, title: '', additionalTexts: [{ id: 'role', text: 'Correspondent' }] };
        }
        return frame;
      }),
      presets: base.presets.map((preset) =>
        preset.id === 'preset-pair'
          ? { ...preset, hiddenTitles: ['frame-left', 'frame-right'] }
          : preset,
      ),
    };
    const bytes = await compileControlLiveLayout(layout);
    expect((await readControlLiveLayout(bytes)).layout).toEqual(layout);
    const { scene } = await unpack(bytes);
    const left = layout.frames.find(({ id }) => id === 'frame-left')!;
    const texts = controlLiveLayoutFrameTexts(left, layout.titleStyle);
    expect(texts.map(({ fieldId }) => fieldId)).toEqual(['title', 'text-role', 'text-location']);
    const composition = (id: string) => scene.compositions?.find((entry) => entry.id === id);
    expect(composition('layout-frame-frame-left')).toMatchObject({
      layers: [
        {
          children: [
            expect.objectContaining({ type: 'video-placeholder' }),
            expect.objectContaining({ id: 'frame-left-title', digits: 'latin', zIndex: 1 }),
            expect.objectContaining({
              id: texts[1]?.id,
              digits: 'arabic-indic',
              align: 'center',
              color: '#CAAC22',
              zIndex: 2,
            }),
            expect.objectContaining({ id: texts[2]?.id, digits: 'latin', zIndex: 3 }),
          ],
        },
      ],
      fields: [
        expect.objectContaining({ id: 'title', default: left.title, digits: 'latin' }),
        expect.objectContaining({ id: 'text-role', default: 'Expert 24', digits: 'arabic-indic' }),
        expect.objectContaining({ id: 'text-location', default: 'Studio 8', digits: 'latin' }),
      ],
      bindings: texts.map(({ id, fieldId }) => ({
        fieldId,
        target: { kind: 'text', elementId: id },
      })),
    });

    const presetFrame = (lookId: string, frameId: string) =>
      composition(`layout-look-${lookId}-contents`)?.layers[0]?.children.find(
        ({ id }) => id === `instance-${frameId}`,
      );
    expect(presetFrame('preset-wide', 'frame-left')).not.toHaveProperty('hiddenTextIds');
    expect(presetFrame('preset-pair', 'frame-left')).toMatchObject({
      hiddenTextIds: texts.map(({ id }) => id),
    });
    expect(presetFrame('preset-pair', 'frame-right')).toMatchObject({
      hiddenTextIds: ['layout-text:frame-right:role'],
    });
    const focus = controlLiveLayoutFocusLookId('preset-wide', 'frame-left');
    expect(presetFrame(focus, 'frame-left')).toMatchObject({
      hiddenTextIds: texts.map(({ id }) => id),
    });
    const imported = await produceTemplateDelivery(bytes);
    expect(imported.template.sharedFrameTitles).toContainEqual(
      expect.arrayContaining([
        ['preset-wide', 'frame-left', 'text-role'],
        ['preset-pair', 'frame-left', 'text-role'],
        [focus, 'frame-left', 'text-role'],
      ]),
    );
    expect(imported.template.sharedFrameTitles).toContainEqual(
      expect.arrayContaining([
        ['preset-wide', 'frame-left', 'text-location'],
        ['preset-pair', 'frame-left', 'text-location'],
      ]),
    );
  });

  it.each(['cut', 'fade'] as const)(
    'keeps the authored title treatment, frame identity, and %s switch in its saved package',
    async (mode) => {
      const base = layoutFixture();
      const titleStyle = {
        xPercent: 100,
        yPercent: 0,
        sizePercent: 14,
        fontFamily: 'Exo 2',
        backgroundColor: '#00000000',
      } as const;
      const layout: ControlLiveLayout = {
        ...base,
        frames: base.frames.map((frame) =>
          frame.id === 'frame-left' ? { ...frame, titleStyle } : frame,
        ),
        effects: { ...base.effects, switch: { ...base.effects.switch, mode } },
      };
      const bytes = await compileControlLiveLayout(layout);
      expect((await readControlLiveLayout(bytes)).layout).toEqual(layout);
      const { scene } = await unpack(bytes);
      const geometry = controlLiveLayoutTitleGeometry(layout.resolution, titleStyle);
      expect(geometry.x + geometry.width).toBe(layout.resolution.width);
      expect(geometry.y).toBe(0);
      expect(geometry.height).toBeGreaterThan(layout.resolution.height * 0.085);
      const contents = scene.compositions?.find(({ id }) => id === 'layout-frame-frame-left');
      expect(contents?.layers[0]?.children[1]).toMatchObject({
        id: 'frame-left-title',
        font: { family: 'Exo 2', size: geometry.fontSize },
        transform: {
          position: { x: geometry.x, y: geometry.y },
          size: { w: geometry.width, h: geometry.height },
        },
        backgroundColor: '#00000000',
        padding: geometry.padding,
      });
      const pair = scene.compositions?.find(({ id }) => id === 'layout-look-preset-pair-contents');
      expect(pair?.layers[0]?.children).toContainEqual(
        expect.objectContaining({ compositionId: contents?.id }),
      );
    },
  );

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
