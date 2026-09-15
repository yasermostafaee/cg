/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { StackItemState } from '@cg/shared-schema';
import { applyDraft } from '../src/renderer/features/inspector/applyDraft.js';
import {
  __resetDraftsForTest,
  clearDraft,
  isItemDirty,
  stageTiming,
  timingDraftOf,
} from '../src/renderer/features/inspector/draftStore.js';
import {
  __resetSentPassesForTest,
  lastSentPasses,
} from '../src/renderer/features/inspector/timingSent.js';

/**
 * 🔴 **`TIMING-WIRE-22 · DELTA B4` — ONE PRESS SPENDS THE TIMING DRAFT.**
 *
 * The section stages (pinned in `timingSection.dom.test.ts`); this pins what the COMMIT BAR
 * does with what was staged. The two halves are separate files because they fail separately and
 * for different reasons — a section that sends on blur is a different defect from an Update
 * that sends twice.
 *
 * ── WHY THE SUBJECT IS `applyDraft` AND NOT THE BUTTON ──────────────────────
 *
 * `Update` / `Update on air` and the stack row's UPDATE verb call the SAME `applyDraft`. Driving
 * the function is what makes these specs true of BOTH controls at once; driving one button would
 * leave the other free to disagree, which is the class golden rule 6 exists to stop.
 *
 * ── ⚠ WHAT THIS FILE CANNOT SEE, AND WHERE THAT IS PINNED ───────────────────
 *
 * "An off-air Update sends ZERO AMCP" is a claim about the BRIDGE, not about this renderer: the
 * console calls `stack.set-pass-timing` in both states and `#ownsLiveSeats` decides whether a
 * `CG UPDATE` crosses. Asserting it here would only be asserting the stub. It is measured at the
 * wire in `tools/caspar-bridge/tests/pass-timing-wire.integration.test.ts` —
 * "(c) an OFF-AIR row records the intent and sends nothing", which reads the actual socket
 * lines. What this file pins is the half it owns: the call is still MADE off air, so the next
 * take carries the count.
 */

const item = (over: Partial<StackItemState> = {}): StackItemState =>
  ({
    itemId: 'item-1',
    templateId: 'looper',
    fields: {},
    status: 'idle',
    pending: false,
    ...over,
  }) as unknown as StackItemState;

const errors: string[] = [];
vi.mock('../src/renderer/features/status/commandFeedback.js', () => ({
  reportCommandError: (m: string) => {
    errors.push(m);
  },
}));

function stubBridge(timing: { ok: boolean; message?: string } = { ok: true }): {
  setPassTiming: Mock;
  update: Mock;
  setPosition: Mock;
} {
  const setPassTiming = vi.fn(() => Promise.resolve(timing));
  /*
    🔴 `stack.update` AND `stack.setPosition` ARE PART OF THE STUB — `applyDraft` commits the
    row's WHOLE draft on every press, and the field half re-sends even with nothing staged (the
    documented `B-048` recovery path). A stub carrying only `setPassTiming` would fail these
    specs on a missing function rather than on a wrong payload, which is the shape of failure
    that gets a test "fixed" by deleting the assertion under it.
  */
  const update = vi.fn(() => Promise.resolve({ accepted: true }));
  const setPosition = vi.fn(() => Promise.resolve({ ok: true }));
  const stub = { stack: { setPassTiming, update, setPosition } };
  (globalThis as unknown as { window: { cg: typeof stub } }).window.cg = stub;
  return { setPassTiming, update, setPosition };
}

beforeEach(() => {
  errors.length = 0;
  __resetDraftsForTest();
  __resetSentPassesForTest();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('🔴 DELTA B4 — UPDATE spends the timing draft, exactly once', () => {
  it('sends ONE stack.set-pass-timing carrying the staged count', async () => {
    const { setPassTiming } = stubBridge();
    const subject = item({ status: 'on-air' });
    stageTiming('item-1', { passes: { kind: 'count', text: '3' } });

    await applyDraft(subject);

    expect(setPassTiming).toHaveBeenCalledTimes(1);
    expect(setPassTiming).toHaveBeenCalledWith({ itemId: 'item-1', passes: 3 });
  });

  it('carries BOTH halves in the one call when both are staged', async () => {
    // Two controls, one press: a gap typed after a count must not cost a second command, and it
    // must not lose the count either.
    const { setPassTiming } = stubBridge();
    stageTiming('item-1', { passes: { kind: 'count', text: '2' } });
    stageTiming('item-1', { gapSeconds: '1.5' });

    await applyDraft(item({ status: 'on-air' }));

    expect(setPassTiming).toHaveBeenCalledTimes(1);
    expect(setPassTiming).toHaveBeenCalledWith({ itemId: 'item-1', passes: 2, delayMs: 1500 });
  });

  it('`Until stop` crosses as infinite', async () => {
    const { setPassTiming } = stubBridge();
    stageTiming('item-1', { passes: { kind: 'until-stop' } });

    await applyDraft(item({ status: 'on-air', timingOverride: { repeat: 3 } }));

    expect(setPassTiming).toHaveBeenCalledWith({ itemId: 'item-1', passes: 'infinite' });
  });

  it('🔴 ZERO is an instruction and is SENT — never read as "nothing staged"', async () => {
    // Reading `0` as absent is the silent-clamp failure this feature guards at four layers; this
    // is the one at the commit.
    const { setPassTiming } = stubBridge();
    stageTiming('item-1', { passes: { kind: 'count', text: '0' } });

    await applyDraft(item({ status: 'on-air', timingOverride: { repeat: 5 } }));

    expect(setPassTiming).toHaveBeenCalledWith({ itemId: 'item-1', passes: 0 });
  });

  it('OFF AIR the call is still made, so the next take carries the count', async () => {
    // Golden rule 10 lives at the BRIDGE, which withholds the wire for a row owning no live
    // seats (pinned at the socket — see this file's header). What the console must not do is
    // decide that itself and leave the intent unrecorded.
    const { setPassTiming } = stubBridge();

    await applyDraft(item({ status: 'idle' }));
    expect(setPassTiming, 'nothing staged, so nothing to send').not.toHaveBeenCalled();

    stageTiming('item-1', { passes: { kind: 'count', text: '4' } });
    await applyDraft(item({ status: 'idle' }));
    expect(setPassTiming).toHaveBeenCalledWith({ itemId: 'item-1', passes: 4 });
  });

  it('sends NOTHING when no timing is staged', async () => {
    // The field half still re-sends — that is `B-048` — but a press with no timing edit must not
    // put a configuration command on the wire.
    const { setPassTiming, update } = stubBridge();

    await applyDraft(item({ status: 'on-air' }));

    expect(setPassTiming).not.toHaveBeenCalled();
    expect(update, 'the field half must still run').toHaveBeenCalledTimes(1);
  });

  it('sends nothing for a draft that only RESTATES what is applied', async () => {
    // Re-typing the number already stored is not an edit. Sending it would be a command nobody
    // asked for, and leaving it staged would keep a dirty chip up over a row with nothing out.
    const { setPassTiming } = stubBridge();
    stageTiming('item-1', { passes: { kind: 'count', text: '2' } });

    await applyDraft(item({ status: 'on-air', timingOverride: { repeat: 2 } }));

    expect(setPassTiming).not.toHaveBeenCalled();
    expect(
      timingDraftOf('item-1'),
      'a restatement was left staged as if it were an edit',
    ).toBeUndefined();
  });

  it('a HALF-TYPED count carries no passes member and does not fail the press', async () => {
    // `"tw"` left in the box when UPDATE is pressed is not rewritten to a number: `timingPassesOf`
    // answers `undefined`, so the member is simply absent. The gap staged beside it still goes.
    const { setPassTiming } = stubBridge();
    stageTiming('item-1', { passes: { kind: 'count', text: 'tw' } });
    stageTiming('item-1', { gapSeconds: '2' });

    const res = await applyDraft(item({ status: 'on-air' }));

    expect(setPassTiming).toHaveBeenCalledWith({ itemId: 'item-1', delayMs: 2000 });
    expect(res.accepted, 'unparseable text must not fail the whole press').toBe(true);
  });
});

describe('🔴 DELTA B4 — acceptance clears the draft; a refusal keeps it', () => {
  it('an ACCEPTED send drops the draft and stamps what was sent', async () => {
    stubBridge({ ok: true });
    stageTiming('item-1', { passes: { kind: 'count', text: '3' } });

    await applyDraft(item({ status: 'on-air' }));

    expect(timingDraftOf('item-1')).toBeUndefined();
    expect(
      lastSentPasses('item-1'),
      'the sent line has no time for an accepted send',
    ).toBeDefined();
  });

  it('🔴 a REFUSED send KEEPS the draft, and says why', async () => {
    /*
      The operator's number is still theirs: the dirty mark stays up, the box keeps the value,
      and UPDATE can be pressed again when the link returns. A refusal that also destroyed the
      edit would be the product punishing the operator for the bridge's answer.
    */
    stubBridge({ ok: false, message: 'CasparCG did not accept the timing change.' });
    stageTiming('item-1', { passes: { kind: 'count', text: '3' } });

    const res = await applyDraft(item({ status: 'on-air' }));

    expect(timingDraftOf('item-1')?.passes).toEqual({ kind: 'count', text: '3' });
    expect(res.accepted, 'a refused half must drag the press down with it').toBe(false);
    expect(errors[0]).toBe('CasparCG did not accept the timing change.');
  });

  it('a refusal does NOT stamp the sent line — it is a fact about what happened', async () => {
    stubBridge({ ok: false, message: 'no' });
    stageTiming('item-1', { passes: { kind: 'count', text: '3' } });

    await applyDraft(item({ status: 'on-air' }));

    expect(lastSentPasses('item-1')).toBeUndefined();
  });

  it('a thrown call is reported too, and keeps the draft', async () => {
    const setPassTiming = vi.fn(() => Promise.reject(new Error('link down')));
    const stub = {
      stack: {
        setPassTiming,
        update: vi.fn(() => Promise.resolve({ accepted: true })),
        setPosition: vi.fn(() => Promise.resolve({ ok: true })),
      },
    };
    (globalThis as unknown as { window: { cg: typeof stub } }).window.cg = stub;
    stageTiming('item-1', { passes: { kind: 'count', text: '3' } });

    const res = await applyDraft(item({ status: 'on-air' }));

    expect(errors[0]).toBe('link down');
    expect(timingDraftOf('item-1')).toBeDefined();
    expect(res.accepted).toBe(false);
  });
});

describe('🔴 DELTA B4 — DISCARD drops it with the rest', () => {
  it('a discarded timing edit sends nothing on the next press', async () => {
    const { setPassTiming } = stubBridge();
    stageTiming('item-1', { passes: { kind: 'count', text: '3' } });

    clearDraft('item-1');
    await applyDraft(item({ status: 'on-air' }));

    expect(timingDraftOf('item-1')).toBeUndefined();
    expect(setPassTiming, 'a discarded edit reached the wire').not.toHaveBeenCalled();
  });
});

describe('🔴 DELTA B4 — the commit bar can SEE a staged timing edit', () => {
  /*
    The dirty chip and the enabled UPDATE read ONE function. A staged count that did not answer
    there would leave the bar reporting itself clean with a pass count still to send — and
    Discard would throw it away having never said it was there.
  */
  it('a staged count makes the row dirty', () => {
    expect(isItemDirty('item-1', {}, new Map(), undefined, undefined, undefined)).toBe(false);
    stageTiming('item-1', { passes: { kind: 'count', text: '3' } });
    expect(isItemDirty('item-1', {}, new Map(), undefined, undefined, undefined)).toBe(true);
  });

  it('a draft equal to what is applied is NOT dirty', () => {
    // Otherwise the bar would demand an UPDATE that changes nothing, every time an operator
    // re-typed the number in front of them.
    stageTiming('item-1', { passes: { kind: 'count', text: '3' } });
    expect(isItemDirty('item-1', {}, new Map(), undefined, undefined, { repeat: 3 })).toBe(false);
  });

  it('a gap that carries NO VALUE is not dirty; one that carries a value is', () => {
    /*
      ⚠ The boundary is not "looks finished". `Number('1.')` is `1`, so a box reading `1.` DOES
      carry a value — one second — and the bar is right to offer an UPDATE for it. What carries
      nothing is text that is not a number at all, and this case was written the other way round
      until the suite said so.
    */
    stageTiming('item-1', { gapSeconds: '-' });
    expect(isItemDirty('item-1', {}, new Map(), undefined, undefined, undefined)).toBe(false);
    stageTiming('item-1', { gapSeconds: '1.' });
    expect(isItemDirty('item-1', {}, new Map(), undefined, undefined, undefined)).toBe(true);
  });

  it('choosing Until stop on a row storing a count is dirty', () => {
    stageTiming('item-1', { passes: { kind: 'until-stop' } });
    expect(isItemDirty('item-1', {}, new Map(), undefined, undefined, { repeat: 3 })).toBe(true);
  });
});
