import { afterEach, describe, expect, it } from 'vitest';
import type { Scene, TextElement } from '@cg/shared-schema';
import { buildScene } from '../src/scene-builder.js';
import { applyAnimationAtFrame, type AnimatedElement } from '../src/animation-applier.js';
import { lowerThirdScene } from './fixtures.js';

/**
 * D-060 — auto-size text rendering (consume `fitMode`). happy-dom does not lay out,
 * so these assert the CSS CONTRACT the runtime writes (the visual "hug" is covered by
 * the Designer E2E); `max-content` + `white-space: pre` is what produces the hug.
 */

/** Clone the lower-third scene and tweak its `name` text element. */
function textScene(patch: Partial<TextElement>): { scene: Scene; textId: string } {
  const scene = structuredClone(lowerThirdScene);
  const txt = scene.layers[0]?.children.find((e) => e.id === 'name');
  if (txt === undefined || txt.type !== 'text') throw new Error('fixture changed');
  Object.assign(txt, patch);
  return { scene, textId: 'name' };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('D-060 — fitMode=fixed (unchanged)', () => {
  it('sizes the box from transform.size', () => {
    const { scene, textId } = textScene({
      fitMode: 'fixed',
      transform: { ...lowerThirdScene.layers[0]!.children[1]!.transform, size: { w: 300, h: 90 } },
    });
    const el = buildScene(scene).elementMap.get(textId);
    expect(el?.style.width).toBe('300px');
    expect(el?.style.height).toBe('90px');
    expect(el?.style.whiteSpace).not.toBe('pre');
  });

  it('applies the vertical-align flex wrapper when verticalAlign is set', () => {
    const { scene, textId } = textScene({ fitMode: 'fixed', verticalAlign: 'middle' });
    const el = buildScene(scene).elementMap.get(textId);
    expect(el?.style.display).toBe('flex');
    expect(el?.style.justifyContent).toBe('center');
  });
});

describe('D-060 — fitMode=autosize hugs content (both dimensions)', () => {
  it('sizes width + height via max-content and forbids wrapping with white-space: pre', () => {
    const { scene, textId } = textScene({ fitMode: 'autosize', direction: 'ltr' });
    const el = buildScene(scene).elementMap.get(textId);
    expect(el?.style.width).toBe('max-content');
    expect(el?.style.height).toBe('max-content');
    expect(el?.style.whiteSpace).toBe('pre');
  });

  it('keeps a minimum box (≥ one line) so empty text stays selectable', () => {
    const { scene, textId } = textScene({ fitMode: 'autosize', direction: 'ltr', text: '' });
    const el = buildScene(scene).elementMap.get(textId);
    // font.size 48 × lineHeight 1.4 = 67.2 (one line); minWidth derived from font size.
    expect(el?.style.minHeight).toBe(`${48 * 1.4}px`);
    expect(el?.style.minWidth).toBe(`${48 * 0.5}px`);
  });

  it('does NOT apply the vertical-align flex wrapper (no vertical slack in a hug)', () => {
    const { scene, textId } = textScene({
      fitMode: 'autosize',
      direction: 'ltr',
      verticalAlign: 'middle',
    });
    const el = buildScene(scene).elementMap.get(textId);
    expect(el?.style.display).not.toBe('flex');
  });

  it('preserves explicit newlines in the rendered content (multi-line)', () => {
    const { scene, textId } = textScene({
      fitMode: 'autosize',
      direction: 'ltr',
      text: 'line one\nline two',
    });
    const el = buildScene(scene).elementMap.get(textId);
    expect(el?.style.whiteSpace).toBe('pre');
    expect(el?.textContent).toContain('\n');
  });
});

describe('D-060 §E — auto anchor / growth direction', () => {
  it('LTR pins the top-left edge (CSS left, no right)', () => {
    const { scene, textId } = textScene({
      fitMode: 'autosize',
      direction: 'ltr',
      transform: {
        ...lowerThirdScene.layers[0]!.children[1]!.transform,
        position: { x: 120, y: 820 },
      },
    });
    const el = buildScene(scene).elementMap.get(textId);
    expect(el?.style.left).toBe('120px');
    expect(el?.style.right).toBe('');
  });

  it('RTL pins the top-right edge via CSS right (= resolutionWidth − position.x), left auto', () => {
    const { scene, textId } = textScene({
      fitMode: 'autosize',
      direction: 'rtl',
      transform: {
        ...lowerThirdScene.layers[0]!.children[1]!.transform,
        position: { x: 120, y: 820 },
      },
    });
    // lowerThirdScene resolution is 1920 wide.
    const el = buildScene(scene).elementMap.get(textId);
    expect(el?.style.left).toBe('auto');
    expect(el?.style.right).toBe(`${1920 - 120}px`);
  });
});

describe('D-060/D-046 — size keyframes ignored for an auto text box', () => {
  function makeAutoText(): { source: TextElement; node: HTMLElement } {
    const source = {
      id: 'txt',
      name: 'txt',
      type: 'text',
      transform: {
        position: { x: 0, y: 0 },
        size: { w: 400, h: 80 },
        scale: { x: 1, y: 1 },
        rotation: 0,
        anchor: { x: 0, y: 0 },
      },
      opacity: 1,
      visible: true,
      locked: false,
      zIndex: 0,
      text: 'hi',
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
      fitMode: 'autosize',
      overflow: 'clip',
    } as TextElement;
    const node = document.createElement('div');
    node.style.width = 'max-content';
    node.style.height = 'max-content';
    return { source, node };
  }

  const sizeTracks = {
    'size.w': {
      keyframes: [
        { frame: 0, value: 100, easing: 'linear' as const },
        { frame: 10, value: 500, easing: 'linear' as const },
      ],
    },
    'size.h': {
      keyframes: [
        { frame: 0, value: 50, easing: 'linear' as const },
        { frame: 10, value: 200, easing: 'linear' as const },
      ],
    },
  };

  it('an auto text box keeps max-content even with a size track', () => {
    const { source, node } = makeAutoText();
    const entry: AnimatedElement = {
      id: source.id,
      node,
      source,
      animation: { tracks: sizeTracks },
    };
    applyAnimationAtFrame(entry, 5);
    expect(node.style.width).toBe('max-content');
    expect(node.style.height).toBe('max-content');
  });

  it('a FIXED text box still applies the size track (px)', () => {
    const { source, node } = makeAutoText();
    const fixed: TextElement = { ...source, fitMode: 'fixed' };
    node.style.width = '400px';
    node.style.height = '80px';
    const entry: AnimatedElement = {
      id: fixed.id,
      node,
      source: fixed,
      animation: { tracks: sizeTracks },
    };
    applyAnimationAtFrame(entry, 5);
    expect(node.style.width).toBe('300px');
    expect(node.style.height).toBe('125px');
  });
});
