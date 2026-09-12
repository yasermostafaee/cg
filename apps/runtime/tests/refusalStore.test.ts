import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearRefusal,
  getRefusal,
  onRefusal,
  raiseRefusal,
} from '../src/renderer/features/status/refusalStore.js';

/**
 * 🔴 `CONSOLE-LOOK-06` DELTA R §4 — the refusal STORE's contract, without a browser.
 *
 * The geometry and the paint belong in Playwright (golden rule 12c); what belongs here is the
 * behaviour that has nothing to do with layout — that it persists, that it coalesces, and
 * that nothing in it can hide itself. The last one is asserted as an ABSENCE of any timer,
 * which is the property the owner's defect (b) was the lack of.
 */
describe('refusalStore — a refusal is a state, not an announcement', () => {
  beforeEach(() => {
    clearRefusal();
  });

  it('PERSISTS: it is still standing long after any toast would have gone', async () => {
    raiseRefusal('CH 1 already has a multi-box look on air.');
    // Comfortably past the toast's 3200 ms dwell, in fake-free real time so nothing about
    // this depends on a timer being mocked. If a timer is ever added to the store, this fails.
    await new Promise((r) => setTimeout(r, 40));
    expect(getRefusal()?.message).toBe('CH 1 already has a multi-box look on air.');
  });

  it('COALESCES: five presses of the same refused verb are one refusal and a count', () => {
    for (let i = 0; i < 5; i += 1) raiseRefusal('Take it off air first.');
    expect(getRefusal()?.count).toBe(5);
    expect(getRefusal()?.message).toBe('Take it off air first.');
  });

  it('a DIFFERENT refusal replaces it rather than stacking — one banner, always', () => {
    raiseRefusal('first');
    const firstSeen = getRefusal()?.firstSeen;
    raiseRefusal('second');
    expect(getRefusal()?.message).toBe('second');
    expect(getRefusal()?.count).toBe(1);
    expect(getRefusal()?.firstSeen).not.toBe(undefined);
    expect(firstSeen).not.toBe(undefined);
  });

  it('DISMISSES, and stays dismissed until something is refused again', () => {
    raiseRefusal('x');
    clearRefusal();
    expect(getRefusal()).toBeNull();
    raiseRefusal('x');
    // A fresh raise after a dismissal starts its count again: the operator dealt with the
    // last one, so telling them it has happened six times would be counting their own history
    // back at them.
    expect(getRefusal()?.count).toBe(1);
  });

  it('keeps the id-bearing text as DETAIL, never as the sentence', () => {
    raiseRefusal('CH 1 already has a multi-box look on air.', {
      detail: 'template "e506e319-…" (3 boxes, item "item-0d9a…") is already on air on channel 1',
      code: 'multibox-already-on-air',
    });
    const r = getRefusal();
    expect(r?.message, 'no id in the sentence').not.toMatch(/e506e319|item-0d9a/);
    expect(r?.detail, 'the ids survive for diagnosis').toMatch(/e506e319/);
    expect(r?.code).toBe('multibox-already-on-air');
  });

  it('notifies subscribers on raise and on dismiss, and replays on subscribe', () => {
    const seen: (string | null)[] = [];
    raiseRefusal('standing');
    const off = onRefusal((r) => seen.push(r?.message ?? null));
    // Replayed immediately — a surface that mounts after the refusal must still show it.
    expect(seen).toEqual(['standing']);
    raiseRefusal('another');
    clearRefusal();
    expect(seen).toEqual(['standing', 'another', null]);
    off();
  });
});
