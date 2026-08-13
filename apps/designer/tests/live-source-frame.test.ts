/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { buildScene } from '@cg/template-runtime';
import { cgCss } from '@cg/single-file-export';
import type { Element, Scene } from '@cg/shared-schema';

/**
 * §9a.1 / task 1.5e — 🔴 **THE FRAME TAKES NO LAYOUT, UNDER THE STYLESHEET THE
 * ARTIFACT ACTUALLY SHIPS.**
 *
 * This file exists because §9a.1's premise did not survive re-verification, and the
 * correction is only observable where the two packages meet:
 *
 * > §9a.1: "there is **no `box-sizing` reset anywhere in `@cg/template-runtime`**, so
 * > the CSS default `content-box` applies and the border is painted **OUTSIDE** the
 * > declared `width`/`height`."
 *
 * True of the PACKAGE, false of the PAGE. `@cg/single-file-export`'s `cgCss` — the
 * same bytes in every `.vcg`, in the single-file export and in the Preview iframe —
 * opens with `*{box-sizing:border-box}`, and the Designer canvas is reset identically
 * by `@cg/ui`'s `theme.css`. Under that reset a `border` would be drawn INSIDE
 * `transform.size`: covering the live picture and shrinking the visible area below
 * the rect `collectLiveSources` declared — precisely the failure §9a.1's constraint 1
 * forbids. And declaring `content-box` to escape it fixes the size while SLIDING the
 * hole by the stroke width, because `left`/`top` position the border edge (measured
 * in Chromium; see `tests/e2e/live-source.spec.ts`).
 *
 * `buildLiveSource` therefore renders the frame as an `outline`, which is painted
 * outside the box and occupies no layout at all — so the plate's box is `transform`
 * under either box model, and the reset becomes IRRELEVANT rather than defeated.
 *
 * What this file pins is that irrelevance: the reset is real and live in the
 * document, and the plate carries nothing for it to act on. Neither package's own
 * tests can see this — template-runtime does not depend on the exporter, and the
 * exporter never builds a scene — so the Designer, which depends on both, is where
 * it lives. The GEOMETRY itself needs real layout and is asserted in the Playwright
 * spec above.
 *
 * Maps `specs/designer-live-source/spec.md`:
 *   - "A Live Source may carry a FRAME, and the frame never enters the hole"
 */

const baseElProps = {
  transform: {
    position: { x: 100, y: 200 },
    size: { w: 640, h: 360 },
    scale: { x: 1, y: 1 },
    rotation: 0,
    anchor: { x: 0, y: 0 },
  },
  opacity: 1,
  visible: true,
  locked: false,
  zIndex: 0,
};

const STROKE = { width: 6, color: '#ff8800' };

function sceneWith(children: Element[]): Scene {
  return {
    schemaVersion: 1,
    id: 'scene-frame',
    name: 'frame',
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

/** Mount a built scene under the SHIPPED baseline stylesheet, as the artifact does. */
function mountUnderCgCss(children: Element[]): void {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  const style = document.createElement('style');
  style.textContent = cgCss;
  document.head.appendChild(style);
  const built = buildScene(sceneWith(children), document, 'output');
  document.body.appendChild(built.container);
}

const found = (id: string): HTMLElement =>
  document.querySelector<HTMLElement>(`[data-cg-element-id="${id}"]`) as HTMLElement;

const plate = (over: Record<string, unknown> = {}): Element =>
  ({
    ...baseElProps,
    id: 'live-a',
    name: 'Guest box',
    type: 'video-placeholder',
    routeKey: 'guest-1',
    ...over,
  }) as unknown as Element;

const shape = (over: Record<string, unknown> = {}): Element =>
  ({
    ...baseElProps,
    id: 'shape-a',
    name: 'Bar',
    type: 'shape',
    shape: 'rect',
    ...over,
  }) as unknown as Element;

describe('the shipped baseline stylesheet — the fact the opt-out exists for', () => {
  it('cgCss resets EVERY element to border-box', () => {
    // If this ever stops being true, the plate's explicit `content-box` becomes
    // redundant rather than wrong — but read `buildLiveSource` before removing it,
    // because `@cg/ui`'s theme.css resets the Designer canvas the same way.
    expect(cgCss).toMatch(/\*\s*\{[^}]*box-sizing\s*:\s*border-box/);
  });
});

describe('§9a.1 constraint 1 — the reset cannot reach the plate', () => {
  it('a framed plate declares an OUTLINE and no border; a framed shape declares a border', () => {
    mountUnderCgCss([plate({ stroke: STROKE }), shape({ stroke: STROKE })]);
    const el = found('live-a');

    // The frame: painted outside the box, taking no layout, so nothing about the
    // page's box model can change where the hole is.
    expect(el.style.outline).toContain('6px');
    expect(el.style.outline).toContain('solid');
    // …and NOTHING that occupies layout. This is the assertion that survives a
    // future change swapping the outline back to a border: a border here would be
    // eaten by the reset below, and `content-box` would slide the hole instead.
    expect(el.style.border).toBe('');
    expect(el.style.borderWidth).toBe('');
    expect(el.style.padding).toBe('');
    expect(el.style.boxSizing).toBe('');

    // The reset is LIVE in this document and the plate inherits it — which is now
    // harmless rather than fixed: with no border and no padding, content box ===
    // border box under either model.
    expect(getComputedStyle(el).boxSizing).toBe('border-box');
    expect(getComputedStyle(el).paddingTop).toBe('0px');

    // The contrast is the point: the reset is NOT a bug and is NOT globally "fixed".
    // Shapes and text have been authored against border-box since D-042 — their
    // strokes ARE borders and paint inside the box — and templates are drawn to
    // that. Only the Live Source declines to be a drawing, because its rect is a
    // CONTRACT with another process.
    expect(found('shape-a').style.border).toContain('6px');
    expect(getComputedStyle(found('shape-a')).boxSizing).toBe('border-box');
  });

  it('an UNFRAMED plate is untouched by the feature — no outline, no DOM change', () => {
    mountUnderCgCss([plate()]);
    expect(found('live-a').style.outline).toBe('');
    expect(found('live-a').style.border).toBe('');
  });

  it('a zero-width frame paints nothing and still occupies no layout', () => {
    // The falsy-zero trap from the other side: `width: 0` is "no frame", not "unset".
    mountUnderCgCss([plate({ stroke: { width: 0, color: '#00ff00' } })]);
    expect(found('live-a').style.outline).toContain('0px');
    expect(found('live-a').style.border).toBe('');
  });
});
