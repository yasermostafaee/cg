import { describe, expect, it } from 'vitest';
import { Window } from 'happy-dom';
import type { Element, Scene } from '@cg/shared-schema';
import { ImageElementSchema } from '@cg/shared-schema';
import { buildScene } from '../src/scene-builder.js';
import golden from './fixtures/image-fit-golden.json' with { type: 'json' };

/**
 * D-149 — the image element's `fit` gains `fit-width` / `fit-height`, and `none`
 * is relabelled "original" in the Designer without its stored value changing.
 *
 * 🔴 **The first describe block is the point of the whole change.** The feature
 * needs an extra DOM node; emitting it on EVERY image would change the rendered
 * output of templates that use none of the new options — an on-air change bought
 * for nothing. `fixtures/image-fit-golden.json` was captured from the renderer
 * **before** this change landed, and every pre-existing mode is compared to it
 * byte-for-byte, so "the wrapper is conditional" is PROVEN rather than inspected.
 */

const baseTransform = {
  position: { x: 100, y: 200 },
  size: { w: 640, h: 360 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
};

function image(fit: string, over: Record<string, unknown> = {}): Element {
  return {
    transform: baseTransform,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    id: `img-${fit}`,
    name: 'Logo',
    type: 'image',
    assetId: 'asset-1',
    source: 'project',
    fit,
    preserveAspect: true,
    ...over,
  } as unknown as Element;
}

function sceneWith(children: Element[]): Scene {
  return {
    schemaVersion: 1,
    id: 'scene-img',
    name: 'img',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    background: 'transparent',
    layers: [
      { id: 'L1', name: 'main', visible: true, locked: false, blendMode: 'normal', children },
    ],
    compositions: [],
    fields: [],
  } as unknown as Scene;
}

function build(el: Element): HTMLElement {
  const win = new Window();
  const doc = win.document as unknown as Document;
  const built = buildScene(sceneWith([el]), doc, 'output');
  return built.container.querySelector('[data-cg-element-id]') as HTMLElement;
}

/** The four variants that exercise every branch `buildImage` still has. */
const VARIANTS = [
  ['plain', {}],
  ['tinted', { tint: '#ff0000' }],
  ['hidden', { visible: false }],
  ['filtered', { filter: { blur: 3 } }],
] as const;

const PRE_EXISTING = ['contain', 'cover', 'fill', 'none'] as const;

describe('D-149 — a pre-existing fit mode exports BYTE-IDENTICAL output', () => {
  const goldens = golden as Record<string, string>;

  it.each(PRE_EXISTING)('%s is unchanged in every variant', (fit) => {
    for (const [label, over] of VARIANTS) {
      const key = `${fit}/${label}`;
      expect(goldens[key], `golden missing for ${key}`).toBeDefined();
      expect(build(image(fit, over)).outerHTML, key).toBe(goldens[key]);
    }
  });

  it('emits NO wrapper — the element IS the <img>, as it always was', () => {
    for (const fit of PRE_EXISTING) {
      const el = build(image(fit));
      expect(el.tagName, fit).toBe('IMG');
      expect(el.children.length, fit).toBe(0);
    }
  });

  it('the golden covers every pre-existing mode, so a mode cannot slip past it', () => {
    // Guards the test itself: a fifth legacy mode added without a golden would
    // otherwise be "covered" by a loop that never runs for it.
    const covered = new Set(Object.keys(goldens).map((k) => k.split('/')[0]));
    expect([...covered].sort()).toEqual([...PRE_EXISTING].sort());
    expect(Object.keys(goldens)).toHaveLength(PRE_EXISTING.length * VARIANTS.length);
  });
});

describe('D-149 — fit-width / fit-height scale one axis and clip the other', () => {
  it('fit-width pins the WIDTH to the box and lets the height run free', () => {
    const box = build(image('fit-width'));
    expect(box.tagName).toBe('DIV');
    // The authored rect is still exactly the element's box…
    expect(box.style.width).toBe('640px');
    expect(box.style.height).toBe('360px');
    // …and the overflow is clipped to it.
    expect(box.style.overflow).toBe('hidden');

    const img = box.querySelector('img') as HTMLElement;
    expect(img.style.width).toBe('100%');
    expect(img.style.height).toBe('auto');
    // Centred on the overflowing axis, which is what `cover` does for its own
    // overflow — so fit-width and cover agree wherever they coincide.
    expect(img.style.transform).toBe('translateY(-50%)');
    expect(img.style.top).toBe('50%');
  });

  it('fit-height is the exact mirror', () => {
    const box = build(image('fit-height'));
    expect(box.style.overflow).toBe('hidden');
    const img = box.querySelector('img') as HTMLElement;
    expect(img.style.height).toBe('100%');
    expect(img.style.width).toBe('auto');
    expect(img.style.transform).toBe('translateX(-50%)');
    expect(img.style.left).toBe('50%');
  });

  it('keeps `data-cg-asset-id` ON THE <img>, so every host still resolves the src', () => {
    // Both hosts walk `img[data-cg-asset-id]` (runtime.ts, preview.ts). Moving
    // this onto the wrapper would leave the image permanently blank.
    for (const fit of ['fit-width', 'fit-height']) {
      const box = build(image(fit));
      expect(box.querySelector('img[data-cg-asset-id="asset-1"]'), fit).not.toBeNull();
      expect(box.getAttribute('data-cg-asset-id'), fit).toBeNull();
    }
  });

  it('carries the element id, opacity, transform and filter on the OUTER node', () => {
    // Animation and hit-testing target `data-cg-element-id`; if the id stayed on
    // the inner <img> every keyframe would animate the unclipped child instead.
    const box = build(image('fit-width', { opacity: 0.5, filter: { blur: 3 } }));
    expect(box.dataset['cgElementId']).toBe('img-fit-width');
    expect(box.classList.contains('cg-element')).toBe(true);
    expect(box.style.opacity).toBe('0.5');
    expect(box.style.filter).toBe('blur(3px)');
  });

  it('is invisible when the element is hidden', () => {
    expect(build(image('fit-width', { visible: false })).style.display).toBe('none');
  });

  it('uses no CSS newer than CasparCG CEF 71 (B-066)', () => {
    // Every declaration this path emits is CSS 2.1 / baseline: no aspect-ratio,
    // no object-view-box, no logical properties, no clip-path.
    const html = build(image('fit-width')).outerHTML;
    for (const modern of ['aspect-ratio', 'object-view-box', 'inline-size', 'clip-path']) {
      expect(html).not.toContain(modern);
    }
  });
});

describe('D-149 — the schema round-trips both new modes, and `none` is untouched', () => {
  const parse = (fit: string): string =>
    ImageElementSchema.parse({
      id: 'i1',
      name: 'Logo',
      type: 'image',
      visible: true,
      locked: false,
      opacity: 1,
      zIndex: 0,
      transform: baseTransform,
      assetId: 'a1',
      fit,
      preserveAspect: true,
    }).fit;

  it.each(['contain', 'cover', 'fill', 'none', 'fit-width', 'fit-height'])(
    '%s round-trips',
    (fit) => {
      expect(parse(fit)).toBe(fit);
    },
  );

  it('a document saved BEFORE this change still loads, and still stores `none`', () => {
    // The Designer labels this "original"; the STORED value must not drift, or
    // every scene ever saved needs a migration for a word.
    expect(parse('none')).toBe('none');
  });

  it('rejects a value that is neither', () => {
    expect(() => parse('fit-both')).toThrow();
  });
});
