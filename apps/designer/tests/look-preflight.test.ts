import { describe, expect, it } from 'vitest';
import type { Element, Scene } from '@cg/shared-schema';
import { liveSourceIssues } from '../src/renderer/state/live-source-preflight.js';
import { editSceneOf } from '../src/renderer/state/scene-doc.js';

/**
 * `multibox-layout-switch` §14 (LOOKS) phase 1, session BA — **THE LOOKS REFUSAL FAMILY.**
 *
 * B.1 an undeclared reference, B.2 the same source twice in ONE look's visible set,
 * B.3 the visible-set overlap pass (root plate vs the active look's plates) and the v1
 * single-group refusal, B.4 the stamped-scope refusal reaching inside a look.
 *
 * ⭐ The cases that must be ACCEPTED matter as much as the refusals: the same source in
 * DIFFERENT looks is the identity mechanism, and the same screen area in different looks
 * is the normal case — each has a positive test below.
 */

const baseElProps = { opacity: 1, visible: true, locked: false, zIndex: 0 };

const tf = (x: number, y: number, w: number, h: number) => ({
  position: { x, y },
  size: { w, h },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
});

const plate = (id: string, routeKey: string, x = 0, y = 0, w = 640, h = 360): Element =>
  ({
    ...baseElProps,
    id,
    name: id,
    type: 'video-placeholder',
    transform: tf(x, y, w, h),
    routeKey,
  }) as unknown as Element;

/** A full-frame LOOK composition holding the given children. */
const lookComp = (id: string, children: Element[]) => ({
  id,
  name: id,
  resolution: { width: 1920, height: 1080 },
  frameRange: { in: 0, out: 50 },
  editorBackdrop: 'transparent',
  layers: [
    {
      id: `${id}-l`,
      name: 'l',
      visible: true,
      locked: false,
      blendMode: 'normal',
      children,
    },
  ],
  fields: [],
  bindings: [],
});

/** A look INSTANCE — full-frame, identity transform, direct child of the scene layer. */
const instance = (id: string, compId: string): Element =>
  ({
    ...baseElProps,
    id,
    name: id,
    type: 'composition',
    compositionId: compId,
    transform: tf(0, 0, 1920, 1080),
  }) as unknown as Element;

const src = (routeKey: string) => ({ routeKey, dynamic: false });
const cut = { mode: 'cut' } as const;
const look = (id: string, instanceId: string) => ({ id, name: id, instanceId, entered: cut });

function scene(options: {
  rootChildren?: Element[];
  compositions?: unknown[];
  lookGroups?: unknown[];
}): Scene {
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
      {
        id: 'L1',
        name: 'main',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: options.rootChildren ?? [],
      },
    ],
    compositions: options.compositions ?? [],
    fonts: [],
    fields: [],
    bindings: [],
    lookGroups: options.lookGroups ?? [],
  } as unknown as Scene;
}

/** Two-look scene: look A (guest-1 left, guest-2 right), look B (guest-1 solo, centred). */
function twoLookScene(over: {
  rootChildren?: Element[];
  lookAChildren?: Element[];
  lookBChildren?: Element[];
  sources?: unknown[];
  lookGroups?: unknown[];
}): Scene {
  return scene({
    rootChildren: [
      instance('inst-a', 'comp-a'),
      instance('inst-b', 'comp-b'),
      ...(over.rootChildren ?? []),
    ],
    compositions: [
      lookComp(
        'comp-a',
        over.lookAChildren ?? [plate('a-1', 'guest-1', 0, 0), plate('a-2', 'guest-2', 960, 0)],
      ),
      lookComp('comp-b', over.lookBChildren ?? [plate('b-1', 'guest-1', 320, 180, 1280, 720)]),
    ],
    lookGroups: over.lookGroups ?? [
      {
        id: 'g1',
        sources: over.sources ?? [src('guest-1'), src('guest-2')],
        looks: [look('look-a', 'inst-a'), look('look-b', 'inst-b')],
        defaultLookId: 'look-a',
      },
    ],
  });
}

const codesOf = (s: Scene): string[] => liveSourceIssues(s).map((i) => i.code);
const byCode = (s: Scene, code: string): ReturnType<typeof liveSourceIssues> =>
  liveSourceIssues(s).filter((i) => i.code === code);

describe('B.1 — a plate referencing an UNDECLARED source is refused, naming it and the declared list', () => {
  it('POSITIVE CONTROL — the well-formed two-look template is clean', () => {
    expect(codesOf(twoLookScene({}))).toEqual([]);
  });

  it('an undeclared reference is an export-blocking error naming source and list', () => {
    const s = twoLookScene({ lookBChildren: [plate('b-1', 'guest-9', 320, 180, 1280, 720)] });
    const issues = byCode(s, 'look-source-undeclared');
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe('error');
    expect(issues[0]?.message).toContain('"guest-9"');
    expect(issues[0]?.message).toContain('"guest-1", "guest-2"');
    expect(issues[0]?.elementId).toBe('b-1');
  });

  it('a ROOT-LEVEL plate outside every look must reference a declared source too', () => {
    const s = twoLookScene({ rootChildren: [plate('root-1', 'presenter', 0, 720, 640, 360)] });
    expect(byCode(s, 'look-source-undeclared')).toHaveLength(1);
  });
});

describe('B.2 — the same source twice in ONE look is refused; across looks it is the identity mechanism', () => {
  it('🔴 twice within one look → error against BOTH plates, and the message teaches the across-looks case', () => {
    const s = twoLookScene({
      lookAChildren: [plate('a-1', 'guest-1', 0, 0), plate('a-dup', 'guest-1', 960, 0)],
    });
    const issues = byCode(s, 'look-source-duplicate');
    expect(issues.map((i) => i.elementId).sort()).toEqual(['a-1', 'a-dup']);
    expect(issues[0]?.message).toContain('DIFFERENT looks is fine');
  });

  it('⭐ the SAME source in TWO looks is ACCEPTED — one seat, held across the switch', () => {
    // guest-1 is in look A AND look B by default in this fixture.
    expect(codesOf(twoLookScene({}))).toEqual([]);
  });

  it('a root-level plate collides with a look plate naming the same source — on screen together', () => {
    const s = twoLookScene({
      rootChildren: [plate('root-1', 'guest-1', 1280, 720, 640, 360)],
    });
    // In BOTH looks' visible sets the root plate meets a guest-1 plate.
    const issues = byCode(s, 'look-source-duplicate');
    expect(issues.length).toBeGreaterThanOrEqual(2);
    expect(issues.some((i) => i.elementId === 'root-1')).toBe(true);
  });
});

describe('B.3 — the visible-set overlap pass, and the v1 single-group refusal', () => {
  it('🔴 a root plate overlapping a plate of the ACTIVE look is refused, naming the look', () => {
    // Root plate sits exactly where look B's solo plate is; look A's plates are elsewhere.
    const s = twoLookScene({
      sources: [src('guest-1'), src('guest-2'), src('presenter')],
      rootChildren: [plate('root-1', 'presenter', 320, 180, 1280, 720)],
    });
    const issues = byCode(s, 'live-source-overlap');
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some((i) => i.message.includes('look "look-b"'))).toBe(true);
    // Reported against BOTH participants (the D-137 rule).
    const ids = new Set(issues.map((i) => i.elementId));
    expect(ids.has('root-1')).toBe(true);
    expect(ids.has('b-1')).toBe(true);
  });

  it('⭐ the same screen area in DIFFERENT looks is ACCEPTED — they are never on air together', () => {
    // Look A's a-1 and look B's b-1 both cover the centre; no error may fire.
    const s = twoLookScene({
      lookAChildren: [plate('a-1', 'guest-1', 320, 180, 1280, 720)],
      lookBChildren: [plate('b-1', 'guest-2', 320, 180, 1280, 720)],
    });
    expect(byCode(s, 'live-source-overlap')).toEqual([]);
  });

  it('a root plate that overlaps NOTHING in either look is clean (positive control)', () => {
    const s = twoLookScene({
      sources: [src('guest-1'), src('guest-2'), src('presenter')],
      lookAChildren: [plate('a-1', 'guest-1', 0, 0), plate('a-2', 'guest-2', 960, 0)],
      lookBChildren: [plate('b-1', 'guest-1', 0, 0, 960, 540)],
      rootChildren: [plate('root-1', 'presenter', 1280, 720, 640, 360)],
    });
    expect(byCode(s, 'live-source-overlap')).toEqual([]);
  });

  it('🔴 a SECOND multi-frame group is refused in v1, in the same family', () => {
    const s = twoLookScene({
      lookGroups: [
        {
          id: 'g1',
          sources: [src('guest-1'), src('guest-2')],
          looks: [look('look-a', 'inst-a')],
          defaultLookId: 'look-a',
        },
        {
          id: 'g2',
          sources: [src('guest-2')],
          looks: [look('look-b', 'inst-b')],
          defaultLookId: 'look-b',
        },
      ],
    });
    const issues = byCode(s, 'look-second-group');
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain('"g2"');
    expect(issues[0]?.message).toContain('exactly ONE');
  });
});

describe('B.4 — a plate inside a stamped scope stays refused, including INSIDE a look', () => {
  it('a sequence inside the composition of a look, carrying a plate, is refused by the existing rule', () => {
    const seq = {
      ...baseElProps,
      id: 'seq-1',
      name: 'seq',
      type: 'sequence',
      transform: tf(0, 0, 960, 540),
      items: [{ kind: 'composition', compositionId: 'comp-stamped' }],
    } as unknown as Element;
    const s = scene({
      rootChildren: [instance('inst-a', 'comp-a')],
      compositions: [
        lookComp('comp-a', [plate('a-1', 'guest-1', 0, 0), seq]),
        lookComp('comp-stamped', [plate('stamped-plate', 'guest-2', 0, 0)]),
      ],
      lookGroups: [
        {
          id: 'g1',
          sources: [src('guest-1'), src('guest-2')],
          looks: [look('look-a', 'inst-a')],
          defaultLookId: 'look-a',
        },
      ],
    });
    const issues = byCode(s, 'live-source-in-stamped-scope');
    expect(issues).toHaveLength(1);
    expect(issues[0]?.elementId).toBe('stamped-plate');
  });
});

describe('the projection — lookGroups reach the working Scene, which is the export path input', () => {
  it('editSceneOf projects the active composition lookGroups exactly as it projects arrangements', () => {
    const s = scene({
      compositions: [
        { ...lookComp('comp-root', []), lookGroups: [{ id: 'g9', sources: [], looks: [] }] },
      ],
    });
    const projected = editSceneOf(s, 'comp-root');
    expect(projected?.lookGroups?.[0]?.id).toBe('g9');
  });
});
