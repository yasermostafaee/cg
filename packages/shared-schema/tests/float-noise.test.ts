import { describe, expect, it } from 'vitest';
import { NOISE_ULPS, lessThanBeyondNoise, noiseFloor } from '../src/float-noise.js';

/**
 * ⭐ **`B-180` — the noise floor is a NOISE FILTER, and these tests are what keeps it one.**
 *
 * The guard exists because a Live Source overlap of 5.55e-17 px blocked the export while the
 * author could see nothing wrong. The danger in fixing that is over-correcting into a product
 * tolerance — a number that decides how close two holes may sit, which is an on-air judgement
 * `B-180` explicitly left to the owner.
 *
 * 🔴 So the tests pin BOTH ends: dust is ignored, and anything an author could act on still
 * fires. If a future edit raises this to a pixel figure, the 0.01 px case below goes red.
 */

describe('B-180 — lessThanBeyondNoise', () => {
  it('EXACTLY EQUAL is not less — flush abutment stays a non-overlap', () => {
    // The property `B-180` insists on: the strict `<` is correct and is not the defect. Touching
    // edges must not be an overlap, or a flush multibox layout becomes unbuildable.
    expect(lessThanBeyondNoise(600, 600)).toBe(false);
    expect(lessThanBeyondNoise(0, 0)).toBe(false);
    expect(lessThanBeyondNoise(-42.5, -42.5)).toBe(false);
  });

  it('🔴 DUST is not less — the exact residue B-180 measured', () => {
    // `0.1 + 0.2 === 0.30000000000000004` is the class in one line: a box whose edge is computed
    // as a sum lands a fraction of a ULP past its neighbour and "overlaps" it.
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(lessThanBeyondNoise(0.3, 0.1 + 0.2)).toBe(false);
    // …and the magnitude the item actually reports, at scene scale.
    expect(lessThanBeyondNoise(124, 124.00000000000001)).toBe(false);
    expect(lessThanBeyondNoise(599.9999999999999, 600)).toBe(false);
  });

  it('🔴 A REAL 0.01 px difference IS less — the guard must not blunt the real case', () => {
    // Ten orders of magnitude above the floor. This is the assertion that turns red if anyone
    // ever "simplifies" the guard into a pixel tolerance.
    expect(lessThanBeyondNoise(599.99, 600)).toBe(true);
    expect(lessThanBeyondNoise(0, 0.01)).toBe(true);
    // …and a whole pixel, obviously.
    expect(lessThanBeyondNoise(599, 600)).toBe(true);
  });

  it('a difference far BELOW a pixel but far ABOVE the noise still fires', () => {
    // 1e-6 px is invisible, but it is not arithmetic dust — it is a number someone computed. The
    // guard deliberately does not judge visibility; that would be the product decision.
    expect(lessThanBeyondNoise(600 - 1e-6, 600)).toBe(true);
  });

  it('greater-than and equal are both false — the operator is not widened', () => {
    expect(lessThanBeyondNoise(601, 600)).toBe(false);
    expect(lessThanBeyondNoise(600.01, 600)).toBe(false);
  });

  describe('the floor is RELATIVE, because a double’s precision is', () => {
    it('scales with magnitude', () => {
      // One ULP at 4 px is ~8.9e-16; at 4000 px it is ~9.1e-13. A fixed absolute floor would be
      // far too tight at the top of a 4K frame and needlessly loose at the origin.
      expect(noiseFloor(4000, 4000)).toBeGreaterThan(noiseFloor(4, 4));
      expect(noiseFloor(4000, 4000) / noiseFloor(4, 4)).toBeCloseTo(1000, 6);
    });

    it('never collapses to zero near the origin', () => {
      // The `Math.max(1, …)` floor: without it, comparing two values around 0 would get an
      // epsilon of 0 and the guard would silently stop guarding exactly where sums are smallest.
      expect(noiseFloor(0, 0)).toBeGreaterThan(0);
      expect(noiseFloor(0, 0)).toBe(Number.EPSILON * NOISE_ULPS);
    });

    it('takes the LARGER operand, so a small value compared to a big one is judged at big scale', () => {
      expect(noiseFloor(1, 4000)).toBe(noiseFloor(4000, 4000));
    });

    it('🔴 the floor stays astronomically below anything an author can act on', () => {
      // The one-line proof that this is a noise filter: at the largest scene magnitude in play,
      // the floor is still nine orders of magnitude under 0.01 px.
      expect(noiseFloor(4000, 4000)).toBeLessThan(0.01 / 1e9);
    });
  });

  it('🔴 survives the REAL generator — a composition instance’s preScale', () => {
    /*
      Not a contrived chain: this is `B-180`'s own first generator, at values that reproduce the
      exact residue the item quotes. A 1000-wide instance of a 1920-wide composition gives
      `preScale = 1000/1920`, and an authored-INTEGER edge at 124 comes back through it as
      124.00000000000001 — the number in the item, arrived at from integers.
    */
    const preScale = 1000 / 1920;
    const roundTripped = (124 * preScale) / preScale;
    expect(roundTripped).toBe(124.00000000000001);
    expect(roundTripped).not.toBe(124);
    // A neighbour whose edge is an honest 124 therefore "overlaps" it — unless the guard holds.
    expect(124 < roundTripped).toBe(true); // the raw operator says yes …
    expect(lessThanBeyondNoise(124, roundTripped)).toBe(false); // … the guarded one says no.

    // …and the same generator drifts the OTHER way for a different instance width, which is why
    // the guard has to be symmetric rather than a one-sided fudge.
    const under = (124 * (640 / 1920)) / (640 / 1920);
    expect(under).toBe(123.99999999999999);
    expect(lessThanBeyondNoise(under, 124)).toBe(false);
  });
});
