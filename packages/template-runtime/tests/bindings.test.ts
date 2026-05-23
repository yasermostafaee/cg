import { describe, expect, it } from 'vitest';
import { applyFieldValues } from '../src/bindings.js';
import { buildScene } from '../src/scene-builder.js';
import { lowerThirdScene } from './fixtures.js';

describe('applyFieldValues', () => {
  it('substitutes a placeholder with a field value', () => {
    const { container, elementMap, textOriginals } = buildScene(lowerThirdScene);
    applyFieldValues(
      lowerThirdScene,
      { anchor: 'دکتر سارا نادری' },
      elementMap,
      textOriginals,
      container,
    );
    expect(elementMap.get('name')?.textContent).toBe('دکتر سارا نادری');
  });

  it('falls back to the field default when no value is supplied', () => {
    const { container, elementMap, textOriginals } = buildScene(lowerThirdScene);
    applyFieldValues(lowerThirdScene, {}, elementMap, textOriginals, container);
    expect(elementMap.get('name')?.textContent).toBe('سارا نادری');
  });

  it('replaces the whole text when placeholder is absent', () => {
    const sceneCopy = structuredClone(lowerThirdScene);
    sceneCopy.bindings[0]!.target = { kind: 'text', elementId: 'name' };
    const { container, elementMap, textOriginals } = buildScene(sceneCopy);
    applyFieldValues(sceneCopy, { anchor: 'replaced' }, elementMap, textOriginals, container);
    expect(elementMap.get('name')?.textContent).toBe('replaced');
  });

  it('writes a color binding to a shape fill', () => {
    const sceneCopy = structuredClone(lowerThirdScene);
    sceneCopy.fields.push({
      id: 'themeColor',
      label: 'Theme',
      required: false,
      type: 'color',
      default: '#FFFFFF',
    });
    sceneCopy.bindings.push({
      fieldId: 'themeColor',
      target: { kind: 'color', elementId: 'bg', property: 'fill' },
    });
    const { container, elementMap, textOriginals } = buildScene(sceneCopy);
    applyFieldValues(sceneCopy, { themeColor: '#E11D48' }, elementMap, textOriginals, container);
    expect(elementMap.get('bg')?.style.background).toMatch(/#e11d48/i);
  });

  it('toggles visibility', () => {
    const sceneCopy = structuredClone(lowerThirdScene);
    sceneCopy.fields.push({
      id: 'showLogo',
      label: 'Show logo',
      required: false,
      type: 'boolean',
      default: true,
    });
    sceneCopy.bindings.push({
      fieldId: 'showLogo',
      target: { kind: 'visible', elementId: 'bg' },
    });
    const { container, elementMap, textOriginals } = buildScene(sceneCopy);
    applyFieldValues(sceneCopy, { showLogo: false }, elementMap, textOriginals, container);
    expect(elementMap.get('bg')?.style.display).toBe('none');
  });

  it('writes to scene-background target', () => {
    const sceneCopy = structuredClone(lowerThirdScene);
    sceneCopy.fields.push({
      id: 'bgColor',
      label: 'BG',
      required: false,
      type: 'color',
      default: '#000000',
    });
    sceneCopy.bindings.push({
      fieldId: 'bgColor',
      target: { kind: 'scene-background' },
    });
    const { container, elementMap, textOriginals } = buildScene(sceneCopy);
    applyFieldValues(sceneCopy, { bgColor: '#0F172A' }, elementMap, textOriginals, container);
    expect(container.style.background).toMatch(/#0f172a/i);
  });

  it('applies the persian-digits transform', () => {
    const sceneCopy = structuredClone(lowerThirdScene);
    sceneCopy.fields[0] = {
      id: 'anchor',
      label: 'x',
      required: false,
      type: 'text',
      default: '',
    };
    sceneCopy.bindings[0]!.transform = 'persian-digits';
    const { container, elementMap, textOriginals } = buildScene(sceneCopy);
    applyFieldValues(sceneCopy, { anchor: 'Episode 12' }, elementMap, textOriginals, container);
    expect(elementMap.get('name')?.textContent).toBe('Episode ۱۲');
  });

  it('ignores bindings targeting unknown elements', () => {
    const sceneCopy = structuredClone(lowerThirdScene);
    sceneCopy.bindings.push({
      fieldId: 'anchor',
      target: { kind: 'text', elementId: 'nonexistent' },
    });
    const { container, elementMap, textOriginals } = buildScene(sceneCopy);
    expect(() =>
      applyFieldValues(sceneCopy, { anchor: 'x' }, elementMap, textOriginals, container),
    ).not.toThrow();
  });
});
