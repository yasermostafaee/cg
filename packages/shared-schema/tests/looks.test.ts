import { describe, expect, it } from 'vitest';
import {
  CUT_LOOK_TRANSITION,
  LookGroupSchema,
  LookTransitionSchema,
  defaultLookOf,
  lookContaining,
  lookGroupOf,
  type LookGroup,
} from '../src/looks.js';
import { SceneSchema } from '../src/scene.js';

/**
 * `multibox-layout-switch` §14 (LOOKS) phase 1 — the GROUP schema: looks referencing
 * instances, cut-only v1, and the refinements that make the illegal states unparseable rather
 * than detectable.
 *
 * 🔴 `B-188` — the group no longer DECLARES sources; the list is derived from the plates
 * (`deriveLookSources`, covered in `look-sources.test.ts`).
 */

const look = (id: string, instanceId: string) => ({ id, name: id, instanceId });

const group = (over: Record<string, unknown> = {}): unknown => ({
  id: 'g1',
  looks: [look('look-a', 'inst-a'), look('look-b', 'inst-b')],
  defaultLookId: 'look-a',
  ...over,
});

describe('LookGroupSchema — the multi-frame group', () => {
  it('parses a valid group, applying the defaults (entered cut)', () => {
    const parsed = LookGroupSchema.parse(group());
    expect(parsed.looks[0]?.entered).toEqual(CUT_LOOK_TRANSITION);
  });

  it('🔴 `B-188` — a stored group carrying the OLD `sources` array still parses, and the array is STRIPPED', () => {
    const parsed = LookGroupSchema.parse(
      group({ sources: [{ routeKey: 'guest-1', dynamic: false }, { routeKey: 'guest-1' }] }),
    );
    // Not merely tolerated — GONE. A key that survives parsing is a key some later reader
    // finds and believes, which is how the second copy of a fact comes back.
    expect('sources' in parsed).toBe(false);
    // And the duplicate that used to be a REFUSAL is now simply not a question the schema asks.
    expect(parsed.looks).toHaveLength(2);
  });

  it('a duplicated look id is refused', () => {
    const r = LookGroupSchema.safeParse(
      group({ looks: [look('look-a', 'inst-a'), look('look-a', 'inst-b')] }),
    );
    expect(r.success).toBe(false);
  });

  it('one instance claimed by two looks is refused — a look IS its instance', () => {
    const r = LookGroupSchema.safeParse(
      group({ looks: [look('look-a', 'inst-a'), look('look-b', 'inst-a')] }),
    );
    expect(r.success).toBe(false);
  });

  it('🔴 a group with looks but NO default is refused — "what does take show?" may not be an accident of array order', () => {
    const r = LookGroupSchema.safeParse(group({ defaultLookId: undefined }));
    expect(r.success).toBe(false);
  });

  it('a default naming no look is refused; an EMPTY group needs no default', () => {
    expect(LookGroupSchema.safeParse(group({ defaultLookId: 'look-zz' })).success).toBe(false);
    expect(LookGroupSchema.safeParse(group({ looks: [], defaultLookId: undefined })).success).toBe(
      true,
    );
  });
});

describe('LookTransitionSchema — cut-only v1 (D2 parked, §14.4)', () => {
  it('cut parses; fade and move are UNREPRESENTABLE, not merely unused', () => {
    expect(LookTransitionSchema.safeParse({ mode: 'cut' }).success).toBe(true);
    expect(LookTransitionSchema.safeParse({ mode: 'fade', durationMs: 400 }).success).toBe(false);
    expect(LookTransitionSchema.safeParse({ mode: 'move' }).success).toBe(false);
  });

  it('a stale duration on a cut is NORMALISED AWAY, never a parse error — refusing a whole template over a field nothing reads would take a working graphic off air', () => {
    const parsed = LookTransitionSchema.parse({ mode: 'cut', durationMs: 400 });
    expect(parsed).toEqual({ mode: 'cut' });
  });
});

describe('the scene carries lookGroups (both homes) and the helpers resolve them', () => {
  const MINIMAL_SCENE = {
    schemaVersion: 1,
    id: 'scene-1',
    name: 's',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    editorBackdrop: 'transparent',
    layers: [],
    fonts: [],
    fields: [],
    bindings: [],
    metadata: { createdAt: '2026-08-19T00:00:00.000Z', updatedAt: '2026-08-19T00:00:00.000Z' },
  };

  it('SceneSchema accepts lookGroups and a scene without them validates unchanged', () => {
    expect(SceneSchema.safeParse(MINIMAL_SCENE).success).toBe(true);
    const withLooks = { ...MINIMAL_SCENE, lookGroups: [group()] };
    const parsed = SceneSchema.parse(withLooks);
    expect(parsed.lookGroups?.[0]?.looks).toHaveLength(2);
  });

  it('lookGroupOf returns THE v1 group; defaultLookOf resolves the named default', () => {
    const g = LookGroupSchema.parse(group());
    expect(lookGroupOf({ lookGroups: [g] })?.id).toBe('g1');
    expect(lookGroupOf({})).toBeUndefined();
    expect(defaultLookOf(g)?.id).toBe('look-a');
  });

  it('lookContaining answers by ANCESTOR ids — a root-level element belongs to no look', () => {
    const g: LookGroup = LookGroupSchema.parse(group());
    expect(lookContaining(g, ['L1', 'inst-b'])?.id).toBe('look-b');
    expect(lookContaining(g, ['L1'])).toBeUndefined();
  });
});
