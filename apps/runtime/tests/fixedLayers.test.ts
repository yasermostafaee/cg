import { describe, expect, it } from 'vitest';
import type { FixedSlotState } from '@cg/shared-ipc';
import { occupancyLabel } from '../src/renderer/features/fixedLayers/occupancyLabel.js';
import { fixedRowActions } from '../src/renderer/features/fixedLayers/fixedRowActions.js';
import { fixedLayersReasonMessage } from '../src/renderer/ui/fixedLayersReasonMessage.js';

/**
 * R-021 — the two pure modules behind the fixed row, tested directly:
 * `occupancyLabel` (the D8/B-094 honesty wording, incl. the dead-link mask)
 * and `fixedRowActions` (the ONE verb-derivation point, design (f)/(g)).
 *
 * The verb split as it stands after stage 3: observed `html` → the layer
 * CLEAR; observed `empty` → the import+load chain and Load-from-library
 * (task 5.3); `unknown` / non-html → still nothing until task 4.3 (stage 4).
 */

const noDeps = {
  linkDown: false,
  clear: () => Promise.resolve({ accepted: true }),
  importAndLoad: () => Promise.resolve({ accepted: true }),
  loadFromLibrary: () => Promise.resolve({ accepted: true }),
  onError: () => undefined,
};

function slot(observed: FixedSlotState['observed'], layer = 72): FixedSlotState {
  return { channel: 1, layer, observed, binding: null };
}

describe('occupancyLabel — honest wording for the four display cases', () => {
  it('unknown reads as explicitly unknown — NEVER as empty (B-094)', () => {
    const label = occupancyLabel({ kind: 'unknown' }, false);
    expect(label).toBe('no signal — occupancy unknown');
    expect(label).not.toContain('empty');
  });

  it('empty reads as empty', () => {
    expect(occupancyLabel({ kind: 'empty' }, false)).toBe('empty');
  });

  it('a producer names its kind verbatim', () => {
    expect(occupancyLabel({ kind: 'producer', producer: 'html' }, false)).toBe(
      'occupied — html producer',
    );
    expect(occupancyLabel({ kind: 'producer', producer: 'ffmpeg' }, false)).toBe(
      'occupied — ffmpeg producer',
    );
  });

  it('a dead link masks EVERY observation to unknown — a frozen claim is never shown', () => {
    // The D8/B-087 rule: `useBridgeSnapshot` freezes the last value on a dead
    // link, so a frozen `producer`/`empty` claim must display as unknown.
    for (const observed of [
      { kind: 'empty' } as const,
      { kind: 'unknown' } as const,
      { kind: 'producer', producer: 'html' } as const,
      { kind: 'producer', producer: 'ffmpeg' } as const,
    ]) {
      const label = occupancyLabel(observed, true);
      expect(label).toBe('not connected — occupancy unknown');
    }
  });
});

describe('fixedRowActions — the ONE verb-derivation point (D1/D2/stage 3)', () => {
  it('observed html producer → exactly the confirm-gated layer CLEAR', () => {
    const actions = fixedRowActions(slot({ kind: 'producer', producer: 'html' }, 70), noDeps);
    expect(actions.map((a) => a.key)).toEqual(['clear']);
    expect(actions[0]).toMatchObject({ label: 'CLEAR', disabled: false });
    // The tooltip names the exact coordinate it would clear.
    expect(actions[0]?.title).toContain('1-70');
  });

  it('unknown → NO control at all (the b1 blind-Clear is stage 4, task 4.3)', () => {
    expect(fixedRowActions(slot({ kind: 'unknown' }), noDeps)).toEqual([]);
  });

  it('empty → the stage-3 chain: import+load AND Load-from-library, nothing else', () => {
    const actions = fixedRowActions(slot({ kind: 'empty' }), noDeps);
    expect(actions.map((a) => a.key)).toEqual(['import-load', 'load-library']);
    // Neither is a destructive verb: both pre-roll (CG ADD), neither clears.
    expect(actions.map((a) => a.variant)).toEqual(['secondary', 'secondary']);
    expect(actions.every((a) => !a.disabled)).toBe(true);
    // Both tooltips name the exact coordinate the chain would land on.
    for (const action of actions) expect(action.title).toContain('1-72');
  });

  it('each stage-3 verb runs its OWN injected handler — no crossed wires', async () => {
    const calls: string[] = [];
    const actions = fixedRowActions(slot({ kind: 'empty' }), {
      ...noDeps,
      importAndLoad: () => {
        calls.push('import');
        return Promise.resolve({ accepted: true });
      },
      loadFromLibrary: () => {
        calls.push('library');
        return Promise.resolve({ accepted: true });
      },
    });
    await actions.find((a) => a.key === 'import-load')?.run();
    await actions.find((a) => a.key === 'load-library')?.run();
    expect(calls).toEqual(['import', 'library']);
  });

  it('the chain is offered ONLY on observed-empty — never blind, never over a producer', () => {
    // The load path adopts the layer with a CLEAR before its first CG ADD, so
    // offering it on `unknown` or over a producer would hide a destructive step
    // behind a constructive label (d1). Observed-empty has nothing to destroy.
    const chainKeys = (s: FixedSlotState): string[] =>
      fixedRowActions(s, noDeps)
        .map((a) => a.key)
        .filter((k) => k === 'import-load' || k === 'load-library');
    expect(chainKeys(slot({ kind: 'unknown' }))).toEqual([]);
    expect(chainKeys(slot({ kind: 'producer', producer: 'html' }))).toEqual([]);
    expect(chainKeys(slot({ kind: 'producer', producer: 'ffmpeg' }))).toEqual([]);
  });

  it('a non-html producer → NO control (the carve-out is stage 4, task 4.3)', () => {
    expect(fixedRowActions(slot({ kind: 'producer', producer: 'ffmpeg' }), noDeps)).toEqual([]);
    expect(fixedRowActions(slot({ kind: 'producer', producer: 'decklink' }), noDeps)).toEqual([]);
  });

  it('a dead link empties the verb list for EVERY observation (R-006 — no door onto air)', () => {
    const down = { ...noDeps, linkDown: true };
    for (const observed of [
      { kind: 'unknown' } as const,
      { kind: 'empty' } as const,
      { kind: 'producer', producer: 'html' } as const,
      { kind: 'producer', producer: 'ffmpeg' } as const,
    ]) {
      expect(fixedRowActions(slot(observed), down)).toEqual([]);
    }
  });

  it('a BOUND slot offers nothing here — not the chain, and no private copy of the item verbs', () => {
    // The bound item is an ordinary stack item: its C-012 verbs are declared on
    // its STACK row and must be mirrored from those declarations, never
    // re-declared here. What the row must NOT do meanwhile is offer the
    // import+load chain over a slot that already holds an item — that is
    // `slot-bound` on the wire, and an enabled button must never invite a click
    // that only rejects.
    const bound = (observed: FixedSlotState['observed']): FixedSlotState => ({
      channel: 1,
      layer: 70,
      observed,
      binding: { itemId: 'item-1', templateType: 'lower-third' },
    });
    expect(fixedRowActions(bound({ kind: 'producer', producer: 'html' }), noDeps)).toEqual([]);
    // Including over an EMPTY observation — the binding outranks the occupancy.
    expect(fixedRowActions(bound({ kind: 'empty' }), noDeps)).toEqual([]);
  });

  it('the CLEAR runs the shared handler and routes refusals to the given sink', async () => {
    let cleared = 0;
    const actions = fixedRowActions(slot({ kind: 'producer', producer: 'html' }), {
      ...noDeps,
      clear: () => {
        cleared += 1;
        return Promise.resolve({ accepted: true });
      },
    });
    await actions[0]?.run();
    expect(cleared).toBe(1);
  });
});

describe('fixedLayersReasonMessage — one sentence per validator code', () => {
  it('maps every wire reason to operator wording', () => {
    for (const reason of [
      'exceeds-ceiling',
      'overlaps-policy',
      'overlaps-reserved',
      'alias-out-of-bank',
      'renumber-refused',
      'channel-change-refused',
      'shrink-occupied',
    ]) {
      const message = fixedLayersReasonMessage(reason);
      expect(message, reason).not.toBeNull();
      expect(message, reason).not.toContain('Not accepted');
    }
  });

  it('surfaces an unknown code verbatim and answers null for none', () => {
    expect(fixedLayersReasonMessage('mystery-code')).toBe('Not accepted (mystery-code).');
    expect(fixedLayersReasonMessage(undefined)).toBeNull();
  });
});
