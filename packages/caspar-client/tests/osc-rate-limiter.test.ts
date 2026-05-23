import { describe, expect, it } from 'vitest';
import { OscRateLimiter } from '../src/osc/rate-limiter.js';

describe('OscRateLimiter', () => {
  it('emits the first observation per key', () => {
    const rl = new OscRateLimiter();
    expect(rl.shouldEmit({ kind: 'osc.framerate', channel: 1, num: 50, den: 1 })).toBe(true);
  });

  it('suppresses repeated emissions within the budget window', () => {
    let now = 1000;
    const rl = new OscRateLimiter({ 'osc.framerate': 1000 }, () => now);
    expect(rl.shouldEmit({ kind: 'osc.framerate', channel: 1, num: 50, den: 1 })).toBe(true);
    now += 500;
    expect(rl.shouldEmit({ kind: 'osc.framerate', channel: 1, num: 50, den: 1 })).toBe(false);
    now += 600;
    expect(rl.shouldEmit({ kind: 'osc.framerate', channel: 1, num: 50, den: 1 })).toBe(true);
  });

  it('keeps separate budgets per channel', () => {
    const now = 1000;
    const rl = new OscRateLimiter({ 'osc.framerate': 1000 }, () => now);
    rl.shouldEmit({ kind: 'osc.framerate', channel: 1, num: 50, den: 1 });
    expect(rl.shouldEmit({ kind: 'osc.framerate', channel: 2, num: 50, den: 1 })).toBe(true);
  });

  it('does not rate-limit kinds without a budget', () => {
    const rl = new OscRateLimiter({});
    const ev = {
      kind: 'osc.layer.foreground.producer' as const,
      channel: 1,
      layer: 10,
      producer: 'html',
    };
    expect(rl.shouldEmit(ev)).toBe(true);
    expect(rl.shouldEmit(ev)).toBe(true);
    expect(rl.shouldEmit(ev)).toBe(true);
  });

  it('treats zero-budget as unrate-limited', () => {
    const rl = new OscRateLimiter({ 'osc.framerate': 0 });
    expect(rl.shouldEmit({ kind: 'osc.framerate', channel: 1, num: 50, den: 1 })).toBe(true);
    expect(rl.shouldEmit({ kind: 'osc.framerate', channel: 1, num: 50, den: 1 })).toBe(true);
  });

  it('reset() clears all gating state', () => {
    const now = 1000;
    const rl = new OscRateLimiter({ 'osc.framerate': 1000 }, () => now);
    rl.shouldEmit({ kind: 'osc.framerate', channel: 1, num: 50, den: 1 });
    rl.reset();
    expect(rl.shouldEmit({ kind: 'osc.framerate', channel: 1, num: 50, den: 1 })).toBe(true);
  });
});
