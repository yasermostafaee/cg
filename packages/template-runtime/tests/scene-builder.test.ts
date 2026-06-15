import { describe, expect, it } from 'vitest';
import type { ClockElement, Scene, SequenceElement } from '@cg/shared-schema';
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

  it('renders a gradient text fill via background-clip', () => {
    const scene = structuredClone(lowerThirdScene);
    const txt = scene.layers[0]?.children.find((e) => e.id === 'name');
    if (txt === undefined || txt.type !== 'text') throw new Error('fixture changed');
    txt.colorFill = {
      kind: 'linear',
      angle: 90,
      stops: [
        { at: 0, color: '#FF0000' },
        { at: 1, color: '#0000FF' },
      ],
    };
    const el = buildScene(scene).elementMap.get('name');
    expect(el?.style.background).toMatch(/linear-gradient/);
    expect(el?.style.color).toBe('transparent');
    expect(el?.style.getPropertyValue('background-clip')).toBe('text');
  });

  it('renders a solid colorFill as the text colour and a gradient text background', () => {
    const scene = structuredClone(lowerThirdScene);
    const txt = scene.layers[0]?.children.find((e) => e.id === 'name');
    if (txt === undefined || txt.type !== 'text') throw new Error('fixture changed');
    txt.colorFill = { kind: 'solid', color: '#00FF00' };
    txt.backgroundFill = {
      kind: 'radial',
      center: { x: 0.5, y: 0.5 },
      radius: 100,
      stops: [
        { at: 0, color: '#111111' },
        { at: 1, color: '#222222' },
      ],
    };
    const el = buildScene(scene).elementMap.get('name');
    expect(el?.style.color).toMatch(/#00FF00/i);
    expect(el?.style.background).toMatch(/radial-gradient/);
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

describe('buildClock — static initial render (D-027)', () => {
  function clockScene(clock: Partial<ClockElement>): Scene {
    const element: ClockElement = {
      id: 'clk',
      name: 'clock',
      type: 'clock',
      transform: {
        position: { x: 10, y: 20 },
        size: { w: 320, h: 84 },
        scale: { x: 1, y: 1 },
        rotation: 0,
        anchor: { x: 0.5, y: 0.5 },
      },
      opacity: 1,
      visible: true,
      locked: false,
      zIndex: 0,
      font: {
        family: 'Vazirmatn',
        weight: 600,
        style: 'normal',
        size: 48,
        lineHeight: 1.2,
        letterSpacing: 0,
      },
      color: '#FFFFFF',
      align: 'center',
      mode: 'wall',
      format: 'HH:mm:ss',
      digits: 'persian',
      ...clock,
    };
    return {
      schemaVersion: 1,
      id: 'scene-clock',
      name: 'clock',
      templateType: 'custom',
      resolution: { width: 1920, height: 1080 },
      frameRate: 50,
      safeAreas: { title: 10, action: 5 },
      frameRange: { in: 0, out: 50 },
      background: 'transparent',
      layers: [
        {
          id: 'L1',
          name: 'main',
          visible: true,
          locked: false,
          blendMode: 'normal',
          children: [element],
        },
      ],
      fields: [],
      bindings: [],
      fonts: [],
      metadata: { createdAt: '2026-06-11T00:00:00.000Z', updatedAt: '2026-06-11T00:00:00.000Z' },
    };
  }

  function span(built: ReturnType<typeof buildScene>): HTMLElement {
    const node = built.elementMap.get('clk')?.querySelector<HTMLElement>('[data-cg-clock-time]');
    if (node === null || node === undefined) throw new Error('clock span not rendered');
    return node;
  }

  it('a wall clock shows the build-time time with Persian digits', () => {
    const built = buildScene(clockScene({}));
    expect(span(built).textContent).toMatch(/^[۰-۹]{2}:[۰-۹]{2}:[۰-۹]{2}$/u);
  });

  it('a countdown shows the FULL target remaining; overflow absorbed by the largest unit', () => {
    const built = buildScene(
      clockScene({
        mode: 'countdown',
        format: 'mm:ss',
        digits: 'latin',
        target: { kind: 'duration', ms: 90 * 60_000 },
      }),
    );
    expect(span(built).textContent).toBe('90:00');
  });

  it('a countup shows zero', () => {
    const built = buildScene(clockScene({ mode: 'countup', format: 'mm:ss', digits: 'latin' }));
    expect(span(built).textContent).toBe('00:00');
  });

  it('D-056 — a clock paints NO border-radius or stroke (box styling removed)', () => {
    const built = buildScene(
      clockScene({ cornerRadius: [4, 8, 12, 16], stroke: { width: 3, color: '#00FF00' } }),
    );
    const node = built.elementMap.get('clk')!;
    expect(node.style.borderRadius).toBe('');
    expect(node.style.border).toBe('');
  });

  it('the time span is LTR, bidi-isolated, and width-stable (tabular numerals)', () => {
    const built = buildScene(clockScene({}));
    const node = span(built);
    expect(node.style.direction).toBe('ltr');
    expect(node.style.unicodeBidi).toBe('isolate');
    expect(node.style.fontVariantNumeric).toBe('tabular-nums');
  });

  it('the box is flex-aligned per `align`; D-056 — no background / radius / padding painted', () => {
    const built = buildScene(
      clockScene({
        align: 'end',
        backgroundColor: '#112233',
        cornerRadius: 8,
        padding: { top: 4, right: 12, bottom: 4, left: 12 },
      }),
    );
    const box = built.elementMap.get('clk');
    expect(box?.style.display).toBe('flex');
    expect(box?.style.justifyContent).toBe('flex-end');
    expect(box?.style.fontFamily.startsWith('Vazirmatn,')).toBe(true);
    // D-056 — box styling is no longer painted for the content-driven kinds.
    expect(box?.style.backgroundColor).toBe('');
    expect(box?.style.borderRadius).toBe('');
    expect(box?.style.paddingLeft).toBe('');
  });

  it('built clocks are collected on the scope (driver + content-hold seam)', () => {
    const built = buildScene(clockScene({}));
    expect(built.scopeTree.clocks).toHaveLength(1);
    expect(built.scopeTree.clocks[0]?.element.id).toBe('clk');
    expect(built.scopeTree.clocks[0]?.node).toBe(span(built));
  });
});

describe('buildSequence — static item-1 render (D-029)', () => {
  function sequenceScene(seq: Partial<SequenceElement>): Scene {
    const element: SequenceElement = {
      id: 'seq',
      name: 'now-next',
      type: 'sequence',
      transform: {
        position: { x: 10, y: 20 },
        size: { w: 720, h: 72 },
        scale: { x: 1, y: 1 },
        rotation: 0,
        anchor: { x: 0.5, y: 0.5 },
      },
      opacity: 1,
      visible: true,
      locked: false,
      zIndex: 0,
      font: {
        family: 'Vazirmatn',
        weight: 500,
        style: 'normal',
        size: 36,
        lineHeight: 1.4,
        letterSpacing: 0,
      },
      color: '#FFFFFF',
      align: 'start',
      direction: 'rtl',
      items: [
        { id: 'a', text: 'اکنون: برنامهٔ نخست' },
        { id: 'b', text: 'سپس: برنامهٔ دوم' },
      ],
      defaultDwellMs: 5000,
      advance: 'auto',
      transitionIn: 'bottom',
      transitionOut: 'top',
      transitionTiming: 'simultaneous',
      transitionMs: 400,
      repeat: 'infinite',
      ...seq,
    };
    return {
      schemaVersion: 1,
      id: 'scene-seq',
      name: 'sequence',
      templateType: 'custom',
      resolution: { width: 1920, height: 1080 },
      frameRate: 50,
      safeAreas: { title: 10, action: 5 },
      frameRange: { in: 0, out: 50 },
      background: 'transparent',
      layers: [
        {
          id: 'L1',
          name: 'main',
          visible: true,
          locked: false,
          blendMode: 'normal',
          children: [element],
        },
      ],
      fields: [],
      bindings: [],
      fonts: [],
      metadata: { createdAt: '2026-06-11T00:00:00.000Z', updatedAt: '2026-06-11T00:00:00.000Z' },
    };
  }

  it('renders ONLY item 1 statically, bidi-isolated with the element direction', () => {
    const built = buildScene(sequenceScene({}));
    const host = built.elementMap.get('seq');
    const items = host?.querySelectorAll<HTMLElement>('[data-cg-sequence-item]') ?? [];
    expect(items).toHaveLength(1);
    expect(items[0]?.textContent).toBe('اکنون: برنامهٔ نخست');
    expect(items[0]?.style.direction).toBe('rtl');
    expect(items[0]?.style.unicodeBidi).toBe('isolate');
    expect(items[0]?.style.gridArea).toContain('1');
  });

  it('the host is a clipped single-cell grid, aligned per `align`', () => {
    const built = buildScene(sequenceScene({ align: 'end' }));
    const host = built.elementMap.get('seq');
    expect(host?.style.overflow).toBe('hidden');
    expect(host?.style.display).toBe('grid');
    expect(host?.style.alignItems).toBe('center');
    expect(host?.style.justifyItems).toBe('end');
    expect(host?.style.fontFamily.startsWith('Vazirmatn,')).toBe(true);
  });

  it("the host carries the READING direction so `align: 'start'` is the reading start", () => {
    // Grid `justify-items` is direction-sensitive: without this, a Persian
    // `start` would resolve against the inherited LTR and land on the left.
    const rtl = buildScene(sequenceScene({})).elementMap.get('seq');
    expect(rtl?.style.direction).toBe('rtl');
    const ltr = buildScene(sequenceScene({ direction: 'ltr' })).elementMap.get('seq');
    expect(ltr?.style.direction).toBe('ltr');
  });

  it('an empty items list renders an empty box', () => {
    const built = buildScene(sequenceScene({ items: [] }));
    const host = built.elementMap.get('seq');
    expect(host?.querySelectorAll('[data-cg-sequence-item]')).toHaveLength(0);
  });

  it('built sequences are collected on the scope (driver + next() seam)', () => {
    const built = buildScene(sequenceScene({}));
    expect(built.scopeTree.sequences).toHaveLength(1);
    expect(built.scopeTree.sequences[0]?.element.id).toBe('seq');
    expect(built.scopeTree.sequences[0]?.host).toBe(built.elementMap.get('seq'));
  });
});
