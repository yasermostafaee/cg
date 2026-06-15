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

/**
 * D-052 — a minimal time-driven element (ticker/clock/sequence). The applier reads
 * only `.type` + the style fields, so a loose cast is enough; `extra` supplies the
 * static `stroke` / `textShadow` / `padding` a given test needs.
 */
function makeTimeDriven(
  type: 'ticker' | 'clock' | 'sequence',
  extra: Record<string, unknown> = {},
): { source: ShapeElement; node: HTMLElement } {
  const source = {
    id: type,
    name: type,
    type,
    transform: baseTransform,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    color: '#FFFFFF',
    ...extra,
  } as unknown as ShapeElement;
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

  it('toggles dashed border when stroke.dash is animated past zero', () => {
    const { source, node } = makeShape();
    const withStroke: ShapeElement = {
      ...source,
      stroke: { color: '#222222', width: 4 },
    };
    const entry: AnimatedElement = {
      id: withStroke.id,
      node,
      source: withStroke,
      animation: {
        tracks: {
          'stroke.dash': {
            keyframes: [
              { frame: 0, value: 0, easing: 'linear' },
              { frame: 10, value: 8, easing: 'linear' },
            ],
          },
        },
      },
    };
    applyAnimationAtFrame(entry, 10);
    expect(node.style.border).toContain('dashed');
    applyAnimationAtFrame(entry, 0);
    expect(node.style.border).toContain('solid');
  });

  it('writes cornerRadius to borderRadius for any shape kind', () => {
    const { source, node } = makeShape();
    const entry: AnimatedElement = {
      id: source.id,
      node,
      source,
      animation: {
        tracks: {
          cornerRadius: {
            keyframes: [
              { frame: 0, value: 0, easing: 'linear' },
              { frame: 10, value: 20, easing: 'linear' },
            ],
          },
        },
      },
    };
    applyAnimationAtFrame(entry, 10);
    expect(node.style.borderRadius).toBe('20px');
  });

  it('recomposes per-corner border-radius from the tl/tr/br/bl sub-tracks (D-042)', () => {
    const { source, node } = makeShape();
    const src: ShapeElement = { ...source, cornerRadius: [4, 8, 12, 16] };
    const entry: AnimatedElement = {
      id: src.id,
      node,
      source: src,
      animation: {
        tracks: {
          'cornerRadius.tl': {
            keyframes: [
              { frame: 0, value: 0, easing: 'linear' },
              { frame: 10, value: 40, easing: 'linear' },
            ],
          },
        },
      },
    };
    applyAnimationAtFrame(entry, 10);
    // tl animates to 40; the other corners fall back to the static tuple.
    expect(node.style.borderRadius).toBe('40px 8px 12px 16px');
  });

  it('per-corner radius animates on a NON-shape kind too (text) — the previously-broken tuple path', () => {
    const { source, node } = makeText();
    // Distinct corners so CSS doesn't collapse the four-value shorthand.
    const src: TextElement = { ...source, cornerRadius: [1, 2, 3, 4] };
    const entry: AnimatedElement = {
      id: src.id,
      node,
      source: src,
      animation: {
        tracks: {
          'cornerRadius.br': {
            keyframes: [
              { frame: 0, value: 3, easing: 'linear' },
              { frame: 10, value: 33, easing: 'linear' },
            ],
          },
        },
      },
    };
    applyAnimationAtFrame(entry, 10);
    // br animates to 33; the other corners fall back to the static tuple.
    expect(node.style.borderRadius).toBe('1px 2px 33px 4px');
  });

  it('B-015 — migration output renders in the mode its tracks imply (no orphaned track)', () => {
    // per-corner migration output: tuple value + four sub-tracks, NO uniform track.
    {
      const { source, node } = makeShape();
      const src: ShapeElement = { ...source, cornerRadius: [10, 10, 10, 10] };
      const entry: AnimatedElement = {
        id: src.id,
        node,
        source: src,
        animation: {
          tracks: {
            'cornerRadius.tl': { keyframes: [{ frame: 10, value: 22, easing: 'linear' }] },
            'cornerRadius.tr': { keyframes: [{ frame: 10, value: 33, easing: 'linear' }] },
            'cornerRadius.br': { keyframes: [{ frame: 10, value: 44, easing: 'linear' }] },
            'cornerRadius.bl': { keyframes: [{ frame: 10, value: 55, easing: 'linear' }] },
          },
        },
      };
      applyAnimationAtFrame(entry, 10);
      expect(node.style.borderRadius).toBe('22px 33px 44px 55px'); // four-value
    }
    // collapsed (uniform) migration output: number value + single track, NO sub-tracks.
    {
      const { source, node } = makeShape();
      const src: ShapeElement = { ...source, cornerRadius: 8 };
      const entry: AnimatedElement = {
        id: src.id,
        node,
        source: src,
        animation: {
          tracks: { cornerRadius: { keyframes: [{ frame: 10, value: 18, easing: 'linear' }] } },
        },
      };
      applyAnimationAtFrame(entry, 10);
      expect(node.style.borderRadius).toBe('18px'); // single value
    }
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

describe('D-056 — content-driven kinds animate ONLY text colour + text-shadow (ticker/clock/sequence)', () => {
  const KINDS = ['ticker', 'clock', 'sequence'] as const;

  for (const kind of KINDS) {
    it(`${kind}: text colour animates on the node (inherits to items/digits)`, () => {
      const { source, node } = makeTimeDriven(kind);
      applyAnimationAtFrame(
        {
          id: kind,
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
        },
        10,
      );
      expect(node.style.color.toLowerCase()).toMatch(/0,\s*255,\s*0|#00ff00/);
    });

    it(`${kind}: shadow animates as text-shadow, not box-shadow`, () => {
      const { source, node } = makeTimeDriven(kind, {
        textShadow: { offsetX: 1, offsetY: 2, blur: 3, color: '#000000' },
      });
      applyAnimationAtFrame(
        {
          id: kind,
          node,
          source,
          animation: {
            tracks: {
              'shadow.blur': {
                keyframes: [
                  { frame: 0, value: 3, easing: 'linear' },
                  { frame: 10, value: 12, easing: 'linear' },
                ],
              },
            },
          },
        },
        10,
      );
      expect(node.style.textShadow).toContain('12px');
      expect(node.style.boxShadow).toBe('');
    });

    it(`${kind}: D-056 — stroke / background / padding / cornerRadius are NOT applied`, () => {
      const { source, node } = makeTimeDriven(kind, {
        stroke: { width: 1, color: '#3366ff' },
        cornerRadius: 8,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
      });
      applyAnimationAtFrame(
        {
          id: kind,
          node,
          source,
          animation: {
            tracks: {
              'stroke.width': {
                keyframes: [
                  { frame: 0, value: 2, easing: 'linear' },
                  { frame: 10, value: 8, easing: 'linear' },
                ],
              },
              backgroundColor: {
                keyframes: [
                  { frame: 0, value: '#000000', easing: 'linear' },
                  { frame: 10, value: '#0000FF', easing: 'linear' },
                ],
              },
              'padding.top': {
                keyframes: [
                  { frame: 0, value: 0, easing: 'linear' },
                  { frame: 10, value: 16, easing: 'linear' },
                ],
              },
              cornerRadius: {
                keyframes: [
                  { frame: 0, value: 0, easing: 'linear' },
                  { frame: 10, value: 10, easing: 'linear' },
                ],
              },
            },
          },
        },
        10,
      );
      expect(node.style.border).toBe('');
      expect(node.style.backgroundColor).toBe('');
      expect(node.style.paddingTop).toBe('');
      expect(node.style.borderRadius).toBe('');
    });
  }

  it('no-regression: shape shadow stays box-shadow; text shadow stays text-shadow', () => {
    const { source: shp, node: shpNode } = makeShape();
    applyAnimationAtFrame(
      {
        id: 'shp',
        node: shpNode,
        source: { ...shp, shadow: { offsetX: 0, offsetY: 0, blur: 0, color: '#000000' } },
        animation: {
          tracks: {
            'shadow.blur': {
              keyframes: [
                { frame: 0, value: 0, easing: 'linear' },
                { frame: 10, value: 9, easing: 'linear' },
              ],
            },
          },
        },
      },
      10,
    );
    expect(shpNode.style.boxShadow).toContain('9px');
    expect(shpNode.style.textShadow).toBe('');

    const { source: txt, node: txtNode } = makeText();
    applyAnimationAtFrame(
      {
        id: 'txt',
        node: txtNode,
        source: { ...txt, textShadow: { offsetX: 0, offsetY: 0, blur: 0, color: '#000000' } },
        animation: {
          tracks: {
            'shadow.blur': {
              keyframes: [
                { frame: 0, value: 0, easing: 'linear' },
                { frame: 10, value: 7, easing: 'linear' },
              ],
            },
          },
        },
      },
      10,
    );
    expect(txtNode.style.textShadow).toContain('7px');
    expect(txtNode.style.boxShadow).toBe('');
  });

  it('no-regression: shape stroke still animates the border', () => {
    const { source, node } = makeShape();
    applyAnimationAtFrame(
      {
        id: 's',
        node,
        source: { ...source, stroke: { width: 1, color: '#000000' } },
        animation: {
          tracks: {
            'stroke.width': {
              keyframes: [
                { frame: 0, value: 1, easing: 'linear' },
                { frame: 10, value: 5, easing: 'linear' },
              ],
            },
          },
        },
      },
      10,
    );
    expect(node.style.border).toContain('5px');
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
