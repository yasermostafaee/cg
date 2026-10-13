import { describe, it, expect } from 'vitest';
import { nextPlateAssignments } from '../src/renderer/features/inspector/applyDraft.js';

/**
 * 🔴 `TIMING-BUILD-21` §2(c) — THE THIRD SILENT-DROP SITE, and the one that had ALREADY eaten a
 * field before anyone wrote a guard.
 *
 * `sendPlateAssignments` rebuilds the entries it is changing: they are filtered out of the
 * surviving set, then reconstructed. While that reconstruction was an exhaustive three-key
 * literal, every other key on the assignment was dropped — and the key that mattered was `fit`,
 * the OPERATOR's fit-mode override.
 *
 * The failure is quiet and arrives late. The operator sets a plate's fit mode; hours later they
 * re-point that plate at a different source; the fit reverts to the author's with nothing said.
 * Nobody connects the two actions, because nothing links them on screen.
 *
 * ⚠ **PLANTED-RED PROVENANCE.** Verified to BITE by restoring the old literal
 * (`{ templateId, plateId, sourceId }`, no spread): `carries the operator's fit override` failed
 * with `fit` undefined. Restored, it passes.
 */

interface Assignment {
  templateId: string;
  plateId: string;
  sourceId: string;
  fit?: string;
}

describe('TIMING-BUILD-21 §2(c) — re-pointing a plate must not eat its other fields', () => {
  const current: Assignment[] = [
    { templateId: 'tpl-1', plateId: 'plate-a', sourceId: 'cam-1', fit: 'cover' },
    { templateId: 'tpl-1', plateId: 'plate-b', sourceId: 'cam-2' },
    { templateId: 'tpl-2', plateId: 'plate-a', sourceId: 'cam-9', fit: 'contain' },
  ];

  it("carries the operator's fit override across a source change", () => {
    const next = nextPlateAssignments(current, 'tpl-1', new Map([['plate-a', 'cam-7']]));
    const a = next.find((x) => x.templateId === 'tpl-1' && x.plateId === 'plate-a');
    expect(a?.sourceId, 'the change itself applies').toBe('cam-7');
    expect(a?.fit, "the operator's fit override was silently dropped by the rebuild").toBe('cover');
  });

  it('leaves other templates and other plates untouched', () => {
    const next = nextPlateAssignments(current, 'tpl-1', new Map([['plate-a', 'cam-7']]));
    expect(next.find((x) => x.templateId === 'tpl-2' && x.plateId === 'plate-a')).toEqual(
      current[2],
    );
    expect(next.find((x) => x.templateId === 'tpl-1' && x.plateId === 'plate-b')).toEqual(
      current[1],
    );
    expect(next).toHaveLength(3);
  });

  it('an empty staged value REMOVES the entry rather than writing a blank one', () => {
    // Unchanged behaviour, pinned here because the spread must not accidentally resurrect a
    // removed entry from its prior self.
    const next = nextPlateAssignments(current, 'tpl-1', new Map([['plate-a', '']]));
    expect(next.find((x) => x.templateId === 'tpl-1' && x.plateId === 'plate-a')).toBeUndefined();
    expect(next).toHaveLength(2);
  });

  it('the named keys win over the prior entry, never the other way round', () => {
    // The spread comes FIRST precisely so this call's subject outranks history.
    const next = nextPlateAssignments(current, 'tpl-1', new Map([['plate-a', 'cam-7']]));
    const a = next.find((x) => x.plateId === 'plate-a' && x.templateId === 'tpl-1');
    expect(a?.sourceId).toBe('cam-7');
    expect(a?.templateId).toBe('tpl-1');
    expect(a?.plateId).toBe('plate-a');
  });

  it('a brand-new assignment has no prior to carry, and that is not an error', () => {
    const next = nextPlateAssignments(current, 'tpl-1', new Map([['plate-c', 'cam-3']]));
    const c = next.find((x) => x.plateId === 'plate-c');
    expect(c).toEqual({ templateId: 'tpl-1', plateId: 'plate-c', sourceId: 'cam-3' });
    expect(c && 'fit' in c, 'no phantom key invented for a plate that never had one').toBe(false);
  });
});
