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
    expect(text?.style.fontFamily).toBe('Vazirmatn');
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
});
