import { describe, expect, it } from 'vitest';
import { repeaterRowLimit } from '../src/index.js';

/**
 * 🔴 `B-106` — the ONE reading of a repeater's row limit, shared by the page's build-time stamp,
 * the driver's restamp and the Designer's row editor. An exported page never re-parses its scene,
 * so a hand-edited value reaches it unvalidated: anything that is not a number of at least 1 is no
 * limit (the Designer's "0 = unlimited"), and a fraction is floored.
 */
describe('B-106 — repeaterRowLimit', () => {
  it('a whole number of at least 1 is the limit', () => {
    expect(repeaterRowLimit({ maxItems: 1 })).toBe(1);
    expect(repeaterRowLimit({ maxItems: 3 })).toBe(3);
  });

  it('absent is no limit', () => {
    expect(repeaterRowLimit({})).toBeUndefined();
    expect(repeaterRowLimit({ maxItems: undefined })).toBeUndefined();
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 0.5, null])(
    'a value the schema refuses (%s) is no limit — never zero rows',
    (value) => {
      expect(repeaterRowLimit({ maxItems: value })).toBeUndefined();
    },
  );

  it('a fraction is floored', () => {
    expect(repeaterRowLimit({ maxItems: 2.5 })).toBe(2);
  });
});
