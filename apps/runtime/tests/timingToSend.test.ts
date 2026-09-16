import { beforeEach, describe, expect, it } from 'vitest';
import { TEMPLATE_TIMING_VERSION, type StackItemState } from '@cg/shared-schema';
import type { TemplateInfo } from '@cg/shared-ipc';
import {
  effectiveTimingFor,
  timingPatchToSend,
} from '../src/renderer/features/inspector/timingToSend.js';
import {
  __resetDraftsForTest,
  stageTiming,
} from '../src/renderer/features/inspector/draftStore.js';

/**
 * 🔴 `PASSES-CYCLE-ONLY-26` §A1.2 / §B0.2 — **THE ONE PLACE THAT DECIDES WHAT TIMING LEAVES THE
 * CONSOLE.**
 *
 * Two readers, one gate:
 *
 *  - `timingPatchToSend` — what an UPDATE press sends (the DIFF from what is applied, because
 *    re-sending a value the row already has is not an edit);
 *  - `effectiveTimingFor` — what PVW should PLAY (the FULL effective value: the staged draft
 *    layered on the stored override, the same "draft over applied" shape `buildApplyPayload`
 *    gives the fields).
 *
 * They answer different questions and must not be collapsed. What they share is the gate: a
 * template whose stated mode is not `loop-cycle` has no pass timing to send or to play, because
 * the console no longer offers one and the only cyclic scope is usually a decoration.
 */

const PLAYOUT = (mode: string): TemplateInfo['playout'] =>
  ({
    v: TEMPLATE_TIMING_VERSION,
    mode,
    holdSource: 'timed',
    loops: true,
  }) as TemplateInfo['playout'];

const LOOP = PLAYOUT('loop-cycle');
/** The plant ticker: loops (a nested dot), but its own mode does not. */
const TICKER = PLAYOUT('auto-out');

function row(over: Partial<StackItemState> = {}): StackItemState {
  return {
    itemId: 'item-1',
    templateId: 'tpl',
    fields: {},
    status: 'on-air',
    pending: false,
    ...over,
  } as unknown as StackItemState;
}

beforeEach(() => {
  __resetDraftsForTest();
});

describe('the gate — a template that does not admit pass timing sends none', () => {
  it('a stored override on a TICKER row yields no patch and no effective value', () => {
    const item = row({ timingOverride: { repeat: 2, delayMs: 500 } } as Partial<StackItemState>);
    stageTiming(item.itemId, { passes: { kind: 'count', text: '3' } });

    expect(timingPatchToSend(TICKER, item), 'a hidden control still sent a patch').toBeUndefined();
    expect(effectiveTimingFor(TICKER, item), 'PVW would play a hidden count').toBeUndefined();
  });

  it('an ABSENT playout admits nothing — an old import states no mode', () => {
    const item = row({ timingOverride: { repeat: 2 } } as Partial<StackItemState>);
    expect(timingPatchToSend(undefined, item)).toBeUndefined();
    expect(effectiveTimingFor(undefined, item)).toBeUndefined();
  });

  it('a LOOP-CYCLE row is unaffected — the positive control', () => {
    // Without this, "returns undefined" is satisfied by a builder that always does.
    const item = row({ timingOverride: { repeat: 2 } } as Partial<StackItemState>);
    expect(effectiveTimingFor(LOOP, item)).toEqual({ passes: 2 });
  });
});

describe('timingPatchToSend — the DIFF a press carries', () => {
  it('sends nothing when there is no draft', () => {
    expect(timingPatchToSend(LOOP, row())).toBeUndefined();
  });

  it('sends only what DIFFERS from what is applied', () => {
    const item = row({ timingOverride: { repeat: 2, delayMs: 500 } } as Partial<StackItemState>);
    stageTiming(item.itemId, { passes: { kind: 'count', text: '2' }, gapSeconds: '1.5' });
    // The count restates the applied value; only the gap moved.
    expect(timingPatchToSend(LOOP, item)).toEqual({ delayMs: 1500 });
  });

  it('sends nothing when the draft merely restates the applied value', () => {
    const item = row({ timingOverride: { repeat: 2 } } as Partial<StackItemState>);
    stageTiming(item.itemId, { passes: { kind: 'count', text: '2' } });
    expect(timingPatchToSend(LOOP, item)).toBeUndefined();
  });

  it('a HALF-TYPED count carries no passes member rather than a guess', () => {
    const item = row();
    stageTiming(item.itemId, { passes: { kind: 'count', text: 'tw' } });
    expect(timingPatchToSend(LOOP, item)).toBeUndefined();
  });

  it('ZERO is a real instruction and survives', () => {
    const item = row({ timingOverride: { repeat: 4 } } as Partial<StackItemState>);
    stageTiming(item.itemId, { passes: { kind: 'count', text: '0' } });
    expect(timingPatchToSend(LOOP, item)).toEqual({ passes: 0 });
  });

  it('`infinite` is carried as itself', () => {
    const item = row({ timingOverride: { repeat: 2 } } as Partial<StackItemState>);
    stageTiming(item.itemId, { passes: { kind: 'until-stop' } });
    expect(timingPatchToSend(LOOP, item)).toEqual({ passes: 'infinite' });
  });
});

describe('effectiveTimingFor — what PVW should PLAY', () => {
  it('is the STORED value when nothing is staged', () => {
    const item = row({ timingOverride: { repeat: 3, delayMs: 800 } } as Partial<StackItemState>);
    expect(effectiveTimingFor(LOOP, item)).toEqual({ passes: 3, delayMs: 800 });
  });

  it('LAYERS the staged draft over the stored value — what Apply would produce', () => {
    // The fields' own rule (`buildApplyPayload`): what is rehearsed is exactly what Apply would
    // send. A count typed but not yet applied must be what PVW plays, or the preview is
    // showing a different graphic from the one the operator is about to commit.
    const item = row({ timingOverride: { repeat: 3, delayMs: 800 } } as Partial<StackItemState>);
    stageTiming(item.itemId, { passes: { kind: 'count', text: '1' } });
    expect(effectiveTimingFor(LOOP, item)).toEqual({ passes: 1, delayMs: 800 });
  });

  it('is undefined when neither a draft nor a stored value states anything', () => {
    // A template with no override must reach the frame with NO timing at all, so the page runs
    // its AUTHORED default — the same abstain-on-absence rule the position already has.
    expect(effectiveTimingFor(LOOP, row())).toBeUndefined();
  });

  it('a half-typed draft falls back to the stored value rather than blanking it', () => {
    const item = row({ timingOverride: { repeat: 3 } } as Partial<StackItemState>);
    stageTiming(item.itemId, { passes: { kind: 'count', text: 'tw' } });
    expect(effectiveTimingFor(LOOP, item)).toEqual({ passes: 3 });
  });
});
