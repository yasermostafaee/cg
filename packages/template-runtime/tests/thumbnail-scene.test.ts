import { describe, expect, it } from 'vitest';
import {
  CUT_LOOK_TRANSITION,
  SequenceElementSchema,
  type Composition,
  type Element,
  type Scene,
} from '@cg/shared-schema';
import { buildThumbnailScene } from '../src/thumbnail-scene.js';
import { lowerThirdScene } from './fixtures.js';

const main = lowerThirdScene.layers[0]!;
const element = {
  transform: main.children[0]!.transform,
  opacity: 1,
  visible: true,
  locked: false,
  zIndex: 0,
};

function plate(id: string): Element {
  return {
    ...element,
    id,
    name: id,
    type: 'video-placeholder',
    routeKey: id,
    fallbackKind: 'color',
    fallbackColor: '#E33261',
    showFallback: false,
  };
}

function preset(id: string, plates: Element[]): Composition {
  return {
    id,
    name: id,
    resolution: lowerThirdScene.resolution,
    frameRange: lowerThirdScene.frameRange,
    editorBackdrop: '#FFFFFF',
    layers: [{ ...main, children: plates }],
  };
}

describe('representative thumbnail scene', () => {
  it('keeps shared artwork and the last preset tied for the most visible plates', () => {
    const compositions = [
      preset('one', [plate('p1')]),
      preset('two', [plate('p2'), plate('p3')]),
      preset('last', [plate('p4'), plate('p5')]),
      preset('hidden', [
        plate('p6'),
        { ...plate('p7'), visible: false },
        { ...plate('p8'), visible: false },
      ]),
    ];
    const looks = compositions.map(({ id }) => ({
      id,
      name: id,
      instanceId: `instance-${id}`,
      entered: CUT_LOOK_TRANSITION,
    }));
    const instances = looks.map(
      ({ id, instanceId }): Element => ({
        ...element,
        id: instanceId,
        name: id,
        type: 'composition',
        compositionId: id,
      }),
    );
    const scene: Scene = {
      ...lowerThirdScene,
      layers: [{ ...main, children: [...main.children, ...instances] }],
      compositions,
      lookGroups: [{ id: 'group', looks, defaultLookId: 'one' }],
    };
    const artwork = buildThumbnailScene(scene, document);
    const node = (id: string) => artwork.querySelector<HTMLElement>(`[data-cg-element-id="${id}"]`);
    expect(node('name')?.textContent).toBe('سارا نادری');
    expect(node('instance-one')?.style.display).toBe('none');
    expect(node('instance-two')?.style.display).toBe('none');
    expect(node('instance-hidden')?.style.display).toBe('none');
    expect(node('instance-last')?.style.display).toBe('');
    expect(
      node('p4')?.querySelector<HTMLElement>('[data-cg-live-fallback]')?.style.background,
    ).toBe('#E33261');
    expect(artwork.querySelector('[data-cg-live-source-label]')).toBeNull();
    expect(artwork.style.background).toBe('');
  });

  it('uses a picture page after text and identifies an empty operator book', () => {
    const sequence = SequenceElementSchema.parse({
      ...element,
      id: 'book',
      name: 'Book',
      type: 'sequence',
      font: {
        family: 'Vazirmatn',
        weight: 500,
        style: 'normal',
        size: 36,
        lineHeight: 1.4,
        letterSpacing: 0,
      },
      color: '#FFFFFF',
      align: 'center',
      direction: 'ltr',
      items: [
        { id: 'text', text: 'Opening text' },
        { id: 'cover', kind: 'image', assetId: 'cover-png' },
      ],
    });
    const empty = { ...sequence, id: 'empty', items: [] };
    const scene: Scene = {
      ...lowerThirdScene,
      layers: [{ ...main, children: [sequence, empty] }],
      fields: [
        { id: 'pages', type: 'list', pages: true, label: 'Pages', required: false, default: [] },
      ],
      bindings: [{ fieldId: 'pages', target: { kind: 'sequence-items', elementId: empty.id } }],
    };
    const artwork = buildThumbnailScene(scene, document);
    expect(
      artwork
        .querySelector('[data-cg-sequence-page="cover"] img')
        ?.getAttribute('data-cg-asset-id'),
    ).toBe('cover-png');
    expect(artwork.querySelector('[data-cg-element-id="empty"]')?.textContent).toBe(
      'Image sequence',
    );
  });
});
