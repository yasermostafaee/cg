import { afterEach, describe, expect, it } from 'vitest';
import type { Element, Scene } from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';
import { lowerThirdScene } from './fixtures.js';

afterEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
});

function ruledScene(): Scene {
  const scene = structuredClone(lowerThirdScene);
  scene.fields.push({
    id: 'temperature',
    label: 'Temperature',
    required: false,
    type: 'number',
    default: 25,
  });
  const name = scene.layers[0]?.children.find((element) => element.id === 'name');
  if (name === undefined) throw new Error('fixture changed');
  name.valueRules = {
    input: { kind: 'field', fieldId: 'temperature' },
    rules: [
      {
        condition: { comparator: '<=', value: 20 },
        effect: { elementId: 'name', property: 'textColor', value: '#0000FF' },
      },
      {
        condition: { comparator: '<=', value: 10 },
        effect: { elementId: 'name', property: 'textColor', value: '#FF0000' },
      },
    ],
  };
  return scene;
}

describe('D-139 value rules in the template runtime', () => {
  it('evaluates authored order first and restores the authored colour on no match', async () => {
    const runtime = createRuntime(ruledScene(), { skipFontLoad: true });
    await runtime.ready;
    const name = document.querySelector<HTMLElement>('[data-cg-element-id="name"]');
    expect(name?.style.color).toMatch(/#ffffff/i);

    await runtime.update({ temperature: 8 });
    expect(name?.style.color).toMatch(/#0000ff/i);

    await runtime.update({ temperature: 30 });
    expect(name?.style.color).toMatch(/#ffffff/i);
  });

  it('applies matching text and background effects together while keeping first match per effect', async () => {
    const scene = ruledScene();
    const name = scene.layers[0]?.children.find((element) => element.id === 'name');
    if (name === undefined || name.valueRules === undefined) throw new Error('fixture changed');
    name.valueRules.rules.push({
      condition: { comparator: '<=', value: 10 },
      effect: { elementId: 'name', property: 'backgroundColor', value: '#FFFF00' },
    });

    const runtime = createRuntime(scene, { skipFontLoad: true });
    await runtime.update({ temperature: 8 });
    const node = document.querySelector<HTMLElement>('[data-cg-element-id="name"]');
    expect(node?.style.color).toMatch(/#0000ff/i);
    expect(node?.style.backgroundColor).toMatch(/#ffff00/i);
  });

  it('applies visibility on a wrapper and restores the authored state', async () => {
    const scene = ruledScene();
    const bg = scene.layers[0]?.children.find((element) => element.id === 'bg');
    if (bg === undefined) throw new Error('fixture changed');
    bg.valueRules = {
      input: { kind: 'field', fieldId: 'temperature' },
      rules: [
        {
          condition: { comparator: '<', value: 0 },
          effect: { elementId: 'bg', property: 'visible', value: false },
        },
      ],
    };
    const runtime = createRuntime(scene, { skipFontLoad: true });
    await runtime.update({ temperature: -1 });
    const node = document.querySelector<HTMLElement>('[data-cg-element-id="bg"]');
    expect(node?.parentElement?.style.opacity).toBe('0');

    await runtime.update({ temperature: 1 });
    expect(node?.parentElement?.style.opacity).toBe('1');
  });

  it('resolves an image branch through assetUrls and restores the authored image', async () => {
    const scene = ruledScene();
    scene.fields.push({
      id: 'weather',
      label: 'Weather',
      required: false,
      type: 'text',
      default: 'sun',
    });
    const image = {
      id: 'icon',
      name: 'Icon',
      type: 'image',
      assetId: 'sun',
      source: 'project',
      fit: 'contain',
      preserveAspect: true,
      opacity: 1,
      visible: true,
      locked: false,
      zIndex: 3,
      transform: {
        position: { x: 0, y: 0 },
        size: { w: 100, h: 100 },
        scale: { x: 1, y: 1 },
        rotation: 0,
        anchor: { x: 0, y: 0 },
      },
      valueRules: {
        input: { kind: 'field', fieldId: 'weather' },
        rules: [
          {
            condition: { comparator: '=', value: 'rain' },
            effect: {
              elementId: 'icon',
              property: 'image',
              value: { assetId: 'rain', source: 'project' },
            },
          },
        ],
      },
    } as unknown as Element;
    scene.layers[0]?.children.push(image);
    const runtime = createRuntime(scene, {
      skipFontLoad: true,
      assetUrls: { sun: 'assets/sun.png', rain: 'assets/rain.png' },
    });
    await runtime.update({ weather: 'rain' });
    const node = document.querySelector<HTMLImageElement>('[data-cg-element-id="icon"]');
    expect(node?.getAttribute('src')).toBe('assets/rain.png');

    await runtime.update({ weather: 'sun' });
    expect(node?.getAttribute('src')).toBe('assets/sun.png');
  });
});
