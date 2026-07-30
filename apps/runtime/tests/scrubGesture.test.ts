import { describe, expect, it } from 'vitest';
import { arrowStep } from '../src/renderer/ui/scrubGesture.js';

/**
 * Owner request: the Runtime's numeric and position inputs adjust by horizontal drag
 * and by arrow keys, like the Designer's.
 *
 * `arrowStep` is the whole keyboard half and is pure, so it is pinned here. The DRAG
 * half lives in window pointer listeners and is covered by the E2E, which can
 * actually move a pointer.
 */
describe('arrowStep — keyboard stepping for a numeric field', () => {
  const key = (
    k: string,
    mods: Partial<Record<'shiftKey' | 'ctrlKey' | 'metaKey', boolean>> = {},
  ) => ({
    key: k,
    shiftKey: mods.shiftKey ?? false,
    ctrlKey: mods.ctrlKey ?? false,
    metaKey: mods.metaKey ?? false,
  });

  it('steps up and down by one by default', () => {
    expect(arrowStep(key('ArrowUp'), { value: 10 })).toBe(11);
    expect(arrowStep(key('ArrowDown'), { value: 10 })).toBe(9);
  });

  it('returns null for any other key, so the caller leaves the event alone', () => {
    for (const k of ['ArrowLeft', 'ArrowRight', 'Enter', 'a', 'Tab', 'Escape']) {
      expect(arrowStep(key(k), { value: 10 }), k).toBeNull();
    }
  });

  it('Shift is FINE (a tenth) and Ctrl/Cmd is COARSE (ten) — matching the drag modifiers', () => {
    expect(arrowStep(key('ArrowUp', { shiftKey: true }), { value: 10 })).toBe(10.1);
    expect(arrowStep(key('ArrowDown', { shiftKey: true }), { value: 10 })).toBe(9.9);
    expect(arrowStep(key('ArrowUp', { ctrlKey: true }), { value: 10 })).toBe(20);
    expect(arrowStep(key('ArrowUp', { metaKey: true }), { value: 10 })).toBe(20);
  });

  it('honours a custom step', () => {
    expect(arrowStep(key('ArrowUp'), { value: 0, step: 5 })).toBe(5);
    expect(arrowStep(key('ArrowUp', { shiftKey: true }), { value: 0, step: 5 })).toBe(0.5);
  });

  it('clamps to min/max rather than stepping past them', () => {
    expect(arrowStep(key('ArrowDown'), { value: 0, min: 0 })).toBe(0);
    expect(arrowStep(key('ArrowUp'), { value: 100, max: 100 })).toBe(100);
    expect(arrowStep(key('ArrowDown'), { value: 0.5, min: 0 })).toBe(0);
  });

  it('does NOT accumulate float error — 0.1 steps stay clean', () => {
    // The naive form gives 10.299999999999999 after two Shift-steps; 4dp rounding
    // is what keeps the displayed value readable.
    let v = 10;
    for (let i = 0; i < 3; i++) {
      v = arrowStep(key('ArrowUp', { shiftKey: true }), { value: v }) ?? v;
    }
    expect(v).toBe(10.3);
  });

  it('steps a negative value the intuitive way (up means larger, not "away from zero")', () => {
    expect(arrowStep(key('ArrowUp'), { value: -5 })).toBe(-4);
    expect(arrowStep(key('ArrowDown'), { value: -5 })).toBe(-6);
  });
});
