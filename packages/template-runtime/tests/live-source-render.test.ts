import { describe, expect, it } from 'vitest';
import { Window } from 'happy-dom';
import type { Element, Scene } from '@cg/shared-schema';
import { buildScene, smpteBarsGradient, SMPTE_BARS } from '../src/scene-builder.js';
import { compileZoneCss } from '../src/zone-css.js';

/**
 * D-137 phase 1 §9 — the render-MODE seam, and the thing it exists for: a Live
 * Source paints SMPTE bars while authoring and **zero pixels** in both exports.
 *
 * Maps `specs/designer-live-source/spec.md`:
 *   - "Bars on the authoring surfaces, nothing in the exports"
 *   - "An authored zone cannot fill the hole on air"
 *
 * The zone case has no UI to drive it (`zoneOverrides` is reachable from no
 * Designer surface), so it is pinned HERE rather than in the E2E — it is
 * representable in a hand-edited scene, which is the whole reason it is a hazard.
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

describe("D-137 — 'author' mode paints the bars", () => {
  it('renders SMPTE bars with the id label overlaid', () => {
    const { root } = build(sceneWith([liveSource()]), 'author');
    const el = node(root);
    expect(el).not.toBeNull();
    // Procedural: a gradient, not a bundled bitmap. If this ever becomes a `url(…)`
    // the element has acquired a shipped asset, which is exactly what D-137 refuses.
    expect(el.style.backgroundImage).toContain('linear-gradient');
    expect(el.style.backgroundImage).not.toContain('url(');
    const label = el.querySelector('[data-cg-live-source-label]');
    expect(label?.textContent).toBe('guest-1');
  });

  it('the gradient uses PAIRED stops, never the Chromium-72 double-position form', () => {
    // B-066 class. CasparCG's CEF is baseline Chromium 71; double-position colour
    // stops shipped in 72. The short form renders correctly in every browser we
    // develop in and breaks on air — so the shape of the string is the assertion.
    const { root } = build(sceneWith([liveSource()]), 'author');
    const g = node(root).style.backgroundImage;
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
    expect(node(root).style.backgroundImage).toBe(smpteBarsGradient());
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
    // `src` is deliberately unset — the host resolves it, exactly as for `buildImage`.
    expect(img?.getAttribute('src')).toBeNull();
    expect(el.querySelector('[data-cg-live-source-label]')?.textContent).toBe('guest-1');
  });

  it('the label is pinned LTR, so a Persian scene cannot flip `guest-1` to `1-guest`', () => {
    const { root } = build(sceneWith([liveSource()]), 'author');
    const label = node(root).querySelector<HTMLElement>('[data-cg-live-source-label]');
    expect(label?.style.direction).toBe('ltr');
  });
});

describe("D-137 — 'output' mode paints NOTHING", () => {
  it('no background, no children, no label — the box is empty', () => {
    const { root } = build(sceneWith([liveSource()]), 'output');
    const el = node(root);
    expect(el).not.toBeNull();
    expect(el.style.backgroundImage).toBe('');
    expect(el.style.background).toBe('');
    expect(el.style.backgroundColor).toBe('');
    // Zero children: no label node, no poster, nothing that could paint.
    expect(el.childElementCount).toBe(0);
  });

  it('a POSTER does not paint either — the export is not a preview', () => {
    const { root } = build(sceneWith([liveSource({ posterAssetId: 'asset-1' })]), 'output');
    const el = node(root);
    expect(el.querySelector('img')).toBeNull();
    expect(el.childElementCount).toBe(0);
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
    expect(el.style.backgroundImage).toBe('');
    expect(el.childElementCount).toBe(0);
  });
});

describe('D-137 §9 — the zone-css hazard is closed in output mode', () => {
  /** A Live Source whose zone override would paint its hole. */
  const zoned = liveSource({
    zoneOverrides: [{ zone: 'danger', backgroundColor: '#ff0000' }],
  } as never);

  it("'author' still compiles its zone slot — nothing about authoring changed", () => {
    const css = compileZoneCss(sceneWith([zoned]), 'author').css;
    expect(css).toContain('background-color');
    expect(css).toContain('#ff0000');
  });

  it("'output' compiles NOTHING for it — no rule can fill the hole on air", () => {
    const css = compileZoneCss(sceneWith([zoned]), 'output').css;
    // The whole stylesheet is empty: it was this element's only slot.
    expect(css).toBe('');
  });

  it('the zone NUMBERING stays mode-independent, so other elements keep their slots', () => {
    // A Live Source authored BEFORE a zoned shape. If the exclusion renumbered, the
    // shape's index would shift in 'output' and every compiled rule would mis-target.
    const shape = {
      ...baseElProps,
      id: 'shape-b',
      name: 'bar',
      type: 'shape',
      shape: 'rect',
      fill: { kind: 'solid', color: '#123456' },
      zoneOverrides: [{ zone: 'danger', fill: '#00ff00' }],
    } as unknown as Element;
    const scene = sceneWith([zoned, shape]);
    // Distinct scene OBJECTS: `assignZoneIndices` caches per scene identity.
    const authorCss = compileZoneCss(scene, 'author').css;
    const outputCss = compileZoneCss(sceneWith([zoned, shape]), 'output').css;
    // The shape is index 1 in BOTH — it was authored second, and the Live Source
    // still occupies index 0 even though 'output' emits no rule for it.
    expect(authorCss).toContain("[data-cg-zone-el='1']");
    expect(outputCss).toContain("[data-cg-zone-el='1']");
    expect(outputCss).toContain('#00ff00');
    // …and 'output' emits nothing at all for index 0.
    expect(outputCss).not.toContain("[data-cg-zone-el='0']");
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

    expect(node(build(scene, 'author').root, 'nested-live').childElementCount).toBe(1);
    const out = node(build(scene, 'output').root, 'nested-live');
    expect(out.childElementCount).toBe(0);
    expect(out.style.backgroundImage).toBe('');
  });
});
