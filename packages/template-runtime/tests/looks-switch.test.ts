import { describe, expect, it } from 'vitest';
import { Window } from 'happy-dom';
import { CG_CONTROL_KEY, withCgControl, type Element, type Scene } from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';

/**
 * `multibox-layout-switch` §14 (LOOKS) phase 1D — **the 6-box fixture: the switch is a
 * visibility flip plus a re-punch, and NOTHING else.**
 *
 * Six sources; a 6-box look (3×2), a solo look, and two single-purpose looks that differ
 * from the 6-box CELL 1 on exactly one axis each — so a one-axis-blind reader cannot pass
 * (D.4: three defects in four sessions came from one-axis suites). Every switch test
 * asserts BOTH halves: where the plates are (instance visibility; nothing inside moved)
 * AND where the holes are (the backdrop's mask).
 */

const baseElProps = { opacity: 1, visible: true, locked: false };

const tf = (x: number, y: number, w: number, h: number) => ({
  position: { x, y },
  size: { w, h },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
});

const el = (type: string, id: string, t: ReturnType<typeof tf>, over = {}): Element =>
  ({ ...baseElProps, id, name: id, type, transform: t, zIndex: 0, ...over }) as unknown as Element;

const plate = (id: string, routeKey: string, x: number, y: number, w: number, h: number): Element =>
  el('video-placeholder', id, tf(x, y, w, h), { routeKey });

const BACKDROP = el('shape', 'backdrop', tf(0, 0, 1920, 1080), {
  shape: 'rectangle',
  fill: { kind: 'solid', color: '#d00000' },
  zIndex: 0,
});

/** The 3×2 grid — six 640×540 cells. */
const GRID = [
  { x: 0, y: 0 },
  { x: 640, y: 0 },
  { x: 1280, y: 0 },
  { x: 0, y: 540 },
  { x: 640, y: 540 },
  { x: 1280, y: 540 },
];

const comp = (id: string, children: Element[]) => ({
  id,
  name: id,
  resolution: { width: 1920, height: 1080 },
  frameRange: { in: 0, out: 50 },
  editorBackdrop: 'transparent',
  layers: [
    { id: `${id}-l`, name: 'l', visible: true, locked: false, blendMode: 'normal', children },
  ],
  fields: [],
  bindings: [],
});

const instance = (id: string, compId: string): Element =>
  el('composition', id, tf(0, 0, 1920, 1080), { compositionId: compId, zIndex: 10 });

const cut = { mode: 'cut' } as const;

function scene(): Scene {
  return {
    schemaVersion: 1,
    id: 's',
    name: 's',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    editorBackdrop: 'transparent',
    layers: [
      {
        id: 'L1',
        name: 'main',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [
          BACKDROP,
          instance('inst-six', 'comp-six'),
          instance('inst-pair', 'comp-pair'),
          instance('inst-big', 'comp-big'),
          instance('inst-solo', 'comp-solo'),
        ],
      },
    ],
    compositions: [
      comp(
        'comp-six',
        GRID.map((c, i) =>
          plate(`six-p${String(i + 1)}`, `guest-${String(i + 1)}`, c.x, c.y, 640, 540),
        ),
      ),
      // vs cell 1 (0,0,640,540): MOVED only.
      comp('comp-pair', [plate('pair-p1', 'guest-1', 640, 0, 640, 540)]),
      // vs cell 1: RESIZED only.
      comp('comp-big', [plate('big-p1', 'guest-1', 0, 0, 1280, 1080)]),
      // vs cell 1: BOTH axes.
      comp('comp-solo', [plate('solo-p1', 'guest-1', 320, 180, 1280, 720)]),
    ],
    fonts: [],
    fields: [],
    bindings: [],
    lookGroups: [
      {
        id: 'g1',
        sources: GRID.map((_, i) => ({ routeKey: `guest-${String(i + 1)}`, dynamic: false })),
        looks: [
          { id: 'look-six', name: 'Six', instanceId: 'inst-six', entered: cut },
          { id: 'look-pair', name: 'Pair', instanceId: 'inst-pair', entered: cut },
          { id: 'look-big', name: 'Big', instanceId: 'inst-big', entered: cut },
          { id: 'look-solo', name: 'Solo', instanceId: 'inst-solo', entered: cut },
        ],
        defaultLookId: 'look-six',
      },
    ],
  } as unknown as Scene;
}

function boot(sceneOverride?: Scene): {
  runtime: ReturnType<typeof createRuntime>;
  root: HTMLElement;
} {
  const window = new Window();
  const doc = window.document as unknown as Document;
  const host = doc.createElement('div');
  doc.body.appendChild(host);
  const runtime = createRuntime(sceneOverride ?? scene(), { root: host });
  return { runtime, root: host.querySelector('.cg-stage') as HTMLElement };
}

/** ALL holes punched into the backdrop, sorted (y, then x) for stable comparison. */
function holes(root: HTMLElement): { x: number; y: number; w: number; h: number }[] {
  const node = root.querySelector<HTMLElement>('[data-cg-element-id="backdrop"]');
  const svg = decodeURIComponent(node?.style.getPropertyValue('mask-image') ?? '');
  if (svg === '') return [];
  const num = (rect: string, k: string): number =>
    Number(new RegExp(`${k}='(-?[\\d.]+)'`).exec(rect)?.[1] ?? NaN);
  return [...svg.matchAll(/<rect [^>]*fill='#000'[^>]*\/>/g)]
    .map((m) => m[0])
    .map((r) => ({ x: num(r, 'x'), y: num(r, 'y'), w: num(r, 'width'), h: num(r, 'height') }))
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

function displayOf(root: HTMLElement, id: string): string {
  return root.querySelector<HTMLElement>(`[data-cg-element-id="${id}"]`)?.style.display ?? '?';
}

const INSTANCES = ['inst-six', 'inst-pair', 'inst-big', 'inst-solo'];
const SIX_HOLES = GRID.map((c) => ({ x: c.x, y: c.y, w: 640, h: 540 }));

describe('boot — a fresh build enters the DEFAULT look', () => {
  it('exactly one look visible from the start: six shown, the other three display:none', () => {
    const { runtime, root } = boot();
    expect(runtime.activeLookId()).toBe('look-six');
    expect(displayOf(root, 'inst-six')).not.toBe('none');
    for (const id of ['inst-pair', 'inst-big', 'inst-solo']) {
      expect(displayOf(root, id)).toBe('none');
    }
  });

  it('only the ACTIVE look punches: exactly the six grid holes, none from the hidden looks', () => {
    const { root } = boot();
    expect(holes(root)).toEqual(SIX_HOLES);
  });
});

describe('the switch — a visibility flip + re-punch, and nothing else', () => {
  it('🔴 six → solo: one hole, the flipped instances, and NO GEOMETRY inside any look moved', () => {
    const { runtime, root } = boot();
    // ⚠ Geometry, not innerHTML: the ACTIVE plate legitimately punches INTO the hidden
    // plates below it in z-order (suppression governs the PUNCHER, never the punched), so
    // their mask properties may change. What must NOT change is where anything sits —
    // under LOOKS a switch moves NOTHING. The byte-identical claim is the ROUND TRIP's,
    // below, where the transient masks must have been cleared again.
    const geomOf = (): Record<string, string>[] =>
      [...root.querySelectorAll<HTMLElement>('[data-cg-element-id^="six-p"]')].map((n) => ({
        left: n.style.left,
        top: n.style.top,
        width: n.style.width,
        height: n.style.height,
      }));
    const geomBefore = geomOf();
    expect(geomBefore).toHaveLength(6);

    expect(runtime.setActiveLook('look-solo')).toBe(true);

    expect(runtime.activeLookId()).toBe('look-solo');
    expect(holes(root)).toEqual([{ x: 320, y: 180, w: 1280, h: 720 }]);
    expect(displayOf(root, 'inst-solo')).not.toBe('none');
    expect(displayOf(root, 'inst-six')).toBe('none');
    expect(geomOf()).toEqual(geomBefore);
    // The backdrop itself was never hidden — the switch touches looks, not the scene.
    expect(displayOf(root, 'backdrop')).not.toBe('none');
  });

  it('🔴 solo-and-back RESTORES EXACTLY — holes, visibility AND the whole subtree, byte-identical', () => {
    const { runtime, root } = boot();
    const holesBefore = holes(root);
    const displaysBefore = INSTANCES.map((id) => displayOf(root, id));
    const sixBefore = root.querySelector('[data-cg-element-id="inst-six"]')?.innerHTML;

    runtime.setActiveLook('look-solo');
    runtime.setActiveLook('look-six');

    expect(holes(root)).toEqual(holesBefore);
    expect(INSTANCES.map((id) => displayOf(root, id))).toEqual(displaysBefore);
    expect(runtime.activeLookId()).toBe('look-six');
    // The transient masks the solo plate punched into six's hidden plates are CLEARED
    // again — "had a hole, has NONE now" (task 4.3) — so the round trip is byte-identical.
    expect(root.querySelector('[data-cg-element-id="inst-six"]')?.innerHTML).toBe(sixBefore);
  });

  it('an UNKNOWN look id returns false and changes nothing', () => {
    const { runtime, root } = boot();
    const before = holes(root);
    expect(runtime.setActiveLook('look-nope')).toBe(false);
    expect(runtime.activeLookId()).toBe('look-six');
    expect(holes(root)).toEqual(before);
  });

  it('a scene with NO multi-frame group: setActiveLook is a refused no-op, activeLookId undefined', () => {
    const bare = scene();
    delete (bare as unknown as Record<string, unknown>)['lookGroups'];
    const { runtime } = boot(bare);
    expect(runtime.activeLookId()).toBeUndefined();
    expect(runtime.setActiveLook('look-six')).toBe(false);
  });
});

describe('🔴 D.4 axes — the SAME source, one axis at a time (vs the 6-box cell 1)', () => {
  const cell1 = { x: 0, y: 0, w: 640, h: 540 };

  it('MOVED only — position changes, size does not', () => {
    const { runtime, root } = boot();
    runtime.setActiveLook('look-pair');
    const [hole] = holes(root);
    expect(hole).toEqual({ x: 640, y: 0, w: 640, h: 540 });
    expect({ w: hole?.w, h: hole?.h }).toEqual({ w: cell1.w, h: cell1.h });
  });

  it('RESIZED only — size changes, position does not', () => {
    const { runtime, root } = boot();
    runtime.setActiveLook('look-big');
    const [hole] = holes(root);
    expect(hole).toEqual({ x: 0, y: 0, w: 1280, h: 1080 });
    expect({ x: hole?.x, y: hole?.y }).toEqual({ x: cell1.x, y: cell1.y });
  });

  it('BOTH — position and size change together', () => {
    const { runtime, root } = boot();
    runtime.setActiveLook('look-solo');
    expect(holes(root)).toEqual([{ x: 320, y: 180, w: 1280, h: 720 }]);
  });
});

describe('🔴 tasks.md 6.7 — the BRIDGE→PAGE control payload switches the look', () => {
  /*
    The gap this closes: phase 3 moved each plate's MIXER FILL per look on the BRIDGE, while
    the page kept punching the OUTGOING look's holes — fill at the new geometry, hole at the
    old. Nothing carried the look id between the two machines.

    These tests drive the page through the exact payload the bridge sends, built by the SAME
    `withCgControl` the bridge calls, so the two halves cannot drift apart.
  */

  it('an update carrying the look id moves the holes — POSITION and SIZE together', async () => {
    const { runtime, root } = boot();
    expect(holes(root)).toEqual(SIX_HOLES);

    await runtime.update(withCgControl({}, { look: 'look-solo' }) as Record<string, never>);

    expect(runtime.activeLookId()).toBe('look-solo');
    // Both components, in one assertion — a rect is never checked one axis at a time.
    expect(holes(root)).toEqual([{ x: 320, y: 180, w: 1280, h: 720 }]);
    expect(displayOf(root, 'inst-solo')).not.toBe('none');
    expect(displayOf(root, 'inst-six')).toBe('none');
  });

  it('AXIS moved-only — the hole moves and does not resize', async () => {
    const { runtime, root } = boot();
    await runtime.update(withCgControl({}, { look: 'look-pair' }) as Record<string, never>);
    // vs the 6-box cell 1 (0,0,640,540): x changed, w/h did not.
    expect(holes(root)).toEqual([{ x: 640, y: 0, w: 640, h: 540 }]);
  });

  it('AXIS resized-only — the hole resizes in place', async () => {
    const { runtime, root } = boot();
    await runtime.update(withCgControl({}, { look: 'look-big' }) as Record<string, never>);
    expect(holes(root)).toEqual([{ x: 0, y: 0, w: 1280, h: 1080 }]);
  });

  it('🔴 a DISJOINT switch — the outgoing look shares NO source with the incoming one', async () => {
    /*
      Not add-a-box or drop-a-box: the two looks have no source in common. `look-pair` shows
      guest-1 alone; `look-fifth` shows guest-5 alone. Every plate the page was punching goes
      away and a plate it has never punched arrives, in one switch — the membership shape a
      grid-plus-solo fixture cannot produce, and the one where a stale hole would survive.
    */
    const s = scene();
    const layer = s.layers[0] as { children: Element[] };
    layer.children.push(instance('inst-fifth', 'comp-fifth'));
    (s.compositions as unknown as ReturnType<typeof comp>[]).push(
      comp('comp-fifth', [plate('fifth-p1', 'guest-5', 100, 60, 800, 450)]),
    );
    (s.lookGroups as unknown as { looks: unknown[] }[])[0]?.looks.push({
      id: 'look-fifth',
      name: 'Fifth',
      instanceId: 'inst-fifth',
      entered: cut,
    });
    const { runtime, root } = boot(s);

    await runtime.update(withCgControl({}, { look: 'look-pair' }) as Record<string, never>);
    expect(holes(root)).toEqual([{ x: 640, y: 0, w: 640, h: 540 }]);

    await runtime.update(withCgControl({}, { look: 'look-fifth' }) as Record<string, never>);

    // Exactly ONE hole, and it is the incoming look's — the outgoing plate's hole is gone
    // rather than lingering beside it.
    expect(runtime.activeLookId()).toBe('look-fifth');
    expect(holes(root)).toEqual([{ x: 100, y: 60, w: 800, h: 450 }]);
    expect(displayOf(root, 'inst-pair')).toBe('none');
    expect(displayOf(root, 'inst-fifth')).not.toBe('none');
  });

  it('a payload with NO look id changes nothing about the look', async () => {
    const { runtime, root } = boot();
    await runtime.update(withCgControl({}, { look: 'look-solo' }) as Record<string, never>);
    const before = holes(root);

    await runtime.update({} as Record<string, never>);

    expect(runtime.activeLookId()).toBe('look-solo');
    expect(holes(root)).toEqual(before);
  });

  it('an UNKNOWN look id leaves the current look standing', async () => {
    // A bridge that knows a look this template does not have is a version skew, not a
    // licence to blank the graphic. The ordinary re-punch runs and the row stays as it is.
    const { runtime, root } = boot();
    await runtime.update(withCgControl({}, { look: 'look-solo' }) as Record<string, never>);

    await runtime.update(withCgControl({}, { look: 'no-such-look' }) as Record<string, never>);

    expect(runtime.activeLookId()).toBe('look-solo');
    expect(holes(root)).toEqual([{ x: 320, y: 180, w: 1280, h: 720 }]);
  });

  it('🔴 the reserved key is never applied as a FIELD VALUE, and travels beside real fields', async () => {
    const { runtime, root } = boot();

    // A field id the template does not declare would be ignored anyway; what matters is that
    // the CONTROL key is stripped before the field machinery sees it, and that a real payload
    // carrying both still switches.
    await runtime.update(
      withCgControl({ headline: 'Tehran' }, { look: 'look-solo' }) as Record<string, never>,
    );

    expect(runtime.activeLookId()).toBe('look-solo');
    expect(holes(root)).toEqual([{ x: 320, y: 180, w: 1280, h: 720 }]);
    // Nothing anywhere in the rendered stage names the reserved key.
    expect(root.innerHTML).not.toContain(CG_CONTROL_KEY);
  });
});

describe('🔴 the PLAY path honours the control payload too — the re-take seam', () => {
  /*
    6.7 attaches the active look to the `CG ADD` data payload so a RE-TAKE cannot diverge: a
    row switched to a solo look and then re-taken rebuilds the page, which enters the AUTHORED
    DEFAULT, and only that payload can move it to the look the bridge actually seated.

    CasparCG hands a template's load-time data to the page through whichever global it uses,
    so reading the payload in `update()` alone left that fix INERT on any host that delivers
    load data through `play`. Both entry points now go through the one `enterLook`.
  */

  it('a play() carrying a look enters it, instead of holding the authored default', async () => {
    const { runtime, root } = boot();

    await runtime.play(withCgControl({}, { look: 'look-solo' }) as never);

    expect(runtime.activeLookId(), 'the payload must win over the authored default').toBe(
      'look-solo',
    );
    expect(holes(root)).toEqual([{ x: 320, y: 180, w: 1280, h: 720 }]);
    expect(displayOf(root, 'inst-solo')).not.toBe('none');
    expect(displayOf(root, 'inst-six')).toBe('none');
  });

  it('a play() with NO look keeps the authored default', async () => {
    const { runtime, root } = boot();

    await runtime.play({} as never);

    expect(runtime.activeLookId()).toBe('look-six');
    expect(holes(root)).toEqual(SIX_HOLES);
  });

  it('🔴 the reserved key never lands in the field values on the play path', async () => {
    /*
      `play()` MERGES its payload into the persistent value map, so an unstripped control key
      would not merely pass through — it would LIVE there, re-walked by every later apply.
      `isFieldNamespace` reads `{look: …}` as a nested-composition namespace, so it matched no
      scope and broke nothing visibly, which is exactly why it needed a test rather than a
      symptom.
    */
    const { runtime, root } = boot();

    await runtime.play(withCgControl({}, { look: 'look-solo' }) as never);
    await runtime.update({} as never);

    expect(runtime.activeLookId(), 'and the look survives a later empty update').toBe('look-solo');
    expect(root.innerHTML).not.toContain(CG_CONTROL_KEY);
  });
});

/**
 * 🔴 **`SKEW-INTERSECT-01` — the page half of the transition mask.**
 *
 * The bridge tells the page the entering look TWICE: once with `from` while the fills are
 * still moving, and once without it when they are in place. The first punches
 * `outgoing ∩ entering` so no hole can be open over a geometry that does not fill it; the
 * second is an ordinary re-punch. Everything here is asserted through `update()` — the real
 * door the bridge uses — rather than through a test-only seam.
 */
describe('SKEW-INTERSECT-01 — the transition mask on the page', () => {
  /** `look-six`'s cells that lie inside `look-big`'s 1280×1080 plate. */
  const SIX_IN_BIG = SIX_HOLES.filter((h) => h.x + h.w <= 1280);
  const BIG_HOLE = [{ x: 0, y: 0, w: 1280, h: 1080 }];

  it('🔴 punches the INTERSECTION, not the entering look, while `from` is present', async () => {
    const { runtime, root } = boot();
    await runtime.update(
      withCgControl({}, { look: 'look-big', from: 'look-six' }) as Record<string, never>,
    );
    // Four cells, not one 1280×1080 hole. The two cells `look-big` does not reach are CLOSED
    // rather than left open: the outgoing fills covered them and the entering ones do not.
    expect(holes(root)).toEqual(SIX_IN_BIG);
    expect(holes(root)).not.toEqual(BIG_HOLE);
  });

  it('the look is fully ENTERED during the transition — only the mask is conservative', async () => {
    const { runtime, root } = boot();
    await runtime.update(
      withCgControl({}, { look: 'look-big', from: 'look-six' }) as Record<string, never>,
    );
    // The instance flip, the active id and the media park all follow the ENTERING look. A
    // half-entered look would be a second answer to "which look is on", which §14 forbids.
    expect(runtime.activeLookId()).toBe('look-big');
    expect(displayOf(root, 'inst-big')).not.toBe('none');
    expect(displayOf(root, 'inst-six')).toBe('none');
  });

  it('the SETTLING tell — the same look without `from` — widens to its own holes', async () => {
    const { runtime, root } = boot();
    await runtime.update(
      withCgControl({}, { look: 'look-big', from: 'look-six' }) as Record<string, never>,
    );
    await runtime.update(withCgControl({}, { look: 'look-big' }) as Record<string, never>);
    expect(holes(root)).toEqual(BIG_HOLE);
  });

  it('🔴 the narrowing is NEVER STICKY: any later re-punch is a full one', async () => {
    /*
      The transition mask is a SUBSET of the look's own holes, so a page that RETAINED it
      would show less picture than the look asks for with nothing scheduled to widen it — and
      the next innocent field update would re-assert it rather than repair it. `update()` with
      no control data re-punches the stored view; the stored view must never carry `from`.
    */
    const { runtime, root } = boot();
    await runtime.update(
      withCgControl({}, { look: 'look-big', from: 'look-six' }) as Record<string, never>,
    );
    await runtime.update({ headline: 'Tehran' } as Record<string, never>);
    expect(holes(root)).toEqual(BIG_HOLE);
  });

  it('a `from` that names no second geometry states no transition', async () => {
    const { runtime, root } = boot();
    // The look being entered, and a look this template does not have. Both mean "nothing to
    // intersect with", which is the entering look's own holes — never an empty mask.
    await runtime.update(
      withCgControl({}, { look: 'look-big', from: 'look-big' }) as Record<string, never>,
    );
    expect(holes(root)).toEqual(BIG_HOLE);
    await runtime.update(withCgControl({}, { look: 'look-six' }) as Record<string, never>);
    await runtime.update(
      withCgControl({}, { look: 'look-big', from: 'no-such-look' }) as Record<string, never>,
    );
    expect(holes(root)).toEqual(BIG_HOLE);
  });

  it('a TAKE ignores `from` — there is no outgoing geometry to catch up with', async () => {
    const { runtime, root } = boot();
    await runtime.play(withCgControl({}, { look: 'look-big', from: 'look-six' }) as never);
    expect(holes(root)).toEqual(BIG_HOLE);
  });
});
