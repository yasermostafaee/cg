import { describe, expect, it } from 'vitest';
import { describePlayout } from './describe-playout.js';
import { getStarter } from './index.js';

/**
 * `DESIGNER-FIX-0905` — the landing badge is DERIVED from each starter's entry composition.
 * These pin the five derivations against the scenes, so a starter whose playout changes
 * changes its badge with it — and so the badge can never say what the scene does not do.
 */
const summary = (id: string) => {
  const s = getStarter(id);
  if (s === null) throw new Error(`no starter ${id}`);
  return describePlayout(s.scene);
};

describe('describePlayout — the five starters', () => {
  it('irib-news: manual with an out point — holds until stopped, then exits', () => {
    expect(summary('irib-news')).toEqual({ mode: 'manual', hold: 'operator', hasOutPoint: true });
  });

  it('ticker: manual with an out point; the strap’s one-second blink two levels down is NOT reported', () => {
    expect(summary('ticker')).toEqual({ mode: 'manual', hold: 'operator', hasOutPoint: true });
  });

  it('logo-bug: manual entry whose DIRECT instance loops every ~10 s (the sting)', () => {
    const s = summary('logo-bug');
    expect(s).toMatchObject({ mode: 'manual', hold: 'operator', hasOutPoint: true });
    // 120 frames at 50 fps + an 8 s timed hold = 10.4 s.
    expect(s.nestedCycleSeconds).toBeCloseTo(10.4, 5);
  });

  it('title: auto-out after a 6 s timed hold', () => {
    expect(summary('title')).toEqual({
      mode: 'auto-out',
      hold: 'timed',
      holdSeconds: 6,
      hasOutPoint: true,
    });
  });

  it('sequence: auto-out with a content-driven hold', () => {
    expect(summary('sequence')).toEqual({
      mode: 'auto-out',
      hold: 'content-driven',
      hasOutPoint: true,
    });
  });
});
