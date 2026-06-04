import { describe, expect, it } from 'vitest';
import { buildScene } from '../src/scene-builder.js';
import { lowerThirdScene } from './fixtures.js';

describe('buildScene', () => {
  it('creates a stage container with scene resolution', () => {
    const { container } = buildScene(lowerThirdScene);
    expect(container.className).toBe('cg-stage');
    expect(container.style.width).toBe('1920px');
    expect(container.style.height).toBe('1080px');
  });

  it('produces an element map keyed by element id', () => {
    const { elementMap } = buildScene(lowerThirdScene);
    expect(elementMap.size).toBe(2);
    expect(elementMap.has('bg')).toBe(true);
    expect(elementMap.has('name')).toBe(true);
  });

  it('captures original text for placeholder substitution', () => {
    const { textOriginals } = buildScene(lowerThirdScene);
    expect(textOriginals.get('name')).toBe('{{anchor}}');
  });

  it('renders TextElement with RTL direction', () => {
    const { elementMap } = buildScene(lowerThirdScene);
    const text = elementMap.get('name');
    expect(text?.style.direction).toBe('rtl');
    // The authored family leads a fallback stack (clean sans + Persian shaping).
    expect(text?.style.fontFamily.startsWith('Vazirmatn,')).toBe(true);
    expect(text?.style.fontFamily).toMatch(/sans-serif$/);
    expect(text?.style.fontWeight).toBe('700');
  });

  it('renders ShapeElement with rounded-rect border radius', () => {
    const { elementMap } = buildScene(lowerThirdScene);
    const shape = elementMap.get('bg');
    expect(shape?.style.borderRadius).toBe('8px');
    expect(shape?.style.background).toMatch(/#0ea5e9/i);
  });

  it('positions elements via absolute CSS', () => {
    const { elementMap } = buildScene(lowerThirdScene);
    const shape = elementMap.get('bg');
    expect(shape?.style.left).toBe('100px');
    expect(shape?.style.top).toBe('800px');
    expect(shape?.classList.contains('cg-element')).toBe(true);
  });

  it('hides invisible layers', () => {
    const sceneCopy = structuredClone(lowerThirdScene);
    sceneCopy.layers[0]!.visible = false;
    const { container } = buildScene(sceneCopy);
    const layerNode = container.querySelector<HTMLElement>('.cg-layer');
    expect(layerNode?.style.display).toBe('none');
  });

  it('does not paint a transparent background', () => {
    const { container } = buildScene(lowerThirdScene);
    // happy-dom returns '' when the property isn't set
    expect(container.style.background).toBe('');
  });

  it('paints a solid background', () => {
    const sceneCopy = structuredClone(lowerThirdScene);
    sceneCopy.background = '#000000';
    const { container } = buildScene(sceneCopy);
    expect(container.style.background).toMatch(/#000000/i);
  });

  it('renders a ShapeElement linear-gradient fill', () => {
    const sceneCopy = structuredClone(lowerThirdScene);
    const bg = sceneCopy.layers[0]?.children[0];
    if (bg === undefined || bg.type !== 'shape') throw new Error('fixture changed');
    bg.fill = {
      kind: 'linear',
      angle: 90,
      stops: [
        { at: 0, color: '#000000' },
        { at: 1, color: '#FFFFFF' },
      ],
    };
    const { elementMap } = buildScene(sceneCopy);
    const css = elementMap.get('bg')?.style.background ?? '';
    expect(css).toMatch(/linear-gradient\(90deg/i);
    expect(css).toMatch(/0%/);
    expect(css).toMatch(/100%/);
  });

  it('renders a ShapeElement radial-gradient fill', () => {
    const sceneCopy = structuredClone(lowerThirdScene);
    const bg = sceneCopy.layers[0]?.children[0];
    if (bg === undefined || bg.type !== 'shape') throw new Error('fixture changed');
    bg.fill = {
      kind: 'radial',
      center: { x: 0.5, y: 0.25 },
      radius: 400,
      stops: [
        { at: 0, color: '#112233' },
        { at: 1, color: '#000000' },
      ],
    };
    const { elementMap } = buildScene(sceneCopy);
    const css = elementMap.get('bg')?.style.background ?? '';
    expect(css).toMatch(/radial-gradient\(circle 400px at 50% 25%/i);
  });
});
