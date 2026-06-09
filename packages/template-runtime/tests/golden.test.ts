import { afterEach, describe, expect, it } from 'vitest';
import type { ShapeElement } from '@cg/shared-schema';
import { applyAnimationAtFrame, type AnimatedElement } from '../src/animation-applier.js';
import { applyFieldValues } from '../src/bindings.js';
import { buildScene } from '../src/scene-builder.js';
import { lowerThirdScene } from './fixtures.js';

/**
 * GOLDEN tests — a representative scene + a fixed frame pinned to the EXACT
 * applied field values / rendered output. Unlike the per-unit suites (which
 * assert one property), these freeze the whole observable result so any
 * behavioural drift in the build → bind → animate path surfaces as a diff here.
 * Deterministic: no clock, no rAF — bindings and frame interpolation are pure.
 */

afterEach(() => {
  document.body.innerHTML = '';
});

describe('golden — bind a lower-third', () => {
  it('a fixed set of field values produces the exact rendered DOM', () => {
    const scene = structuredClone(lowerThirdScene);
    // Two more bindings so the snapshot exercises text + colour + visibility together.
    scene.fields.push(
      { id: 'tint', label: 'Tint', required: false, type: 'color', default: '#000000' },
      { id: 'show', label: 'Show', required: false, type: 'boolean', default: true },
    );
    scene.bindings.push(
      { fieldId: 'tint', target: { kind: 'color', elementId: 'bg', property: 'fill' } },
      { fieldId: 'show', target: { kind: 'visible', elementId: 'name' } },
    );

    const { container, elementMap, textOriginals } = buildScene(scene);
    applyFieldValues(
      scene,
      { anchor: 'دکتر مریم رضایی', tint: '#E11D48', show: true },
      elementMap,
      textOriginals,
      container,
    );

    const name = elementMap.get('name')!;
    const bg = elementMap.get('bg')!;
    // Placeholder `{{anchor}}` fully replaced by the field value.
    expect(name.textContent).toBe('دکتر مریم رضایی');
    expect(name.style.display).toBe(''); // visible:true → no `none`
    expect(name.style.direction).toBe('rtl');
    expect(bg.style.background).toMatch(/#e11d48|225, 29, 72/i);
    // Static layout from the fixture transform is untouched by binding.
    expect(bg.style.left).toBe('100px');
    expect(bg.style.top).toBe('800px');
  });

  it('an explicit false visibility hides the bound element', () => {
    const scene = structuredClone(lowerThirdScene);
    scene.fields.push({
      id: 'show',
      label: 'Show',
      required: false,
      type: 'boolean',
      default: true,
    });
    scene.bindings.push({ fieldId: 'show', target: { kind: 'visible', elementId: 'name' } });
    const { container, elementMap, textOriginals } = buildScene(scene);
    applyFieldValues(scene, { show: false }, elementMap, textOriginals, container);
    expect(elementMap.get('name')!.style.display).toBe('none');
  });
});

describe('golden — animate one element across its timeline', () => {
  const source: ShapeElement = {
    id: 'rect',
    name: 'rect',
    type: 'shape',
    transform: {
      position: { x: 100, y: 200 },
      size: { w: 400, h: 80 },
      scale: { x: 1, y: 1 },
      rotation: 0,
      anchor: { x: 0, y: 0 },
    },
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    shape: 'rect',
    fill: { kind: 'solid', color: '#000000' },
  };

  /** Linear keyframes 0→20 on every transform axis + a fill-colour fade. */
  const entry: AnimatedElement = {
    id: 'rect',
    node: document.createElement('div'),
    source,
    animation: {
      tracks: {
        'position.x': {
          keyframes: [
            { frame: 0, value: 100, easing: 'linear' },
            { frame: 20, value: 500, easing: 'linear' },
          ],
        },
        'position.y': {
          keyframes: [
            { frame: 0, value: 200, easing: 'linear' },
            { frame: 20, value: 600, easing: 'linear' },
          ],
        },
        'size.w': {
          keyframes: [
            { frame: 0, value: 400, easing: 'linear' },
            { frame: 20, value: 800, easing: 'linear' },
          ],
        },
        'size.h': {
          keyframes: [
            { frame: 0, value: 80, easing: 'linear' },
            { frame: 20, value: 280, easing: 'linear' },
          ],
        },
        'scale.x': {
          keyframes: [
            { frame: 0, value: 1, easing: 'linear' },
            { frame: 20, value: 3, easing: 'linear' },
          ],
        },
        'scale.y': {
          keyframes: [
            { frame: 0, value: 1, easing: 'linear' },
            { frame: 20, value: 2, easing: 'linear' },
          ],
        },
        rotation: {
          keyframes: [
            { frame: 0, value: 0, easing: 'linear' },
            { frame: 20, value: 90, easing: 'linear' },
          ],
        },
        opacity: {
          keyframes: [
            { frame: 0, value: 0, easing: 'linear' },
            { frame: 20, value: 1, easing: 'linear' },
          ],
        },
        'fill.color': {
          keyframes: [
            { frame: 0, value: '#000000', easing: 'linear' },
            { frame: 20, value: '#FFFFFF', easing: 'linear' },
          ],
        },
      },
    },
  };

  it('frame 0 = the start keyframes', () => {
    applyAnimationAtFrame(entry, 0);
    const s = entry.node.style;
    expect([s.left, s.top, s.width, s.height]).toEqual(['100px', '200px', '400px', '80px']);
    expect(s.transform).toBe(''); // scale(1,1) + rotate(0) collapse to nothing
    expect(s.opacity).toBe('0');
    expect(s.background).toMatch(/#000000|rgb\(0, 0, 0\)/i);
  });

  it('frame 10 = the linear midpoint of every track', () => {
    applyAnimationAtFrame(entry, 10);
    const s = entry.node.style;
    expect([s.left, s.top, s.width, s.height]).toEqual(['300px', '400px', '600px', '180px']);
    expect(s.transform).toBe('scale(2, 1.5) rotate(45deg)');
    expect(s.opacity).toBe('0.5');
    expect(s.background).toMatch(/#808080|rgb\(128, 128, 128\)/i);
  });

  it('frame 20 = the end keyframes', () => {
    applyAnimationAtFrame(entry, 20);
    const s = entry.node.style;
    expect([s.left, s.top, s.width, s.height]).toEqual(['500px', '600px', '800px', '280px']);
    expect(s.transform).toBe('scale(3, 2) rotate(90deg)');
    expect(s.opacity).toBe('1');
    expect(s.background).toMatch(/#ffffff|rgb\(255, 255, 255\)/i);
  });
});
