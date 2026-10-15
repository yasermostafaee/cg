import { describe, expect, it } from 'vitest';
import { machineClock, sameClock } from '../src/index.js';

/**
 * 🔴 `DELTA-RUN-NEXT-VERSION-01-C` — the bridge host's clock is ONE reading both sides make, so it must
 * survive the wire unchanged. At UTC, `-getTimezoneOffset()` is `-0`, which JSON writes as `0`: the
 * reading came back as a different value from the one sent, and CI's UTC host caught it (run
 * 38668193061). Pinned with a stubbed offset, so the test does not depend on the host's zone.
 */

const at = (offset: number): Date => ({ getTimezoneOffset: () => offset }) as unknown as Date;

describe('machineClock', () => {
  it('🔴 at UTC the offset is +0, never -0 — and so it reads back from the wire unchanged', () => {
    const clock = machineClock(at(0));
    expect(Object.is(clock.offsetMinutes, 0)).toBe(true);
    const wire = JSON.parse(JSON.stringify({ clock })) as unknown;
    expect((wire as { clock: unknown }).clock).toEqual(clock);
  });

  it('east of Greenwich is a positive offset (Tehran: +210)', () => {
    expect(machineClock(at(-210)).offsetMinutes).toBe(210);
  });

  it('two readings of one machine are the same clock; another offset is not', () => {
    const clock = machineClock(at(0));
    expect(sameClock(clock, machineClock(at(0)))).toBe(true);
    expect(sameClock(clock, machineClock(at(-210)))).toBe(false);
  });
});
