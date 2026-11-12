import { beforeEach, describe, expect, it } from 'vitest';
import { withCgControl } from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';
import { lowerThirdScene } from './fixtures.js';

describe('D-201 — synchronized live-input foreground pass', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.body.className = '';
  });

  const markedScene = () => {
    const scene = structuredClone(lowerThirdScene);
    const title = scene.layers[0]?.children.find((element) => element.id === 'name');
    if (title === undefined) throw new Error('fixture drift');
    title.liveForeground = true;
    return scene;
  };

  it('background output removes the marked title and keeps ordinary furniture', () => {
    createRuntime(markedScene(), {
      mode: 'output',
      outputPass: 'background',
      skipFontLoad: true,
      installGlobals: false,
    });

    expect(document.querySelector('[data-cg-element-id="name"]')).toBeNull();
    expect(document.querySelector('[data-cg-element-id="bg"]')).not.toBeNull();
  });

  it('foreground output keeps the marked title and removes ordinary furniture', () => {
    createRuntime(markedScene(), {
      mode: 'output',
      outputPass: 'foreground',
      skipFontLoad: true,
      installGlobals: false,
    });

    expect(document.querySelector('[data-cg-element-id="name"]')).not.toBeNull();
    expect(document.querySelector('[data-cg-element-id="bg"]')).toBeNull();
  });

  it('full output preserves the historical single-page render', () => {
    createRuntime(markedScene(), {
      mode: 'output',
      outputPass: 'full',
      skipFontLoad: true,
      installGlobals: false,
    });

    expect(document.querySelector('[data-cg-element-id="name"]')).not.toBeNull();
    expect(document.querySelector('[data-cg-element-id="bg"]')).not.toBeNull();
  });

  it('promotes overlapping text and shapes above a live plate by default', () => {
    const scene = structuredClone(lowerThirdScene);
    const children = scene.layers[0]!.children;
    const title = children.find((element) => element.id === 'name')!;
    const shape = children.find((element) => element.id === 'bg')!;
    if (title.type !== 'text' || shape.type !== 'shape') throw new Error('fixture drift');
    shape.zIndex = -3;
    children.push(
      { ...title, id: 'below', zIndex: -2 },
      {
        id: 'plate',
        name: 'Plate',
        type: 'video-placeholder',
        routeKey: 'guest',
        zIndex: -1,
        visible: true,
        locked: false,
        opacity: 1,
        transform: title.transform,
      },
      { ...title, id: 'behind', liveForeground: false },
      { ...shape, id: 'circle', shape: 'ellipse', zIndex: 2, transform: title.transform },
      {
        ...title,
        id: 'away',
        transform: { ...title.transform, position: { x: 2000, y: 0 } },
      },
    );
    createRuntime(scene, {
      mode: 'output',
      outputPass: 'foreground',
      skipFontLoad: true,
      installGlobals: false,
    });
    expect(
      [...document.querySelectorAll<HTMLElement>('[data-cg-element-id]')].map(
        (node) => node.dataset['cgElementId'],
      ),
    ).toEqual(['name', 'circle']);
  });

  it('moves a move-only frame and its bound title as one artwork without resizing either', async () => {
    const scene = markedScene();
    const layer = scene.layers[0];
    const title = layer?.children.find((element) => element.id === 'name');
    if (layer === undefined || title?.type !== 'text') throw new Error('fixture drift');
    scene.compositions = [
      {
        id: 'frame-doc',
        name: 'Live frame',
        resolution: scene.resolution,
        frameRange: scene.frameRange,
        editorBackdrop: 'transparent',
        fields: scene.fields,
        bindings: scene.bindings,
        layers: [
          {
            ...layer,
            id: 'frame-layer',
            children: [
              {
                id: 'plate',
                name: 'Live input',
                type: 'video-placeholder',
                routeKey: 'guest',
                operatorMove: true,
                transform: title.transform,
                opacity: 1,
                visible: true,
                locked: false,
                zIndex: 0,
              },
              { ...title, padding: 12, backgroundColor: '#133358', zIndex: 1 },
            ],
          },
        ],
      },
    ];
    layer.children = [
      {
        id: 'box',
        name: 'box',
        type: 'composition',
        compositionId: 'frame-doc',
        transform: {
          ...title.transform,
          position: { x: 0, y: 0 },
          size: { w: scene.resolution.width, h: scene.resolution.height },
        },
        opacity: 1,
        visible: true,
        locked: false,
        zIndex: 0,
      },
    ];
    scene.fields = [];
    scene.bindings = [];
    const runtime = createRuntime(scene, { skipFontLoad: true, installGlobals: false });
    const artwork = document.querySelector<HTMLElement>('[data-cg-frame-artwork="box"]');
    const plate = artwork?.querySelector<HTMLElement>('[data-cg-element-id="plate"]');
    const caption = artwork?.querySelector<HTMLElement>('[data-cg-element-id="name"]');
    if (artwork === null || plate == null || caption == null)
      throw new Error('missing frame artwork');
    expect(plate.style.width).toBe('760px');
    expect(caption.style.paddingLeft).toBe('12px');
    const background = caption.style.backgroundColor;
    expect(background).not.toBe('');

    await runtime.update(
      withCgControl(
        { box: { anchor: 'خبر تهران' } },
        {
          framePlacements: [
            { frameKey: 'box/plate', rect: { x: 210, y: 855, width: 760, height: 60 } },
          ],
        },
      ),
    );
    expect(artwork.style.transform).toBe('matrix(1,0,0,1,90,35)');
    expect(plate.style.width).toBe('760px');
    expect(caption.style.paddingLeft).toBe('12px');
    expect(caption.style.backgroundColor).toBe(background);
    expect(caption.textContent).toContain('خبر تهران');
  });

  it.each([true, false])(
    'uses the full plate for foreground ordering with mask editing %s',
    (allowed) => {
      const scene = structuredClone(lowerThirdScene);
      const children = scene.layers[0]?.children;
      const title = children?.find((element) => element.id === 'name');
      if (children === undefined || title?.type !== 'text') throw new Error('Missing test title');
      children.push({
        id: 'plate',
        name: 'Plate',
        type: 'video-placeholder',
        routeKey: 'guest',
        zIndex: title.zIndex - 1,
        visible: true,
        locked: false,
        opacity: 1,
        transform: structuredClone(title.transform),
        allowOperatorMaskEdit: allowed,
        liveMask: { mode: 'inside', rects: [{ x: 0, y: 0, width: 0.25, height: 1 }] },
      });
      title.transform.position.x += 400;
      createRuntime(scene, { outputPass: 'foreground', skipFontLoad: true, installGlobals: false });
      expect(document.querySelector('[data-cg-element-id="name"]') !== null).toBe(allowed);
      expect(document.querySelector('[data-cg-live-fallback]')).toBeNull();
    },
  );
});
