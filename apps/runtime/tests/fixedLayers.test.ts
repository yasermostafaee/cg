import { describe, expect, it } from 'vitest';
import type { FixedSlotState } from '@cg/shared-ipc';
import { occupancyLabel } from '../src/renderer/features/fixedLayers/occupancyLabel.js';
import { fixedRowActions } from '../src/renderer/features/fixedLayers/fixedRowActions.js';
import { fixedLayersReasonMessage } from '../src/renderer/ui/fixedLayersReasonMessage.js';

/**
 * R-021 stage 2b — the two pure modules behind the fixed row, tested directly:
 * `occupancyLabel` (the D8/B-094 honesty wording, incl. the dead-link mask)
 * and `fixedRowActions` (the ONE verb-derivation point, design (f)/(g) — the
 * D1 split: CLEAR on observed html only, nothing anywhere else).
 */

const noDeps = {
  linkDown: false,
  clear: () => Promise.resolve({ accepted: true }),
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

describe('fixedRowActions — the ONE verb-derivation point (D1/D2)', () => {
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

  it('empty → NO control (the import+load chain is stage 3, task 5.3)', () => {
    expect(fixedRowActions(slot({ kind: 'empty' }), noDeps)).toEqual([]);
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

  it('a non-null binding returns [] — the item verb set is stage 3 (task 5.3)', () => {
    const bound: FixedSlotState = {
      channel: 1,
      layer: 70,
      observed: { kind: 'producer', producer: 'html' },
      binding: { itemId: 'item-1', templateType: 'lower-third' },
    };
    expect(fixedRowActions(bound, noDeps)).toEqual([]);
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
