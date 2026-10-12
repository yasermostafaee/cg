import { describe, expect, it } from 'vitest';
import {
  LICENSE_POLL_MS,
  LICENSE_SIGN_IN_FLOOR_MS,
  PlayoutLicenseReader,
} from '../src/playout-license.js';

/**
 * 🔴 `DONGLE-RECOVER-01` H3 — **WHILE THE LICENSE READS FALSE, THE BRIDGE LOOKS AGAIN AT THE FLOOR.**
 *
 * A take reads the license this bridge HOLDS. The Playout says licensed again ~10 s after its dongle is back
 * (LICENSE §4), but the reader looked only every {@link LICENSE_POLL_MS}: for up to a minute after the
 * return every take was refused with the Playout's old sentence — CG stricter than the Playout, which the
 * owner's rule forbids. While the held value is `licensed:false` the reader now reads at
 * {@link LICENSE_SIGN_IN_FLOOR_MS}. While it is `licensed:true` the cadence is unchanged: a removal is
 * still seen within a minute (changing that is the owner's call, not this fix's).
 */

/** A Playout whose license answer the test sets; counts the reads. */
function playout(): {
  fetchImpl: typeof fetch;
  set: (licensed: boolean) => void;
  reads: () => number;
} {
  let licensed = true;
  let reads = 0;
  const fetchImpl = ((): Promise<Response> => {
    reads += 1;
    const body = licensed
      ? { licensed: true, reason: null, playoutState: 'valid' }
      : { licensed: false, reason: 'missing', playoutState: 'missing' };
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  }) as typeof fetch;
  return { fetchImpl, set: (v) => (licensed = v), reads: () => reads };
}

/** Tick the reader once a second (as its own ticker does) for `ms`, moving the clock. */
async function run(
  reader: PlayoutLicenseReader,
  clock: { t: number },
  ms: number,
  until?: () => boolean,
): Promise<number> {
  const start = clock.t;
  for (let left = ms; left > 0; left -= 1_000) {
    clock.t += 1_000;
    await reader.refresh();
    if (until?.() === true) break;
  }
  return clock.t - start;
}

describe('DONGLE-RECOVER-01 H3 — the license reader after a dongle returns', () => {
  it('🔴 the Playout says licensed again: the bridge holds it within the 5 s floor, not the 60 s poll', async () => {
    const clock = { t: 0 };
    const p = playout();
    const reader = new PlayoutLicenseReader('http://playout.invalid/api/cg/license', () => 'tok', {
      fetchImpl: p.fetchImpl,
      now: () => clock.t,
      log: () => undefined,
    });
    p.set(false);
    await reader.refresh();
    expect(reader.license()?.licensed).toBe(false);

    p.set(true); // the dongle is back
    const took = await run(reader, clock, 120_000, () => reader.license()?.licensed === true);
    expect(reader.license()?.licensed).toBe(true);
    expect(took, `measured: ${String(took)} ms`).toBeLessThanOrEqual(LICENSE_SIGN_IN_FLOOR_MS);
  });

  it('control — while licensed, the cadence is the Playout’s minute: one read per 60 s, not one per 5 s', async () => {
    const clock = { t: 0 };
    const p = playout();
    const reader = new PlayoutLicenseReader('http://playout.invalid/api/cg/license', () => 'tok', {
      fetchImpl: p.fetchImpl,
      now: () => clock.t,
      log: () => undefined,
    });
    await reader.refresh();
    expect(p.reads()).toBe(1);
    await run(reader, clock, 5 * LICENSE_POLL_MS - 1_000);
    expect(p.reads(), 'five minutes of ticks while licensed').toBe(5);
  });

  it('measured — on removal, the held value turns false at the next minute read (unchanged; the owner decides)', async () => {
    const clock = { t: 0 };
    const p = playout();
    const reader = new PlayoutLicenseReader('http://playout.invalid/api/cg/license', () => 'tok', {
      fetchImpl: p.fetchImpl,
      now: () => clock.t,
      log: () => undefined,
    });
    await reader.refresh();
    clock.t += 1_000;
    p.set(false); // pulled one second after a read: the worst case
    const took = await run(reader, clock, 120_000, () => reader.license()?.licensed === false);
    expect(took).toBeLessThanOrEqual(LICENSE_POLL_MS);
    expect(took).toBeGreaterThan(LICENSE_POLL_MS - 2_000);
  });

  it('while unlicensed, the floor is still a floor: never more than one read per 5 s', async () => {
    const clock = { t: 0 };
    const p = playout();
    p.set(false);
    const reader = new PlayoutLicenseReader('http://playout.invalid/api/cg/license', () => 'tok', {
      fetchImpl: p.fetchImpl,
      now: () => clock.t,
      log: () => undefined,
    });
    await reader.refresh();
    await run(reader, clock, 60_000);
    expect(p.reads()).toBe(1 + 60_000 / LICENSE_SIGN_IN_FLOOR_MS);
  });
});
