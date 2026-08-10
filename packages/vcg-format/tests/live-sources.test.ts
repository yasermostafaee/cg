import { describe, expect, it } from 'vitest';
import type {
  Composition,
  Element,
  Layer,
  Scene,
  Transform,
  VideoPlaceholderElement,
} from '@cg/shared-schema';
import { SceneSchema } from '@cg/shared-schema';
import { collectLiveSources } from '../src/live-sources.js';
import { fixtureScene } from './fixtures.js';

/**
 * D-137 / C-015 phase 2 — `collectLiveSources` derives the runtime's declaration
 * from the scene graph.
 *
 * The load-bearing case is the SCALED composition instance. `frameAabb` — the
 * repo's other flattener — never walks into a composition instance at all, so a
 * naive reuse of it would emit the element's own composition-local rect. On an
 * UNSCALED instance that rect is still right, so a fixture whose instance merely
 * translates would pass against the wrong implementation; every nesting test here
 * therefore scales.
 */

function transform(over: Partial<Transform> = {}): Transform {
  return {
    position: { x: 0, y: 0 },
    size: { w: 100, h: 100 },
    scale: { x: 1, y: 1 },
    rotation: 0,
    anchor: { x: 0, y: 0 },
    ...over,
  };
}

function liveSource(
  id: string,
  t: Transform,
  over: Partial<VideoPlaceholderElement> = {},
): VideoPlaceholderElement {
  return {
    id,
    name: id,
    type: 'video-placeholder',
    transform: t,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    routeKey: id,
    ...over,
  };
}

function layer(children: Element[], id = 'layer-live'): Layer {
  return { id, name: id, visible: true, locked: false, blendMode: 'normal', children };
}

function container(id: string, t: Transform, children: Element[]): Element {
  return {
    id,
    name: id,
    type: 'container',
    transform: t,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    children,
  };
}

function instance(id: string, compositionId: string, t: Transform): Element {
  return {
    id,
    name: id,
    type: 'composition',
    transform: t,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    compositionId,
  };
}

function composition(id: string, width: number, height: number, children: Element[]): Composition {
  return {
    id,
    name: id,
    resolution: { width, height },
    frameRate: 50,
    frameRange: { in: 0, out: 50 },
    background: 'transparent',
    layers: [layer(children, `${id}-layer`)],
  };
}

/** A scene whose root layers are exactly `children`, at 1920×1080. */
function sceneWith(children: Element[], compositions?: Composition[]): Scene {
  return {
    ...fixtureScene,
    layers: [layer(children)],
    ...(compositions !== undefined ? { compositions } : {}),
  };
}

describe('collectLiveSources', () => {
  it('flattens a top-level Live Source to its own rect, and carries ONE id', () => {
    // The element still PARSES a `keySourceId` — deleting the field would be a
    // migration — and this scene carries one, so the assertion below is the
    // whole point of the amendment (design.md §1a): a template declares one
    // symbolic id and the fill/key pair belongs to the installation's MAPPING.
    const scene = sceneWith([
      liveSource('guest-1', transform({ position: { x: 300, y: 200 }, size: { w: 640, h: 360 } }), {
        keySourceId: 'guest-1-key',
        expectedAspect: 16 / 9,
      }),
    ]);

    expect(collectLiveSources(scene)).toEqual([
      {
        elementId: 'guest-1',
        sourceId: 'guest-1',
        rect: { x: 300, y: 200, width: 640, height: 360 },
        expectedAspect: 16 / 9,
        dynamic: false,
      },
    ]);
  });

  it('omits absent optionals rather than spelling them undefined', () => {
    const [decl] = collectLiveSources(sceneWith([liveSource('guest-1', transform())]));
    expect(decl).toBeDefined();
    expect(Object.keys(decl ?? {})).not.toContain('expectedAspect');
  });

  it('composes container ancestors, including their own scale', () => {
    const scene = sceneWith([
      container('group', transform({ position: { x: 100, y: 50 }, scale: { x: 2, y: 3 } }), [
        liveSource('guest-1', transform({ position: { x: 10, y: 20 }, size: { w: 40, h: 30 } })),
      ]),
    ]);

    // The container's anchor is (0,0), so its scale applies about its own origin:
    // x = 100 + 2·10 = 120, w = 2·40 = 80; y = 50 + 3·20 = 110, h = 3·30 = 90.
    expect(collectLiveSources(scene)[0]?.rect).toEqual({ x: 120, y: 110, width: 80, height: 90 });
  });

  it('THE case: composes a composition instance SCALE, which frameAabb does not', () => {
    // A 960×540 composition rendered into a 480×270 box ⇒ inner scale 0.5 on both
    // axes. The hole is at (200,100) 400×200 in COMPOSITION pixels.
    const comp = composition('comp-inner', 960, 540, [
      liveSource('guest-1', transform({ position: { x: 200, y: 100 }, size: { w: 400, h: 200 } })),
    ]);
    const scene = sceneWith(
      [
        instance(
          'inst-1',
          'comp-inner',
          transform({ position: { x: 1000, y: 600 }, size: { w: 480, h: 270 } }),
        ),
      ],
      [comp],
    );

    // Composition-local (200,100)+400×200 → ×0.5 → (100,50)+200×100 in the
    // instance box → +instance position (1000,600) → (1100,650) sized 200×100.
    //
    // The wrong implementation — the one that walks the children but forgets the
    // instance's inner scale — yields (1200,700) sized 400×200. Both differ from
    // the "never walked at all" answer, so this case separates all three.
    expect(collectLiveSources(scene)[0]?.rect).toEqual({
      x: 1100,
      y: 650,
      width: 200,
      height: 100,
    });
  });

  it('composes a scaled instance with a NON-UNIFORM scale, per axis', () => {
    // 1920×1080 composition into a 960×1080 box ⇒ scale (0.5, 1). A single-factor
    // implementation would place the box a quarter of the frame wrong on one axis.
    const comp = composition('comp-inner', 1920, 1080, [
      liveSource('guest-1', transform({ position: { x: 400, y: 400 }, size: { w: 800, h: 200 } })),
    ]);
    const scene = sceneWith(
      [instance('inst-1', 'comp-inner', transform({ size: { w: 960, h: 1080 } }))],
      [comp],
    );

    expect(collectLiveSources(scene)[0]?.rect).toEqual({ x: 200, y: 400, width: 400, height: 200 });
  });

  it('composes a container INSIDE a scaled instance, both levels', () => {
    const comp = composition('comp-inner', 1000, 1000, [
      container('group', transform({ position: { x: 100, y: 200 } }), [
        liveSource('guest-1', transform({ position: { x: 50, y: 50 }, size: { w: 200, h: 100 } })),
      ]),
    ]);
    const scene = sceneWith(
      [
        instance(
          'inst-1',
          'comp-inner',
          transform({ position: { x: 10, y: 20 }, size: { w: 500, h: 500 } }),
        ),
      ],
      [comp],
    );

    // comp-local (150,250)+200×100 → ×0.5 → (75,125)+100×50 → +(10,20).
    expect(collectLiveSources(scene)[0]?.rect).toEqual({ x: 85, y: 145, width: 100, height: 50 });
  });

  it('composes TWO levels of scaled instance', () => {
    const inner = composition('comp-inner', 800, 800, [
      liveSource('guest-1', transform({ position: { x: 100, y: 100 }, size: { w: 400, h: 400 } })),
    ]);
    const outer = composition('comp-outer', 400, 400, [
      instance('inst-inner', 'comp-inner', transform({ size: { w: 200, h: 200 } })), // ×0.25
    ]);
    const scene = sceneWith(
      [instance('inst-outer', 'comp-outer', transform({ size: { w: 200, h: 200 } }))], // ×0.5
      [inner, outer],
    );

    // (100,100)+400×400 → ×0.25 → (25,25)+100×100 → ×0.5 → (12.5,12.5)+50×50.
    expect(collectLiveSources(scene)[0]?.rect).toEqual({
      x: 12.5,
      y: 12.5,
      width: 50,
      height: 50,
    });
  });

  it('takes the AABB of a ROTATED hole, not the mapping of two corners', () => {
    const scene = sceneWith([
      liveSource(
        'guest-1',
        transform({
          position: { x: 0, y: 0 },
          size: { w: 100, h: 200 },
          rotation: 90,
          anchor: { x: 0.5, y: 0.5 },
        }),
      ),
    ]);

    const rect = collectLiveSources(scene)[0]?.rect;
    // Rotating a 100×200 box 90° about its centre swaps the extents.
    expect(rect?.width).toBeCloseTo(200, 6);
    expect(rect?.height).toBeCloseTo(100, 6);
    expect(rect?.x).toBeCloseTo(-50, 6);
    expect(rect?.y).toBeCloseTo(50, 6);
  });

  it('declares each Live Source separately, in document order', () => {
    const scene = sceneWith([
      liveSource('guest-1', transform({ position: { x: 0, y: 0 } })),
      liveSource('guest-2', transform({ position: { x: 500, y: 0 } }), {
        expectedAspect: 4 / 3,
      }),
    ]);

    const decls = collectLiveSources(scene);
    expect(decls.map((d) => d.sourceId)).toEqual(['guest-1', 'guest-2']);
    expect(decls[0]?.rect.x).toBe(0);
    expect(decls[1]?.rect.x).toBe(500);
    expect(decls[1]?.expectedAspect).toBe(4 / 3);
  });

  it('reports a bound FILL id as dynamic, and an unbound one as static', () => {
    const scene: Scene = {
      ...sceneWith([liveSource('guest-1', transform()), liveSource('guest-2', transform())]),
      fields: [{ id: 'src', label: 'Source', required: false, type: 'text', default: 'guest-1' }],
      bindings: [
        { fieldId: 'src', target: { kind: 'live-source-id', elementId: 'guest-1', role: 'fill' } },
      ],
    };

    const decls = collectLiveSources(scene);
    expect(decls[0]).toMatchObject({ sourceId: 'guest-1', dynamic: true });
    expect(decls[1]).toMatchObject({ sourceId: 'guest-2', dynamic: false });
    for (const decl of decls) expect(decl).not.toHaveProperty('keyDynamic');
  });

  it('IGNORES a KEY-role binding — a key device is the installation mapping’s business', () => {
    const comp: Composition = {
      ...composition('comp-inner', 960, 540, [
        liveSource('guest-1', transform(), { keySourceId: 'guest-1-key' }),
      ]),
      fields: [{ id: 'key', label: 'Key', required: false, type: 'text', default: 'guest-1-key' }],
      bindings: [
        { fieldId: 'key', target: { kind: 'live-source-id', elementId: 'guest-1', role: 'key' } },
      ],
    };
    const scene = sceneWith(
      [instance('inst-1', 'comp-inner', transform({ size: { w: 480, h: 270 } }))],
      [comp],
    );

    // The binding still exists in the scene and still parses; it simply reaches
    // nothing, because a key device is no longer something a scene can name.
    const [decl] = collectLiveSources(scene);
    expect(decl).toMatchObject({ dynamic: false });
    expect(decl).not.toHaveProperty('keyDynamic');
    expect(decl).not.toHaveProperty('keySourceId');
  });

  it('declares nothing for a scene with no Live Source', () => {
    expect(collectLiveSources(fixtureScene)).toEqual([]);
  });

  it('does not walk a repeater subtree — a stamped row has no static rect', () => {
    const comp = composition('comp-row', 400, 100, [liveSource('guest-1', transform())]);
    const scene = sceneWith(
      [
        {
          id: 'rep',
          name: 'rep',
          type: 'repeater',
          transform: transform(),
          opacity: 1,
          visible: true,
          locked: false,
          zIndex: 0,
          compositionId: 'comp-row',
          count: 3,
          spacing: { x: 0, y: 120 },
          direction: 'vertical',
        } as Element,
      ],
      [comp],
    );

    expect(collectLiveSources(scene)).toEqual([]);
  });

  it('stops at a cyclic composition reference instead of looping', () => {
    const a = composition('comp-a', 100, 100, [instance('inst-b', 'comp-b', transform())]);
    const b = composition('comp-b', 100, 100, [
      instance('inst-a', 'comp-a', transform()),
      liveSource('guest-1', transform()),
    ]);
    const scene = sceneWith([instance('inst-a-root', 'comp-a', transform())], [a, b]);

    // One declaration — the cycle is cut on re-entry, never followed twice.
    expect(collectLiveSources(scene).map((d) => d.sourceId)).toEqual(['guest-1']);
  });

  it('declares nothing for a composition instance whose reference is missing', () => {
    const scene = sceneWith([instance('inst-1', 'comp-gone', transform())], []);
    expect(collectLiveSources(scene)).toEqual([]);
  });

  it('operates on scenes that round-trip through SceneSchema', () => {
    const comp = composition('comp-inner', 960, 540, [
      liveSource('guest-1', transform({ position: { x: 200, y: 100 }, size: { w: 400, h: 200 } })),
    ]);
    const scene = sceneWith(
      [instance('inst-1', 'comp-inner', transform({ size: { w: 480, h: 270 } }))],
      [comp],
    );

    const parsed = SceneSchema.parse(JSON.parse(JSON.stringify(scene)));
    expect(collectLiveSources(parsed)[0]?.rect).toEqual({
      x: 100,
      y: 50,
      width: 200,
      height: 100,
    });
  });
});
