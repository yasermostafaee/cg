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

  describe('B-016/B-017 — gradient text on a dedicated inner node (linear + radial)', () => {
    const GRADIENTS = {
      linear: {
        kind: 'linear',
        angle: 90,
        stops: [
          { at: 0, color: '#FF0000' },
          { at: 1, color: '#0000FF' },
        ],
      },
      radial: {
        kind: 'radial',
        center: { x: 0.5, y: 0.5 },
        radius: 200,
        stops: [
          { at: 0, color: '#FF0000' },
          { at: 1, color: '#0000FF' },
        ],
      },
    } as const;

    function gradientTextScene(fill: unknown, extra?: Record<string, unknown>): Scene {
      const scene = structuredClone(lowerThirdScene);
      const txt = scene.layers[0]?.children.find((e) => e.id === 'name');
      if (txt === undefined || txt.type !== 'text') throw new Error('fixture changed');
      Object.assign(txt, { colorFill: fill }, extra);
      return scene;
    }
    const innerOf = (host: HTMLElement | undefined): HTMLElement | null =>
      host?.querySelector<HTMLElement>('[data-cg-text]') ?? null;

    for (const kind of ['linear', 'radial'] as const) {
      it(`${kind}: the gradient + clip + text live on the inner node, not the host`, () => {
        const el = buildScene(gradientTextScene(GRADIENTS[kind])).elementMap.get('name');
        const inner = innerOf(el);
        expect(inner).not.toBeNull();
        expect(inner?.style.background).toMatch(new RegExp(`${kind}-gradient`));
        expect(inner?.style.color).toBe('transparent');
        expect(inner?.style.getPropertyValue('background-clip')).toBe('text');
        expect(inner?.textContent).toBe('{{anchor}}');
        // The host is NOT clipped and does not carry the transparent text colour.
        expect(el?.style.getPropertyValue('background-clip')).toBe('');
        expect(el?.style.color).not.toBe('transparent');
      });

      it(`${kind}: B-016 — a box background renders independently (not clipped away)`, () => {
        const el = buildScene(
          gradientTextScene(GRADIENTS[kind], { backgroundColor: '#0A0A0A' }),
        ).elementMap.get('name');
        // Box background survives on the OUTER host…
        expect(el?.style.backgroundColor).toMatch(/#0A0A0A/i);
        expect(el?.style.getPropertyValue('background-clip')).toBe('');
        // …while the gradient text fill is on the inner node.
        expect(innerOf(el)?.style.background).toMatch(new RegExp(`${kind}-gradient`));
      });

      it(`${kind}: B-017 — a Text Shadow renders as drop-shadow behind the gradient`, () => {
        const el = buildScene(
          gradientTextScene(GRADIENTS[kind], {
            textShadow: { offsetX: 2, offsetY: 3, blur: 4, color: '#123456' },
          }),
        ).elementMap.get('name');
        const inner = innerOf(el);
        expect(inner?.style.filter).toContain('drop-shadow(');
        expect(inner?.style.filter).toContain('4px');
        expect(inner?.style.filter).toContain('#123456');
        // NOT a text-shadow (which would paint over the gradient); host untouched.
        expect(inner?.style.textShadow).toBe('');
        expect(el?.style.textShadow).toBe('');
        expect(el?.style.filter).toBe('');
      });

      it(`${kind}: B-016 — the gradient maps to the TEXT (content-sized inner node), not the box width`, () => {
        const build = (boxWidth: number): HTMLElement | undefined => {
          const scene = gradientTextScene(GRADIENTS[kind], { align: 'center' });
          const txt = scene.layers[0]?.children.find((e) => e.id === 'name');
          if (txt === undefined || txt.type !== 'text') throw new Error('fixture changed');
          txt.transform = { ...txt.transform, size: { ...txt.transform.size, w: boxWidth } };
          return buildScene(scene).elementMap.get('name');
        };
        const narrow = build(160);
        const wide = build(2000);
        const innerN = innerOf(narrow);
        const innerW = innerOf(wide);
        // The inner gradient node is content-sized (capped at the box so long text wraps,
        // but shrinks to the text otherwise) — its gradient declaration does NOT depend on
        // the box width, so widening the box can't shift which stop falls on a glyph.
        expect(innerN?.style.maxWidth).toBe('100%');
        expect(innerN?.style.background).toBe(innerW?.style.background);
        // The host content-sizes the inner via flex (align-items from `align`, NOT stretch),
        // and never carries the gradient/clip itself (which would span the box width).
        expect(narrow?.style.display).toBe('flex');
        expect(narrow?.style.alignItems).toBe('center');
        expect(narrow?.style.getPropertyValue('background-clip')).toBe('');
      });
    }

    it('solid text colour is unchanged — host renders colour + text-shadow, no inner node', () => {
      const el = buildScene(
        gradientTextScene(
          { kind: 'solid', color: '#00FF00' },
          { textShadow: { offsetX: 1, offsetY: 1, blur: 2, color: '#111111' } },
        ),
      ).elementMap.get('name');
      expect(innerOf(el)).toBeNull();
      expect(el?.style.color).toMatch(/#00FF00/i);
      expect(el?.style.textShadow).toContain('2px');
      expect(el?.style.filter).toBe('');
      expect(el?.textContent).toBe('{{anchor}}');
    });
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

  it('D-057 — a text element paints BOTH text-shadow (textShadow) and box-shadow (shadow)', () => {
    const scene = structuredClone(lowerThirdScene);
    const txt = scene.layers[0]?.children.find((e) => e.id === 'name');
    if (txt === undefined || txt.type !== 'text') throw new Error('fixture changed');
    txt.textShadow = { offsetX: 1, offsetY: 1, blur: 2, color: '#111111' };
    txt.shadow = { offsetX: 3, offsetY: 4, blur: 5, color: '#222222' };
    const el = buildScene(scene).elementMap.get('name');
    // text-shadow on the glyphs (from textShadow) AND box-shadow on the box (from shadow).
    expect(el?.style.textShadow).toContain('2px');
    expect(el?.style.boxShadow).toContain('5px');
    expect(el?.style.boxShadow).toContain('3px');
  });

  it('D-043 — the box-shadow emits the spread length + inset prefix for shape AND text', () => {
    const scene = structuredClone(lowerThirdScene);
    const shape = scene.layers[0]?.children.find((e) => e.id === 'bg');
    const txt = scene.layers[0]?.children.find((e) => e.id === 'name');
    if (shape === undefined || shape.type !== 'shape') throw new Error('fixture changed');
    if (txt === undefined || txt.type !== 'text') throw new Error('fixture changed');
    shape.shadow = { offsetX: 1, offsetY: 2, blur: 3, spread: 4, inset: true, color: '#111111' };
    txt.shadow = { offsetX: 5, offsetY: 6, blur: 7, spread: 8, color: '#222222' };
    const { elementMap } = buildScene(scene);
    // Shape: inset prefix + the 4th spread length, from the single composer.
    expect(elementMap.get('bg')?.style.boxShadow).toBe('inset 1px 2px 3px 4px #111111');
    // Text box: no inset (false), spread length present.
    expect(elementMap.get('name')?.style.boxShadow).toBe('5px 6px 7px 8px #222222');
  });

  it('D-043 — spread/inset never leak onto a text-shadow or a gradient drop-shadow', () => {
    // The spread/inset fields are structurally allowed on the SHARED Shadow type, so a
    // textShadow may carry them — but every text-shadow / drop-shadow path must IGNORE them.
    // Solid text → text-shadow (no spread/inset); gradient text → drop-shadow (no spread/inset).
    const solid = structuredClone(lowerThirdScene);
    const solidTxt = solid.layers[0]?.children.find((e) => e.id === 'name');
    if (solidTxt === undefined || solidTxt.type !== 'text') throw new Error('fixture changed');
    solidTxt.colorFill = { kind: 'solid', color: '#00FF00' };
    solidTxt.textShadow = {
      offsetX: 1,
      offsetY: 1,
      blur: 2,
      spread: 9,
      inset: true,
      color: '#111111',
    };
    const solidEl = buildScene(solid).elementMap.get('name');
    expect(solidEl?.style.textShadow).toBe('1px 1px 2px #111111');
    expect(solidEl?.style.textShadow).not.toContain('inset');
    expect(solidEl?.style.textShadow).not.toContain('9px');

    const grad = structuredClone(lowerThirdScene);
    const gradTxt = grad.layers[0]?.children.find((e) => e.id === 'name');
    if (gradTxt === undefined || gradTxt.type !== 'text') throw new Error('fixture changed');
    gradTxt.colorFill = {
      kind: 'linear',
      angle: 0,
      stops: [
        { at: 0, color: '#000000' },
        { at: 1, color: '#FFFFFF' },
      ],
    };
    gradTxt.textShadow = {
      offsetX: 2,
      offsetY: 3,
      blur: 4,
      spread: 9,
      inset: true,
      color: '#123456',
    };
    const inner = buildScene(grad)
      .elementMap.get('name')
      ?.querySelector<HTMLElement>('[data-cg-text]');
    expect(inner?.style.filter).toBe('drop-shadow(2px 3px 4px #123456)');
    expect(inner?.style.filter).not.toContain('inset');
    expect(inner?.style.filter).not.toContain('9px');
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

  for (const kind of ['linear', 'radial'] as const) {
    const fill =
      kind === 'linear'
        ? {
            kind: 'linear' as const,
            angle: 90,
            stops: [
              { at: 0, color: '#FF0000' },
              { at: 1, color: '#0000FF' },
            ],
          }
        : {
            kind: 'radial' as const,
            center: { x: 0.5, y: 0.5 },
            radius: 120,
            stops: [
              { at: 0, color: '#FF0000' },
              { at: 1, color: '#0000FF' },
            ],
          };

    it(`B-016/B-017 — ${kind} gradient: clip on the content-sized span, drop-shadow on the host filter`, () => {
      const built = buildScene(
        clockScene({
          colorFill: fill,
          textShadow: { offsetX: 2, offsetY: 3, blur: 5, color: '#123456' },
          filter: { blur: 4 },
        }),
      );
      const box = built.elementMap.get('clk')!;
      const timeSpan = box.querySelector<HTMLElement>('[data-cg-clock-time]')!;
      // B-016 — the gradient + clip live on the content-sized time span, not the box.
      expect(timeSpan.style.background).toMatch(new RegExp(`${kind}-gradient`));
      expect(timeSpan.style.getPropertyValue('background-clip')).toBe('text');
      expect(timeSpan.style.color).toBe('transparent');
      expect(box.style.getPropertyValue('background-clip')).toBe('');
      // B-017 — the glyph shadow is a drop-shadow composed WITH element.filter (blur)
      // on the host (the node the applier writes) — not a text-shadow.
      expect(box.style.filter).toContain('blur(4px)');
      expect(box.style.filter).toContain('drop-shadow(');
      expect(box.style.filter).toContain('5px');
      expect(box.style.textShadow).toBe('');
    });
  }

  it('B-017 — a SOLID clock keeps text-shadow (no drop-shadow)', () => {
    const built = buildScene(
      clockScene({
        colorFill: { kind: 'solid', color: '#00FF00' },
        textShadow: { offsetX: 1, offsetY: 1, blur: 2, color: '#111111' },
      }),
    );
    const box = built.elementMap.get('clk')!;
    expect(box.style.textShadow).toContain('2px');
    expect(box.style.filter).not.toContain('drop-shadow');
    expect(box.style.getPropertyValue('background-clip')).toBe('');
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

  it('B-016/B-017 — radial-gradient sequence: clip on the content-sized item, drop-shadow on the host', () => {
    const built = buildScene(
      sequenceScene({
        colorFill: {
          kind: 'radial',
          center: { x: 0.5, y: 0.5 },
          radius: 160,
          stops: [
            { at: 0, color: '#FF0000' },
            { at: 1, color: '#0000FF' },
          ],
        },
        textShadow: { offsetX: 2, offsetY: 2, blur: 6, color: '#222222' },
      }),
    );
    const host = built.elementMap.get('seq')!;
    const item = host.querySelector<HTMLElement>('[data-cg-sequence-item]')!;
    // B-016 — gradient + clip on the content-sized item node, not the host box.
    expect(item.style.background).toMatch(/radial-gradient/);
    expect(item.style.getPropertyValue('background-clip')).toBe('text');
    expect(item.style.color).toBe('transparent');
    expect(host.style.getPropertyValue('background-clip')).toBe('');
    // B-017 — glyph shadow as a drop-shadow on the host (the node the applier writes).
    expect(host.style.filter).toContain('drop-shadow(');
    expect(host.style.filter).toContain('6px');
    expect(host.style.textShadow).toBe('');
  });

  it('B-017 — a SOLID sequence keeps text-shadow (no drop-shadow)', () => {
    const built = buildScene(
      sequenceScene({
        colorFill: { kind: 'solid', color: '#00FF00' },
        textShadow: { offsetX: 1, offsetY: 1, blur: 3, color: '#333333' },
      }),
    );
    const host = built.elementMap.get('seq')!;
    expect(host.style.textShadow).toContain('3px');
    expect(host.style.filter).not.toContain('drop-shadow');
  });
});
