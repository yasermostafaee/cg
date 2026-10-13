import { describe, expect, it } from 'vitest';
import { playoutBadge } from '../src/renderer/features/shell/playout-badge.js';

/** `DESIGNER-FIX-0905` — one wording rule for the landing card's playout badge. */
describe('playoutBadge', () => {
  it('a manual composition without an out point stays until stopped', () => {
    expect(playoutBadge({ mode: 'static', hold: 'operator', hasOutPoint: false })).toBe(
      'stays until stopped',
    );
  });

  it('a manual composition with an out point holds, then exits', () => {
    expect(playoutBadge({ mode: 'manual', hold: 'operator', hasOutPoint: true })).toBe(
      'holds until stopped, then exits',
    );
  });

  it('auto-out names the timed hold in seconds', () => {
    expect(
      playoutBadge({ mode: 'auto-out', hold: 'timed', holdSeconds: 6, hasOutPoint: true }),
    ).toBe('auto-out after 6 s');
  });

  it('a content-driven hold says so', () => {
    expect(playoutBadge({ mode: 'auto-out', hold: 'content-driven', hasOutPoint: true })).toBe(
      'content-driven hold',
    );
  });

  it('a nested loop-cycle is appended, rounded to the second', () => {
    expect(
      playoutBadge({
        mode: 'manual',
        hold: 'operator',
        hasOutPoint: true,
        nestedCycleSeconds: 10.4,
      }),
    ).toBe('holds until stopped, then exits · loops every ~10 s');
  });

  it('a loop-cycle entry names its own hold', () => {
    expect(
      playoutBadge({ mode: 'loop-cycle', hold: 'timed', holdSeconds: 8, hasOutPoint: true }),
    ).toBe('loops · 8 s hold');
  });
});
