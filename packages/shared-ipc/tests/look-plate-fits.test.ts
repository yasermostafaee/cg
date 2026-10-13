import { describe, expect, it } from 'vitest';
import {
  TemplateLiveSourcesSchema,
  lookPlateFits,
  lookPlateRects,
  type LiveSourceRect,
  type TemplateLiveSources,
} from '../src/index.js';

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
      },
      {
        id: 'solo',
        name: 'solo',
        entered: { mode: 'cut' },
        rects: { 'guest-1': OTHER },
        fits: { 'guest-1': 'cover' },
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
      { elementId: 'el-1', sourceId: 'guest-1', rect: RECT, dynamic: false, fitMode: 'cover' },
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
