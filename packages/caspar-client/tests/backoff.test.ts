import { describe, expect, it } from 'vitest';
import { Backoff } from '../src/session/backoff.js';

describe('Backoff', () => {
  it('produces the canonical 250→500→1000→2000→4000 cap sequence', () => {
    const b = new Backoff(250, 4000);
    expect(b.nextDelay()).toBe(250);
    expect(b.nextDelay()).toBe(500);
    expect(b.nextDelay()).toBe(1000);
    expect(b.nextDelay()).toBe(2000);
    expect(b.nextDelay()).toBe(4000);
    expect(b.nextDelay()).toBe(4000);
    expect(b.nextDelay()).toBe(4000);
  });

  it('reset() returns to the initial delay', () => {
    const b = new Backoff(250, 4000);
    b.nextDelay();
    b.nextDelay();
    b.reset();
    expect(b.nextDelay()).toBe(250);
  });

  it('counts attempts for diagnostics', () => {
    const b = new Backoff(100, 800);
    expect(b.attemptCount).toBe(0);
    b.nextDelay();
    b.nextDelay();
    expect(b.attemptCount).toBe(2);
    b.reset();
    expect(b.attemptCount).toBe(0);
  });
});
