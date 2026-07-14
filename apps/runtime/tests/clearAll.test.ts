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

describe('isOnAir — one predicate, shared by the row and the header', () => {
  const item = (status: StackItemState['status']): StackItemState => ({
    itemId: 'i',
    templateId: 't',
    fields: {},
    status,
    pending: false,
  });

  it('an idle or merely-loaded item has nothing to clear', () => {
    // `loaded` has been CG ADD-ed but never PLAYed — there is nothing on air yet.
    expect(isOnAir(item('idle'))).toBe(false);
    expect(isOnAir(item('loaded'))).toBe(false);
  });

  it('anything that might be showing something IS clearable', () => {
    expect(isOnAir(item('on-air'))).toBe(true);
    expect(isOnAir(item('playing'))).toBe(true);
    expect(isOnAir(item('updating'))).toBe(true);
    // B-044 — an item whose true state is UNKNOWN is precisely the one an operator most
    // needs to be able to clear.
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
    expect(result).toEqual({ ok: true, cleared: 2 });

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

  it('leaves a merely-loaded item alone — it was never on air', async () => {
    const mock = emptyMock();
    mock.load('item-loaded', 'tpl-1', {});
    await loadAndPlay(mock, 'item-live');

    expect(mock.clearAll()).toEqual({ ok: true, cleared: 1 });
    await settle();

    const after = mock.stackSnapshot();
    expect(after).toHaveLength(2);
    // Untouched: still loaded and ready to take, not knocked back to idle.
    expect(byId(after, 'item-loaded').status).toBe('loaded');
    expect(byId(after, 'item-live').status).toBe('idle');
  });

  it('is a no-op when nothing is on air', () => {
    const mock = emptyMock();
    mock.load('item-loaded', 'tpl-1', {});

    expect(mock.clearAll()).toEqual({ ok: true, cleared: 0 });
    expect(mock.stackSnapshot()).toHaveLength(1);
  });

  it('is NOT Remove-All: the list survives clear, and does not survive remove', async () => {
    const mock = emptyMock();
    await loadAndPlay(mock, 'item-a');

    mock.clearAll();
    expect(mock.stackSnapshot()).toHaveLength(1); // cleared from air, kept in the list

    mock.removeAll();
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
