import { afterEach, describe, expect, it } from 'vitest';
import type { ShapeElement, TextElement } from '@cg/shared-schema';
import {
  applyAnimationAtFrame,
  collectAnimatedElements,
  type AnimatedElement,
} from '../src/animation-applier.js';

const baseTransform = {
  position: { x: 100, y: 200 },
  size: { w: 400, h: 80 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
};

function makeShape(): { source: ShapeElement; node: HTMLElement } {
  const source: ShapeElement = {
    id: 'rect',
    name: 'rect',
    type: 'shape',
    transform: baseTransform,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    shape: 'rect',
    fill: { kind: 'solid', color: '#FF0000' },
  };
  const node = document.createElement('div');
  document.body.appendChild(node);
  return { source, node };
}

function makeText(): { source: TextElement; node: HTMLElement } {
  const source: TextElement = {
    id: 'txt',
    name: 'txt',
    type: 'text',
    transform: baseTransform,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    text: 'hello',
    font: {
      family: 'Inter',
      weight: 400,
      style: 'normal',
      size: 32,
      lineHeight: 1.2,
      letterSpacing: 0,
    },
    color: '#FFFFFF',
    align: 'start',
    direction: 'auto',
    fitMode: 'fixed',
    overflow: 'clip',
  };
  const node = document.createElement('div');
  document.body.appendChild(node);
  return { source, node };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('applyAnimationAtFrame', () => {
  it('writes opacity at the interpolated frame', () => {
    const { source, node } = makeShape();
    const entry: AnimatedElement = {
      id: source.id,
      node,
      source,
      animation: {
        tracks: {
          opacity: {
            keyframes: [
              { frame: 0, value: 0, easing: 'linear' },
              { frame: 10, value: 1, easing: 'linear' },
            ],
          },
        },
      },
    };
    applyAnimationAtFrame(entry, 5);
    expect(node.style.opacity).toBe('0.5');
  });

  it('writes position.x as `left` and falls back to static y', () => {
    const { source, node } = makeShape();
    const entry: AnimatedElement = {
      id: source.id,
      node,
      source,
      animation: {
        tracks: {
          'position.x': {
            keyframes: [
              { frame: 0, value: 100, easing: 'linear' },
              { frame: 10, value: 500, easing: 'linear' },
            ],
          },
        },
      },
    };
    applyAnimationAtFrame(entry, 5);
    expect(node.style.left).toBe('300px');
    expect(node.style.top).toBe('200px');
  });

  it('writes size.w and size.h', () => {
    const { source, node } = makeShape();
    const entry: AnimatedElement = {
      id: source.id,
      node,
      source,
      animation: {
        tracks: {
          'size.w': {
            keyframes: [
              { frame: 0, value: 100, easing: 'linear' },
              { frame: 10, value: 200, easing: 'linear' },
            ],
          },
        },
      },
    };
    applyAnimationAtFrame(entry, 10);
    expect(node.style.width).toBe('200px');
    expect(node.style.height).toBe('80px');
  });

  it('composes scale + rotation into a transform string', () => {
    const { source, node } = makeShape();
    const entry: AnimatedElement = {
      id: source.id,
      node,
      source,
      animation: {
        tracks: {
          'scale.x': {
            keyframes: [
              { frame: 0, value: 1, easing: 'linear' },
              { frame: 10, value: 2, easing: 'linear' },
            ],
          },
          rotation: {
            keyframes: [
              { frame: 0, value: 0, easing: 'linear' },
              { frame: 10, value: 90, easing: 'linear' },
            ],
          },
        },
      },
    };
    applyAnimationAtFrame(entry, 10);
    expect(node.style.transform).toContain('scale(2, 1)');
    expect(node.style.transform).toContain('rotate(90deg)');
  });

  it('writes fill.color to background only for shape elements', () => {
    const { source, node } = makeShape();
    const entry: AnimatedElement = {
      id: source.id,
      node,
      source,
      animation: {
        tracks: {
          'fill.color': {
            keyframes: [
              { frame: 0, value: '#000000', easing: 'linear' },
              { frame: 10, value: '#FFFFFF', easing: 'linear' },
            ],
          },
        },
      },
    };
    applyAnimationAtFrame(entry, 5);
    expect(node.style.background).toMatch(/128|#808080/i);
  });

  it('writes text.color to color only for text elements', () => {
    const { source, node } = makeText();
    const entry: AnimatedElement = {
      id: source.id,
      node,
      source,
      animation: {
        tracks: {
          'text.color': {
            keyframes: [
              { frame: 0, value: '#FF0000', easing: 'linear' },
              { frame: 10, value: '#00FF00', easing: 'linear' },
            ],
          },
        },
      },
    };
    applyAnimationAtFrame(entry, 10);
    expect(node.style.color.toLowerCase()).toMatch(/0,\s*255,\s*0|#00ff00/);
  });
});

describe('collectAnimatedElements', () => {
  it('returns only elements with non-empty tracks', () => {
    const { source: a, node: na } = makeShape();
    const { source: b, node: nb } = makeShape();
    const animated: ShapeElement = {
      ...a,
      id: 'a',
      animation: {
        tracks: {
          opacity: { keyframes: [{ frame: 0, value: 1, easing: 'linear' }] },
        },
      },
    };
    const plain: ShapeElement = { ...b, id: 'b' };
    const map = new Map<string, HTMLElement>([
      ['a', na],
      ['b', nb],
    ]);
    const out = collectAnimatedElements([[animated, plain]], map);
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe('a');
  });

  it('skips elements whose nodes are missing from the map', () => {
    const { source } = makeShape();
    const animated: ShapeElement = {
      ...source,
      animation: {
        tracks: {
          opacity: { keyframes: [{ frame: 0, value: 1, easing: 'linear' }] },
        },
      },
    };
    const map = new Map<string, HTMLElement>();
    const out = collectAnimatedElements([[animated]], map);
    expect(out).toHaveLength(0);
  });
});
