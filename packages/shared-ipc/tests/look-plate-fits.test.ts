import { describe, expect, it } from 'vitest';
import {
  TemplateLiveSourcesSchema,
  framePlacementRects,
  linkedMaskPlacements,
  lookAllowsOperatorAutoLayout,
  lookOperatorFrames,
  lookOperatorMasks,
  lookPlateFocuses,
  lookPlateFits,
  lookPlateMasks,
  lookPlateReveals,
  lookPlateRects,
  type LiveSourceRect,
  type TemplateLiveSources,
} from '../src/index.js';
import type { LiveMaskPlacement } from '@cg/shared-schema';

/**
 * ⭐ **`B-178` — `lookPlateFits`, the per-look answer to "how is this picture fitted".**
 *
 * `C-028` read the mode off the DECLARATION, and the field it read (`LookSource.fitMode`) had no
 * writer anywhere in the product — so every plate of every look-group template reached air on the
 * `contain` default however the author had set it. The owner put two plates side by side, one
 * `contain` and one `cover`, and both rendered `contain`.
 *
 * 🔴 This function is a deliberate SIBLING of {@link lookPlateRects} rather than a branch at each
 * call site, because that function's own header forbids a local spelling: *"a FUNCTION OF THE
 * CARRIER, not a method on any runtime, so the bridge cannot drift from the console: both call
 * this."* The mode has the same two carriers and the same fallback, so it gets the same treatment.
 */

const RECT: LiveSourceRect = { x: 0, y: 0, width: 480, height: 270 };
const OTHER: LiveSourceRect = { x: 480, y: 0, width: 480, height: 270 };

/** A carrier WITH a look group: two looks, one of which fits `guest-1` differently. */
function withLooks(): TemplateLiveSources {
  return {
    resolution: { width: 1920, height: 1080 },
    defaultPosition: { anchor: 'center', offset: { x: 0, y: 0 } },
    sources: [
      { elementId: 'el-1', sourceId: 'guest-1', rect: RECT, dynamic: false },
      { elementId: 'el-2', sourceId: 'guest-2', rect: OTHER, dynamic: false },
    ],
    looks: [
      {
        id: 'grid',
        name: 'grid',
        entered: { mode: 'cut' },
        rects: { 'guest-1': RECT, 'guest-2': OTHER },
        fits: { 'guest-1': 'contain', 'guest-2': 'cover' },
        focuses: { 'guest-1': { x: 0.2, y: 0.8 }, 'guest-2': { x: 0.5, y: 0.5 } },
        reveals: {
          'guest-2': {
            targetSourceId: 'guest-1',
            rect: { x: 0.05, y: 0.7, width: 0.9, height: 0.25 },
          },
        },
      },
      {
        id: 'solo',
        name: 'solo',
        entered: { mode: 'cut' },
        rects: { 'guest-1': OTHER },
        fits: { 'guest-1': 'cover' },
        focuses: { 'guest-1': { x: 0.8, y: 0.2 } },
      },
      // A look that authored NOTHING — the third state, and it must stay empty.
      { id: 'bare', name: 'bare', entered: { mode: 'cut' }, rects: { 'guest-1': RECT } },
    ],
    defaultLookId: 'grid',
  } as unknown as TemplateLiveSources;
}

/** A carrier with NO look group — the pre-LOOKS shape, where the mode is on the declaration. */
function withoutLooks(): TemplateLiveSources {
  return {
    resolution: { width: 1920, height: 1080 },
    defaultPosition: { anchor: 'center', offset: { x: 0, y: 0 } },
    sources: [
      {
        elementId: 'el-1',
        sourceId: 'guest-1',
        rect: RECT,
        dynamic: false,
        fitMode: 'cover',
        cropFocus: { x: 0.3, y: 0.7 },
        revealMask: {
          targetSourceId: 'guest-2',
          rect: { x: 0.1, y: 0.6, width: 0.8, height: 0.3 },
        },
      },
      { elementId: 'el-2', sourceId: 'guest-2', rect: OTHER, dynamic: false },
    ],
  } as unknown as TemplateLiveSources;
}

describe('B-178 — lookPlateFits resolves the AUTHOR’s mode for the active look', () => {
  it('🔴 TWO plates in one look can be fitted DIFFERENTLY', () => {
    // The assertion the shipped code could not satisfy at all: one map, two answers.
    expect(lookPlateFits(withLooks(), 'grid')).toEqual({
      'guest-1': 'contain',
      'guest-2': 'cover',
    });
  });

  it('🔴 ONE source can be fitted differently in TWO looks — why it is not per-source', () => {
    expect(lookPlateFits(withLooks(), 'grid')['guest-1']).toBe('contain');
    expect(lookPlateFits(withLooks(), 'solo')['guest-1']).toBe('cover');
  });

  it('answers for the DEFAULT look when no id is given, exactly as the rects do', () => {
    // Pinned against its sibling rather than against a literal, so the two cannot come to
    // disagree about which look "no id" means.
    expect(lookPlateFits(withLooks(), undefined)).toEqual({
      'guest-1': 'contain',
      'guest-2': 'cover',
    });
    expect(Object.keys(lookPlateRects(withLooks(), undefined))).toEqual(
      Object.keys(lookPlateFits(withLooks(), undefined)),
    );
  });

  it('🔴 a look that authored NOTHING yields an EMPTY map, never a defaulted `contain`', () => {
    // The third state. `contain` here would erase the distinction between "nobody said" and
    // "the author chose contain" for every reader at once — which is the state that made this
    // bug take a plant walk to diagnose.
    expect(lookPlateFits(withLooks(), 'bare')).toEqual({});
    expect('guest-1' in lookPlateFits(withLooks(), 'bare')).toBe(false);
  });

  it('a look with no `fits` key at all is empty too — a package built before B-178', () => {
    const live = withLooks();
    const looks = (live as unknown as { looks: { id: string; fits?: unknown }[] }).looks;
    const bare = looks.find((l) => l.id === 'bare');
    expect(bare?.fits, 'the fixture really omits the key').toBeUndefined();
    expect(lookPlateFits(live, 'bare')).toEqual({});
  });

  it('a STALE look id falls back to the AUTHORED DEFAULT, exactly as the rects do', () => {
    /*
      `activeLookOf`'s documented chain: a recorded id that names nothing is STALE (the template
      was re-imported with different looks) and resolves to the authored default — "not to array
      order, because that is what a fresh take enters and what the operator expects to see".
      Asserted against the SIBLING rather than against a literal, so the mode and the rect can
      never come to disagree about which look a stale id means.
    */
    expect(lookPlateFits(withLooks(), 'no-such-look')).toEqual(lookPlateFits(withLooks(), 'grid'));
    expect(Object.keys(lookPlateRects(withLooks(), 'no-such-look'))).toEqual(
      Object.keys(lookPlateFits(withLooks(), 'no-such-look')),
    );
  });

  describe('a carrier with NO look group — the pre-LOOKS path, unchanged', () => {
    it('falls through to each declaration’s own fitMode', () => {
      expect(lookPlateFits(withoutLooks(), undefined)).toEqual({ 'guest-1': 'cover' });
    });

    it('🔴 a declaration that states nothing gets NO entry, not a defaulted one', () => {
      expect('guest-2' in lookPlateFits(withoutLooks(), undefined)).toBe(false);
    });

    it('ignores an active look id it has no looks for', () => {
      expect(lookPlateFits(withoutLooks(), 'grid')).toEqual({ 'guest-1': 'cover' });
    });
  });

  it('returns a COPY — a caller mutating the answer cannot edit the carrier', () => {
    const live = withLooks();
    const fits = lookPlateFits(live, 'grid');
    fits['guest-1'] = 'cover';
    expect(lookPlateFits(live, 'grid')['guest-1']).toBe('contain');
  });
});

it('resolves the operator frame by active Look or the standalone declaration', () => {
  const target = { frameKey: 'inst/plate', artworkKey: 'inst', resize: 'proportional' } as const;
  const live = withLooks();
  const firstLook = live.looks?.[0];
  const firstSource = live.sources[0];
  if (firstLook === undefined || firstSource === undefined) throw new Error('missing fixture');
  firstLook.operatorFrames = { 'guest-1': target };
  firstSource.operatorFrame = target;

  const parsed = TemplateLiveSourcesSchema.parse(live);
  expect(lookOperatorFrames(parsed, 'grid')).toEqual({ 'guest-1': target });
  expect(lookOperatorFrames(parsed, undefined)).toEqual({ 'guest-1': target });
  const authored = lookPlateRects(parsed, 'grid')['guest-1'];
  if (authored === undefined) throw new Error('missing authored plate');
  const moved = { ...authored, x: authored.x + 100 };
  const placements = [{ frameKey: target.frameKey, lookId: 'grid', rect: moved }];
  expect(framePlacementRects(parsed, undefined, placements)['guest-1']).toEqual(moved);
  expect(framePlacementRects(parsed, 'missing-look', placements)['guest-1']).toEqual(moved);
  expect(framePlacementRects(parsed, 'solo', placements)).toEqual(lookPlateRects(parsed, 'solo'));
  expect(lookOperatorFrames(parsed, 'solo')).toEqual({});
  expect(lookOperatorFrames({ ...parsed, looks: undefined }, undefined)).toEqual({
    'guest-1': target,
  });
  expect(lookOperatorFrames(withoutLooks(), undefined)).toEqual({});
});

it('accepts an explicit Auto Layout authorization and preserves omission on older carriers', () => {
  const legacy = withLooks();
  expect(TemplateLiveSourcesSchema.parse(legacy)).not.toHaveProperty('allowOperatorAutoLayout');
  expect(
    TemplateLiveSourcesSchema.parse({ ...legacy, allowOperatorAutoLayout: true }),
  ).toMatchObject({ allowOperatorAutoLayout: true });
  expect(
    TemplateLiveSourcesSchema.safeParse({ ...legacy, allowOperatorAutoLayout: false }).success,
  ).toBe(false);
});

it('resolves Auto layout by the active or default preset before using the legacy grant', () => {
  const legacy = { ...withLooks(), allowOperatorAutoLayout: true } as const;
  expect(lookAllowsOperatorAutoLayout(legacy, 'grid')).toBe(true);
  expect(lookAllowsOperatorAutoLayout(withoutLooks(), undefined)).toBe(false);

  const live = TemplateLiveSourcesSchema.parse({
    ...legacy,
    looks: legacy.looks?.map((look) => ({
      ...look,
      ...(look.id === 'grid' && { allowOperatorAutoLayout: false }),
      ...(look.id === 'solo' && { allowOperatorAutoLayout: true }),
    })),
  });
  expect(live.looks?.map((look) => look.allowOperatorAutoLayout)).toEqual([false, true, undefined]);
  expect(lookAllowsOperatorAutoLayout(live, 'grid')).toBe(false);
  expect(lookAllowsOperatorAutoLayout(live, 'solo')).toBe(true);
  expect(lookAllowsOperatorAutoLayout(live, 'bare')).toBe(true);
  expect(lookAllowsOperatorAutoLayout(live, undefined)).toBe(false);
  expect(lookAllowsOperatorAutoLayout(live, 'stale-id')).toBe(false);
});

it('moves only the authorized mask window in its own Look and preserves authored defaults', () => {
  const live = withLooks();
  const grid = live.looks?.[0];
  const solo = live.looks?.[1];
  if (grid === undefined || solo === undefined) throw new Error('missing Look fixture');
  const authored = { x: 0.125, y: 0.25, width: 0.25, height: 0.25 };
  const sibling = { ...authored, x: 0.5 };
  const rect = { ...authored, x: 0.25, width: 0.125 };
  const mask = { mode: 'outside', rects: [authored, sibling] } as const;
  grid.masks = { 'guest-1': { ...mask, rects: [...mask.rects] } };
  solo.masks = grid.masks;
  grid.operatorMaskEdits = ['guest-1'];
  const parsed = TemplateLiveSourcesSchema.parse(live);
  const edit = {
    lookId: 'grid',
    plateId: 'guest-1',
    kind: 'mask',
    index: 0,
    authored,
    rect,
  } satisfies LiveMaskPlacement;
  expect(lookOperatorMasks(parsed, 'grid')).toEqual(new Set(['guest-1']));
  expect(lookOperatorMasks(parsed, 'solo').size).toBe(0);
  expect(lookPlateMasks(parsed, undefined, [edit])['guest-1']).toEqual({
    mode: 'outside',
    rects: [rect, sibling],
  });
  expect(lookPlateMasks(parsed, 'grid')['guest-1']).toEqual(mask);
  expect(lookPlateMasks(parsed, 'grid', [{ ...edit, index: 1 }])['guest-1']).toEqual(mask);
  expect(lookPlateMasks(parsed, 'solo', [{ ...edit, lookId: 'solo' }])['guest-1']).toEqual(mask);
  expect(linkedMaskPlacements(parsed, edit)).toEqual([edit]);
});

it('links an own mask by authored plate, mode and window while retaining per-preset coordinates', () => {
  const live = withLooks();
  const grid = live.looks?.[0];
  const solo = live.looks?.[1];
  if (grid === undefined || solo === undefined) throw new Error('missing Look fixture');
  const authored = { x: 0.125, y: 0.25, width: 0.25, height: 0.25 };
  const sibling = { ...authored, x: 0.5 };
  const rect = { ...authored, x: 0.25, width: 0.125 };
  const mask = { mode: 'inside', rects: [authored, sibling] } as const;
  const plateId = 'guest-1';
  grid.masks = { [plateId]: { ...mask, rects: [...mask.rects] } };
  grid.maskElementIds = { [plateId]: 'authored-plate' };
  grid.operatorMaskEdits = [plateId];
  const peer = { ...grid, id: 'peer', rects: solo.rects };
  const parsed = TemplateLiveSourcesSchema.parse({
    ...live,
    looks: [
      grid,
      peer,
      { ...peer, id: 'unrelated', maskElementIds: { [plateId]: 'independent-plate' } },
      { ...peer, id: 'read-only', operatorMaskEdits: [] },
      { ...peer, id: 'absent', rects: {} },
      { ...peer, id: 'collapsed', rects: { [plateId]: { ...RECT, width: 0 } } },
      { ...peer, id: 'revert', masks: { [plateId]: { ...mask, mode: 'outside' } } },
      {
        ...peer,
        id: 'different-window-order',
        masks: { [plateId]: { ...mask, rects: [sibling, authored] } },
      },
      { ...peer, id: 'legacy', maskElementIds: undefined },
      peer,
    ],
  });
  const edit = {
    lookId: 'grid',
    plateId,
    kind: 'mask',
    index: 0,
    authored,
    rect,
  } satisfies LiveMaskPlacement;
  const edits = linkedMaskPlacements(parsed, edit);
  expect(edits).toEqual([edit, { ...edit, lookId: 'peer' }]);
  expect(lookPlateRects(parsed, 'grid')[plateId]).toEqual(RECT);
  expect(lookPlateRects(parsed, 'peer')[plateId]).toEqual(OTHER);
  for (const lookId of ['grid', 'peer']) {
    expect(lookPlateMasks(parsed, lookId, edits)[plateId]?.rects).toEqual([rect, sibling]);
  }
  expect(lookPlateMasks(parsed, 'unrelated', edits)[plateId]).toEqual(mask);
  for (const seed of [
    { ...edit, lookId: 'legacy' },
    { ...edit, lookId: 'read-only' },
    { ...edit, lookId: 'stale-id' },
    { ...edit, lookId: undefined },
    { ...edit, authored: sibling },
    { ...edit, kind: 'reveal' as const },
  ]) {
    expect(linkedMaskPlacements(parsed, seed)).toEqual([seed]);
  }
});

it('edits a standalone linked reveal without changing its lower input or siblings', () => {
  const live = withoutLooks();
  const plate = live.sources[0];
  const reveal = plate?.revealMask;
  if (plate === undefined || reveal === undefined) throw new Error('missing reveal fixture');
  const sibling = { x: 0.25, y: 0.25, width: 0.25, height: 0.25 };
  plate.revealMask = { ...reveal, additionalRects: [sibling] };
  const rect = { ...reveal.rect, x: 0.125, width: 0.5 };
  const edit = {
    plateId: plate.sourceId,
    kind: 'reveal',
    index: 0,
    authored: reveal.rect,
    rect,
  } satisfies LiveMaskPlacement;
  expect(lookPlateReveals(live, undefined, [edit])[plate.sourceId]).toEqual(plate.revealMask);
  plate.operatorMaskEdit = true;
  expect(lookPlateReveals(live, undefined, [edit])[plate.sourceId]).toEqual({
    ...plate.revealMask,
    rect,
  });
});

describe('D-178 — lookPlateFocuses resolves focus through both carrier shapes', () => {
  it('uses the active look and can differ for one source between looks', () => {
    expect(lookPlateFocuses(withLooks(), 'grid')['guest-1']).toEqual({ x: 0.2, y: 0.8 });
    expect(lookPlateFocuses(withLooks(), 'solo')['guest-1']).toEqual({ x: 0.8, y: 0.2 });
  });

  it('falls back to declaration focus without looks and preserves absence', () => {
    expect(lookPlateFocuses(withoutLooks(), undefined)).toEqual({
      'guest-1': { x: 0.3, y: 0.7 },
    });
  });

  it('survives the wire schema and an older look may omit it', () => {
    const parsed = TemplateLiveSourcesSchema.parse(withLooks());
    expect(lookPlateFocuses(parsed, 'grid')['guest-1']).toEqual({ x: 0.2, y: 0.8 });
    expect(lookPlateFocuses(parsed, 'bare')).toEqual({});
  });
});

describe('D-202 — lookPlateReveals resolves explicit overlap through both carrier shapes', () => {
  it('uses only the active look relation and survives the wire schema', () => {
    const parsed = TemplateLiveSourcesSchema.parse(withLooks());
    expect(lookPlateReveals(parsed, 'grid')).toEqual({
      'guest-2': {
        targetSourceId: 'guest-1',
        rect: { x: 0.05, y: 0.7, width: 0.9, height: 0.25 },
      },
    });
    expect(lookPlateReveals(parsed, 'solo')).toEqual({});
  });

  it('falls back to the groupless declaration', () => {
    expect(lookPlateReveals(withoutLooks(), undefined)).toEqual({
      'guest-1': {
        targetSourceId: 'guest-2',
        rect: { x: 0.1, y: 0.6, width: 0.8, height: 0.3 },
      },
    });
  });
});

/**
 * 🔴 **THE ZOD ROUND-TRIP — the exact road the bug came down.**
 *
 * `B-178` was not a logic error; it was a field that never arrived. Zod STRIPS unknown keys, so a
 * carrier field that is emitted but not declared on the schema is dropped **silently** at the IPC
 * boundary and again at the bridge's boot parse — the collector would look right, the tests around
 * it would pass, and the wire would carry nothing. This block exists so that road is closed by a
 * test rather than by having remembered.
 */
describe('B-178 — `fits` survives the wire schema', () => {
  it('🔴 a look`s fits map SURVIVES a parse — it is not stripped as an unknown key', () => {
    const parsed = TemplateLiveSourcesSchema.parse(withLooks());
    const grid = parsed.looks?.find((l) => l.id === 'grid');
    expect(grid?.fits).toEqual({ 'guest-1': 'contain', 'guest-2': 'cover' });
  });

  it('a look with NO fits still parses — a package built before B-178 must not be refused', () => {
    // Optional on purpose: making it required would refuse every pre-B-178 record at the IPC
    // boundary and again at boot, taking a working installation off air over an absent field.
    const parsed = TemplateLiveSourcesSchema.parse(withLooks());
    expect(parsed.looks?.find((l) => l.id === 'bare')?.fits).toBeUndefined();
    expect(lookPlateFits(parsed, 'bare')).toEqual({});
  });

  it('an ILLEGAL mode is refused rather than carried', () => {
    const bad = withLooks() as unknown as { looks: { id: string; fits?: unknown }[] };
    const grid = bad.looks.find((l) => l.id === 'grid');
    if (grid !== undefined) grid.fits = { 'guest-1': 'stretch' };
    expect(TemplateLiveSourcesSchema.safeParse(bad).success).toBe(false);
  });

  it('🔴 the round-trip preserves the per-look ANSWER, not merely the shape', () => {
    // The end-to-end claim: what the collector emitted is what a consumer resolves after the
    // record has crossed the boundary. Asserted through `lookPlateFits` because that is the
    // function the bridge actually calls.
    const parsed = TemplateLiveSourcesSchema.parse(withLooks());
    expect(lookPlateFits(parsed, 'grid')).toEqual({ 'guest-1': 'contain', 'guest-2': 'cover' });
    expect(lookPlateFits(parsed, 'solo')).toEqual({ 'guest-1': 'cover' });
  });
});
