import { describe, expect, it } from 'vitest';
import type { StackItemState } from '@cg/shared-schema';
import { MockRuntime } from '../src/platform/MockRuntime.js';
import { isOnAir } from '../src/renderer/features/stack/onAir.js';

/**
 * Clear-All: take everything OFF AIR, and KEEP it on the stack.
 *
 * The distinction from Remove-All is the whole point. "Get it off the screen" is not "throw
 * it away": Remove-All empties the list, so recovering means re-importing and re-typing every
 * field. Clear-All leaves the rows exactly where they were, idle and re-takeable.
 *
 * It adds NO AMCP verb — it issues the same per-item `out()` (a `CLEAR <ch>-<layer>`) that the
 * row's own Clear button sends.
 */

/** A mock with an EMPTY stack — the constructor seeds a demo stack we do not want here. */
function emptyMock(): MockRuntime {
  const mock = new MockRuntime();
  mock.removeAll();
  return mock;
}

/**
 * The mock's transitions settle on a beat, exactly as a real ack arrives late: `take()` goes
 * `playing` → `on-air`, and `out()` goes `exiting` → `idle`. Clear-All inherits that from the
 * per-item Clear it reuses, so the assertions wait for the settle rather than reading a
 * transient state.
 */
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 220));

/** Put an item genuinely ON AIR — settled, as it would be before an operator clears it. */
async function loadAndPlay(mock: MockRuntime, itemId: string): Promise<void> {
  mock.load(itemId, 'tpl-1', {});
  mock.take(itemId);
  await settle();
}

function byId(stack: readonly StackItemState[], itemId: string): StackItemState {
  const found = stack.find((i) => i.itemId === itemId);
  if (found === undefined) throw new Error(`item ${itemId} fell off the stack`);
  return found;
}

describe('isOnAir — the GRACEFUL predicate (B-122: no longer Clear-All’s)', () => {
  const item = (status: StackItemState['status']): StackItemState => ({
    itemId: 'i',
    templateId: 't',
    fields: {},
    status,
    pending: false,
  });

  it('an idle or merely-loaded item has no outro to run', () => {
    // `loaded` has been CG ADD-ed but never PLAYed — there is nothing on air yet, so
    // STOP has nothing to ask of it. B-122 — this is NOT the reason Clear-All would
    // skip it, because Clear-All no longer skips anything that holds a layer.
    expect(isOnAir(item('idle'))).toBe(false);
    expect(isOnAir(item('loaded'))).toBe(false);
  });

  it('anything that might be showing something IS stoppable', () => {
    expect(isOnAir(item('on-air'))).toBe(true);
    expect(isOnAir(item('playing'))).toBe(true);
    expect(isOnAir(item('updating'))).toBe(true);
    // B-044 — an item whose true state is UNKNOWN may well be showing something.
    expect(isOnAir(item('unconfirmed'))).toBe(true);
  });
});

describe('stack.clearAll', () => {
  it('takes on-air items off air and KEEPS them on the stack, idle', async () => {
    const mock = emptyMock();
    await loadAndPlay(mock, 'item-a');
    await loadAndPlay(mock, 'item-b');
    const before = mock.stackSnapshot();
    expect(before.filter(isOnAir)).toHaveLength(2);

    const result = mock.clearAll();
    expect(result).toEqual({ ok: true, cleared: 2, attempted: 2, refused: [] });

    // The rows never leave the stack — not even mid-transition, while they are `exiting`.
    expect(mock.stackSnapshot()).toHaveLength(2);

    await settle();

    const after = mock.stackSnapshot();
    // Still there, and now resting idle. That is the entire difference from Remove-All.
    expect(after).toHaveLength(2);
    expect(byId(after, 'item-a').status).toBe('idle');
    expect(byId(after, 'item-b').status).toBe('idle');
    expect(after.filter(isOnAir)).toHaveLength(0);
  });

  it('B-122 — a merely-loaded item is cleared TOO: the cued row is the accepted cost', async () => {
    const mock = emptyMock();
    mock.load('item-loaded', 'tpl-1', {});
    await loadAndPlay(mock, 'item-live');

    // ⭐ THIS TEST ASSERTED THE OPPOSITE, and the assertion was the defect written
    // down: it required Clear-All to spare a row on the strength of its BELIEVED status.
    // That is the same reasoning that spares a whole stack of WRONGLY-idle rows in the
    // emergency the button exists for. The owner's decision (2026-08-12) is that a clear
    // goes to every row the console holds, whatever it believes.
    expect(mock.clearAll()).toEqual({ ok: true, cleared: 2, attempted: 2, refused: [] });
    await settle();

    const after = mock.stackSnapshot();
    expect(after).toHaveLength(2);
    // Both rows are now idle. The cued row lost its pre-rolled producer and will re-load
    // on its next play — deliberately, and it is the cheaper of the two failures.
    expect(byId(after, 'item-loaded').status).toBe('idle');
    expect(byId(after, 'item-live').status).toBe('idle');
  });

  it('sends nothing ONLY with an empty stack — and never calls that a success', () => {
    const mock = emptyMock();

    // Nothing to address at all is the one honest no-op, and it does not come back as
    // `ok: true`. A success report for a no-op is the exact shape of B-122's lie.
    expect(mock.clearAll()).toEqual({ ok: false, cleared: 0, attempted: 0, refused: [] });
    expect(mock.stackSnapshot()).toHaveLength(0);
  });

  it('is NOT Remove-All: the list survives clear, and does not survive remove', async () => {
    const mock = emptyMock();
    await loadAndPlay(mock, 'item-a');

    mock.clearAll();
    expect(mock.stackSnapshot()).toHaveLength(1); // cleared from air, kept in the list

    /*
      🔴 `R-017` — the `settle()` is REQUIRED now, and its absence was hiding something.

      Remove-All is refused while anything is on air OR UNSETTLED, and the clear above lands
      the row on a transient before it rests at `idle`. Without the settle the second half of
      this test was removing a row mid-exit — which is exactly the press R-017 exists to
      refuse. The test's own claim is unchanged and now reads honestly: clear KEEPS the row,
      remove drops it, and remove waits for the clear to finish.
    */
    await settle();
    expect(mock.removeAll()).toMatchObject({ ok: true });
    expect(mock.stackSnapshot()).toHaveLength(0); // dropped from the list
  });

  it('a cleared item can be taken again — the CLEAR destroyed the producer, not the row', async () => {
    const mock = emptyMock();
    await loadAndPlay(mock, 'item-a');
    mock.clearAll();
    await settle();

    expect(mock.take('item-a')).toEqual({ accepted: true });
    await settle();
    expect(isOnAir(byId(mock.stackSnapshot(), 'item-a'))).toBe(true);
  });
});
