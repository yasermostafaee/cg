import { describe, expect, it } from 'vitest';
import {
  assignmentInForce,
  effectiveOverridesForLook,
  resolvePlateSourcesForLook,
  type SourceAssignments,
} from '../src/index.js';

/**
 * 🔴 **SESSION BQ / `B-157` — the four-level resolution, tested AT ITS OWN HOME.**
 *
 * These functions moved here from the bridge because PVW's overlay could not call a private
 * method on a process it does not run in — so it was handed a plate-keyed name callback with
 * no look in it, and named the template default while air showed the bound source. `B-151`
 * was the same shape one field over, about RECTS, and `lookPlateRects` moved here for exactly
 * this reason one session earlier.
 *
 * The bridge's `live-look-bindings.test.ts` asserts that its resolution AGREES with these,
 * and `apps/runtime`'s `livePlateGeometry.test.ts` asserts the overlay's does. **This file is
 * the one that pins what the answer IS** — the other two pin that nobody has grown a second
 * copy of it.
 */

const assignments = (pairs: Record<string, string>, templateId = 'tpl-1'): SourceAssignments => ({
  assignments: Object.entries(pairs).map(([plateId, sourceId]) => ({
    templateId,
    plateId,
    sourceId,
  })),
});

describe('effectiveOverridesForLook — levels 3 and 4, flattened for ONE look', () => {
  it('returns undefined when neither level has anything to say', () => {
    expect(effectiveOverridesForLook('look-1', undefined, undefined)).toBeUndefined();
  });

  it('a per-look binding applies to THAT look only', () => {
    const bindings = { 'look-1': { 'l-1': 'studio-3' } };
    expect(effectiveOverridesForLook('look-1', bindings, undefined)).toEqual({ 'l-1': 'studio-3' });
    expect(effectiveOverridesForLook('look-2', bindings, undefined)).toBeUndefined();
  });

  it('🔴 the R-048 EMERGENCY outranks a per-look binding — in the look that HAS one…', () => {
    /*
      `R-048` exists because an INPUT IS DEAD, and a dead input is dead in every look. If a
      per-look binding won, switching look would bring the dead feed straight back and the
      operator would have to re-patch, live, once per look, having already been told the
      substitution was applied.
    */
    expect(
      effectiveOverridesForLook('look-1', { 'look-1': { 'l-1': 'studio-3' } }, { 'l-1': 'dead-9' }),
    ).toEqual({ 'l-1': 'dead-9' });
  });

  it('…and in a look that has NONE, where the patch is the only thing in force', () => {
    expect(
      effectiveOverridesForLook('look-2', { 'look-1': { 'l-1': 'studio-3' } }, { 'l-1': 'x' }),
    ).toEqual({ 'l-1': 'x' });
  });

  it('a patch on ONE plate leaves another plate’s per-look binding alone', () => {
    expect(
      effectiveOverridesForLook(
        'look-1',
        { 'look-1': { 'l-1': 'studio-3', 'l-2': 'studio-4' } },
        { 'l-1': 'dead-9' },
      ),
    ).toEqual({ 'l-1': 'dead-9', 'l-2': 'studio-4' });
  });

  it('an UNDEFINED look (a carrier that authors none) still honours the patch', () => {
    expect(
      effectiveOverridesForLook(undefined, { 'look-1': { 'l-1': 'x' } }, { 'l-1': 'y' }),
    ).toEqual({ 'l-1': 'y' });
  });
});

describe('assignmentInForce — level 2, freeze or live', () => {
  it('reads the store, narrowed to THIS template', () => {
    const store: SourceAssignments = {
      assignments: [
        { templateId: 'tpl-1', plateId: 'l-1', sourceId: 'studio-1' },
        { templateId: 'other', plateId: 'l-1', sourceId: 'studio-9' },
      ],
    };
    expect(assignmentInForce('tpl-1', store, undefined)).toEqual({ 'l-1': 'studio-1' });
  });

  it('🔴 a FROZEN snapshot wins over the store — session BP', () => {
    // A row on air resolves what its take captured, so an edit made during a show cannot
    // change a picture that is already up.
    expect(
      assignmentInForce('tpl-1', assignments({ 'l-1': 'studio-9' }), { 'l-1': 'studio-1' }),
    ).toEqual({ 'l-1': 'studio-1' });
  });

  it('🔴 an EMPTY frozen record is a real freeze to nothing, NOT "not frozen"', () => {
    // The test is presence, never emptiness. A row taken with no assignment is pinned to
    // having none, and must not silently pick the store up afterwards.
    expect(assignmentInForce('tpl-1', assignments({ 'l-1': 'studio-9' }), {})).toEqual({});
  });

  it('the frozen map is COMPLETE: a plate absent from it does NOT fall through', () => {
    // A partial freeze would leave "…except for plates that had no assignment" as a caveat,
    // and would reopen the multi-station case for exactly those plates.
    expect(
      assignmentInForce('tpl-1', assignments({ 'l-1': 'studio-9', 'l-2': 'studio-2' }), {
        'l-1': 'studio-1',
      }),
    ).toEqual({ 'l-1': 'studio-1' });
  });
});

describe('resolvePlateSourcesForLook — the whole answer a TAKE would give', () => {
  const base = {
    templateId: 'tpl-1',
    plateIds: ['l-1', 'l-2'],
    assignments: assignments({ 'l-1': 'studio-1', 'l-2': 'studio-2' }),
  };

  it('level 2 alone, which is the commonest case by far', () => {
    expect([...resolvePlateSourcesForLook({ ...base, lookId: 'look-1' })]).toEqual([
      ['l-1', 'studio-1'],
      ['l-2', 'studio-2'],
    ]);
  });

  it('🔴 a per-look binding beats the template default — the reported defect', () => {
    expect(
      resolvePlateSourcesForLook({
        ...base,
        lookId: 'look-1',
        lookBindings: { 'look-1': { 'l-1': 'studio-3' } },
      }).get('l-1'),
    ).toBe('studio-3');
  });

  it('🔴 the SAME plate resolves differently in two looks', () => {
    // The property a plate-keyed map could not express at all, which is why `B-157` was an
    // unrepresentable case rather than a missed one.
    const bindings = { 'look-1': { 'l-1': 'studio-3' }, 'look-2': { 'l-1': 'studio-4' } };
    expect(
      resolvePlateSourcesForLook({ ...base, lookId: 'look-1', lookBindings: bindings }).get('l-1'),
    ).toBe('studio-3');
    expect(
      resolvePlateSourcesForLook({ ...base, lookId: 'look-2', lookBindings: bindings }).get('l-1'),
    ).toBe('studio-4');
  });

  it('the emergency patch wins over both, in every look', () => {
    for (const lookId of ['look-1', 'look-2']) {
      expect(
        resolvePlateSourcesForLook({
          ...base,
          lookId,
          lookBindings: { 'look-1': { 'l-1': 'studio-3' } },
          overrides: { 'l-1': 'dead-9' },
        }).get('l-1'),
      ).toBe('dead-9');
    }
  });

  it('the frozen level 2 is what a binding falls back TO', () => {
    expect(
      resolvePlateSourcesForLook({
        ...base,
        frozenAssignment: { 'l-1': 'frozen-1' },
        lookId: 'look-1',
      }).get('l-1'),
    ).toBe('frozen-1');
  });

  it('a plate nothing resolves for answers null, and is still PRESENT in the map', () => {
    // Present-with-null, not absent: the caller asked about this plate and is owed an answer
    // about it. An absent key would read as "not asked" at every call site.
    const out = resolvePlateSourcesForLook({
      templateId: 'tpl-1',
      plateIds: ['l-1', 'l-9'],
      assignments: assignments({ 'l-1': 'studio-1' }),
      lookId: 'look-1',
    });
    expect(out.get('l-9')).toBeNull();
    expect(out.has('l-9')).toBe(true);
  });

  it('answers in CATALOG IDS, never names — the join belongs to the caller', () => {
    /*
      Deliberate: only a surface knows what a missing catalog entry means. On a preview it
      reads as "unassigned"; at the bridge it refuses a take. Folding the join in would force
      one of those two to be wrong.
    */
    expect(
      resolvePlateSourcesForLook({
        ...base,
        lookId: 'look-1',
        lookBindings: { 'look-1': { 'l-1': 'a-source-that-was-deleted' } },
      }).get('l-1'),
    ).toBe('a-source-that-was-deleted');
  });
});
