import { describe, expect, it } from 'vitest';
import type { SourceAssignments, SourceCatalog } from '@cg/shared-ipc';
import type { LiveSourceDeclaration } from '@cg/shared-schema';
import { LIVE_PLATE_UNASSIGNED, resolvePlateAssignments } from '../src/live-plate-assignment.js';

/**
 * C-015 phase 6 (task 6.7) — the take refuses legibly when a declared plate has no
 * assignment, and NAMES THE PLATE.
 *
 * ⚠ **Every assertion here is on the CLAIM, not on the presence of a refusal.** "It
 * refused" is the easy half and the useless half: an operator staring at
 * `live-source-unassigned` with three guest boxes on screen learns nothing they can
 * act on. What this file pins is that the message says WHICH plate, in both of the
 * two ways a plate can be unassigned.
 */

const plate = (sourceId: string): LiveSourceDeclaration => ({
  elementId: `el-${sourceId}`,
  sourceId,
  rect: { x: 0, y: 0, width: 100, height: 100 },
  dynamic: false,
});

const catalog: SourceCatalog = {
  sources: [
    { id: 'cat-a', name: 'Studio A', format: '1080i5000', producer: { kind: 'route', channel: 2 } },
    { id: 'cat-b', name: 'Baku', format: 'PAL', producer: { kind: 'route', channel: 3 } },
  ],
};

const assignments = (
  ...pairs: readonly (readonly [plateId: string, sourceId: string])[]
): SourceAssignments => ({
  assignments: pairs.map(([plateId, sourceId]) => ({ templateId: 'tpl-1', plateId, sourceId })),
});

const resolve = (declarations: readonly LiveSourceDeclaration[], a: SourceAssignments) =>
  resolvePlateAssignments({ templateId: 'tpl-1', declarations, assignments: a, catalog });

describe('every plate assigned — the take proceeds', () => {
  it('resolves each plate to its catalog entry, in declaration order', () => {
    const out = resolve(
      [plate('guest-1'), plate('guest-2')],
      assignments(['guest-1', 'cat-a'], ['guest-2', 'cat-b']),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.plates.map((p) => p.declaration.sourceId)).toEqual(['guest-1', 'guest-2']);
    expect(out.plates.map((p) => p.source.name)).toEqual(['Studio A', 'Baku']);
  });

  it('a template with NO plates is not a refusal — an empty array is a real answer', () => {
    expect(resolve([], assignments())).toEqual({ ok: true, plates: [] });
  });

  it('another template’s assignments do not satisfy this one', () => {
    // The assignment is keyed by (templateId, plateId). Matching on plateId alone
    // would let a same-named plate in a different template silently satisfy this.
    const foreign: SourceAssignments = {
      assignments: [{ templateId: 'tpl-OTHER', plateId: 'guest-1', sourceId: 'cat-a' }],
    };
    expect(resolve([plate('guest-1')], foreign).ok).toBe(false);
  });
});

describe('🔴 the refusal NAMES THE PLATE — in both ways of being unassigned', () => {
  it('NEVER ASSIGNED (a freshly imported template) names the plate', () => {
    const out = resolve([plate('guest-1')], assignments());
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.errorCode).toBe(LIVE_PLATE_UNASSIGNED);
    expect(out.message).toContain('guest-1');
    // …and says what happens if it is not fixed, in the operator's terms.
    expect(out.message).toMatch(/to air empty/i);
    // …and what to do next. A refusal with no next step reads as a broken console.
    expect(out.message).toMatch(/CG Control/);
  });

  it('CASCADED AWAY (the source was retired) names the plate too', () => {
    // §2c: the delete cascade removed the assignment when its source left the
    // catalog. Modelled here as the assignment simply being absent — which is
    // exactly what the cascade leaves behind, and exactly why the two cases
    // resolve to ONE state.
    const out = resolve([plate('guest-2')], assignments());
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.message).toContain('guest-2');
  });

  it('a STALE assignment naming a missing source keeps the CODE and changes the WORDING', () => {
    // The third route to the same refusal: hand-edited or restored from an older
    // file. The operator's next action is identical, so the code is the same — but
    // telling them it is "unassigned" would send them looking for an assignment
    // they will find already made.
    const out = resolve([plate('guest-1')], assignments(['guest-1', 'cat-GONE']));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.errorCode).toBe(LIVE_PLATE_UNASSIGNED);
    expect(out.message).toContain('guest-1');
    expect(out.message).toMatch(/no longer has/i);
  });

  it('names EVERY unresolved plate, not just the first', () => {
    // One attempt must tell the operator the whole list. Discovering them a plate
    // at a time is three failed takes on air.
    const out = resolve(
      [plate('guest-1'), plate('guest-2'), plate('guest-3')],
      assignments(['guest-2', 'cat-a']),
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.plateIds).toEqual(['guest-1', 'guest-3']);
    expect(out.message).toContain('guest-1');
    expect(out.message).toContain('guest-3');
    expect(out.message).not.toContain('guest-2');
  });

  it('mixes the two causes in ONE message, each in its own words', () => {
    const out = resolve([plate('guest-1'), plate('guest-2')], assignments(['guest-2', 'cat-GONE']));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.message).toMatch(/"guest-1".*no live source assigned/is);
    expect(out.message).toMatch(/"guest-2".*no longer has/is);
  });

  it('🔴 ALL-OR-NOTHING — a partly-assigned template seats NOTHING', () => {
    // A template with three guest boxes, two assigned, is not two-thirds of a
    // graphic — it is a designed layout with a hole in it, on air. Seating the two
    // would be the silent-empty-hole outcome this refusal exists to prevent,
    // reached by a different road: the operator sees something plausible and has no
    // reason to look for what is missing.
    const out = resolve([plate('guest-1'), plate('guest-2')], assignments(['guest-1', 'cat-a']));
    expect(out.ok).toBe(false);
  });
});
