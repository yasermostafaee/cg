import { beforeEach, describe, expect, it } from 'vitest';
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
});
