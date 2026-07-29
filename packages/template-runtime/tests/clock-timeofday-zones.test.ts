import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ClockZones } from '@cg/shared-schema';
import {
  ClockDriver,
  clockInitialText,
  pickByThreshold,
  remainingMsOf,
  resolveTimeOfDay,
  type ClockDriverOptions,
} from '../src/clock-driver.js';

/**
 * D-141 — the driver half: a `timeofday` target (next local occurrence, pinned once
 * per run), the latched zone publication, and `retarget()`. Everything runs on a
 * fake {@link RuntimeClock}, so no test waits on real time.
 *
 * Every expected instant is built with the SAME local-field constructor the
 * implementation uses (`AT` below), so the suite is correct in any machine time
 * zone; the DST block forces a zone explicitly and restores it.
 */

/** A local-calendar instant — TZ-independent by construction on both sides. */
function AT(y: number, mo: number, d: number, h: number, mi: number, s = 0): number {
  return new Date(y, mo, d, h, mi, s, 0).getTime();
}

/** Fake rAF + timer clock (same shape as the D-027 suite), startable at any epoch. */
function makeClock(startMs = 0) {
  let ms = startMs;
  let rafQueue: ((ts: number) => void)[] = [];
  return {
    now: () => ms,
    raf: (cb: (ts: number) => void) => {
      rafQueue.push(cb);
      return rafQueue.length;
    },
    cancel: () => {
      rafQueue = [];
    },
    advance: (delta: number) => {
      ms += delta;
      const cbs = rafQueue;
      rafQueue = [];
      for (const cb of cbs) cb(ms);
    },
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
}

function completionFlag(driver: ClockDriver): { done: boolean; count: number } {
  const out = { done: false, count: 0 };
  void driver.whenComplete().then(() => {
    out.done = true;
    out.count += 1;
  });
  return out;
}

/** The 4-zone 60/30/10 preset — base + three steps, 3 boundaries, 4 zones. */
const PRESET: ClockZones = {
  base: { key: 'normal', color: '#00c853' },
  steps: [
    { atOrBelowMs: 3_600_000, key: 'caution', color: '#ffd600' },
    { atOrBelowMs: 1_800_000, key: 'warning', color: '#ff9100' },
    { atOrBelowMs: 600_000, key: 'critical', color: '#d50000' },
  ],
};

function make(
  opts: Partial<ClockDriverOptions> & Pick<ClockDriverOptions, 'mode'>,
  startMs = 0,
): {
  clock: ReturnType<typeof makeClock>;
  node: HTMLElement;
  root: HTMLElement;
  driver: ClockDriver;
} {
  const clock = makeClock(startMs);
  const node = document.createElement('span');
  const root = document.createElement('div');
  document.body.appendChild(root);
  root.appendChild(node);
  const driver = new ClockDriver({
    node,
    format: 'HH:mm:ss',
    digits: 'latin',
    clock,
    zoneRoot: root,
    ...opts,
  });
  return { clock, node, root, driver };
}

/** Record every `data-cg-zone` write on the scope root, in order. */
function instrumentZoneWrites(root: HTMLElement): { writes: string[] } {
  const out: { writes: string[] } = { writes: [] };
  const target = root as unknown as {
    setAttribute: (name: string, value: string) => void;
    removeAttribute: (name: string) => void;
  };
  const set = root.setAttribute.bind(root);
  const remove = root.removeAttribute.bind(root);
  target.setAttribute = (name, value): void => {
    if (name === 'data-cg-zone') out.writes.push(value);
    set(name, value);
  };
  target.removeAttribute = (name): void => {
    if (name === 'data-cg-zone') out.writes.push('(cleared)');
    remove(name);
  };
  return out;
}

const zoneOf = (root: HTMLElement): string | null => root.getAttribute('data-cg-zone');

/**
 * Count `textContent` writes. (Deliberately a local copy of the D-027 suite's
 * helper: instrumentation, not a predicate — nothing about the product's behaviour
 * is being re-derived here.)
 */
function instrumentTextWrites(node: HTMLElement): { count: number } {
  const out = { count: 0 };
  let proto: object | null = Object.getPrototypeOf(node) as object | null;
  let desc: PropertyDescriptor | undefined;
  while (proto !== null && desc === undefined) {
    desc = Object.getOwnPropertyDescriptor(proto, 'textContent');
    proto = Object.getPrototypeOf(proto) as object | null;
  }
  const get = desc?.get;
  const set = desc?.set;
  if (get === undefined || set === undefined) throw new Error('textContent descriptor not found');
  Object.defineProperty(node, 'textContent', {
    configurable: true,
    get(): unknown {
      return get.call(this) as unknown;
    },
    set(v: unknown) {
      out.count += 1;
      set.call(this, v);
    },
  });
  return out;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

// — 2.1 / 2.6 / 2.7 — resolveTimeOfDay ————————————————————————————————————

describe('resolveTimeOfDay — next local occurrence (D-141)', () => {
  const NOW = AT(2026, 6, 28, 19, 0); // 2026-07-28, 19:00 machine-local

  it("takes TODAY's occurrence when it is still ahead", () => {
    expect(resolveTimeOfDay('20:32', NOW)).toBe(AT(2026, 6, 28, 20, 32));
  });

  it("takes TOMORROW's occurrence when today's has passed", () => {
    expect(resolveTimeOfDay('05:00', NOW)).toBe(AT(2026, 6, 29, 5, 0));
  });

  it('honours an optional :ss field', () => {
    expect(resolveTimeOfDay('20:32:45', NOW)).toBe(AT(2026, 6, 28, 20, 32, 45));
  });

  it('an occurrence exactly EQUAL to now counts as ARRIVED, not a fresh full day', () => {
    const exact = AT(2026, 6, 28, 20, 32);
    // Today's, i.e. remaining 0 — NOT tomorrow's. A countdown to a time that is
    // happening right now must never read 23:59:59 on air.
    expect(resolveTimeOfDay('20:32', exact)).toBe(exact);
    expect(resolveTimeOfDay('20:32', exact + 1)).toBe(AT(2026, 6, 29, 20, 32));
  });

  it('an unparseable time degrades to "arrived" rather than throwing (never fail on air)', () => {
    expect(resolveTimeOfDay('24:00', NOW)).toBe(NOW);
    expect(resolveTimeOfDay('', NOW)).toBe(NOW);
    expect(resolveTimeOfDay('nonsense', NOW)).toBe(NOW);
  });

  it('the resolved instant always carries the REQUESTED local wall-clock fields', () => {
    const d = new Date(resolveTimeOfDay('03:30:07', NOW));
    expect([d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([3, 30, 7]);
  });
});

describe('resolveTimeOfDay — DST is resolved by the platform, not by +24h (D-141)', () => {
  const originalTz = process.env['TZ'];
  afterEach(() => {
    // DELETE when there was no TZ to begin with: assigning `undefined` to a
    // process.env key stores the STRING "undefined", which leaves every later test
    // resolving local calendar fields in the wrong zone.
    if (originalTz === undefined) delete process.env['TZ'];
    else process.env['TZ'] = originalTz;
  });

  it('a SPRING-FORWARD roll advances 23 real hours, keeping the local time', () => {
    process.env['TZ'] = 'Europe/London';
    // 2026-03-29 is the short (23-hour) local day: 01:00 GMT → 02:00 BST.
    const now = AT(2026, 2, 28, 12, 0); // the day before, after 11:30
    const resolved = resolveTimeOfDay('11:30', now);
    expect(resolved).toBe(AT(2026, 2, 29, 11, 30));
    // The local fields are what was asked for…
    const d = new Date(resolved);
    expect([d.getHours(), d.getMinutes()]).toEqual([11, 30]);
    // …and the roll cost 23 REAL hours, not the 24 a fixed-ms day would have added.
    expect(resolved - AT(2026, 2, 28, 11, 30)).toBe(23 * 3_600_000);
  });

  it('a FALL-BACK roll advances 25 real hours, keeping the local time', () => {
    process.env['TZ'] = 'Europe/London';
    // 2026-10-25 is the long (25-hour) local day: 02:00 BST → 01:00 GMT.
    const now = AT(2026, 9, 24, 12, 0);
    const resolved = resolveTimeOfDay('11:30', now);
    expect(resolved).toBe(AT(2026, 9, 25, 11, 30));
    const d = new Date(resolved);
    expect([d.getHours(), d.getMinutes()]).toEqual([11, 30]);
    expect(resolved - AT(2026, 9, 24, 11, 30)).toBe(25 * 3_600_000);
  });
});

// — 2.2 / 2.8 / 2.9 — the pinned deadline ————————————————————————————————

describe('a timeofday countdown is absolute and PINNED per run (D-141)', () => {
  it('counts down to the next local occurrence and paints the initial remaining', () => {
    const h = make(
      { mode: 'countdown', target: { kind: 'timeofday', time: '20:32' } },
      AT(2026, 6, 28, 19, 0),
    );
    h.driver.start();
    expect(h.node.textContent).toBe('01:32:00'); // 19:00 → 20:32
    h.clock.advance(60_000);
    expect(h.node.textContent).toBe('01:31:00');
  });

  it('is ABSOLUTE — isAbsolute is true, so the runtime ticks it from the play cascade', () => {
    const h = make(
      { mode: 'countdown', target: { kind: 'timeofday', time: '20:32' } },
      AT(2026, 6, 28, 19, 0),
    );
    expect(h.driver.isAbsolute).toBe(true);
  });

  it('the static build-time paint resolves the same way (clockInitialText)', () => {
    expect(
      clockInitialText(
        {
          mode: 'countdown',
          format: 'HH:mm:ss',
          digits: 'latin',
          target: { kind: 'timeofday', time: '20:32' },
        },
        AT(2026, 6, 28, 19, 0),
      ),
    ).toBe('01:32:00');
  });

  it('the deadline does NOT roll forward at zero — it clamps, completes ONCE, and stops', async () => {
    const h = make(
      { mode: 'countdown', target: { kind: 'timeofday', time: '20:32' } },
      AT(2026, 6, 28, 20, 31, 58),
    );
    const done = completionFlag(h.driver);
    h.driver.start();
    expect(h.node.textContent).toBe('00:00:02');
    h.clock.advance(2000);
    expect(h.node.textContent).toBe('00:00:00');
    await flush();
    expect(done.done).toBe(true);
    expect(done.count).toBe(1);

    // Past the deadline the remaining keeps going NEGATIVE — the pin never
    // re-resolves to tomorrow's occurrence, which is what would make the display
    // jump from 00:00 back to a full day.
    h.clock.advance(3_600_000);
    expect(h.node.textContent).toBe('00:00:00');
    expect(remainingMsOf(h.driver)).toBe(-3_600_000);
    await flush();
    expect(done.count).toBe(1);
  });

  it('a pause never delays the deadline — resume shows the TRUE remaining', () => {
    const h = make(
      { mode: 'countdown', target: { kind: 'timeofday', time: '20:32' } },
      AT(2026, 6, 28, 20, 30, 0),
    );
    h.driver.start();
    expect(h.node.textContent).toBe('00:02:00');
    h.clock.advance(30_000);
    expect(h.node.textContent).toBe('00:01:30');
    h.driver.pause();
    h.clock.advance(60_000); // the real deadline keeps approaching while paused
    h.driver.resume();
    expect(h.node.textContent).toBe('00:00:30'); // true remaining, not 00:01:30
  });

  it('a run started EXACTLY at the target arrives immediately (remaining 0)', async () => {
    const h = make(
      { mode: 'countdown', target: { kind: 'timeofday', time: '20:32' } },
      AT(2026, 6, 28, 20, 32, 0),
    );
    const done = completionFlag(h.driver);
    h.driver.start();
    expect(h.node.textContent).toBe('00:00:00');
    await flush();
    expect(done.done).toBe(true);
  });
});

// — 2.3 — the shared helpers ——————————————————————————————————————————————

describe('pickByThreshold — helper 3, on the DISPLAYED quantum (D-141)', () => {
  it('selects the TIGHTEST covering step, not the widest', () => {
    expect(pickByThreshold(PRESET.steps, 5_400_000)).toBeUndefined(); // 90 min → base
    expect(pickByThreshold(PRESET.steps, 2_700_000)?.key).toBe('caution'); // 45 min
    expect(pickByThreshold(PRESET.steps, 1_200_000)?.key).toBe('warning'); // 20 min
    expect(pickByThreshold(PRESET.steps, 300_000)?.key).toBe('critical'); // 5 min
  });

  it('at and after zero the LOWEST step stays selected', () => {
    expect(pickByThreshold(PRESET.steps, 0)?.key).toBe('critical');
    expect(pickByThreshold(PRESET.steps, -60_000)?.key).toBe('critical');
  });

  it('compares on the one-second quantum the display paints', () => {
    // 3_600_001 ms paints 01:00:01, so it is still ABOVE the 60-minute boundary…
    expect(pickByThreshold(PRESET.steps, 3_600_001)).toBeUndefined();
    // …while every ms that paints 01:00:00 is at or below it.
    expect(pickByThreshold(PRESET.steps, 3_600_000)?.key).toBe('caution');
    expect(pickByThreshold(PRESET.steps, 3_599_001)?.key).toBe('caution');
  });

  it('an empty match set with no steps covering leaves the caller to fall back', () => {
    expect(pickByThreshold([{ atOrBelowMs: 1000 }], 5000)).toBeUndefined();
  });
});

describe('remainingMsOf — helper 1, the ONE source of remaining ms (D-141)', () => {
  it('reads the driver rather than re-deriving deadline − now', () => {
    const h = make(
      { mode: 'countdown', target: { kind: 'timeofday', time: '20:32' } },
      AT(2026, 6, 28, 19, 0),
    );
    h.driver.start();
    expect(remainingMsOf(h.driver)).toBe(92 * 60_000);
    h.clock.advance(60_000);
    expect(remainingMsOf(h.driver)).toBe(91 * 60_000);
  });

  it('works for a relative (duration) target too', () => {
    const h = make({ mode: 'countdown', target: { kind: 'duration', ms: 5000 } });
    h.driver.start();
    h.clock.advance(2000);
    expect(remainingMsOf(h.driver)).toBe(3000);
  });
});

// — 2.4 / 2.10 / 2.11 / 2.12 — zone publication ————————————————————————————

describe('zone publication on the scope root (D-141)', () => {
  it('flips EXACTLY at the displayed boundary — key and painted digits agree', () => {
    // One ms above the 60-minute threshold, so the crossing can be walked 1 ms at a time.
    const h = make({
      mode: 'countdown',
      target: { kind: 'duration', ms: 3_600_001 },
      zones: PRESET,
    });
    h.driver.start();
    expect(h.node.textContent).toBe('01:00:01');
    expect(zoneOf(h.root)).toBe('normal'); // above the boundary ⇒ base

    h.clock.advance(1); // remaining 3_600_000 — the boundary itself
    expect(h.node.textContent).toBe('01:00:00');
    expect(zoneOf(h.root)).toBe('caution'); // flips on the frame the digits reach it

    h.clock.advance(1); // remaining 3_599_999 — one ms past
    expect(h.node.textContent).toBe('01:00:00');
    expect(zoneOf(h.root)).toBe('caution');
  });

  it('a run through all four zones writes the attribute once per zone — 3 crossings', () => {
    const h = make({
      mode: 'countdown',
      target: { kind: 'duration', ms: 3_900_000 }, // 65 min: starts in base
      zones: PRESET,
    });
    const zone = instrumentZoneWrites(h.root);
    h.driver.start();
    // The run's own establishing write — the zone it ENTERS at, not a crossing.
    expect(zone.writes).toEqual(['normal']);
    const afterStart = zone.writes.length;

    h.clock.advance(300_000); // → 60 min remaining
    h.clock.advance(1_800_000); // → 30 min remaining
    h.clock.advance(1_200_000); // → 10 min remaining
    h.clock.advance(600_000); // → 0

    // Exactly THREE boundary crossings, each flipping the DOM exactly once.
    expect(zone.writes.slice(afterStart)).toEqual(['caution', 'warning', 'critical']);
    // At and after zero the lowest step stays selected — no flip back to base.
    expect(zoneOf(h.root)).toBe('critical');
    h.clock.advance(600_000);
    expect(zoneOf(h.root)).toBe('critical');
    expect(zone.writes.slice(afterStart)).toEqual(['caution', 'warning', 'critical']);
  });

  it('a minute spent INSIDE one zone adds zero zone writes (the latch)', () => {
    const h = make({
      mode: 'countdown',
      target: { kind: 'duration', ms: 3_900_000 },
      zones: PRESET,
    });
    h.driver.start();
    const zone = instrumentZoneWrites(h.root); // instrument AFTER the establishing write
    for (let i = 0; i < 60; i += 1) h.clock.advance(1000); // a minute of per-second repaints
    expect(zone.writes).toEqual([]);
    expect(zoneOf(h.root)).toBe('normal');
  });

  it('with NO base zone, the region above the highest threshold publishes nothing', () => {
    const h = make({
      mode: 'countdown',
      target: { kind: 'duration', ms: 700_000 },
      zones: { steps: [{ atOrBelowMs: 600_000, key: 'critical', color: '#d50000' }] },
    });
    h.driver.start();
    expect(zoneOf(h.root)).toBeNull(); // inert — every override falls back to authored
    h.clock.advance(100_000);
    expect(zoneOf(h.root)).toBe('critical');
  });

  it('reset() clears the zone and the next cycle re-establishes it from the NEW run', () => {
    const h = make({
      mode: 'countdown',
      target: { kind: 'duration', ms: 3_900_000 },
      zones: PRESET,
    });
    h.driver.start();
    h.clock.advance(3_900_000); // run to zero — ends in 'critical'
    expect(zoneOf(h.root)).toBe('critical');

    h.driver.reset();
    // Cleared: a fresh run must not inherit the previous cycle's colour.
    expect(zoneOf(h.root)).toBeNull();

    h.driver.start();
    expect(zoneOf(h.root)).toBe('normal'); // re-entered from the new run's remaining
    h.clock.advance(300_000);
    expect(zoneOf(h.root)).toBe('caution');
  });

  it('destroy() leaves no stale zone behind', () => {
    const h = make({
      mode: 'countdown',
      target: { kind: 'duration', ms: 600_000 },
      zones: PRESET,
    });
    h.driver.start();
    expect(zoneOf(h.root)).toBe('critical');
    h.driver.destroy();
    expect(zoneOf(h.root)).toBeNull();
  });

  it.each(['wall', 'countup'] as const)('a %s clock publishes NO zone (runtime layer)', (mode) => {
    // The schema refuses to author this; the runtime ignores it independently, so a
    // hand-edited .vcg degrades to base styles rather than misbehaving.
    const h = make({ mode, zones: PRESET });
    h.driver.start();
    h.clock.advance(5000);
    expect(zoneOf(h.root)).toBeNull();
  });

  it('a countdown with no zones publishes nothing', () => {
    const h = make({ mode: 'countdown', target: { kind: 'duration', ms: 5000 } });
    h.driver.start();
    h.clock.advance(1000);
    expect(zoneOf(h.root)).toBeNull();
  });
});

// — 2.5 / 2.13 / 2.14 — retarget() ————————————————————————————————————————

describe('retarget() — re-aim without replaying (D-141)', () => {
  // Evaluated per test, never at module scope: a suite that forces a time zone must
  // not be able to shift an instant another suite captured earlier.
  const NOW = (): number => AT(2026, 6, 28, 19, 0);

  it('re-targets a LIVE countdown: new remaining, run preserved, no replay', () => {
    const h = make({ mode: 'countdown', target: { kind: 'timeofday', time: '20:32' } }, NOW());
    const pending = h.driver.whenComplete();
    h.driver.start();
    h.clock.advance(60_000); // 19:01
    expect(h.node.textContent).toBe('01:31:00');

    h.driver.retarget({ kind: 'timeofday', time: '20:45' });
    // Repainted at once, straight to the new remaining — no pass through the full value.
    expect(h.node.textContent).toBe('01:44:00');
    // The RUN is untouched: still ticking, and the pending hold promise is the SAME
    // object the scope is already awaiting (replacing it would strand the hold open).
    expect(h.driver.whenComplete()).toBe(pending);
    h.clock.advance(60_000);
    expect(h.node.textContent).toBe('01:43:00');
  });

  it('an UNCHANGED deadline is a no-op — repeated CG UPDATEs cost nothing', () => {
    const h = make({ mode: 'countdown', target: { kind: 'timeofday', time: '20:32' } }, NOW());
    h.driver.start();
    h.clock.advance(60_000);
    const text = instrumentTextWrites(h.node);

    h.driver.retarget({ kind: 'timeofday', time: '20:32' }); // same time ⇒ same deadline
    expect(text.count).toBe(0);
    expect(h.node.textContent).toBe('01:31:00');

    // …while a genuinely different time DOES repaint, so the no-op is a deadline
    // comparison and not a dead code path.
    h.driver.retarget({ kind: 'timeofday', time: '20:33' });
    expect(text.count).toBe(1);
  });

  it('re-evaluates the zone in ONE write when the new deadline crosses a boundary', () => {
    const h = make(
      { mode: 'countdown', target: { kind: 'timeofday', time: '20:32' }, zones: PRESET },
      NOW(),
    );
    h.driver.start();
    expect(zoneOf(h.root)).toBe('normal'); // 92 min out
    const zone = instrumentZoneWrites(h.root);

    h.driver.retarget({ kind: 'timeofday', time: '19:05' }); // 5 min out
    expect(zone.writes).toEqual(['critical']);
    expect(zoneOf(h.root)).toBe('critical');
  });

  it('re-targeting while PAUSED updates the deadline and repaints once', () => {
    const h = make({ mode: 'countdown', target: { kind: 'timeofday', time: '20:32' } }, NOW());
    h.driver.start();
    h.driver.pause();
    h.driver.retarget({ kind: 'timeofday', time: '19:30' });
    expect(h.node.textContent).toBe('00:30:00');
  });

  it('after completion it re-arms the DISPLAY but does NOT re-open the closed hold', async () => {
    const h = make(
      { mode: 'countdown', target: { kind: 'timeofday', time: '20:32' } },
      AT(2026, 6, 28, 20, 31, 58),
    );
    const awaited = h.driver.whenComplete(); // the promise the scope's hold aggregation reads
    const done = completionFlag(h.driver);
    h.driver.start();
    h.clock.advance(2000);
    await flush();
    expect(done.done).toBe(true); // the hold has closed

    h.driver.retarget({ kind: 'timeofday', time: '21:00' });
    // The DISPLAY re-arms to the new remaining…
    expect(h.node.textContent).toBe('00:28:00');
    // …but the gate the scope already awaited stays resolved: a resolved promise is
    // not un-resolved by minting a new one, so a replay is what re-runs this.
    await expect(awaited).resolves.toBeUndefined();
    expect(h.driver.whenComplete()).not.toBe(awaited);
  });

  it('a re-armed countdown completes again on its NEW deadline', async () => {
    const h = make(
      { mode: 'countdown', target: { kind: 'timeofday', time: '20:32' } },
      AT(2026, 6, 28, 20, 31, 58),
    );
    h.driver.start();
    h.clock.advance(2000);
    await flush();

    h.driver.retarget({ kind: 'timeofday', time: '20:33' });
    const second = completionFlag(h.driver);
    await flush();
    expect(second.done).toBe(false); // pending again
    h.driver.start(); // the driver stopped itself at zero; a fresh run re-pins
    h.clock.advance(60_000);
    await flush();
    expect(second.done).toBe(true);
  });

  it('a repaint outside a run never completes a countdown that has not started', async () => {
    const h = make({ mode: 'countdown', target: { kind: 'timeofday', time: '20:32' } }, NOW());
    const done = completionFlag(h.driver);
    h.driver.retarget({ kind: 'timeofday', time: '18:00' }); // already past ⇒ tomorrow
    await flush();
    expect(done.done).toBe(false);
  });
});
