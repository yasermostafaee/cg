import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Scene } from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';

function sceneWithOpacityTrack(): Scene {
  return {
    schemaVersion: 1,
    id: 'kf-scene',
    name: 'kf',
    templateType: 'lower-third',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    background: 'transparent',
    layers: [
      {
        id: 'L1',
        name: 'main',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [
          {
            id: 'rect',
            name: 'rect',
            type: 'shape',
            transform: {
              position: { x: 100, y: 100 },
              size: { w: 200, h: 200 },
              scale: { x: 1, y: 1 },
              rotation: 0,
              anchor: { x: 0, y: 0 },
            },
            opacity: 1,
            visible: true,
            locked: false,
            zIndex: 0,
            shape: 'rect',
            fill: { kind: 'solid', color: '#FF0000' },
            animation: {
              tracks: {
                opacity: {
                  keyframes: [
                    { frame: 0, value: 0, easing: 'linear' },
                    { frame: 10, value: 1, easing: 'linear' },
                  ],
                },
                'position.x': {
                  keyframes: [
                    { frame: 0, value: 100, easing: 'linear' },
                    { frame: 10, value: 500, easing: 'linear' },
                  ],
                },
                'fill.color': {
                  keyframes: [
                    { frame: 0, value: '#000000', easing: 'linear' },
                    { frame: 10, value: '#FFFFFF', easing: 'linear' },
                  ],
                },
              },
            },
          },
        ],
      },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: {
      createdAt: '2026-05-25T00:00:00.000Z',
      updatedAt: '2026-05-25T00:00:00.000Z',
    },
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
});
afterEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
});

describe('createRuntime — keyframe scrubbing', () => {
  it('tick(0) paints the first keyframe values', async () => {
    const r = createRuntime(sceneWithOpacityTrack(), { skipFontLoad: true });
    await r.play({});
    r.tick(0);
    const node = document.querySelector<HTMLElement>('[data-cg-element-id="rect"]')!;
    expect(node.style.opacity).toBe('0');
    expect(node.style.left).toBe('100px');
    r.remove();
  });

  it('tick(5) lerps to the midpoint', async () => {
    const r = createRuntime(sceneWithOpacityTrack(), { skipFontLoad: true });
    await r.play({});
    r.tick(5);
    const node = document.querySelector<HTMLElement>('[data-cg-element-id="rect"]')!;
    expect(parseFloat(node.style.opacity)).toBeCloseTo(0.5);
    expect(node.style.left).toBe('300px');
    expect(node.style.background).toMatch(/128|#808080/i);
    r.remove();
  });

  it('tick(10) settles at the last keyframe', async () => {
    const r = createRuntime(sceneWithOpacityTrack(), { skipFontLoad: true });
    await r.play({});
    r.tick(10);
    const node = document.querySelector<HTMLElement>('[data-cg-element-id="rect"]')!;
    expect(node.style.opacity).toBe('1');
    expect(node.style.left).toBe('500px');
    r.remove();
  });

  it('elements without animation are unaffected by tick()', async () => {
    const scene = sceneWithOpacityTrack();
    scene.layers[0]!.children.push({
      id: 'static',
      name: 'static',
      type: 'shape',
      transform: {
        position: { x: 10, y: 10 },
        size: { w: 50, h: 50 },
        scale: { x: 1, y: 1 },
        rotation: 0,
        anchor: { x: 0, y: 0 },
      },
      opacity: 0.42,
      visible: true,
      locked: false,
      zIndex: 1,
      shape: 'rect',
      fill: { kind: 'solid', color: '#0000FF' },
    });
    const r = createRuntime(scene, { skipFontLoad: true });
    await r.play({});
    r.tick(5);
    const staticNode = document.querySelector<HTMLElement>('[data-cg-element-id="static"]')!;
    expect(staticNode.style.opacity).toBe('0.42');
    expect(staticNode.style.left).toBe('10px');
    r.remove();
  });
});
