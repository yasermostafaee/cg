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
});
