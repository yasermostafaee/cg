import { describe, expect, it } from 'vitest';
import { Window } from 'happy-dom';
import type { Element, Scene } from '@cg/shared-schema';
import { buildScene, smpteBarsGradient, SMPTE_BARS } from '../src/scene-builder.js';
import { compileStepCss } from '../src/step-css.js';

/**
 * D-137 phase 1 §9 — the render-MODE seam, and the thing it exists for: a Live
 * Source paints SMPTE bars while authoring and **zero pixels** in both exports.
 *
 * Maps `specs/designer-live-source/spec.md`:
 *   - "Bars on the authoring surfaces, nothing in the exports"
 *   - "An authored zone cannot fill the hole on air" (a countdown STEP's change since
 *     `DELTA-RUN-NEXT-VERSION-01-A`)
 *
 * That case has no UI to drive it (the Designer offers no change on a Live Source), so it is
 * pinned HERE rather than in the E2E — it is representable in a hand-edited scene, which is the
 * whole reason it is a hazard.
 */

const baseTransform = {
  position: { x: 100, y: 200 },
  size: { w: 640, h: 360 },
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

function liveSource(over: Partial<Element & { type: 'video-placeholder' }> = {}): Element {
  return {
    ...baseElProps,
    id: 'live-a',
    name: 'Guest box',
    type: 'video-placeholder',
    expectedAspect: 16 / 9,
    routeKey: 'guest-1',
    ...over,
  } as Element;
}

function sceneWith(children: Element[]): Scene {
  return {
    schemaVersion: 1,
    id: 'scene-live',
    name: 'live',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    editorBackdrop: 'transparent',
    layers: [
      { id: 'L1', name: 'main', visible: true, locked: false, blendMode: 'normal', children },
    ],
    fonts: [],
    fields: [],
    bindings: [],
  } as unknown as Scene;
}

function build(scene: Scene, mode: 'author' | 'output'): { doc: Document; root: HTMLElement } {
  const window = new Window();
  const doc = window.document as unknown as Document;
  const built = buildScene(scene, doc, mode);
  return { doc, root: built.container };
}

const node = (root: HTMLElement, id = 'live-a'): HTMLElement =>
  root.querySelector<HTMLElement>(`[data-cg-element-id="${id}"]`) as HTMLElement;
const fallback = (root: HTMLElement, id = 'live-a'): HTMLElement =>
  node(root, id).querySelector<HTMLElement>('[data-cg-live-fallback]') as HTMLElement;

describe("D-137 — 'author' mode paints the bars", () => {
  it('R-105 — turning the fallback off affects output while authoring still draws the colour', () => {
    const scene = sceneWith([
      liveSource({ showFallback: false, fallbackKind: 'color', fallbackColor: '#21345f' }),
    ]);
    const author = build(scene, 'author').root;
    const output = build(scene, 'output').root;
    expect(node(author).querySelector('[data-cg-live-source-label]')?.textContent).toBe('guest-1');
    expect(fallback(author).style.background).toBe('#21345f');
    expect(node(output).querySelector('[data-cg-live-fallback]')).toBeNull();
  });

  it('R-105 — only the marked srcdoc rehearsal draws a disabled output poster', () => {
    const scene = sceneWith([liveSource({ showFallback: false, posterAssetId: 'poster' })]);
    const render = (url: string, marked: boolean): HTMLElement => {
      const window = new Window({ url });
      const frame = window.document.createElement('iframe');
      if (marked) frame.setAttribute('data-cg-pvw', '1');
      Object.defineProperty(window, 'frameElement', { value: frame });
      return buildScene(scene, window.document as unknown as Document, 'output').container;
    };

    const preview = render('about:srcdoc', true);
    expect(fallback(preview).querySelector('img')?.getAttribute('data-cg-asset-id')).toBe('poster');
    expect(node(preview).querySelector('[data-cg-live-source-label]')).toBeNull();
    expect(node(render('about:srcdoc', false)).querySelector('[data-cg-live-fallback]')).toBeNull();
    expect(
      node(render('http://localhost/template/test', true)).querySelector('[data-cg-live-fallback]'),
    ).toBeNull();
  });

  it('renders SMPTE bars with the id label overlaid', () => {
    const { root } = build(sceneWith([liveSource()]), 'author');
    const el = node(root);
    expect(el).not.toBeNull();
    // Procedural: a gradient, not a bundled bitmap. If this ever becomes a `url(…)`
    // the element has acquired a shipped asset, which is exactly what D-137 refuses.
    expect(fallback(root).style.backgroundImage).toContain('linear-gradient');
    expect(fallback(root).style.backgroundImage).not.toContain('url(');
    const label = el.querySelector<HTMLElement>('[data-cg-live-source-label]');
    expect(label?.textContent).toBe('guest-1');
    expect(label?.style.left).toBe('50%');
    expect(label?.style.top).toBe('50%');
    expect(label?.style.transform).toBe(
      'translate(-50%, -50%) scale(var(--cg-author-guide-scale, 2))',
    );
    expect(label?.style.textAlign).toBe('center');
    expect(label?.style.font).toContain('16px');
  });

  it('the gradient uses PAIRED stops, never the Chromium-72 double-position form', () => {
    // B-066 class. CasparCG's CEF is baseline Chromium 71; double-position colour
    // stops shipped in 72. The short form renders correctly in every browser we
    // develop in and breaks on air — so the shape of the string is the assertion.
    const { root } = build(sceneWith([liveSource()]), 'author');
    const g = fallback(root).style.backgroundImage;
    // Seven bars ⇒ fourteen stops, each `#rrggbb NN%`.
    expect((g.match(/#[0-9a-f]{6} [0-9.]+%/g) ?? []).length).toBe(14);
    // No `#rrggbb A% B%` anywhere.
    expect(/#[0-9a-f]{6}\s+[0-9.]+%\s+[0-9.]+%/.test(g)).toBe(false);
  });

  it('R-049 — the painted bars ARE `smpteBarsGradient()`, the exported one', () => {
    // The reuse guard, as an EQUALITY rather than a shape check. PVW draws these
    // same bars over each live plate by calling this exact function, so the two
    // surfaces must be one table: a hand-written second copy is how the paired
    // stops above get lost on the ONE build nobody develops against.
    const { root } = build(sceneWith([liveSource()]), 'author');
    expect(fallback(root).style.backgroundImage).toBe(smpteBarsGradient());
    // Seven bars, 75 % amplitude, in authored order. Pinned so a colour that is
    // silently changed shows up here rather than in a gallery.
    expect(SMPTE_BARS).toEqual([
      '#c0c0c0',
      '#c0c000',
      '#00c0c0',
      '#00c000',
      '#c000c0',
      '#c00000',
      '#0000c0',
    ]);
  });

  it('a POSTER replaces the bars — and still carries the label', () => {
    const { root } = build(sceneWith([liveSource({ posterAssetId: 'asset-1' })]), 'author');
    const el = node(root);
    expect(el.style.backgroundImage).toBe('');
    const img = el.querySelector<HTMLImageElement>('img[data-cg-asset-id]');
    expect(img?.dataset['cgAssetId']).toBe('asset-1');
    expect(img?.style.objectFit).toBe('cover');
    expect(img?.style.objectPosition).toBe('50% 50%');
    // `src` is deliberately unset — the host resolves it, exactly as for `buildImage`.
    expect(img?.getAttribute('src')).toBeNull();
    expect(el.querySelector('[data-cg-live-source-label]')?.textContent).toBe('guest-1');
  });

  it('D-178 — the authoring poster previews the stored crop focus', () => {
    const { root } = build(
      sceneWith([liveSource({ posterAssetId: 'asset-1', cropFocus: { x: 0.2, y: 0.8 } } as never)]),
      'author',
    );
    expect(node(root).querySelector<HTMLImageElement>('img')?.style.objectPosition).toBe('20% 80%');
  });

  it('D-202 — author mode draws both reveal guides and output paints neither', () => {
    const plate = liveSource({
      revealMask: {
        targetSourceId: 'guest-2',
        rect: { x: 0.1, y: 0.6, width: 0.8, height: 0.3 },
        additionalRects: [{ x: 0.2, y: 0.1, width: 0.6, height: 0.2 }],
      },
    } as never);
    const guides = node(build(sceneWith([plate]), 'author').root).querySelectorAll<HTMLElement>(
      '[data-cg-live-reveal-mask="guest-2"]',
    );
    expect(guides).toHaveLength(2);
    const [author, second] = [...guides];
    expect(author?.dataset['cgLiveRevealMask']).toBe('guest-2');
    expect(author?.style.left).toBe('10%');
    expect(author?.style.top).toBe('60%');
    expect(author?.style.width).toBe('80%');
    expect(author?.style.height).toBe('30%');
    expect(second?.style.top).toBe('10%');
    expect(author?.textContent).toBe('Mask 1');
    expect(second?.textContent).toBe('Mask 2');
    expect(
      node(build(sceneWith([plate]), 'output').root).querySelector('[data-cg-live-reveal-mask]'),
    ).toBeNull();
  });

  it('the label is pinned LTR, so a Persian scene cannot flip `guest-1` to `1-guest`', () => {
    const { root } = build(sceneWith([liveSource()]), 'author');
    const label = node(root).querySelector<HTMLElement>('[data-cg-live-source-label]');
    expect(label?.style.direction).toBe('ltr');
  });

  it('centres a masked plate label in its largest visible window', () => {
    const scene = sceneWith([
      liveSource({
        liveMask: {
          mode: 'inside',
          rects: [
            { x: 0, y: 0, width: 0.125, height: 0.125 },
            { x: 0.5, y: 0.25, width: 0.25, height: 0.5 },
          ],
        },
      }),
    ]);
    const label = node(build(scene, 'author').root).querySelector<HTMLElement>(
      '[data-cg-live-source-label]',
    );
    expect(label?.style.left).toBe('62.5%');
    expect(label?.style.top).toBe('50%');
    expect(label?.style.maxWidth).toContain('22.5%');
    expect(
      node(build(scene, 'output').root).querySelector('[data-cg-live-source-label]'),
    ).toBeNull();
  });
});

describe("R-105 — 'output' mode paints the selected fallback under the live producer", () => {
  it('D-202 — Revert clips the fallback to the four sides and keeps mask guides out of output', () => {
    const scene = sceneWith([
      liveSource({
        liveMask: { mode: 'outside', rects: [{ x: 0.25, y: 0.25, width: 0.5, height: 0.5 }] },
      }),
    ]);
    const author = build(scene, 'author').root;
    const output = build(scene, 'output').root;
    const plate = fallback(output);
    const clip = plate.querySelector('clipPath');
    expect(clip?.getAttribute('clipPathUnits')).toBe('objectBoundingBox');
    expect(clip?.children).toHaveLength(4);
    expect(plate.style.clipPath).toBe('url(#' + clip?.id + ')');
    expect(node(output).querySelector('[data-cg-live-plate-mask]')).toBeNull();
    expect(node(author).querySelector('[data-cg-live-plate-mask="outside"]')?.textContent).toBe(
      'Mask 1',
    );
  });

  it('defaults to Bars and keeps the author-only label out', () => {
    const { root } = build(sceneWith([liveSource()]), 'output');
    const el = node(root);
    expect(el).not.toBeNull();
    expect(fallback(root).style.backgroundImage).toBe(smpteBarsGradient());
    expect(el.querySelector('[data-cg-live-source-label]')).toBeNull();
    expect(el.childElementCount).toBe(1);
  });

  it('an authored picture is the on-air fallback too', () => {
    const { root } = build(sceneWith([liveSource({ posterAssetId: 'asset-1' })]), 'output');
    const el = node(root);
    expect(el.querySelector<HTMLImageElement>('img')?.dataset['cgAssetId']).toBe('asset-1');
    expect(el.childElementCount).toBe(1);
  });

  it('supports an explicit solid colour fallback', () => {
    const { root } = build(
      sceneWith([liveSource({ fallbackKind: 'color', fallbackColor: '#123456' } as never)]),
      'output',
    );
    expect(fallback(root).style.background).toBe('#123456');
  });

  it('but the DECLARATION still rides the DOM — data costs no pixels', () => {
    const { root } = build(
      sceneWith([liveSource({ keySourceId: 'guest-1-key' } as never)]),
      'output',
    );
    const el = node(root);
    expect(el.dataset['cgLiveSource']).toBe('guest-1');
    expect(el.dataset['cgLiveSourceKey']).toBe('guest-1-key');
  });

  it('defaults to output when no mode is named — a forgotten boot site is SAFE', () => {
    const window = new Window();
    const built = buildScene(sceneWith([liveSource()]), window.document as unknown as Document);
    const el = node(built.container);
    expect(fallback(built.container).style.backgroundImage).toBe(smpteBarsGradient());
    expect(el.childElementCount).toBe(1);
  });
});

describe('D-137 §9 — the step-stylesheet hazard is closed in output mode', () => {
  /*
    `DELTA-RUN-NEXT-VERSION-01-A` — what was a zone override is now a countdown step's change. The
    Designer offers NO change on a Live Source (`changePropertiesOf`), but a hand-edited scene can
    still carry one, which is exactly why it is pinned here.
  */
  const countdownChanging = (changes: unknown[]): Element =>
    ({
      ...baseElProps,
      id: 'cd',
      name: 'cd',
      type: 'clock',
      font: {
        family: 'Vazirmatn',
        weight: 600,
        style: 'normal',
        size: 48,
        lineHeight: 1.2,
        letterSpacing: 0,
      },
      color: '#ffffff',
      align: 'center',
      verticalAlign: 'middle',
      mode: 'countdown',
      format: 'mm:ss',
      digits: 'latin',
      target: { kind: 'duration', ms: 60_000 },
      steps: { steps: [{ name: 'danger', atMs: 0, changes }] },
    }) as unknown as Element;
  const paintHole = { elementId: 'live-a', property: 'backgroundColor', value: '#ff0000' };

  it("'author' still compiles its rule — nothing about authoring changed", () => {
    const css = compileStepCss(
      sceneWith([liveSource(), countdownChanging([paintHole])]),
      'author',
    ).css;
    expect(css).toContain('background-color');
    expect(css).toContain('#ff0000');
  });

  it("'output' compiles NOTHING for it — no rule can fill the hole on air", () => {
    const css = compileStepCss(
      sceneWith([liveSource(), countdownChanging([paintHole])]),
      'output',
    ).css;
    expect(css).not.toContain('#ff0000');
    expect(css).not.toContain('background-color');
  });

  it('the NUMBERING stays mode-independent, so other elements keep their indices', () => {
    // A Live Source authored BEFORE a stepped shape. If the exclusion renumbered, the shape's
    // index would shift in 'output' and every compiled rule would mis-target.
    const shape = {
      ...baseElProps,
      id: 'shape-b',
      name: 'bar',
      type: 'shape',
      shape: 'rect',
      fill: { kind: 'solid', color: '#123456' },
    } as unknown as Element;
    const changes = [paintHole, { elementId: 'shape-b', property: 'fill', value: '#00ff00' }];
    // Distinct scene OBJECTS: the step plan caches per scene identity.
    const authorCss = compileStepCss(
      sceneWith([liveSource(), shape, countdownChanging(changes)]),
      'author',
    ).css;
    const outputCss = compileStepCss(
      sceneWith([liveSource(), shape, countdownChanging(changes)]),
      'output',
    ).css;
    // The shape is index 1 in BOTH — the Live Source still occupies index 0 even though
    // 'output' emits no rule for it.
    expect(authorCss).toContain("[data-cg-step-el='1']");
    expect(outputCss).toContain("[data-cg-step-el='1']");
    expect(outputCss).toContain('#00ff00');
    // …and 'output' emits nothing at all for index 0.
    expect(outputCss).not.toContain("[data-cg-step-el='0']");
  });
});

describe('D-137 — the mode reaches a NESTED Live Source', () => {
  it('a Live Source inside a composition instance inherits the mode', () => {
    const scene = {
      ...sceneWith([
        {
          ...baseElProps,
          id: 'inst',
          name: 'inst',
          type: 'composition',
          compositionId: 'comp-1',
        } as unknown as Element,
      ]),
      compositions: [
        {
          id: 'comp-1',
          name: 'inner',
          resolution: { width: 960, height: 540 },
          frameRate: 50,
          frameRange: { in: 0, out: 50 },
          editorBackdrop: 'transparent',
          layers: [
            {
              id: 'CL1',
              name: 'main',
              visible: true,
              locked: false,
              blendMode: 'normal',
              children: [liveSource({ id: 'nested-live' } as never)],
            },
          ],
        },
      ],
    } as unknown as Scene;

    expect(node(build(scene, 'author').root, 'nested-live').childElementCount).toBe(2);
    const out = node(build(scene, 'output').root, 'nested-live');
    expect(out.childElementCount).toBe(1);
    expect(out.style.backgroundImage).toBe('');
  });
});

/**
 * §9a.1 / task 1.5e — the plate's FRAME.
 *
 * Maps `specs/designer-live-source/spec.md`:
 *   - "A Live Source may carry a FRAME, and the frame never enters the hole"
 *
 * The load-bearing assertion is not "a border appears" — it is that the border is
 * OUTSIDE `transform.size`, because the declared rect is a contract with CasparCG
 * and a frame painted inside it covers the live picture.
 */
describe('§9a.1 — the frame paints OUTSIDE the hole, in BOTH modes', () => {
  const framed = liveSource({ stroke: { width: 6, color: '#ff8800' } } as never);

  it.each(['author', 'output'] as const)('%s mode paints the frame as an OUTLINE', (mode) => {
    // 'output' is the one that matters: the stroke is the ONLY thing a Live Source
    // paints on air, and it is applied BEFORE the output-mode early return.
    const el = node(build(sceneWith([framed]), mode).root);
    // Longhands, not the shorthand string: happy-dom re-serialises `outline` in its
    // own property order, so a string comparison would pin the DOM library rather
    // than the render.
    expect(el.style.outlineWidth).toBe('6px');
    expect(el.style.outlineStyle).toBe('solid');
    expect(el.style.outlineColor).toBe('#ff8800');
  });

  it.each(['author', 'output'] as const)(
    '%s mode leaves the plate BOX untouched — no border, no padding, no box-sizing',
    (mode) => {
      const el = node(build(sceneWith([framed]), mode).root);
      // THE REQUIREMENT, expressed as what is ABSENT. An outline takes no layout, so
      // the plate's box is exactly `transform` — the rect `collectLiveSources`
      // declares — under any box model and any scale. A `border` here would be wrong
      // twice over: the page's own `*{box-sizing:border-box}` reset would shrink the
      // hole, and `content-box` would slide it by the stroke width (both measured;
      // see the note in `buildLiveSource`).
      expect(el.style.border).toBe('');
      expect(el.style.padding).toBe('');
      expect(el.style.boxSizing).toBe('');
      // …and the declared size is what it always was.
      expect(el.style.width).toBe('640px');
      expect(el.style.height).toBe('360px');
    },
  );

  it('the frame shorthand is the SHARED one — identical to a shape border', () => {
    // The reuse guard as an equality (the R-049 pattern above). The PROPERTY differs
    // by design (outline vs border); the stroke grammar must not, or a dash rule or a
    // unit changed in one place silently misses the other.
    const stroke = { width: 3, color: '#00ccff' };
    const shape = {
      ...baseElProps,
      id: 'shape-ref',
      name: 'ref',
      type: 'shape',
      shape: 'rect',
      stroke,
    } as unknown as Element;
    const { root } = build(sceneWith([liveSource({ stroke } as never), shape]), 'output');
    const plate = node(root, 'live-a').style;
    const box = node(root, 'shape-ref').style;
    expect([plate.outlineWidth, plate.outlineStyle, plate.outlineColor]).toEqual([
      box.borderTopWidth,
      box.borderTopStyle,
      box.borderTopColor,
    ]);
  });

  it('a dashed stroke renders dashed — the shared shorthand decides that too', () => {
    const el = node(
      build(
        sceneWith([liveSource({ stroke: { width: 2, color: '#ffffff', dash: [8, 4] } } as never)]),
        'output',
      ).root,
    );
    expect(el.style.outlineStyle).toBe('dashed');
    expect(el.style.outlineWidth).toBe('2px');
  });

  it('NO stroke ⇒ no outline — an unframed scene DOM is byte-for-byte unchanged', () => {
    const el = node(build(sceneWith([liveSource()]), 'output').root);
    expect(el.style.outline).toBe('');
    expect(el.style.outlineWidth).toBe('');
    expect(el.style.border).toBe('');
  });

  it('width 0 is "no frame", not "unset" — it paints nothing and keeps its colour', () => {
    // The falsy-zero trap, pinned. A zero width must not be read as an absent stroke
    // and back-filled with a default width, and it must not paint a hairline.
    const el = node(
      build(sceneWith([liveSource({ stroke: { width: 0, color: '#00ff00' } } as never)]), 'output')
        .root,
    );
    expect(el.style.outlineWidth).toBe('0px');
    expect(el.style.outlineColor).toBe('#00ff00');
    expect(el.style.width).toBe('640px');
  });

  it('the frame does not add content beyond the selected fallback', () => {
    const el = node(build(sceneWith([framed]), 'output').root);
    expect(el.childElementCount).toBe(1);
    expect(el.style.backgroundImage).toBe('');
    expect(el.style.background).toBe('');
    expect(el.style.backgroundColor).toBe('');
  });

  it('a NESTED plate is framed too — the frame is not a top-level-only affordance', () => {
    const scene = {
      ...sceneWith([
        {
          ...baseElProps,
          id: 'inst',
          name: 'inst',
          type: 'composition',
          compositionId: 'comp-1',
        } as unknown as Element,
      ]),
      compositions: [
        {
          id: 'comp-1',
          name: 'inner',
          resolution: { width: 960, height: 540 },
          frameRate: 50,
          frameRange: { in: 0, out: 50 },
          editorBackdrop: 'transparent',
          layers: [
            {
              id: 'CL1',
              name: 'main',
              visible: true,
              locked: false,
              blendMode: 'normal',
              children: [
                liveSource({ id: 'nested-live', stroke: { width: 5, color: '#ff0000' } } as never),
              ],
            },
          ],
        },
      ],
    } as unknown as Scene;
    const el = node(build(scene, 'output').root, 'nested-live');
    expect(el.style.outlineWidth).toBe('5px');
    expect(el.style.outlineColor).toBe('#ff0000');
  });
});
