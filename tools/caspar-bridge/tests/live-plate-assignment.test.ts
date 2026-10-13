import { describe, expect, it } from 'vitest';
import { isolateText, type SourceAssignments, type SourceCatalog } from '@cg/shared-ipc';
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
 *
 * 🔴 `B-308` — and it says it in the OPERATOR's words: `Plate N`, the plate's position in its
 * template (the swap dialog's and the Inspector's word), never the scene's id (`guest-1`). The ids
 * stay in `plateIds` and `refused`, for a technician.
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
    // `B-308` — `Plate 1`, and no id in the sentence; the id stays in `plateIds`.
    expect(out.message).toBe(
      'Plate 1 has no live source assigned, so it would go to air empty. Assign it in CG ' +
        'Control, then take again.',
    );
    expect(out.message).not.toContain('guest-1');
    expect(out.plateIds).toEqual(['guest-1']);
  });

  it('CASCADED AWAY (the source was retired) names the plate too', () => {
    // §2c: the delete cascade removed the assignment when its source left the
    // catalog. Modelled here as the assignment simply being absent — which is
    // exactly what the cascade leaves behind, and exactly why the two cases
    // resolve to ONE state.
    const out = resolve([plate('guest-1'), plate('guest-2')], assignments(['guest-1', 'cat-a']));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.message).toMatch(/^Plate 2 has no live source assigned/);
    expect(out.message).not.toContain('guest-2');
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
    expect(out.message).toBe(
      'Plate 1 is assigned to a source this installation no longer has. Assign it in CG ' +
        'Control, then take again.',
    );
    expect(out.message).not.toContain('guest-1');
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
    expect(out.message).toMatch(/^Plate 1 and Plate 3 have no live source assigned/);
    expect(out.message).not.toContain('Plate 2');
    expect(out.message).not.toMatch(/guest-/);
  });

  it('mixes the two causes in ONE message, each in its own words', () => {
    const out = resolve([plate('guest-1'), plate('guest-2')], assignments(['guest-2', 'cat-GONE']));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.message).toMatch(/Plate 1 has no live source assigned/);
    expect(out.message).toMatch(/Plate 2 is assigned to a source .* no longer has/);
    expect(out.message).not.toMatch(/guest-/);
  });

  it('🔴 `B-308` — a plate is numbered in its TEMPLATE, not in the subset asked to resolve', () => {
    // The reconcile hands this function only the plates that must resolve. Numbered from that
    // subset, the template's third plate would read `Plate 1`; `plates` is the whole declaration.
    const whole = [plate('guest-1'), plate('guest-2'), plate('guest-3')];
    const out = resolvePlateAssignments({
      templateId: 'tpl-1',
      declarations: [plate('guest-3')],
      plates: whole,
      assignments: assignments(),
      catalog,
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.message).toMatch(/^Plate 3 has no live source assigned/);
    // Control: without the whole declaration it is numbered from what it was given.
    const narrowed = resolve([plate('guest-3')], assignments());
    expect(!narrowed.ok && narrowed.message).toMatch(/^Plate 1 /);
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

describe('🔴 `B-308` — an entry the plate may not use: `Plate N`, the name isolated', () => {
  it('an UNAVAILABLE entry names the plate by position and isolates the Persian name', () => {
    const persian: SourceCatalog = {
      sources: [
        {
          id: 'cat-p',
          name: 'ورودی ۴',
          format: '1080i5000',
          producer: { kind: 'route', channel: 4 },
          status: 'unavailable',
          reason: 'no signal',
        },
      ],
    };
    const out = resolvePlateAssignments({
      templateId: 'tpl-1',
      declarations: [plate('guest-1'), plate('guest-2')],
      assignments: assignments(['guest-1', 'cat-p'], ['guest-2', 'cat-p']),
      catalog: persian,
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.message).toBe(`Plate 1: “${isolateText('ورودی ۴')}” is unavailable: no signal`);
    // The id is RELOCATED, not deleted: it is the refusal's payload.
    expect(out.refused?.plateId).toBe('guest-1');
  });
});
