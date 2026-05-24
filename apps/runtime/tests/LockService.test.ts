import { describe, expect, it } from 'vitest';
import { LockService } from '../src/main/services/LockService.js';

describe('LockService', () => {
  it('starts not engaged', () => {
    const lock = new LockService();
    expect(lock.getState()).toEqual({ engaged: false });
  });

  it('engages with a PIN and reports operator reason by default', () => {
    const lock = new LockService({ now: () => new Date('2026-05-24T12:00:00.000Z') });
    expect(lock.engage('1234')).toEqual({ ok: true });
    expect(lock.getState()).toEqual({
      engaged: true,
      reason: 'operator',
      engagedAt: '2026-05-24T12:00:00.000Z',
    });
  });

  it('engage emits state-changed', () => {
    const lock = new LockService();
    let captured: { engaged: boolean } | null = null;
    lock.on('state-changed', (s) => (captured = s));
    lock.engage('1234');
    expect(captured).toMatchObject({ engaged: true });
  });

  it('release with correct PIN unlocks', () => {
    const lock = new LockService();
    lock.engage('1234');
    expect(lock.release('1234')).toEqual({ ok: true });
    expect(lock.getState().engaged).toBe(false);
  });

  it('release with wrong PIN returns pin-mismatch and stays engaged', () => {
    const lock = new LockService();
    lock.engage('1234');
    expect(lock.release('9999')).toEqual({ ok: false, reason: 'pin-mismatch' });
    expect(lock.getState().engaged).toBe(true);
  });

  it("release when not engaged returns 'not-engaged'", () => {
    const lock = new LockService();
    expect(lock.release('1234')).toEqual({ ok: false, reason: 'not-engaged' });
  });

  it('engage when already engaged returns ok=false', () => {
    const lock = new LockService();
    lock.engage('1234');
    expect(lock.engage('5678')).toEqual({ ok: false });
  });

  it('records reason when explicitly engaged', () => {
    const lock = new LockService({ now: () => new Date('2026-05-24T12:00:00.000Z') });
    lock.engage('1234', 'auto-idle');
    expect(lock.getState()).toEqual({
      engaged: true,
      reason: 'auto-idle',
      engagedAt: '2026-05-24T12:00:00.000Z',
    });
  });
});
