import { describe, expect, it } from 'vitest';
import type { Element, Scene } from '@cg/shared-schema';
import { liveSourceIssues } from '../src/renderer/state/live-source-preflight.js';
import { dropFullyOffFrameForExport } from '../src/renderer/state/off-frame.js';
import { resolveBinding, describeBinding } from '../src/renderer/features/fields/bind-resolver.js';
import { defaultLiveSource } from '../src/renderer/state/element-defaults.js';

/**
 * D-137 phase 1 — the Designer half that is not UI: the four preflight ERRORS, the
 * off-frame EXEMPTION they replace, and the binding rule.
 *
 * Maps `specs/designer-live-source/spec.md`:
 *   - "An off-frame Live Source blocks rather than vanishes"
 *   - "An animated hole is refused in v1"
 *   - "Overlapping Live Sources are reported"
 *   - "A device reference is refused as a source id" (the preflight half)
 *   - "A bound id is settable at playout" (the resolver half)
 *   - "Multiple independent Live Sources"
 */

const baseElProps = {
  opacity: 1,
  visible: true,
  locked: false,
  zIndex: 0,
};

function tf(x: number, y: number, w = 640, h = 360) {
  return {
    position: { x, y },
    size: { w, h },
    scale: { x: 1, y: 1 },
    rotation: 0,
    anchor: { x: 0, y: 0 },
  };
}

function live(id: string, x: number, y: number, over: Record<string, unknown> = {}): Element {
  return {
    ...baseElProps,
    id,
    name: id,
    type: 'video-placeholder',
    transform: tf(x, y),
    expectedAspect: 16 / 9,
    routeKey: id,
    ...over,
  } as unknown as Element;
}

/** A container, optionally ROTATED (via `t`) and optionally ANIMATED (via `tracks`). */
function box(
  id: string,
  t: ReturnType<typeof tf>,
  children: Element[],
  tracks?: Record<string, unknown>,
): Element {
  return {
    ...baseElProps,
    id,
    name: id,
    type: 'container',
    transform: t,
    children,
    ...(tracks !== undefined ? { animation: { tracks } } : {}),
  } as unknown as Element;
}

function scene(children: Element[]): Scene {
  return {
    schemaVersion: 1,
    id: 'scene-1',
    name: 's',
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

const codes = (s: Scene): string[] => liveSourceIssues(s).map((i) => i.code);

describe('D-137 — every Live Source preflight issue is an ERROR, never a warning', () => {
  it('a clean scene reports nothing', () => {
    expect(liveSourceIssues(scene([live('guest-1', 100, 100)]))).toEqual([]);
  });

  it('EVERY issue this module can raise is severity error', () => {
    // The whole point of the codes: only `severity: 'error'` blocks an export
    // (`CompositionActionBar` gates on it, `Exporter.produce` throws on it). A
    // warning would ship the broken template with a note nobody reads.
    const messy = scene([
      live('guest-1', 5000, 100), // off-frame
      live('bad id', 10, 10, { routeKey: 'DECKLINK DEVICE 3' }), // device id
      live('guest-2', 20, 20), // overlaps guest-3
      live('guest-3', 40, 40, { animation: { tracks: { 'position.x': [] } } }), // animated
    ]);
    const issues = liveSourceIssues(messy);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((i) => i.severity === 'error')).toBe(true);
    expect(issues.every((i) => i.elementId !== undefined)).toBe(true);
  });
});

describe('D-137 — off-frame is an ERROR, and the element is NOT deleted', () => {
  it('a fully off-frame Live Source raises live-source-off-frame', () => {
    expect(codes(scene([live('guest-1', 5000, 100)]))).toContain('live-source-off-frame');
  });

  it('a PARTIALLY off-frame Live Source raises it too — half off-screen is still broken', () => {
    // Frame is 1920 wide; a 640-wide box at x=1600 hangs 320px off the right edge.
    expect(codes(scene([live('guest-1', 1600, 100)]))).toContain('live-source-off-frame');
  });

  it('a hole exactly filling the frame is fine — touching an edge is ON frame', () => {
    const el = live('guest-1', 0, 0);
    (el as unknown as { transform: ReturnType<typeof tf> }).transform = tf(0, 0, 1920, 1080);
    expect(codes(scene([el]))).toEqual([]);
  });

  it('the export filter EXEMPTS it — the contract survives to be reported on', () => {
    // Both halves are needed. Without the exemption the element vanishes and the
    // error never fires; without the error a surviving broken hole ships silently.
    const s = scene([live('guest-1', 5000, 100)]);
    const kept = dropFullyOffFrameForExport(s, s);
    expect(kept.layers[0]?.children).toHaveLength(1);
  });

  it('a Live Source inside a fully off-frame CONTAINER survives too', () => {
    // The back door: guarding only the direct child would let the container's own
    // drop delete the Live Source with it.
    const container = {
      ...baseElProps,
      id: 'box',
      name: 'box',
      type: 'container',
      transform: tf(5000, 0),
      children: [live('guest-1', 0, 0)],
    } as unknown as Element;
    const s = scene([container]);
    const kept = dropFullyOffFrameForExport(s, s);
    expect(kept.layers[0]?.children).toHaveLength(1);
  });

  it('an ordinary off-frame shape is STILL dropped — the exemption is narrow', () => {
    const shape = {
      ...baseElProps,
      id: 'rect',
      name: 'rect',
      type: 'shape',
      shape: 'rect',
      transform: tf(5000, 0),
      fill: { kind: 'solid', color: '#fff' },
    } as unknown as Element;
    const s = scene([shape]);
    expect(dropFullyOffFrameForExport(s, s).layers[0]?.children).toHaveLength(0);
  });
});

describe('D-137 — an animated hole is refused in v1', () => {
  it.each(['position.x', 'position.y', 'size.w', 'size.h', 'scale.x', 'scale.y', 'rotation'])(
    'a %s keyframe raises live-source-animated',
    (track) => {
      const s = scene([live('guest-1', 10, 10, { animation: { tracks: { [track]: [] } } })]);
      expect(codes(s)).toContain('live-source-animated');
    },
  );

  it('a NON-geometry keyframe (opacity) is fine — the hole does not move', () => {
    const s = scene([live('guest-1', 10, 10, { animation: { tracks: { opacity: [] } } })]);
    expect(codes(s)).toEqual([]);
  });

  /**
   * THE ANCESTOR CASE, and it is the one an element-local implementation passes by
   * accident: the plate carries no keyframes at all, and its rect is still a lie on
   * every frame but the first. `collectLiveSources` reads transforms STATICALLY, so
   * an animated PARENT moves the hole while the composited `MIXER FILL` stays where
   * it was — the same live-face-sliding-out failure, arriving by a different door.
   */
  it('an ANIMATED CONTAINER refuses the plate inside it, though the plate is static', () => {
    const s = scene([box('rig', tf(0, 0), [live('guest-1', 10, 10)], { 'position.x': [] })]);
    const issues = liveSourceIssues(s);
    expect(issues.map((i) => i.code)).toContain('live-source-animated');
    // The message must name the OFFENDER, not merely the plate — the author has to
    // know which thing to change, and it is not the one they selected.
    const msg = issues.find((i) => i.code === 'live-source-animated')?.message ?? '';
    expect(msg).toContain('guest-1');
    expect(msg).toContain('rig');
    // Reported against the PLATE, so selecting the issue goes to the element the
    // author recognises as the Live Source.
    expect(issues.find((i) => i.code === 'live-source-animated')?.elementId).toBe('guest-1');
  });

  it('an animated GRANDPARENT is caught too — the whole chain, not just the parent', () => {
    const inner = box('inner', tf(0, 0), [live('guest-1', 10, 10)]);
    const s = scene([box('outer', tf(0, 0), [inner], { 'scale.y': [] })]);
    expect(codes(s)).toContain('live-source-animated');
  });

  it('a STATIC container is fine — the check is about animation, not nesting', () => {
    const s = scene([box('rig', tf(0, 0), [live('guest-1', 10, 10)])]);
    expect(codes(s)).toEqual([]);
  });

  it('reports ONE error when the plate AND its parent are animated', () => {
    // Two errors for one thing to fix reads as two faults.
    const s = scene([
      box('rig', tf(0, 0), [live('guest-1', 10, 10, { animation: { tracks: { 'size.w': [] } } })], {
        'position.x': [],
      }),
    ]);
    expect(codes(s).filter((c) => c === 'live-source-animated')).toHaveLength(1);
  });
});

/**
 * D-137 — ROTATION, on the plate or ANYWHERE above it.
 *
 * The declared rect is AXIS-ALIGNED, so a rotated plate declares its BOUNDING BOX:
 * strictly larger than the frame the author drew, with the live picture composited
 * showing outside it. A rotated CONTAINER produces exactly that with the plate's own
 * rotation still at 0, which is why the check reads the composed chain.
 */
describe('D-137 — a rotated hole is refused', () => {
  it('the plate’s OWN rotation raises live-source-rotated', () => {
    const s = scene([live('guest-1', 10, 10, { transform: { ...tf(10, 10), rotation: 12 } })]);
    expect(codes(s)).toContain('live-source-rotated');
  });

  it('a ROTATED CONTAINER refuses the plate inside it, though the plate is unrotated', () => {
    const s = scene([box('rig', { ...tf(0, 0), rotation: 30 }, [live('guest-1', 10, 10)])]);
    const issues = liveSourceIssues(s);
    expect(issues.map((i) => i.code)).toContain('live-source-rotated');
    const msg = issues.find((i) => i.code === 'live-source-rotated')?.message ?? '';
    expect(msg).toContain('guest-1');
    expect(msg).toContain('rig');
    expect(issues.find((i) => i.code === 'live-source-rotated')?.elementId).toBe('guest-1');
  });

  it('a rotated GRANDPARENT is caught too', () => {
    const inner = box('inner', tf(0, 0), [live('guest-1', 10, 10)]);
    const s = scene([box('outer', { ...tf(0, 0), rotation: 45 }, [inner])]);
    expect(codes(s)).toContain('live-source-rotated');
  });

  it('an unrotated chain raises nothing', () => {
    const s = scene([box('rig', tf(0, 0), [live('guest-1', 10, 10)])]);
    expect(codes(s)).not.toContain('live-source-rotated');
  });

  it('reports ONE error when the plate AND its parent are rotated', () => {
    const s = scene([
      box('rig', { ...tf(0, 0), rotation: 30 }, [
        live('guest-1', 10, 10, { transform: { ...tf(10, 10), rotation: 12 } }),
      ]),
    ]);
    expect(codes(s).filter((c) => c === 'live-source-rotated')).toHaveLength(1);
  });
});

describe('D-137 — overlapping holes are reported against BOTH elements', () => {
  it('two overlapping Live Sources raise two issues, one per element', () => {
    const issues = liveSourceIssues(scene([live('guest-1', 100, 100), live('guest-2', 300, 200)]));
    const overlap = issues.filter((i) => i.code === 'live-source-overlap');
    expect(overlap.map((i) => i.elementId).sort()).toEqual(['guest-1', 'guest-2']);
  });

  it('edge-touching is NOT an overlap — zero shared area is not a collision', () => {
    // 640 wide at x=0 ends exactly where x=640 begins.
    expect(codes(scene([live('guest-1', 0, 0), live('guest-2', 640, 0)]))).toEqual([]);
  });

  it('holes in DIFFERENT compositions never collide with each other', () => {
    // Each doc is measured against its own frame; two comps do not share pixels.
    const s = {
      ...scene([live('guest-1', 100, 100)]),
      compositions: [
        {
          id: 'c1',
          name: 'inner',
          resolution: { width: 1920, height: 1080 },
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
              children: [live('guest-2', 100, 100)],
            },
          ],
        },
      ],
    } as unknown as Scene;
    expect(codes(s)).toEqual([]);
  });

  it('the ALIASED active composition is not counted twice', () => {
    // `editSceneOf` projects the open composition's layers into `scene.layers` while
    // leaving that same composition in `scene.compositions` — the shape `useIssues`
    // actually receives. Without deduping, every issue is reported twice and every
    // overlapping PAIR four times. Found by the E2E, which is why it is pinned here.
    const holes = [live('guest-1', 5000, 100), live('guest-2', 20, 20), live('guest-3', 40, 40)];
    const layers = [
      {
        id: 'L1',
        name: 'main',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: holes,
      },
    ];
    const aliased = {
      ...scene(holes),
      layers,
      compositions: [
        {
          id: 'c1',
          name: 'comp1',
          resolution: { width: 1920, height: 1080 },
          frameRate: 50,
          frameRange: { in: 0, out: 50 },
          editorBackdrop: 'transparent',
          layers, // the SAME array the projection put on `scene.layers`
        },
      ],
    } as unknown as Scene;
    const issues = liveSourceIssues(aliased);
    expect(issues.filter((i) => i.code === 'live-source-off-frame')).toHaveLength(1);
    expect(issues.filter((i) => i.code === 'live-source-overlap')).toHaveLength(2);
  });

  it('MULTIPLE independent Live Sources are fine when they do not overlap', () => {
    const s = scene([live('guest-1', 100, 100), live('guest-2', 900, 100)]);
    expect(liveSourceIssues(s)).toEqual([]);
  });
});

describe('D-137 — a device-shaped id is refused at preflight, naming the element', () => {
  it.each(['DECKLINK DEVICE 3', 'route://1-1', 'C:\\media\\guest.mp4'])(
    'refuses the source id %j',
    (routeKey) => {
      const issues = liveSourceIssues(scene([live('guest-1', 10, 10, { routeKey })]));
      const issue = issues.find((i) => i.code === 'live-source-device-id');
      expect(issue?.elementId).toBe('guest-1');
      // The message has to say where the mapping DOES belong — an author who typed a
      // device name meant something, and "invalid" alone teaches them nothing.
      expect(issue?.message).toMatch(/CG Control/);
    },
  );

  it('refuses a device-shaped KEY id as well', () => {
    const s = scene([live('guest-1', 10, 10, { keySourceId: 'DECKLINK DEVICE 4' })]);
    expect(codes(s)).toContain('live-source-device-id');
  });
});

describe('D-137 — the binding rule', () => {
  // `B-183` — the factory hands over no source; this rule is about a BOUND plate, so the
  // source is stated here rather than inherited from a default that no longer exists.
  const el = { ...defaultLiveSource('el-1', 0, 0), routeKey: 'guest-1' };
  const field = { id: 'f1', label: 'Guest', type: 'text' } as never;

  it('a text field on a Live Source resolves to the FILL role', () => {
    expect(resolveBinding(field, el)).toEqual({
      fieldId: 'f1',
      target: { kind: 'live-source-id', elementId: 'el-1', role: 'fill' },
    });
  });

  it('the binding summary names the ROLE — fill and key must not read alike', () => {
    expect(
      describeBinding({
        fieldId: 'f1',
        target: { kind: 'live-source-id', elementId: 'el-1', role: 'key' },
      }),
    ).toContain('key');
  });
});

/**
 * ⭐ **`B-183` — THIS BLOCK'S CONTRACT WAS DELIBERATELY INVERTED, and the inversion is the
 * feature.**
 *
 * It used to assert `routeKey === 'live-1'` and that *"a fresh element must not itself be a
 * preflight error"*. Both are now false ON PURPOSE:
 *
 * - a new plate is **UNASSIGNED** — `live-N` was the `+ Source` input's PLACEHOLDER TEXT, a
 *   suggestion the author had not accepted, and nothing declared it;
 * - so a fresh plate **IS** exactly one error, `live-source-unset`, which is the whole
 *   point: the owner's principle is **nothing lands unconfirmed**, and the refusal is how the
 *   author is told there is a choice to make.
 *
 * ⚠ The old second assertion is not merely relaxed to "no error of the old kind" — that would
 * pass against a plate silently defaulted to the first declared source, which is the
 * alternative the owner REJECTED. It is replaced by an exact-match on the new code, so a
 * regression to any silent default reddens here.
 */
describe('B-183 — the default factory hands over NO source', () => {
  it('omits routeKey entirely, and keeps the aspect self-consistent', () => {
    const el = defaultLiveSource('el-9', 40, 60);
    expect(el.type).toBe('video-placeholder');
    expect(el.routeKey).toBeUndefined();
    // Self-consistent out of the box: a 16:9 box declaring a 16:9 source.
    expect(el.expectedAspect).toBeCloseTo(el.transform.size.w / el.transform.size.h, 6);
  });

  it('is refused as UNASSIGNED — one issue, naming the plate and the control', () => {
    const el = defaultLiveSource('el-9', 40, 60);
    const issues = liveSourceIssues(scene([el as unknown as Element]));
    expect(issues.map((i) => i.code)).toEqual(['live-source-unset']);
    const only = issues[0];
    expect(only?.severity).toBe('error');
    expect(only?.elementId).toBe('el-9');
    // 🔴 The message must NOT be the device-id refusal, which is what an unguarded
    // `safeParse(undefined)` produced — it named a value the author never typed.
    expect(only?.message).not.toContain('not symbolic');
    expect(only?.message).not.toContain('undefined');
    // B3 — it names the state AND the remedy: with no look group, the free-text row.
    expect(only?.message).toContain('has no source');
    expect(only?.message).toContain('"source id" box');
  });
});

/**
 * ⭐ Task 1.5g — **NEITHER STROKE NOR SHADOW ENTERS THE HOLE RECT**, so neither
 * touches 1.8's OVERLAP check.
 *
 * This is the pinning task that makes the frame (1.5e) safe to ship BEFORE the punch
 * (1.5c) exists: it fixes the contract the punch will later have to respect. The
 * property is one sentence — **the overlap check reads the DECLARED rect and must
 * keep reading only that** — and the tests below are the three ways it could break.
 *
 * ⚠ **On "shadow".** §9a.1 names stroke AND shadow, but `video-placeholder` carries
 * no `shadow` field today (1.5e's scope is colour + width; the schema was checked at
 * HEAD). The guarantee asserted here is the one that covers both and does not need
 * the field to exist: `frameAabb` composes `transform` alone, so NO paint property is
 * an input to the geometry. A shadow lands inside that guarantee the day it is added
 * — and the last test below is what will fail if someone ever routes a paint
 * property into the rect.
 *
 * Maps `specs/designer-live-source/spec.md`:
 *   - "A Live Source may carry a FRAME, and the frame never enters the hole"
 */
describe('1.5g — the frame is not geometry: overlapping FRAMES is not a fault', () => {
  const FRAME = { width: 40, color: '#ff8800' };

  it('two plates whose FRAMES overlap but whose HOLES do not: NO issue', () => {
    // 640 wide at x=0 ends at 640; the next starts at x=660 — a 20px gap between the
    // holes, which two 40px frames close and then some (each frame reaches 40px out,
    // so they overlap by 60px). Under a border-box reading — or any check that added
    // the stroke to the rect — this is a collision. It is not one.
    const issues = liveSourceIssues(
      scene([live('guest-1', 0, 0, { stroke: FRAME }), live('guest-2', 660, 0, { stroke: FRAME })]),
    );
    expect(issues.filter((i) => i.code === 'live-source-overlap')).toEqual([]);
  });

  it('two plates whose HOLES overlap IS a fault — frames or no frames', () => {
    // The other half, and the reason the test above is not just "nothing is ever a
    // fault": the real collision is still reported, against both elements.
    const issues = liveSourceIssues(
      scene([
        live('guest-1', 100, 100, { stroke: FRAME }),
        live('guest-2', 300, 200, { stroke: FRAME }),
      ]),
    );
    expect(
      issues
        .filter((i) => i.code === 'live-source-overlap')
        .map((i) => i.elementId)
        .sort(),
    ).toEqual(['guest-1', 'guest-2']);
  });

  it('a frame of ANY width leaves every preflight verdict byte-identical', () => {
    // The general statement, rather than three sampled widths: the issue list is a
    // pure function of the declared rects, so adding a stroke — of any width, up to
    // one far larger than the plate — cannot change a single verdict, message or
    // element id. This is the assertion a future "helpfully" stroke-aware AABB
    // breaks, and it names the reason in its own failure.
    const layout = (over: Record<string, unknown>): Scene =>
      scene([
        live('guest-1', 0, 0, over), // clear
        live('guest-2', 660, 0, over), // 20px from guest-1's hole
        live('guest-3', 700, 300, over), // overlaps guest-2's hole
      ]);
    const bare = liveSourceIssues(layout({}));
    for (const width of [0, 1, 40, 5000]) {
      expect(liveSourceIssues(layout({ stroke: { width, color: '#ffffff' } }))).toEqual(bare);
    }
    // …and the baseline is not vacuous: guest-2 and guest-3 really do collide.
    expect(bare.filter((i) => i.code === 'live-source-overlap')).toHaveLength(2);
  });

  it('an off-frame verdict is the frame\u2019s business either: a frame cannot push a plate off', () => {
    // 640 wide at x=1280 ends exactly at the 1920 edge — on frame. A 40px frame
    // reaches to 1960, past the edge, and that is FINE: the template may paint
    // outside the frame boundary like any other element, and the plate's CONTRACT
    // (the hole) is still fully on frame.
    const el = live('guest-1', 1280, 0, { stroke: { width: 40, color: '#ffffff' } });
    expect(codes(scene([el]))).toEqual([]);
  });
});
