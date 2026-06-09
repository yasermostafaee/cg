import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Composition, Element, Scene, Track } from '@cg/shared-schema';
import { applyFieldValues } from '../src/bindings.js';
import { applyAnimationAtFrame, type AnimatedElement } from '../src/animation-applier.js';
import { buildScene } from '../src/scene-builder.js';
import { interpolateAtFrame } from '../src/keyframe-eval.js';
import { FrameDriver } from '../src/frame-driver.js';
import { createRuntime } from '../src/runtime.js';
import { installCasparGlobals } from '../src/adapters/caspar-globals.js';
import { lowerThirdScene } from './fixtures.js';

/**
 * Coverage for the engine paths the per-feature suites don't already touch:
 * the `transform`/`lottie-override` binding targets, the non-text element
 * builders + their style branches, the FrameDriver guard clauses, the
 * keyframe-eval contract edges, and the CasparCG global cleanup paths.
 */

// — bindings.ts: transform + lottie-override targets ——————————————————————

describe('applyFieldValues — transform + lottie-override targets', () => {
  /** Build the lower-third, add one extra field+binding, return the bound node. */
  function bindExtra(
    target: Scene['bindings'][number]['target'],
    value: unknown,
    fieldType: 'number' | 'text' = 'number',
  ): HTMLElement | undefined {
    const scene = structuredClone(lowerThirdScene);
    scene.fields.push(
      fieldType === 'number'
        ? { id: 'x', label: 'X', required: false, type: 'number', default: 0 }
        : { id: 'x', label: 'X', required: false, type: 'text', default: '' },
    );
    scene.bindings.push({ fieldId: 'x', target });
    const { container, elementMap, textOriginals } = buildScene(scene);
    applyFieldValues(scene, { x: value }, elementMap, textOriginals, container);
    return elementMap.get('bg');
  }

  it('writes opacity', () => {
    expect(
      bindExtra({ kind: 'transform', elementId: 'bg', property: 'opacity' }, 0.4)?.style.opacity,
    ).toBe('0.4');
  });

  it('writes x → left and y → top', () => {
    expect(bindExtra({ kind: 'transform', elementId: 'bg', property: 'x' }, 42)?.style.left).toBe(
      '42px',
    );
    expect(bindExtra({ kind: 'transform', elementId: 'bg', property: 'y' }, 17)?.style.top).toBe(
      '17px',
    );
  });

  it('writes scale and rotation as a CSS transform', () => {
    expect(
      bindExtra({ kind: 'transform', elementId: 'bg', property: 'scale' }, 2)?.style.transform,
    ).toBe('scale(2)');
    expect(
      bindExtra({ kind: 'transform', elementId: 'bg', property: 'rotation' }, 90)?.style.transform,
    ).toBe('rotate(90deg)');
  });

  it('ignores a non-finite transform value', () => {
    // A text value coerces to NaN → the binding is a no-op (keeps the built-in opacity).
    expect(
      bindExtra({ kind: 'transform', elementId: 'bg', property: 'opacity' }, 'not-a-number', 'text')
        ?.style.opacity,
    ).toBe('1');
  });

  it('lottie-override is a no-op (lands with M3.3) and does not throw', () => {
    expect(() =>
      bindExtra({ kind: 'lottie-override', elementId: 'bg', layer: 'l', prop: 'p' }, 'x', 'text'),
    ).not.toThrow();
  });

  it('writes colour to stroke (border) and to text colour', () => {
    expect(
      bindExtra({ kind: 'color', elementId: 'bg', property: 'stroke' }, '#123456', 'text')?.style
        .borderColor,
    ).toMatch(/#123456|18, 52, 86/i);
    expect(
      bindExtra({ kind: 'color', elementId: 'bg', property: 'text' }, '#654321', 'text')?.style
        .color,
    ).toMatch(/#654321|101, 67, 33/i);
  });

  it('writes an image asset id to src + data attribute', () => {
    const scene = structuredClone(lowerThirdScene) as Scene;
    scene.layers[0]!.children = [
      {
        ...baseElProps,
        id: 'im',
        name: 'logo',
        type: 'image',
        assetId: 'placeholder',
        fit: 'cover',
      } as unknown as Element,
    ];
    scene.fields.push({
      id: 'logo',
      label: 'Logo',
      required: false,
      type: 'image',
      default: { assetId: 'placeholder' },
    });
    scene.bindings.push({ fieldId: 'logo', target: { kind: 'image', elementId: 'im' } });
    const { container, elementMap, textOriginals } = buildScene(scene);
    applyFieldValues(
      scene,
      { logo: { assetId: 'newAsset' } },
      elementMap,
      textOriginals,
      container,
    );
    const img = elementMap.get('im') as HTMLImageElement;
    expect(img.dataset['cgAssetId']).toBe('newAsset');
    expect(img.src).toContain('newAsset');
  });
});

// — scene-builder.ts: non-text builders + style branches ————————————————————

const baseTransform = {
  position: { x: 0, y: 0 },
  size: { w: 100, h: 100 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
};
const baseElProps = {
  transform: baseTransform,
  opacity: 1,
  visible: true,
  locked: false,
  zIndex: 0,
};

/** Drop a single element into the lower-third's layer and build it. */
function buildWith(element: Element): HTMLElement | undefined {
  const scene = structuredClone(lowerThirdScene) as Scene;
  scene.layers[0]!.children = [element];
  return buildScene(scene).elementMap.get(element.id);
}

describe('buildScene — element builders + style branches', () => {
  it('renders container / lottie / video-placeholder as tagged placeholder divs', () => {
    for (const type of ['container', 'lottie', 'video-placeholder'] as const) {
      const node = buildWith({
        ...baseElProps,
        id: `e-${type}`,
        name: type,
        type,
        clip: false,
        children: [],
      } as unknown as Element);
      expect(node?.dataset['cgPlaceholderFor']).toBe(type);
    }
  });

  it('renders a shape drop shadow as box-shadow', () => {
    const node = buildWith({
      ...baseElProps,
      id: 'sh',
      name: 'sh',
      type: 'shape',
      shape: 'rect',
      shadow: { offsetX: 2, offsetY: 3, blur: 4, color: '#000000' },
    } as unknown as Element);
    expect(node?.style.boxShadow).toBe('2px 3px 4px #000000');
  });

  it('renders a per-corner cornerRadius array and a dashed stroke on a rect', () => {
    const node = buildWith({
      ...baseElProps,
      id: 'sh',
      name: 'sh',
      type: 'shape',
      shape: 'rect',
      cornerRadius: [1, 2, 3, 4],
      stroke: { color: '#abcdef', width: 3, dash: [4, 2] },
    } as unknown as Element);
    expect(node?.style.borderRadius).toBe('1px 2px 3px 4px');
    expect(node?.style.border).toContain('dashed');
  });

  it('renders an image with object-fit, alt, asset id, and a tint filter', () => {
    const node = buildWith({
      ...baseElProps,
      id: 'im',
      name: 'logo',
      type: 'image',
      assetId: 'a1',
      fit: 'contain',
      tint: '#ff0000',
    } as unknown as Element);
    expect(node?.style.objectFit).toBe('contain');
    expect((node as HTMLImageElement).alt).toBe('logo');
    expect(node?.dataset['cgAssetId']).toBe('a1');
    expect(node?.style.filter).toContain('drop-shadow');
  });

  it('renders text padding, background colour, corner radius, no-wrap, and vertical align', () => {
    const node = buildWith({
      ...baseElProps,
      id: 'tx',
      name: 'tx',
      type: 'text',
      text: 'hi',
      font: {
        family: 'Inter',
        weight: 400,
        style: 'normal',
        size: 20,
        lineHeight: 1.2,
        letterSpacing: 0,
      },
      color: '#fff',
      align: 'start',
      direction: 'ltr',
      fitMode: 'fixed',
      overflow: 'clip',
      padding: { top: 1, right: 2, bottom: 3, left: 4 },
      backgroundColor: '#101010',
      cornerRadius: 6,
      wrap: false,
      verticalAlign: 'middle',
      textShadow: { offsetX: 1, offsetY: 1, blur: 2, color: '#000' },
    } as unknown as Element);
    expect(node?.style.paddingLeft).toBe('4px');
    expect(node?.style.backgroundColor).toMatch(/#101010|16, 16, 16/i);
    expect(node?.style.borderRadius).toBe('6px');
    expect(node?.style.whiteSpace).toBe('nowrap');
    expect(node?.style.justifyContent).toBe('center');
    expect(node?.style.textShadow).toContain('1px 1px 2px');
  });

  it('composes a CSS filter from a Filter object', () => {
    const node = buildWith({
      ...baseElProps,
      id: 'sh',
      name: 'sh',
      type: 'shape',
      shape: 'rect',
      filter: { blur: 2, brightness: 120, grayscale: 50 },
    } as unknown as Element);
    expect(node?.style.filter).toBe('blur(2px) brightness(120%) grayscale(50%)');
  });

  it('composes scale/rotation/skew into one transform', () => {
    const node = buildWith({
      ...baseElProps,
      id: 'sh',
      name: 'sh',
      type: 'shape',
      shape: 'rect',
      transform: { ...baseTransform, scale: { x: 2, y: 3 }, rotation: 45, skew: { x: 10, y: 5 } },
    } as unknown as Element);
    expect(node?.style.transform).toBe('scale(2, 3) rotate(45deg) skew(10deg, 5deg)');
  });
});

describe('buildScene — composition instance edges', () => {
  function sceneWith(instances: Element[], comps: Composition[]): Scene {
    return {
      ...structuredClone(lowerThirdScene),
      layers: [
        {
          id: 'L',
          name: 'main',
          visible: true,
          locked: false,
          blendMode: 'normal',
          children: instances,
        },
      ],
      compositions: comps,
    } as Scene;
  }

  it('renders a missing composition reference as an empty (inner-less) box', () => {
    const inst = {
      ...baseElProps,
      id: 'i',
      name: 'inst',
      type: 'composition',
      compositionId: 'ghost',
    } as unknown as Element;
    const node = buildScene(sceneWith([inst], [])).elementMap.get('i');
    expect(node?.dataset['cgCompositionId']).toBe('ghost');
    expect(node?.querySelector('.cg-comp-inner')).toBeNull();
  });

  it('stops recursion on a self-referential composition (cycle guard)', () => {
    // `self` instances itself → the inner render hits the visited-set and stops.
    const selfComp: Composition = {
      id: 'self',
      name: 'Self',
      resolution: { width: 100, height: 100 },
      frameRange: { in: 0, out: 10 },
      background: 'transparent',
      layers: [
        {
          id: 'cl',
          name: 'main',
          visible: true,
          locked: false,
          blendMode: 'normal',
          children: [
            {
              ...baseElProps,
              id: 'inner',
              name: 'inner',
              type: 'composition',
              compositionId: 'self',
            } as unknown as Element,
          ],
        },
      ],
      fields: [],
      bindings: [],
    };
    const inst = {
      ...baseElProps,
      id: 'i',
      name: 'inst',
      type: 'composition',
      compositionId: 'self',
    } as unknown as Element;
    expect(() => buildScene(sceneWith([inst], [selfComp]))).not.toThrow();
    // The outer instance renders its inner once; the self-reference inside does NOT.
    const inner = buildScene(sceneWith([inst], [selfComp])).container.querySelectorAll(
      '.cg-comp-inner',
    );
    expect(inner.length).toBe(1);
  });
});

// — animation-applier.ts: compose-from-static fallbacks ——————————————————————

describe('applyAnimationAtFrame — partial shadow/filter recompose from static', () => {
  function shape(extra: Partial<Element>): AnimatedElement {
    const source = {
      ...baseElProps,
      id: 'r',
      name: 'r',
      type: 'shape',
      shape: 'rect',
      ...extra,
    } as unknown as Element;
    return {
      id: 'r',
      node: document.createElement('div'),
      source,
      animation: { tracks: {} },
    } as AnimatedElement;
  }

  it('animating only shadow.blur keeps the element’s static offsets/colour', () => {
    const entry = shape({
      shadow: { offsetX: 5, offsetY: 6, blur: 1, color: '#abcdef' },
    } as Partial<Element>);
    entry.animation = {
      tracks: {
        'shadow.blur': {
          keyframes: [
            { frame: 0, value: 1, easing: 'linear' },
            { frame: 10, value: 11, easing: 'linear' },
          ],
        },
      },
    };
    applyAnimationAtFrame(entry, 10);
    expect(entry.node.style.boxShadow).toBe('5px 6px 11px #abcdef');
  });

  it('animating one filter sub-property recomposes the whole filter from static values', () => {
    const entry = shape({ filter: { brightness: 150, blur: 2 } } as Partial<Element>);
    entry.animation = {
      tracks: {
        'filter.blur': {
          keyframes: [
            { frame: 0, value: 2, easing: 'linear' },
            { frame: 10, value: 12, easing: 'linear' },
          ],
        },
      },
    };
    applyAnimationAtFrame(entry, 10);
    expect(entry.node.style.filter).toBe('blur(12px) brightness(150%)');
  });
});

// — frame-driver.ts: guard clauses ————————————————————————————————————————

function makeClock() {
  const clock = {
    ms: 0,
    pending: [] as ((ts: number) => void)[],
    now: () => clock.ms,
    raf: (cb: (ts: number) => void) => clock.pending.push(cb),
    cancel: () => {
      clock.pending = [];
    },
    advance: (ms: number) => {
      clock.ms += ms;
      const cbs = clock.pending;
      clock.pending = [];
      for (const cb of cbs) cb(clock.ms);
    },
  };
  return clock;
}

describe('FrameDriver — guard clauses', () => {
  it('pause() before start() is a no-op', () => {
    const clock = makeClock();
    const d = new FrameDriver({
      frameRate: 50,
      range: { in: 0, out: 10 },
      onFrame: () => undefined,
      raf: clock.raf,
      cancel: clock.cancel,
      now: clock.now,
    });
    expect(() => d.pause()).not.toThrow();
  });

  it('resume() while already running, and after a once-range ended, are no-ops', () => {
    const clock = makeClock();
    const frames: number[] = [];
    const running = new FrameDriver({
      frameRate: 50,
      range: { in: 0, out: 10 },
      onFrame: (f) => frames.push(f),
      raf: clock.raf,
      cancel: clock.cancel,
      now: clock.now,
    });
    running.start();
    running.resume(); // running → no-op
    clock.advance(20);
    expect(frames).toEqual([0, 1]);
    running.stop();

    const ended = new FrameDriver({
      frameRate: 50,
      range: { in: 5, out: 5 },
      mode: 'once',
      onFrame: () => undefined,
      raf: clock.raf,
      cancel: clock.cancel,
      now: clock.now,
    });
    ended.start(); // zero-length once → ends immediately
    expect(() => ended.resume()).not.toThrow(); // ended → no-op
  });

  it('loop mode with a zero-length range holds at range.in', () => {
    const clock = makeClock();
    const frames: number[] = [];
    const d = new FrameDriver({
      frameRate: 50,
      range: { in: 3, out: 3 },
      onFrame: (f) => frames.push(f),
      raf: clock.raf,
      cancel: clock.cancel,
      now: clock.now,
    });
    d.start();
    clock.advance(20);
    clock.advance(20);
    expect(frames).toEqual([3, 3, 3]);
    d.stop();
  });
});

// — keyframe-eval.ts: contract edges ——————————————————————————————————————

describe('interpolateAtFrame — contract edges', () => {
  it('throws when the track has no keyframes', () => {
    expect(() => interpolateAtFrame({ keyframes: [] } as unknown as Track, 0)).toThrow(/empty/);
  });

  it('snaps to the earlier value for a (schema-illegal) mixed-type pair', () => {
    const track = {
      keyframes: [
        { frame: 0, value: 5, easing: 'linear' },
        { frame: 10, value: '#fff', easing: 'linear' },
      ],
    } as unknown as Track;
    expect(interpolateAtFrame(track, 5)).toBe(5);
  });

  it('holds the earlier value across a step segment', () => {
    const track = {
      keyframes: [
        { frame: 0, value: 0, easing: 'step' },
        { frame: 10, value: 100, easing: 'linear' },
      ],
    } as unknown as Track;
    expect(interpolateAtFrame(track, 9)).toBe(0);
    expect(interpolateAtFrame(track, 10)).toBe(100);
  });
});

// — caspar-globals.ts: next/remove globals + non-object payload ————————————

describe('installCasparGlobals — remaining global routes', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.body.className = '';
  });
  afterEach(() => {
    document.body.innerHTML = '';
    document.body.className = '';
  });

  it('window.next() (runtime has no next → no-op) and window.remove() route without throwing', () => {
    const runtime = createRuntime(lowerThirdScene, { skipFontLoad: true });
    const off = installCasparGlobals(runtime);
    expect(() => window.next?.()).not.toThrow();
    expect(() => window.remove?.()).not.toThrow();
    expect(document.body.classList.contains('cg-removed')).toBe(true);
    off();
  });

  it('a non-string / non-object payload coerces to an empty patch', async () => {
    const runtime = createRuntime(lowerThirdScene, { skipFontLoad: true });
    const off = installCasparGlobals(runtime);
    window.play?.('{}');
    await new Promise((r) => setTimeout(r, 0));
    expect(() => window.update?.(42 as unknown as Record<string, unknown>)).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    // Value unchanged (still the field default), proving the numeric payload was dropped.
    expect(document.querySelector<HTMLElement>('[data-cg-element-id="name"]')?.textContent).toBe(
      'سارا نادری',
    );
    off();
  });
});
