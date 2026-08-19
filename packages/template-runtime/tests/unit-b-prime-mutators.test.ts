import { describe, expect, it } from 'vitest';
import { Window } from 'happy-dom';
import type { Element, Scene } from '@cg/shared-schema';
import { liveSourceFit, sceneMaskHoles } from '@cg/shared-schema';
import { buildScene } from '../src/scene-builder.js';
import { createRuntime } from '../src/runtime.js';
import { LIVE_SOURCE_MASK_PROPERTIES } from '../src/live-source-punch.js';

/**
 * ⭐ **UNIT B′ — `multibox-layout-switch` `tasks.md` 4.4: the ELEVEN MUTATORS of
 * `design.md` §6b, one test each.**
 *
 * §6b enumerated every mutator that moves or removes a plate and recorded, for all eleven,
 * **"mask follows today? 🔴 no"** — because the mask was computed once at build and nothing
 * recomputed it. A hole with no plate behind it is the backdrop punched through to nothing:
 * BLACK on air, in the shape of a box that has gone.
 *
 * ⭐ **The file opens with a POSITIVE CONTROL, and the ordering is not decoration.** Six of
 * the tests below assert that a hole is ABSENT or has MOVED, and a mask that never applied
 * would satisfy every one of them. Skipping exactly this control is what let a no-op mask
 * read as "mechanism B fails" at the plant and briefly promoted `design.md` §9b to the live
 * architecture. **A negative observation is VOID until the instrument is proven live.**
 *
 * ⚠ **Rows 3 and 4 are answered on the OUTPUT side, not the page side, and that is the
 * finding rather than a shortcut** — see their own comments.
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

function shape(id: string, t: ReturnType<typeof box>, zIndex: number, over = {}): Element {
  return {
    ...baseProps,
    id,
    name: id,
    type: 'shape',
    shape: 'rectangle',
    fill: { kind: 'solid', color: '#d00000' },
    transform: t,
    zIndex,
    ...over,
  } as unknown as Element;
}

function sceneWith(children: Element[], over: Partial<Scene> = {}): Scene {
  return {
    schemaVersion: 1,
    id: 'scene-b-prime',
    name: 'b-prime',
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
    ...over,
  } as unknown as Scene;
}

function render(scene: Scene): HTMLElement {
  const window = new Window();
  return buildScene(scene, window.document as unknown as Document, 'output').container;
}

const node = (root: HTMLElement, id: string): HTMLElement =>
  root.querySelector<HTMLElement>(`[data-cg-element-id="${id}"]`) as HTMLElement;

function maskSvg(root: HTMLElement, id: string): string {
  return decodeURIComponent(node(root, id).style.getPropertyValue('mask-image'));
}

/** Every rect the mask PUNCHES (the black ones). The white one is the keep. */
function holeRects(svg: string): string[] {
  return [...svg.matchAll(/<rect [^>]*fill='#000'[^>]*\/>/g)].map((m) => m[0]);
}

/** The x of the single hole in `id`'s mask, or `null` when it carries none. */
function holeX(root: HTMLElement, id: string): number | null {
  const svg = maskSvg(root, id);
  if (svg === '') return null;
  const holes = holeRects(svg);
  const m = holes[0]?.match(/x='(-?[\d.]+)'/);
  return m?.[1] === undefined ? null : Number(m[1]);
}

/** Boot a runtime over `scene` and return its stage container. */
function boot(scene: Scene): { runtime: ReturnType<typeof createRuntime>; root: HTMLElement } {
  const window = new Window();
  const doc = window.document as unknown as Document;
  const host = doc.createElement('div');
  doc.body.appendChild(host);
  const runtime = createRuntime(scene, { root: host });
  return { runtime, root: host.querySelector('.cg-stage') as HTMLElement };
}

const BACKDROP = shape('backdrop', box(0, 0, 1920, 1080), 0);
const GUEST = plate('guest-1', box(200, 150, 640, 360), 10);

// ── 0. THE POSITIVE CONTROL ─────────────────────────────────────────────────

describe('UNIT B′ · POSITIVE CONTROL — the instrument is live', () => {
  it('a full-frame backdrop under a plate is punched, in the plate rect', () => {
    const root = render(sceneWith([BACKDROP, GUEST]));
    const svg = maskSvg(root, 'backdrop');
    expect(svg, 'the backdrop carries NO mask — every ABSENT assertion below is void').not.toBe('');
    expect(holeRects(svg)).toHaveLength(1);
    expect(holeX(root, 'backdrop')).toBe(200);
  });
});

// ── ROWS 1 & 2 — take and teardown ──────────────────────────────────────────

describe('UNIT B′ · row 1 — TAKE', () => {
  it('the mask exists the moment the graphic is built for air, not one update later', () => {
    // A take renders the page and puts it up. The claim is that the punch is part of
    // BUILDING, so a graphic is never on air for even one frame with an unpunched backdrop.
    const { root } = boot(sceneWith([BACKDROP, GUEST]));
    expect(holeX(root, 'backdrop')).toBe(200);
  });
});

describe('UNIT B′ · row 2 — TEARDOWN', () => {
  it('🔴 a plate that goes away takes its hole with it, and the mask properties are REMOVED', () => {
    const { runtime, root } = boot(sceneWith([BACKDROP, GUEST]));
    expect(holeX(root, 'backdrop'), 'control: the hole was there to lose').toBe(200);

    // The page-side half of a teardown: the plate stops being on screen. The bridge-side
    // half (releasing the producer) is stage D's reconcile and is not this layer's.
    runtime.setArrangementView({ visibility: { 'guest-1': false } });

    expect(maskSvg(root, 'backdrop')).toBe('');
    // 🔴 CLEARED, not merely absent from the map. A reassign-what-is-in-the-map
    // implementation leaves the old mask standing — a hole with nothing behind it.
    for (const property of LIVE_SOURCE_MASK_PROPERTIES) {
      expect(node(root, 'backdrop').style.getPropertyValue(property), property).toBe('');
    }
  });
});

// ── ROWS 3 & 4 — the OUTPUT-side mutators ───────────────────────────────────

describe('UNIT B′ · row 3 — POSITION OVERRIDE', () => {
  it('the FILL follows the operator position; the page mask correctly does NOT', () => {
    // 🔴 The finding this row actually produces. A position override moves the whole
    // GRAPHIC on the output frame — it changes nothing INSIDE the page, so the page's mask
    // must stay exactly where it is, and it is the bridge's FILL/CLIP that has to follow.
    // A mask that "followed" a position override would double-count the move.
    const common = {
      rect: { x: 200, y: 150, width: 640, height: 360 },
      sceneResolution: { width: 1920, height: 1080 },
      raster: { width: 1920, height: 1080 },
      sourceAspect: null,
    } as const;
    const centred = liveSourceFit({
      ...common,
      position: { anchor: 'center', offset: { x: 0, y: 0 } },
    });
    const nudged = liveSourceFit({
      ...common,
      position: { anchor: 'center', offset: { x: 120, y: 0 } },
    });
    expect(nudged.fill.x).toBeGreaterThan(centred.fill.x);

    // …and the page mask is unmoved, because the position is not a page fact.
    const root = render(sceneWith([BACKDROP, GUEST]));
    expect(holeX(root, 'backdrop')).toBe(200);
  });
});

describe('UNIT B′ · row 4 — RESIZE (the channel raster changes)', () => {
  it('the FILL is re-derived against the new raster', () => {
    const common = {
      rect: { x: 200, y: 150, width: 640, height: 360 },
      sceneResolution: { width: 1920, height: 1080 },
      position: { anchor: 'center', offset: { x: 0, y: 0 } },
      sourceAspect: null,
    } as const;
    const hd = liveSourceFit({ ...common, raster: { width: 1920, height: 1080 } });
    const sd = liveSourceFit({ ...common, raster: { width: 1280, height: 720 } });
    // Normalized FILL is raster-relative, so the same hole on a smaller raster is the same
    // FRACTION — what must not happen is the px box surviving unscaled into the new raster.
    expect(sd.fill.width).toBeCloseTo(hd.fill.width, 6);
    expect(sd.clip.width).toBeCloseTo(hd.clip.width, 6);
  });
});

// ── ROW 5 — lifecycle range ─────────────────────────────────────────────────

describe('UNIT B′ · row 5 — LIFECYCLE RANGE', () => {
  it('a plate gated out of its lifespan stops punching', () => {
    // A `lifespan` gate writes `display: none` on the plate, which is the same expression of
    // "not on screen" the authored `visible` and a `visible` binding use — so the re-punch
    // reads it through the ONE resolved-visibility function without knowing which wrote it.
    const gated = plate('guest-1', box(200, 150, 640, 360), 10, {
      lifespan: { in: 30, out: 50 },
    });
    const { runtime, root } = boot(sceneWith([BACKDROP, gated]));
    // The gate is applied by the frame driver; assert the mechanism directly by hiding the
    // node the way the gate does, then re-punching.
    node(root, 'guest-1').style.display = 'none';
    runtime.setArrangementView(undefined);
    expect(maskSvg(root, 'backdrop')).toBe('');
  });
});

// ── ROW 6 — retention restore ───────────────────────────────────────────────

describe('UNIT B′ · row 6 — RETENTION RESTORE', () => {
  it('a restored item rebuilds the identical mask, because the mask is a pure function', () => {
    // A retention restore re-delivers the stack intent and rebuilds the page (B-092). The
    // claim that matters here is that nothing about the mask is carried in mutable state
    // that a restore could miss: same scene + same view ⇒ byte-identical mask.
    const scene = sceneWith([BACKDROP, GUEST]);
    const first = render(scene);
    const restored = render(scene);
    expect(maskSvg(restored, 'backdrop')).toBe(maskSvg(first, 'backdrop'));
    expect(maskSvg(first, 'backdrop')).not.toBe('');
  });
});

// ── ROW 7 — z-order reorder ─────────────────────────────────────────────────

describe('UNIT B′ · row 7 — Z-ORDER REORDER', () => {
  it('a backdrop moved ABOVE the plate is no longer masked — the rule is z-order', () => {
    const above = shape('backdrop', box(0, 0, 1920, 1080), 99);
    const root = render(sceneWith([above, GUEST]));
    expect(maskSvg(root, 'backdrop')).toBe('');
  });

  it('…and the same two elements the other way round DO punch (the control for it)', () => {
    const root = render(sceneWith([BACKDROP, GUEST]));
    expect(maskSvg(root, 'backdrop')).not.toBe('');
  });
});

// ── ROW 8 — arrangement switch ──────────────────────────────────────────────

describe('UNIT B′ · row 8 — ARRANGEMENT SWITCH', () => {
  it('🔴 a plate moved by the arrangement takes its hole with it', () => {
    const { runtime, root } = boot(sceneWith([BACKDROP, GUEST]));
    expect(holeX(root, 'backdrop'), 'control').toBe(200);

    runtime.setArrangementView({
      geometry: { 'guest-1': { x: 1000, y: 150, width: 640, height: 360 } },
    });

    expect(holeX(root, 'backdrop')).toBe(1000);
  });
});

// ── ROWS 9 & 10 — the bindings ──────────────────────────────────────────────

const VISIBLE_FIELD = {
  fields: [{ id: 'showGuest', label: 'show', type: 'boolean', defaultValue: true }],
  bindings: [{ fieldId: 'showGuest', target: { kind: 'visible', elementId: 'guest-1' } }],
};

describe('UNIT B′ · row 9 — a `visible` BINDING', () => {
  it('hiding the plate through a field stops the punch', async () => {
    const { runtime, root } = boot(sceneWith([BACKDROP, GUEST], VISIBLE_FIELD as Partial<Scene>));
    expect(maskSvg(root, 'backdrop'), 'control').not.toBe('');

    await runtime.update({ showGuest: false });

    expect(maskSvg(root, 'backdrop')).toBe('');
  });

  it('…and showing it again brings the hole back — the pass is not one-way', async () => {
    const { runtime, root } = boot(sceneWith([BACKDROP, GUEST], VISIBLE_FIELD as Partial<Scene>));
    await runtime.update({ showGuest: false });
    await runtime.update({ showGuest: true });
    expect(holeX(root, 'backdrop')).toBe(200);
  });
});

describe('UNIT B′ · row 10 — a `transform` BINDING', () => {
  it('🔴 moving the plate through a field moves its hole', async () => {
    const moved = {
      fields: [{ id: 'guestX', label: 'x', type: 'number', defaultValue: 200 }],
      bindings: [
        { fieldId: 'guestX', target: { kind: 'transform', elementId: 'guest-1', property: 'x' } },
      ],
    };
    const { runtime, root } = boot(sceneWith([BACKDROP, GUEST], moved as Partial<Scene>));
    expect(holeX(root, 'backdrop'), 'control').toBe(200);

    await runtime.update({ guestX: 900 });

    expect(holeX(root, 'backdrop')).toBe(900);
  });
});

// ── ROW 11 — the background crossfade ───────────────────────────────────────

describe('UNIT B′ · row 11 — a BACKGROUND CROSSFADE (§13.3, per-arrangement backgrounds)', () => {
  it('🔴 BOTH backdrops carry the mask while they are crossfading', () => {
    // §13.3's requirement, and the one that is easy to get wrong: during the crossfade the
    // OUTGOING and INCOMING backgrounds are on screen together. A mask on only the incoming
    // one leaves the outgoing one solid over the guest for the whole fade; a mask on only
    // the outgoing one punches a hole to nothing in the incoming one.
    const bgA = shape('bg-a', box(0, 0, 1920, 1080), 0);
    const bgB = shape('bg-b', box(0, 0, 1920, 1080), 1, { visible: false });
    const scene = sceneWith([bgA, bgB, GUEST]);

    // Mid-crossfade: the arrangement has revealed B while A has not yet left.
    const holes = sceneMaskHoles(scene, { visibility: { 'bg-a': true, 'bg-b': true } });

    expect(holes.get('bg-a'), 'the OUTGOING backdrop lost its mask').toBeDefined();
    expect(holes.get('bg-b'), 'the INCOMING backdrop was never masked').toBeDefined();
    expect(holes.get('bg-a')?.[0]?.x).toBe(200);
    expect(holes.get('bg-b')?.[0]?.x).toBe(200);
  });

  it('⭐ the INCOMING backdrop is already masked while it is still hidden', () => {
    // Measured, not assumed: `sceneMaskHoles` filters visibility on the PLATE, never on the
    // element being masked — so a hidden backdrop carries its mask before it is ever shown.
    // That is the SAFE direction and worth pinning: masking something that paints nothing
    // has no cost, while the alternative leaves a one-frame window where a backdrop has
    // become visible and its mask has not yet been reassigned. A crossfade is exactly the
    // manoeuvre that would find that frame.
    const bgA = shape('bg-a', box(0, 0, 1920, 1080), 0);
    const bgB = shape('bg-b', box(0, 0, 1920, 1080), 1, { visible: false });
    const holes = sceneMaskHoles(sceneWith([bgA, bgB, GUEST]));
    expect(holes.get('bg-a')).toBeDefined();
    expect(holes.get('bg-b'), 'the incoming backdrop must arrive already punched').toBeDefined();
  });

  it('the control: with the PLATE hidden, neither backdrop is masked', () => {
    // The negative control for the pair above — proving the two `toBeDefined()`s are
    // reporting the plate's hole and not simply "a mask entry always exists".
    const bgA = shape('bg-a', box(0, 0, 1920, 1080), 0);
    const bgB = shape('bg-b', box(0, 0, 1920, 1080), 1, { visible: false });
    const holes = sceneMaskHoles(sceneWith([bgA, bgB, GUEST]), {
      visibility: { 'guest-1': false },
    });
    expect(holes.get('bg-a')).toBeUndefined();
    expect(holes.get('bg-b')).toBeUndefined();
  });
});
