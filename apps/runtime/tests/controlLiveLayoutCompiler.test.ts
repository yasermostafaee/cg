import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { lookOperatorCropAllowed, lookPlateFits, lookPlateFocuses } from '@cg/shared-ipc';
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
  flattenElements,
  runtimeShortfall,
  type ControlLiveLayout,
  type ControlLiveLayoutPreset,
  type ControlLiveLayoutTitleStyle,
  type LivePlateMask,
} from '@cg/shared-schema';
import { buildTemplateLiveSources, pack, sha256Hex, unpack } from '@cg/vcg-format';
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
import {
  promoteFrameAttachments,
  unpackControlLiveLayoutFrameAttachment,
} from '../src/renderer/features/liveLayouts/controlLiveLayoutFrameAttachments.js';

function layoutFixture(): ControlLiveLayout {
  const { titleStyle: _newTitleStyle, ...layout } = createControlLiveLayout();
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
  it('keeps legacy plates transparent on Programme and applies authored fallback per plate', async () => {
    const layout = layoutFixture();
    const [bars, color, legacy] = layout.frames;
    if (bars === undefined || color === undefined || legacy === undefined)
      throw new Error('Fixture has no frames');
    bars.fallback = { kind: 'bars' };
    color.fallback = { kind: 'color', color: '#2851ab' };
    color.showFallback = false;
    const bytes = await compileControlLiveLayout(layout);
    const { scene } = await unpack(bytes);
    const plate = (id: string) =>
      scene.compositions?.find((item) => item.id === 'layout-frame-' + id)?.layers[0]?.children[0];
    expect(plate(bars.id)).toMatchObject({ fallbackKind: 'bars', showFallback: true });
    expect(plate(color.id)).toMatchObject({
      fallbackKind: 'color',
      fallbackColor: '#2851ab',
      showFallback: false,
    });
    expect(plate(legacy.id)).toMatchObject({ showFallback: false });
    expect(plate(legacy.id)).not.toHaveProperty('fallbackKind');
    const looks = buildTemplateLiveSources(scene).looks ?? [];
    expect(looks.find(({ id }) => id === layout.defaultPresetId)?.fallbacks).toEqual([bars.id]);
    expect(
      looks.find(({ id }) => id === controlLiveLayoutFocusLookId(layout.defaultPresetId, bars.id))
        ?.fallbacks,
    ).toEqual([bars.id]);
    expect(
      looks.find(({ id }) => id === controlLiveLayoutFocusLookId(layout.defaultPresetId, color.id))
        ?.fallbacks,
    ).toBeUndefined();
    const reopened = await readControlLiveLayout(bytes);
    expect(reopened.layout).toEqual(layout);
    expect(reopened.fallbackFiles.size).toBe(0);
  });

  it('keeps distinct fallback image bytes across Save, Edit and Programme delivery', async () => {
    const layout = layoutFixture();
    const [left, right] = layout.frames;
    if (left === undefined || right === undefined) throw new Error('Fixture has no frames');
    const png = new Uint8Array(
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRlkAAAAASUVORK5CYII=',
        'base64',
      ),
    );
    const gif = new Uint8Array(
      Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'),
    );
    left.fallback = { kind: 'image', mime: 'image/png', name: 'fallback-left.png' };
    right.fallback = { kind: 'image', mime: 'image/gif', name: 'fallback-right.gif' };
    right.showFallback = false;
    const imageFiles = new Map([
      [left.id, new Blob([png], { type: 'image/png' })],
      [right.id, new Blob([gif], { type: 'image/gif' })],
    ]);
    const bytes = await compileControlLiveLayout(
      layout,
      undefined,
      undefined,
      undefined,
      imageFiles,
    );
    const reopened = await readControlLiveLayout(bytes);
    expect(reopened.layout).toEqual(layout);
    expect(reopened.fallbackFiles.size).toBe(2);
    expect(reopened.asset).toBeUndefined();
    const { scene, manifest, files } = await unpack(bytes);
    for (const [id, image] of imageFiles) {
      const imageBytes = new Uint8Array(await image.arrayBuffer());
      const sha256 = sha256Hex(imageBytes);
      const asset = manifest.assetIndex.find((item) => item.sha256 === sha256);
      expect(asset).toMatchObject({ kind: 'image', mime: image.type });
      const reopenedImage = reopened.fallbackFiles.get(id)!;
      expect(reopenedImage.type).toEqual(image.type);
      expect(new Uint8Array(await reopenedImage.arrayBuffer())).toEqual(imageBytes);
      expect(files.get(asset!.path)).toEqual(imageBytes);
      const plate = scene.compositions?.find((item) => item.id === 'layout-frame-' + id)?.layers[0]
        ?.children[0];
      expect(plate).toMatchObject({ fallbackKind: 'image', posterAssetId: asset!.id });
    }
    const { template, html } = await produceTemplateDelivery(bytes);
    expect(
      template.liveSources?.looks?.find(({ id }) => id === layout.defaultPresetId)?.fallbacks,
    ).toEqual([left.id]);
    expect(template.controlLiveLayout?.frames[1]?.fallback).toEqual(right.fallback);
    expect(html).toContain('data:image/png;base64,' + Buffer.from(png).toString('base64'));

    const missing = new Map(imageFiles);
    missing.delete(right.id);
    await expect(
      compileControlLiveLayout(layout, undefined, undefined, undefined, missing),
    ).rejects.toThrow('Choose the fallback image');
    missing.set(right.id, new Blob([png], { type: 'image/gif' }));
    await expect(
      compileControlLiveLayout(layout, undefined, undefined, undefined, missing),
    ).rejects.toThrow('does not match its format');

    const badIndex = manifest.assetIndex.map((entry, index) =>
      index === 0 ? { ...entry, sha256: 'f'.repeat(64) } : entry,
    );
    const corrupt = await pack({
      scene,
      manifestExtras: { ...manifest, assetIndex: badIndex },
      assets: new Map([...files].filter(([path]) => path.startsWith('assets/'))),
      indexHtml: '',
      cgJs: '',
      cgCss: '',
    });
    await expect(readControlLiveLayout(corrupt)).rejects.toThrow('The saved fallback image');
  });

  it('delivers independent preset aspect and fit while keeping each plate and linked artwork shared', async () => {
    const layout = layoutFixture();
    const [panel, solo] = layout.presets;
    if (panel === undefined || solo === undefined) throw new Error('Fixture has no presets');
    const plate = layout.frames[1]!;
    panel.plateAspectRatio = 3 / 4;
    panel.plateFitMode = 'cover';
    panel.plateOverrides = {
      'frame-right': { aspectRatio: 4 / 3, fitMode: 'contain' },
    };
    solo.name = 'Single';
    solo.frameIds = [plate.id];
    solo.plateAspectRatio = 16 / 9;
    solo.plateFitMode = 'contain';

    const bytes = await compileControlLiveLayout(layout);
    const { manifest } = await unpack(bytes);
    expect(manifest.compatibility.minRuntimeVersion).toBe('1.2.11');
    expect(runtimeShortfall(manifest.compatibility.minRuntimeVersion, '1.2.8')).not.toBeNull();
    expect((await readControlLiveLayout(bytes)).layout).toEqual(layout);

    const { template } = await produceTemplateDelivery(bytes);
    const carrier = template.liveSources!;
    const active = carrier.looks?.find(({ id }) => id === panel.id);
    const single = carrier.looks?.find(({ id }) => id === solo.id);
    const focusId = controlLiveLayoutFocusLookId(panel.id, plate.id);
    const focused = carrier.looks?.find(({ id }) => id === focusId);
    const aspectOf = (rect: { width: number; height: number } | undefined) =>
      rect === undefined ? undefined : rect.width / rect.height;
    expect(aspectOf(active?.rects[plate.id])).toBeCloseTo(3 / 4);
    expect(aspectOf(active?.rects['frame-right'])).toBeCloseTo(4 / 3);
    expect(aspectOf(single?.rects[plate.id])).toBeCloseTo(16 / 9);
    expect(focused?.rects[plate.id]).toEqual({ ...layout.resolution, x: 0, y: 0 });
    expect(lookPlateFits(carrier, panel.id)).toEqual({
      'frame-anchor': 'cover',
      'frame-left': 'cover',
      'frame-right': 'contain',
    });
    expect(lookPlateFits(carrier, solo.id)).toEqual({ [plate.id]: 'contain' });
    expect(lookPlateFits(carrier, focusId)).toEqual({ [plate.id]: 'contain' });

    const artwork = active?.transitionFrames?.[plate.id];
    expect(artwork).toMatchObject({
      artworkId: 'layout-frame-' + plate.id,
      elementId: plate.id + '-plate',
    });
    expect(single?.transitionFrames?.[plate.id]).toMatchObject({
      artworkId: artwork?.artworkId,
      elementId: artwork?.elementId,
    });
    expect(focused?.transitionFrames?.[plate.id]).toMatchObject({
      artworkId: artwork?.artworkId,
      elementId: artwork?.elementId,
    });
    expect(carrier.sources.filter(({ sourceId }) => sourceId === plate.id)).toHaveLength(1);
    expect(template.sharedFrameTitles).toContainEqual(
      expect.arrayContaining([
        [panel.id, plate.id, 'title'],
        [solo.id, plate.id, 'title'],
      ]),
    );
  });

  it('carries preset crop defaults and plate overrides to the placed image and keeps Focus centered', async () => {
    const layout = layoutFixture();
    const [panel, pair] = layout.presets;
    if (panel === undefined || pair === undefined) throw new Error('Fixture has no presets');
    const sharedCrop = { x: 0.25, y: 0.65, zoom: 1.5 };
    const individualCrop = { x: 0.85, y: 0.75, zoom: 2 };
    layout.frames[1]!.operatorCrop = false;
    layout.frames[2]!.operatorCrop = true;
    panel.plateFitMode = 'cover';
    panel.plateCropFocus = sharedCrop;
    panel.plateOverrides = { 'frame-left': { cropFocus: individualCrop } };
    pair.plateFitMode = 'contain';
    pair.plateCropFocus = sharedCrop;
    pair.plateOverrides = { 'frame-right': { fitMode: 'cover' } };
    layout.frames[2]!.liveMask = {
      mode: 'inside',
      rects: [{ x: 0.1, y: 0.1, width: 0.8, height: 0.8 }],
    };

    const bytes = await compileControlLiveLayout(layout);
    expect((await readControlLiveLayout(bytes)).layout).toEqual(layout);
    const { scene, manifest } = await unpack(bytes);
    expect(manifest.compatibility.minRuntimeVersion).toBe('1.2.11');
    expect(
      scene.lookGroups?.[0]?.looks.find(({ id }) => id === panel.id)?.plateCropFocuses,
    ).toEqual({ 'frame-anchor': sharedCrop, 'frame-left': individualCrop });
    const { template } = await produceTemplateDelivery(bytes);
    const carrier = template.liveSources!;
    expect(lookPlateFocuses(carrier, panel.id)).toEqual({
      'frame-anchor': sharedCrop,
      'frame-left': individualCrop,
    });
    expect(lookPlateFocuses(carrier, pair.id)).toEqual({});
    const focus = controlLiveLayoutFocusLookId(panel.id, 'frame-left');
    expect(lookOperatorCropAllowed(carrier, panel.id, 'frame-left')).toBe(false);
    expect(lookOperatorCropAllowed(carrier, pair.id, 'frame-left')).toBe(false);
    expect(lookOperatorCropAllowed(carrier, focus, 'frame-left')).toBe(false);
    expect(lookOperatorCropAllowed(carrier, panel.id, 'frame-anchor')).toBe(true);
    expect(lookOperatorCropAllowed(carrier, panel.id, 'frame-right')).toBe(true);
    expect(lookPlateFocuses(carrier, controlLiveLayoutFocusLookId(panel.id, 'frame-left'))).toEqual(
      {},
    );
  });

  it('ships a saved plate border in the shared artwork used by presets and Focus', async () => {
    const layout = layoutFixture();
    const plate = layout.frames[1]!;
    const border = { color: '#fec352', width: 18, radius: 36 };
    plate.border = border;
    const [panel, pair] = layout.presets;
    if (panel === undefined || pair === undefined) throw new Error('Fixture has no presets');
    panel.hiddenBorders = [plate.id];
    pair.frameIds = [plate.id];
    pair.hiddenFocusBorders = [plate.id];
    const bytes = await compileControlLiveLayout(layout);
    const reopened = await readControlLiveLayout(bytes);
    expect(reopened.layout.frames[1]?.border).toEqual({ color: border.color, width: border.width });
    const { scene } = await unpack(bytes);
    const artwork = scene.compositions?.find(({ id }) => id === 'layout-frame-' + plate.id);
    expect(
      artwork?.layers[0]?.children.find(({ id }) => id === plate.id + '-border'),
    ).toMatchObject({
      type: 'shape',
      stroke: { color: border.color, width: border.width },
      liveForeground: true,
    });
    expect(
      artwork?.layers[0]?.children.find(({ id }) => id === plate.id + '-border'),
    ).not.toHaveProperty('cornerRadius');
    const looks = buildTemplateLiveSources(scene).looks ?? [];
    const art = looks.find(({ id }) => id === layout.defaultPresetId)?.transitionFrames?.[plate.id]
      ?.artworkId;
    expect(art).toEqual(expect.any(String));
    const focus = looks.find(
      ({ id }) => id === controlLiveLayoutFocusLookId(layout.defaultPresetId, plate.id),
    );
    expect(focus?.transitionFrames?.[plate.id]?.artworkId).toBe(art);
    const borderIn = (id: string) =>
      flattenElements(scene).find(
        ({ key, element }) =>
          key.startsWith('layout-look-' + id + '/') && element.id === plate.id + '-border',
      );
    expect(borderIn(panel.id)).toBeUndefined();
    expect(borderIn(controlLiveLayoutFocusLookId(panel.id, plate.id))).toBeDefined();
    expect(borderIn(pair.id)).toBeDefined();
    expect(borderIn(controlLiveLayoutFocusLookId(pair.id, plate.id))).toBeUndefined();
    expect(reopened.layout.presets[0]?.hiddenBorders).toEqual([plate.id]);
    expect(reopened.layout.presets[1]?.hiddenFocusBorders).toEqual([plate.id]);
  });

  it('packages ordered preset graphics and one masked input without duplicating the native seat', async () => {
    const layout = layoutFixture();
    const scene = buildControlLiveLayoutScene(layout);
    const masked: LivePlateMask = {
      mode: 'inside',
      rects: [{ x: 0.1, y: 0.7, width: 0.8, height: 0.25 }],
    };
    const {
      lookGroups: _looks,
      controlLiveLayout: _layout,
      compositions: _comps,
      ...graphic
    } = scene;
    const shape = scene.layers[0]!.children[0]!;
    const plate = flattenElements(scene).find(
      ({ element }) => element.type === 'video-placeholder',
    )?.element;
    if (plate?.type !== 'video-placeholder') throw new Error('Fixture has no plate');
    const asAttachment = async (name: string, withInput: boolean) =>
      unpackControlLiveLayoutFrameAttachment(
        await pack({
          scene: {
            ...graphic,
            name,
            layers: [
              {
                ...scene.layers[0]!,
                children: withInput ? [shape, { ...plate, liveMask: masked }] : [shape],
              },
            ],
          },
          manifestExtras: {
            id: graphic.id,
            name,
            authoring: {
              designerVersion: '1.2.6',
              createdAt: graphic.metadata.createdAt,
              exportedAt: graphic.metadata.updatedAt,
            },
            compatibility: { minRuntimeVersion: '1.2.6', minCasparCGVersion: '2.3.0' },
            fontDeps: [],
            assetIndex: [],
          },
          indexHtml: '<script>throw Error("foreign page")</script>',
          cgJs: '',
          cgCss: '',
        }),
      );
    const logo = await asAttachment('Logo', false);
    const strip = await asAttachment('Subtitle strip', true);
    const [wide, pair] = layout.presets;
    if (wide === undefined || pair === undefined) throw new Error('Fixture has no presets');
    const rect = { x: 0.15, y: 0.15, width: 0.7, height: 0.7 };
    wide.frameAttachments = [
      { id: 'strip', name: strip.name, frameId: 'frame-left', sourceId: strip.id, rect },
      { id: 'logo', name: logo.name, frameId: 'frame-left', sourceId: logo.id, rect },
    ];
    const sources = new Map([
      [logo.id, logo],
      [strip.id, strip],
    ]);
    const bytes = await compileControlLiveLayout(layout, undefined, undefined, sources);
    const { scene: saved, manifest, files } = await unpack(bytes);
    expect(manifest.compatibility.minRuntimeVersion).toBe('1.2.7');
    expect(new TextDecoder().decode(files.get('index.html'))).not.toContain('foreign page');
    const reopened = await readControlLiveLayout(bytes);
    expect(reopened.layout.presets[0]?.frameAttachments).toEqual(wide.frameAttachments);
    expect([...reopened.attachments.keys()]).toEqual([strip.id, logo.id]);
    const carrier = buildTemplateLiveSources(saved);
    const normal = carrier.looks?.find(({ id }) => id === wide.id);
    const other = carrier.looks?.find(({ id }) => id === pair.id);
    const solo = carrier.looks?.find(
      ({ id }) => id === controlLiveLayoutFocusLookId(wide.id, 'frame-left'),
    );
    expect(normal?.masks?.['frame-left']).toEqual(masked);
    expect(solo?.masks?.['frame-left']).toEqual(masked);
    expect(other?.masks?.['frame-left']).toBeUndefined();
    expect(normal?.transitionFrames?.['frame-left']?.artworkId).toBe(
      other?.transitionFrames?.['frame-left']?.artworkId,
    );
    const templatesIn = (presetId: string) =>
      flattenElements(saved).filter(
        ({ key, element }) =>
          key.startsWith(`layout-look-${presetId}/instance-frame-left/attachment-art-`) &&
          element.type === 'composition',
      );
    expect(templatesIn(wide.id).map(({ element }) => element.id)).toEqual([
      'attachment-art-strip',
      'attachment-art-logo',
    ]);
    expect(templatesIn(pair.id)).toHaveLength(0);

    const clone = { ...wide.frameAttachments[0]!, id: 'strip-clone' };
    const shared = promoteFrameAttachments(
      { ...reopened.layout, presets: [wide, { ...pair, frameAttachments: [clone] }] },
      'frame-left',
      reopened.attachments,
      clone.id,
    );
    expect(shared.frameAttachments?.map(({ id }) => id)).toEqual(['strip-clone', 'logo']);
    expect(shared.presets.every(({ frameAttachments }) => frameAttachments === undefined)).toBe(
      true,
    );
    const globalBytes = await compileControlLiveLayout(shared, undefined, undefined, sources);
    const global = await readControlLiveLayout(globalBytes);
    expect(global.layout.frameAttachments).toEqual(shared.frameAttachments);
    expect([...global.attachments.keys()]).toEqual([strip.id, logo.id]);
    const { scene: globalScene, manifest: globalManifest } = await unpack(globalBytes);
    expect(globalManifest.compatibility.minRuntimeVersion).toBe('1.2.8');
    const globalCarrier = buildTemplateLiveSources(globalScene);
    const leaves = flattenElements(globalScene);
    const showingFrame = [
      wide.id,
      pair.id,
      controlLiveLayoutFocusLookId(wide.id, 'frame-left'),
      controlLiveLayoutFocusLookId(pair.id, 'frame-left'),
    ];
    for (const id of showingFrame) {
      const look = globalCarrier.looks?.find((entry) => entry.id === id);
      expect(look?.masks?.['frame-left']).toEqual(masked);
      expect(look?.transitionFrames?.['frame-left']?.artworkId).toBe(
        normal?.transitionFrames?.['frame-left']?.artworkId,
      );
      expect(
        leaves
          .filter(
            ({ key, element }) =>
              key.startsWith('layout-look-' + id + '/instance-frame-left/attachment-art-') &&
              element.type === 'composition',
          )
          .map(({ element }) => element.id),
      ).toEqual(['attachment-art-strip-clone', 'attachment-art-logo']);
    }

    const conflict = {
      ...reopened.layout,
      presets: [wide, { ...pair, frameAttachments: [{ ...clone, rect: { ...rect, x: 0.25 } }] }],
    };
    expect(promoteFrameAttachments(conflict, 'frame-left', sources)).toBe(conflict);
    const conflictCarrier = buildTemplateLiveSources(
      buildControlLiveLayoutScene(conflict, sources),
    );
    const conflictNormal = conflictCarrier.looks?.find(({ id }) => id === wide.id);
    const conflictOther = conflictCarrier.looks?.find(({ id }) => id === pair.id);
    expect(conflictNormal?.masks?.['frame-left']).toEqual(masked);
    expect(conflictOther?.masks?.['frame-left']).toEqual(masked);
    expect(conflictNormal?.rects['frame-left']?.x).not.toBe(conflictOther?.rects['frame-left']?.x);
  });

  it('authors the new caption and frame settings without reinterpreting legacy layouts', () => {
    const layout = createControlLiveLayout();
    expect(
      layout.frames.map(({ operatorMove, operatorPlacement }) => [operatorMove, operatorPlacement]),
    ).toEqual([
      [false, 'locked'],
      [false, 'locked'],
    ]);
    expect(controlLiveLayoutTitleGeometry(layout.resolution, layout.titleStyle)).toMatchObject({
      xPercent: 0,
      yPercent: 100,
      widthPercent: 100,
      heightPercent: 12,
      padding: 0,
      textOffsetY: 0,
      sizePercent: 4.5,
      borderRadius: 0,
      fontFamily: 'Exo 2',
      fontWeight: 700,
      fontStyle: 'normal',
      align: 'center',
      verticalAlign: 'middle',
      color: '#FFFFFF',
      backgroundColor: '#00000099',
      wrap: true,
    });
    expect(controlLiveLayoutTitleGeometry(layout.resolution)).toMatchObject({
      widthPercent: 66,
      fontFamily: 'Vazirmatn',
    });
  });
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

  it.each([
    { presetHidden: false, focusHidden: false },
    { presetHidden: false, focusHidden: true },
    { presetHidden: true, focusHidden: false },
  ])(
    'respects preset and Focus title visibility independently: $presetHidden / $focusHidden',
    ({ presetHidden, focusHidden }) => {
      const base = layoutFixture();
      const firstPreset = base.presets[0];
      if (firstPreset === undefined) throw new Error('Missing preset fixture');
      const frameId = 'frame-left';
      const multi = {
        ...firstPreset,
        hiddenTitles: presetHidden ? [frameId] : [],
        hiddenFocusTitles: focusHidden ? [frameId] : [],
      };
      const single = { ...multi, id: 'preset-solo', name: 'Solo', frameIds: [frameId] };
      const scene = buildControlLiveLayoutScene({
        ...base,
        frames: base.frames.map((frame) =>
          frame.id === frameId
            ? { ...frame, additionalTexts: [{ id: 'position', text: 'Presenter' }] }
            : frame,
        ),
        presets: [multi, single],
      });
      const captions = ['frame-left-title', 'layout-text:frame-left:position'];
      const hiddenIn = (lookId: string) => {
        const frame = scene.compositions
          ?.find(({ id }) => id === `layout-look-${lookId}-contents`)
          ?.layers[0]?.children.find(({ id }) => id === `instance-${frameId}`);
        if (frame?.type !== 'composition') throw new Error('Missing frame instance');
        return frame.hiddenTextIds;
      };
      expect(hiddenIn(multi.id)).toEqual(presetHidden ? captions : undefined);
      expect(hiddenIn(single.id)).toEqual(presetHidden || focusHidden ? captions : undefined);
      expect(hiddenIn(controlLiveLayoutFocusLookId(multi.id, frameId))).toEqual(
        focusHidden ? captions : undefined,
      );
    },
  );

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
      additionalTextStyles: [{ sizePercent: 7, yPercent: 67 }],
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
    const texts = controlLiveLayoutFrameTexts(left, layout);
    expect(texts.map(({ fieldId }) => fieldId)).toEqual(['title', 'text-role', 'text-location']);
    expect(texts[1]?.style).toMatchObject({ sizePercent: 7, yPercent: 10 });
    const right = layout.frames.find(({ id }) => id === 'frame-right')!;
    expect(controlLiveLayoutFrameTexts(right, layout).map(({ style }) => style)).toMatchObject([
      { sizePercent: 7, yPercent: 67 },
    ]);
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

  it('keeps the space around named and focused frames transparent without packaging an asset', async () => {
    const layout: ControlLiveLayout = { ...layoutFixture(), background: { kind: 'none' } };
    const previousMedia = new Blob([new Uint8Array([12, 34, 56])], { type: 'image/png' });
    const bytes = await compileControlLiveLayout(layout, previousMedia);
    const { scene, manifest } = await unpack(bytes);
    expect(scene.layers.map(({ id }) => id)).toEqual(['layout-presets']);
    expect(scene.editorBackdrop).toBe('transparent');
    expect(manifest.compatibility.minRuntimeVersion).toBe('1.2.8');
    expect(manifest.assetIndex).toEqual([]);
    expect(await readControlLiveLayout(bytes)).toEqual({
      layout,
      fonts: new Map(),
      attachments: new Map(),
      fallbackFiles: new Map(),
    });

    const { html, template } = await produceTemplateDelivery(bytes);
    expect(html).not.toContain('layout-background');
    expect(html).toContain('background:transparent');
    expect(template.liveSources?.looks?.map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        layout.defaultPresetId,
        'preset-pair',
        controlLiveLayoutFocusLookId(layout.defaultPresetId, 'frame-left'),
      ]),
    );
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
