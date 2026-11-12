import { describe, expect, it } from 'vitest';
import {
  calculateLiveSourceAutoLayout as calculateLayout,
  flattenElements,
  liveSourceRowCounts,
  sceneRect,
  type CompositionElement,
  type Layer,
  type LiveSourceLayoutBias,
  type LiveSourceLayoutItem,
  type LiveSourceLayoutOptions,
  type Resolution,
  type Scene,
  type VideoPlaceholderElement,
} from '@cg/shared-schema';
import {
  defaultAudio,
  defaultLiveSource,
  defaultShape,
  defaultText,
} from '../src/renderer/state/element-defaults.js';
import {
  autoLayoutTargets,
  autoLayoutTransform,
  plateLayoutSource,
} from '../src/renderer/features/inspector/live-source-auto-layout.js';

function calculateLiveSourceAutoLayout(
  elements: readonly VideoPlaceholderElement[],
  resolution: Resolution,
  bias: LiveSourceLayoutBias,
  options?: LiveSourceLayoutOptions,
): readonly LiveSourceLayoutItem[] {
  return calculateLayout(
    elements.map((element) => plateLayoutSource(element, element.transform)),
    resolution,
    bias,
    options,
  );
}

describe('Live Source auto layout (B-360)', () => {
  it('chooses balanced rows and lets the fuller row sit at either edge', () => {
    expect(liveSourceRowCounts(2, 'more-top')).toEqual([2]);
    expect(liveSourceRowCounts(3, 'more-top')).toEqual([2, 1]);
    expect(liveSourceRowCounts(3, 'more-bottom')).toEqual([1, 2]);
    expect(liveSourceRowCounts(5, 'more-top')).toEqual([3, 2]);
    expect(liveSourceRowCounts(8, 'more-bottom')).toEqual([2, 3, 3]);
    expect(liveSourceRowCounts(2, 'more-top', 'vertical')).toEqual([1, 1]);
  });

  it('places a 2+1 layout symmetrically with exact equal gaps and preserved aspect', () => {
    const elements = [
      defaultLiveSource('a', 1, 2),
      defaultLiveSource('b', 3, 4),
      defaultLiveSource('c', 5, 6),
    ];
    const [a, b, c] = calculateLiveSourceAutoLayout(
      elements,
      { width: 1920, height: 1080 },
      'more-top',
    );
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(c).toBeDefined();
    expect(a!.y).toBeCloseTo(b!.y);
    expect(c!.y).toBeGreaterThan(a!.y);
    expect(b!.x - (a!.x + a!.width)).toBeCloseTo(c!.y - (a!.y + a!.height));
    expect(a!.x).toBeCloseTo(1920 - (b!.x + b!.width));
    expect(c!.x).toBeCloseTo((1920 - c!.width) / 2);
    for (const item of [a!, b!, c!]) {
      expect(item.width / item.height).toBeCloseTo(16 / 9);
    }
  });

  it('uses one row for three portrait plates when that fills a 16:9 canvas better', () => {
    const elements = ['a', 'b', 'c'].map((id) => ({
      ...defaultLiveSource(id, 0, 0),
      expectedAspect: 9 / 16,
    }));
    const result = calculateLiveSourceAutoLayout(
      elements,
      { width: 1920, height: 1080 },
      'more-top',
    );
    expect(result).toHaveLength(3);
    expect(result[1]!.y).toBeCloseTo(result[0]!.y);
    expect(result[2]!.y).toBeCloseTo(result[0]!.y);
    expect(result[1]!.x).toBeGreaterThan(result[0]!.x + result[0]!.width);
    expect(result[2]!.x).toBeGreaterThan(result[1]!.x + result[1]!.width);
    expect(result[0]!.height).toBeGreaterThan(900);
  });

  it('keeps one common height and exact gaps when declared aspects differ', () => {
    const square = { ...defaultLiveSource('square', 0, 0), expectedAspect: 1 };
    const wide = { ...defaultLiveSource('wide', 0, 0), expectedAspect: 2 };
    const [a, b] = calculateLiveSourceAutoLayout(
      [square, wide],
      { width: 1200, height: 800 },
      'more-top',
    );
    expect(a!.height).toBeCloseTo(b!.height);
    expect(a!.width / a!.height).toBeCloseTo(1);
    expect(b!.width / b!.height).toBeCloseTo(2);
    expect(b!.x - (a!.x + a!.width)).toBeCloseTo(20);
    expect(a!.x).toBeCloseTo(1200 - (b!.x + b!.width));
  });

  it('uses independent horizontal/vertical gaps and can stack two plates', () => {
    const elements = [defaultLiveSource('a', 0, 0), defaultLiveSource('b', 0, 0)];
    const [top, bottom] = calculateLiveSourceAutoLayout(
      elements,
      { width: 1920, height: 1080 },
      'more-top',
      { twoPlateLayout: 'vertical', horizontalGap: 80, verticalGap: 140 },
    );
    expect(top!.x).toBeCloseTo(bottom!.x);
    expect(bottom!.y - (top!.y + top!.height)).toBeCloseTo(140);
    expect(top!.y).toBeCloseTo(1080 - (bottom!.y + bottom!.height));
  });

  it('swaps mixed-aspect seats without changing layer order', () => {
    const portrait = { ...defaultLiveSource('portrait', 0, 0), expectedAspect: 3 / 4 };
    const wide = { ...defaultLiveSource('wide', 0, 0), expectedAspect: 16 / 9 };
    const normal = calculateLiveSourceAutoLayout(
      [portrait, wide],
      { width: 1920, height: 1080 },
      'more-top',
      { horizontalGap: 60 },
    );
    const swapped = calculateLiveSourceAutoLayout(
      [portrait, wide],
      { width: 1920, height: 1080 },
      'more-top',
      { horizontalGap: 60, reverse: true },
    );
    expect(normal.map((item) => item.id)).toEqual(['portrait', 'wide']);
    expect(swapped.map((item) => item.id)).toEqual(['wide', 'portrait']);
    expect(normal[1]!.x - (normal[0]!.x + normal[0]!.width)).toBeCloseTo(60);
    expect(swapped[1]!.x - (swapped[0]!.x + swapped[0]!.width)).toBeCloseTo(60);
  });
});

describe('mixed Designer Auto layout', () => {
  const resolution = { width: 1920, height: 1080 };
  const frameRange = { in: 0, out: 50 };

  function layer(id: string, children: Layer['children']): Layer {
    return { id, name: id, children, visible: true, locked: false, blendMode: 'normal' };
  }

  function preset(children: Layer['children'], compositions: Scene['compositions'] = []): Scene {
    return {
      schemaVersion: 1,
      id: 'preset',
      name: 'Preset',
      templateType: 'custom',
      resolution,
      frameRate: 25,
      safeAreas: { title: 10, action: 5 },
      frameRange,
      editorBackdrop: 'transparent',
      metadata: { createdAt: '2026-11-12T00:00:00.000Z', updatedAt: '2026-11-12T00:00:00.000Z' },
      layers: [layer('preset-layer', children)],
      fields: [],
      bindings: [],
      fonts: [],
      compositions,
    };
  }

  it('fits an offset plate through a scaled, anchored composition instance', () => {
    const plate = defaultLiveSource('plate', 80, 120);
    const child = {
      id: 'child',
      name: 'Titled frame',
      resolution,
      frameRange,
      editorBackdrop: 'transparent',
      layers: [layer('child-layer', [plate])],
    };
    const rectangle = defaultShape('rectangle', 210, 75);
    const instance: CompositionElement = {
      ...rectangle,
      id: 'instance',
      type: 'composition',
      compositionId: child.id,
      transform: {
        ...rectangle.transform,
        anchor: { x: 0.5, y: 0.3 },
        size: { w: 1440, h: 810 },
        scale: { x: 0.8, y: 0.6 },
      },
    };
    const audio = defaultAudio('audio', 'audio-asset', 2000);
    const locked = { ...defaultShape('locked', 60, 60), locked: true };
    const children = [rectangle, instance, audio, locked];
    const scene = preset(children, [child]);
    const targets = autoLayoutTargets(scene, children, ({ transform }) => transform);
    expect(targets.map(({ id }) => id)).toEqual(['rectangle', 'instance']);
    const target = targets.find(({ id }) => id === 'instance')!;
    const slot = calculateLayout(targets, resolution, 'more-top').find(
      ({ id }) => id === 'instance',
    )!;
    const adjusted = {
      ...instance,
      transform: { ...instance.transform, ...autoLayoutTransform(target, slot) },
    };
    const [flattenedPlate] = flattenElements({
      ...scene,
      layers: [layer('preset-layer', [adjusted])],
    }).filter(({ element }) => element.id === plate.id);
    expect(flattenedPlate?.rect.x).toBeCloseTo(slot.x);
    expect(flattenedPlate?.rect.y).toBeCloseTo(slot.y);
    expect(flattenedPlate?.rect.width).toBeCloseTo(slot.width);
    expect(flattenedPlate?.rect.height).toBeCloseTo(slot.height);
  });

  it('keeps the right-edge pin and rotation of an auto-sized RTL title', () => {
    const original = defaultText('title', 600, 240);
    const title = {
      ...original,
      text: 'عنوان فارسی',
      direction: 'rtl' as const,
      fitMode: 'autosize' as const,
      transform: { ...original.transform, size: { w: 155, h: 46 }, rotation: 25 },
    };
    const rectangle = defaultShape('rectangle', 80, 60);
    const children = [title, rectangle];
    const targets = autoLayoutTargets(preset(children), children, ({ transform }) => transform);
    const target = targets[0]!;
    const slot = calculateLayout(targets, resolution, 'more-top')[0]!;
    const transform = { ...title.transform, ...autoLayoutTransform(target, slot) };
    const bounds = sceneRect(
      {
        ...title,
        transform: {
          ...transform,
          position: { x: transform.position.x - transform.size.w, y: transform.position.y },
        },
      },
      [],
    );
    expect(transform.rotation).toBe(25);
    expect(bounds.x).toBeCloseTo(slot.x);
    expect(bounds.y).toBeCloseTo(slot.y);
    expect(bounds.width).toBeCloseTo(slot.width);
    expect(bounds.height).toBeCloseTo(slot.height);
  });
});
