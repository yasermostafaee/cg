import { describe, expect, it } from 'vitest';
import { Window } from 'happy-dom';
import type { Element, Scene } from '@cg/shared-schema';
import { sceneMaskHoles } from '@cg/shared-schema';
import { buildScene } from '../src/scene-builder.js';
import { LIVE_SOURCE_MASK_PROPERTIES } from '../src/live-source-punch.js';

/**
 * 1.5c / §9a-Z — **the backdrop punch: a multi-box layout shows the live picture
 * through its plates.**
 *
 * The rule under test is the owner's, and it is z-order, not a declared role:
 *
 * > Each element is masked with the union of the rects of the plates ABOVE it in
 * > the scene's existing element order. Elements above all plates are not masked.
 *
 * ⭐ **This file is ordered deliberately.** The FIRST test is a positive control
 * that the mask can punch at all, and every later test that asserts a hole is
 * ABSENT depends on it. That ordering is not decoration: skipping exactly this
 * control is what let a no-op mask read as "mechanism B fails" at the plant and
 * briefly promoted design.md §9b to the live architecture. A negative observation
 * is VOID until the instrument is proven live.
 */

const box = (x: number, y: number, w: number, h: number) => ({
  position: { x, y },
  size: { w, h },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
});

const baseProps = { opacity: 1, visible: true, locked: false };

function plate(id: string, t: ReturnType<typeof box>, zIndex: number, over = {}): Element {
  return {
    ...baseProps,
    id,
    name: id,
    type: 'video-placeholder',
    routeKey: id,
    transform: t,
    zIndex,
    ...over,
  } as unknown as Element;
}

function shape(id: string, t: ReturnType<typeof box>, zIndex: number): Element {
  return {
    ...baseProps,
    id,
    name: id,
    type: 'shape',
    shape: 'rectangle',
    fill: { kind: 'solid', color: '#d00000' },
    transform: t,
    zIndex,
  } as unknown as Element;
}

function text(id: string, t: ReturnType<typeof box>, zIndex: number): Element {
  return {
    ...baseProps,
    id,
    name: id,
    type: 'text',
    text: 'مهمان برنامه',
    font: {
      family: 'Vazirmatn',
      weight: 400,
      style: 'normal',
      size: 48,
      lineHeight: 1.2,
      letterSpacing: 0,
    },
    color: '#ffffff',
    align: 'start',
    direction: 'rtl',
    transform: t,
    zIndex,
  } as unknown as Element;
}

function sceneWith(children: Element[]): Scene {
  return {
    schemaVersion: 1,
    id: 'scene-punch',
    name: 'punch',
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

function render(scene: Scene, mode: 'author' | 'output' = 'output'): HTMLElement {
  const window = new Window();
  return buildScene(scene, window.document as unknown as Document, mode).container;
}

const node = (root: HTMLElement, id: string): HTMLElement =>
  root.querySelector<HTMLElement>(`[data-cg-element-id="${id}"]`) as HTMLElement;

/** The mask image actually emitted for `id`, decoded, or `''` when none was. */
function maskSvg(root: HTMLElement, id: string): string {
  return decodeURIComponent(node(root, id).style.getPropertyValue('mask-image'));
}

/** Every `<rect>` the mask punches — i.e. the black ones. The white one is the keep. */
function holeRects(svg: string): string[] {
  return [...svg.matchAll(/<rect [^>]*fill='#000'[^>]*\/>/g)].map((m) => m[0]);
}

// ── 1. THE POSITIVE CONTROL ─────────────────────────────────────────────────
// Nothing below may assert an ABSENT hole until this passes.

describe('1.5c — POSITIVE CONTROL: the mask punches at all', () => {
  const backdrop = shape('backdrop', box(0, 0, 1920, 1080), 0);
  const guest = plate('guest-1', box(200, 150, 640, 360), 10);

  it('a full-frame backdrop below a plate is punched, in the plate rect', () => {
    const root = render(sceneWith([backdrop, guest]));
    const svg = maskSvg(root, 'backdrop');
    expect(svg, 'the backdrop carries NO mask — the instrument is dead').not.toBe('');
    const holes = holeRects(svg);
    expect(holes).toHaveLength(1);
    // The backdrop IS the scene box, so element-local px are scene px here: the hole
    // must name the plate's own rect exactly, unrounded and unscaled.
    expect(holes[0]).toContain("x='200'");
    expect(holes[0]).toContain("y='150'");
    expect(holes[0]).toContain("width='640'");
    expect(holes[0]).toContain("height='360'");
  });

  it('🔴 declares LUMINANCE on the element, in both spellings', () => {
    // Without this the mask applies perfectly and punches NOTHING: `#fff` and `#000`
    // are both fully opaque under the CSS default `mask-mode: alpha`. Chromium's name
    // for the property before 120 is `-webkit-mask-source-type`, and the CEF baseline
    // is 71 — so both spellings, exactly as the plant probe was measured with.
    const style = node(render(sceneWith([backdrop, guest])), 'backdrop').style;
    expect(style.getPropertyValue('mask-mode')).toBe('luminance');
    expect(style.getPropertyValue('-webkit-mask-source-type')).toBe('luminance');
    expect(style.getPropertyValue('-webkit-mask-image')).toBe(style.getPropertyValue('mask-image'));
  });

  it('🔴 sizes the mask in EXPLICIT PIXELS of the DECLARED box, never a percentage', () => {
    // A percentage resolves against the RENDERED box, and `applyBaseStyles` skips
    // `width`/`height` for an auto-sized text element (D-060) — so `100% 100%` on one of
    // those is the INTRINSIC size, and holes authored in the declared box's units get
    // silently rescaled. The flattener measures `transform.size`, `collectLiveSources`
    // declares `transform.size`, so the mask is pinned to `transform.size` too.
    const style = node(render(sceneWith([backdrop, guest])), 'backdrop').style;
    expect(style.getPropertyValue('mask-size')).toBe('1920px 1080px');
    expect(style.getPropertyValue('mask-size')).not.toContain('%');
    expect(style.getPropertyValue('-webkit-mask-size')).toBe('1920px 1080px');
  });

  it('punches on air AND while authoring — there is no preview special case', () => {
    // §9a-Z: the plate is never masked, so it paints its own placeholder over its own
    // hole and preview looks right WITHOUT a branch. A "don't punch in preview" branch
    // is a defect, not a convenience — this pins its absence.
    for (const mode of ['output', 'author'] as const) {
      expect(
        holeRects(maskSvg(render(sceneWith([backdrop, guest]), mode), 'backdrop')),
        mode,
      ).toHaveLength(1);
    }
  });
});

// ── 2. THE RULE IS Z-ORDER ──────────────────────────────────────────────────

describe('1.5c — §9a-Z: the rule is z-order, not a declared role', () => {
  it('🔴 a caption authored ABOVE a plate still paints over it', () => {
    // THE case that killed the simpler "mask everything below a plate" reading. A name
    // super over a live guest is ordinary broadcast; the naive rule ate it.
    const scene = sceneWith([
      shape('backdrop', box(0, 0, 1920, 1080), 0),
      plate('guest-1', box(200, 150, 640, 360), 10),
      text('caption', box(220, 430, 600, 70), 20),
    ]);
    const root = render(scene);
    expect(holeRects(maskSvg(root, 'backdrop'))).toHaveLength(1);
    // The caption overlaps the plate and is ABOVE it, so it must carry no mask at all.
    for (const property of LIVE_SOURCE_MASK_PROPERTIES) {
      expect(node(root, 'caption').style.getPropertyValue(property), property).toBe('');
    }
  });

  it('a caption authored BELOW a plate is punched by it', () => {
    // The mirror of the above, and the reason the rule is z-order rather than "captions
    // are exempt": the SAME element, moved under the plate, must lose the overlap.
    const root = render(
      sceneWith([
        plate('guest-1', box(200, 150, 640, 360), 10),
        text('caption', box(220, 430, 600, 70), 5),
      ]),
    );
    expect(holeRects(maskSvg(root, 'caption'))).toHaveLength(1);
  });

  it('an element that overlaps NO plate above it is not masked', () => {
    const root = render(
      sceneWith([
        shape('bug', box(1700, 60, 160, 90), 0),
        plate('guest-1', box(200, 150, 640, 360), 10),
      ]),
    );
    expect(node(root, 'bug').style.getPropertyValue('mask-image')).toBe('');
  });

  it('a multi-box layout punches ONE hole per plate above the backdrop', () => {
    const root = render(
      sceneWith([
        shape('backdrop', box(0, 0, 1920, 1080), 0),
        plate('guest-1', box(120, 200, 800, 450), 10),
        plate('guest-2', box(1000, 200, 800, 450), 11),
      ]),
    );
    expect(holeRects(maskSvg(root, 'backdrop'))).toHaveLength(2);
    // guest-1 is BELOW guest-2 and they do not overlap, so neither plate is masked —
    // which is what lets each paint its own placeholder over its own hole.
    expect(node(root, 'guest-1').style.getPropertyValue('mask-image')).toBe('');
  });
});

// ── 3. ZERO, PAIRED WITH ONE ────────────────────────────────────────────────

describe('1.5c — zero is a value, and is paired with a one as control', () => {
  it('a plate at x = 0 punches AT zero, not "no hole"', () => {
    const atZero = render(
      sceneWith([shape('backdrop', box(0, 0, 1920, 1080), 0), plate('p', box(0, 0, 400, 300), 9)]),
    );
    const atOne = render(
      sceneWith([shape('backdrop', box(0, 0, 1920, 1080), 0), plate('p', box(1, 1, 400, 300), 9)]),
    );
    expect(holeRects(maskSvg(atZero, 'backdrop'))[0]).toContain("x='0'");
    expect(holeRects(maskSvg(atOne, 'backdrop'))[0]).toContain("x='1'");
  });

  it('an element at INDEX 0 of the z-order is punched — first is not "before everything"', () => {
    const root = render(
      sceneWith([shape('first', box(0, 0, 1920, 1080), 0), plate('p', box(10, 10, 100, 100), 1)]),
    );
    expect(holeRects(maskSvg(root, 'first'))).toHaveLength(1);
  });

  it('a hole list of length 0 emits NO mask property at all, not an empty mask', () => {
    // 🔴 `null` from `liveSourceMask` means ABSENCE. An all-white mask would render the
    // same today and is NOT the same thing: it makes every consumer decide whether a
    // full-keep mask is equivalent to no mask, and one of them will decide wrong.
    const root = render(sceneWith([shape('alone', box(0, 0, 1920, 1080), 0)]));
    expect(sceneMaskHoles(sceneWith([shape('alone', box(0, 0, 1920, 1080), 0)])).size).toBe(0);
    for (const property of LIVE_SOURCE_MASK_PROPERTIES) {
      expect(node(root, 'alone').style.getPropertyValue(property), property).toBe('');
    }
  });
});

// ── 4. WHAT THE MASK MAY AND MAY NOT READ ───────────────────────────────────

describe('1.5c — the mask is a pure function of the SCENE', () => {
  it('an INVISIBLE plate punches nothing — visibility is a scene fact', () => {
    const root = render(
      sceneWith([
        shape('backdrop', box(0, 0, 1920, 1080), 0),
        plate('p', box(200, 150, 640, 360), 10, { visible: false }),
      ]),
    );
    expect(node(root, 'backdrop').style.getPropertyValue('mask-image')).toBe('');
  });

  it('§9a-Z as CORRECTED — the punch is UNCONDITIONAL, never gated on assignment', () => {
    // A plate carries only a SYMBOLIC `routeKey`; whether it resolves to a real feed is
    // an INSTALLATION fact, and this mask is baked at export before any installation is
    // known. A condition belongs in the mask only if it can be evaluated from the scene
    // alone. 6.7's named refusal is the single authority on an unsourced plate.
    const root = render(
      sceneWith([
        shape('backdrop', box(0, 0, 1920, 1080), 0),
        plate('never-mapped-anywhere', box(200, 150, 640, 360), 10),
      ]),
    );
    expect(holeRects(maskSvg(root, 'backdrop'))).toHaveLength(1);
  });
});

// ── 5. THE MASK IS IN THE ELEMENT'S OWN BOX ─────────────────────────────────

describe('1.5c — holes are pulled back into the masked element’s OWN box', () => {
  it('a scaled backdrop gets local-space holes, not scene-space ones', () => {
    // A CSS mask applies BEFORE the element's transform, so scene px would be
    // double-counted by every scale in the chain. Backdrop: a 960×540 box drawn at
    // scale 2 (covering the frame); a plate at scene (200,150,640,360) is therefore at
    // LOCAL (100,75,320,180).
    const backdrop = {
      ...baseProps,
      id: 'backdrop',
      name: 'backdrop',
      type: 'shape',
      shape: 'rectangle',
      fill: { kind: 'solid', color: '#d00000' },
      transform: {
        position: { x: 0, y: 0 },
        size: { w: 960, h: 540 },
        scale: { x: 2, y: 2 },
        rotation: 0,
        anchor: { x: 0, y: 0 },
      },
      zIndex: 0,
    } as unknown as Element;
    const root = render(sceneWith([backdrop, plate('p', box(200, 150, 640, 360), 10)]));
    const svg = maskSvg(root, 'backdrop');
    // The viewBox is the element's own box, and the hole is in that box's units.
    expect(svg).toContain("width='960'");
    expect(svg).toContain("height='540'");
    const hole = holeRects(svg)[0] ?? '';
    expect(hole).toContain("x='100'");
    expect(hole).toContain("y='75'");
    expect(hole).toContain("width='320'");
    expect(hole).toContain("height='180'");
  });
});
