import { beforeEach, describe, expect, it } from 'vitest';
import { ClockDriver, clockInitialText, type ClockDriverOptions } from '../src/clock-driver.js';

/** Fake rAF + timer clock (same shape as the playout/ticker suites). */
function makeClock() {
  let ms = 0;
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

function completionFlag(driver: ClockDriver): { done: boolean } {
  const out = { done: false };
  void driver.whenComplete().then(() => {
    out.done = true;
  });
  return out;
}

/** Count textContent writes (the repaint-only-on-change invariant is about DOM writes). */
function instrumentWrites(node: HTMLElement): { count: number } {
  const out = { count: 0 };
  let proto: object | null = Object.getPrototypeOf(node);
  let desc: PropertyDescriptor | undefined;
  while (proto !== null && desc === undefined) {
    desc = Object.getOwnPropertyDescriptor(proto, 'textContent');
    proto = Object.getPrototypeOf(proto);
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

function make(opts: Partial<ClockDriverOptions> & Pick<ClockDriverOptions, 'mode'>) {
  const clock = makeClock();
  const node = document.createElement('span');
  const driver = new ClockDriver({
    node,
    format: 'mm:ss',
    digits: 'latin',
    clock,
    ...opts,
  });
  return { clock, node, driver };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('ClockDriver (D-027)', () => {
  it('countdown to a duration: full value at start, ceil display, completes exactly at 0', async () => {
    const h = make({ mode: 'countdown', target: { kind: 'duration', ms: 2000 } });
    const done = completionFlag(h.driver);
    h.driver.start();
    expect(h.node.textContent).toBe('00:02');
    h.clock.advance(1000);
    expect(h.node.textContent).toBe('00:01');
    h.clock.advance(990); // 10ms left — still shows 1 (ceil), not yet complete
    expect(h.node.textContent).toBe('00:01');
    await flush();
    expect(done.done).toBe(false);
    h.clock.advance(10); // 0 paints — completion fires exactly now
    expect(h.node.textContent).toBe('00:00');
    await flush();
    expect(done.done).toBe(true);
    h.clock.advance(5000); // clamped and frozen — never negative
    expect(h.node.textContent).toBe('00:00');
  });

  it('a FRACTIONAL duration target starts at ceil and sheds the fraction first (intended)', () => {
    // The Designer authors whole seconds; a hand-authored 1500ms target shows
    // ceil = 2 at start, and the FIRST displayed second lasts only the 500ms
    // fraction — faithful ceil rendering, pinned here as intentional.
    const h = make({ mode: 'countdown', target: { kind: 'duration', ms: 1500 } });
    h.driver.start();
    expect(h.node.textContent).toBe('00:02');
    h.clock.advance(499); // remaining 1001 → still ceil 2
    expect(h.node.textContent).toBe('00:02');
    h.clock.advance(1); // remaining 1000 → 1 (the fraction is gone)
    expect(h.node.textContent).toBe('00:01');
    h.clock.advance(1000); // remaining 0 — completes exactly at zero
    expect(h.node.textContent).toBe('00:00');
  });

  it('clamps a big overshoot to 00:00 in one step', async () => {
    const h = make({ mode: 'countdown', target: { kind: 'duration', ms: 1500 } });
    const done = completionFlag(h.driver);
    h.driver.start();
    h.clock.advance(5000);
    expect(h.node.textContent).toBe('00:00');
    await flush();
    expect(done.done).toBe(true);
  });

  it('writes the DOM only when the formatted string changes (≈1 write/second)', () => {
    const h = make({ mode: 'countdown', target: { kind: 'duration', ms: 3000 } });
    const writes = instrumentWrites(h.node);
    h.driver.start(); // '00:03'
    for (let i = 0; i < 30; i += 1) h.clock.advance(100); // 30 frames over 3s
    // 4 writes: the start paint + the 3 per-second changes — not 31.
    expect(writes.count).toBe(4);
    expect(h.node.textContent).toBe('00:00');
  });

  it('countup counts ACTIVE time: pause freezes, resume continues with no jump', () => {
    const h = make({ mode: 'countup', format: 'ss' });
    h.driver.start();
    expect(h.node.textContent).toBe('00');
    h.clock.advance(1500);
    expect(h.node.textContent).toBe('01');
    h.driver.pause();
    h.clock.advance(10_000); // paused time must not count
    expect(h.node.textContent).toBe('01');
    h.driver.resume();
    h.clock.advance(400); // active total 1900ms
    expect(h.node.textContent).toBe('01');
    h.clock.advance(100); // active total 2000ms
    expect(h.node.textContent).toBe('02');
  });

  it('wall is ABSOLUTE: pause stops painting, resume shows the true current time', () => {
    const h = make({ mode: 'wall', format: 'ss' });
    const expectSecs = (ms: number): string => String(new Date(ms).getSeconds()).padStart(2, '0');
    h.driver.start();
    expect(h.node.textContent).toBe(expectSecs(0));
    h.clock.advance(1000);
    expect(h.node.textContent).toBe(expectSecs(1000));
    h.driver.pause();
    h.clock.advance(5000); // display frozen while paused…
    expect(h.node.textContent).toBe(expectSecs(1000));
    h.driver.resume(); // …but resume paints the TRUE now immediately
    expect(h.node.textContent).toBe(expectSecs(6000));
  });

  it('countdown to a datetime is ABSOLUTE: a pause never delays the real deadline', async () => {
    const clock = makeClock();
    const node = document.createElement('span');
    const driver = new ClockDriver({
      node,
      mode: 'countdown',
      format: 'mm:ss',
      digits: 'latin',
      target: { kind: 'datetime', iso: new Date(5000).toISOString() },
      clock,
    });
    const done = completionFlag(driver);
    driver.start();
    expect(node.textContent).toBe('00:05');
    clock.advance(2000);
    expect(node.textContent).toBe('00:03');
    driver.pause();
    clock.advance(2000); // the deadline keeps approaching while paused
    driver.resume();
    expect(node.textContent).toBe('00:01'); // true remaining, not 00:03
    clock.advance(1000);
    expect(node.textContent).toBe('00:00');
    await flush();
    expect(done.done).toBe(true);
  });

  it('a datetime target already in the past paints 0 and resolves on run start', async () => {
    const clock = makeClock();
    clock.advance(10_000); // "now" is already past the epoch-0 target
    const node = document.createElement('span');
    const driver = new ClockDriver({
      node,
      mode: 'countdown',
      format: 'mm:ss',
      digits: 'latin',
      target: { kind: 'datetime', iso: new Date(0).toISOString() },
      clock,
    });
    const done = completionFlag(driver);
    await flush();
    expect(done.done).toBe(false); // not before the run starts
    driver.start();
    expect(node.textContent).toBe('00:00');
    await flush();
    expect(done.done).toBe(true);
  });

  it('reset() repaints the initial value and mints a FRESH completion per run', async () => {
    const h = make({ mode: 'countdown', target: { kind: 'duration', ms: 1000 } });
    h.driver.start();
    h.clock.advance(1000);
    await flush();
    h.driver.reset();
    expect(h.node.textContent).toBe('00:01'); // back to the full target
    const second = completionFlag(h.driver);
    await flush();
    expect(second.done).toBe(false); // the new run's promise is pending
    h.driver.start();
    h.clock.advance(1000);
    await flush();
    expect(second.done).toBe(true);
  });

  it('wall and countup never resolve completion (not content sources)', async () => {
    for (const mode of ['wall', 'countup'] as const) {
      const h = make({ mode });
      const done = completionFlag(h.driver);
      h.driver.start();
      for (let i = 0; i < 10; i += 1) h.clock.advance(6000);
      await flush();
      expect(done.done).toBe(false);
    }
  });

  it('stop() freezes the display at the stop moment', () => {
    const h = make({ mode: 'countup', format: 'ss' });
    h.driver.start();
    h.clock.advance(2500);
    h.driver.stop();
    expect(h.node.textContent).toBe('02');
    h.clock.advance(5000);
    expect(h.node.textContent).toBe('02');
  });

  it('clockInitialText: wall = now, countup = zero, countdown = full target', () => {
    expect(clockInitialText({ mode: 'countup', format: 'mm:ss', digits: 'latin' }, 0)).toBe(
      '00:00',
    );
    expect(
      clockInitialText(
        {
          mode: 'countdown',
          format: 'mm:ss',
          digits: 'latin',
          target: { kind: 'duration', ms: 90 * 60_000 },
        },
        0,
      ),
    ).toBe('90:00');
    expect(
      clockInitialText(
        {
          mode: 'countdown',
          format: 'mm:ss',
          digits: 'latin',
          target: { kind: 'datetime', iso: new Date(0).toISOString() },
        },
        60_000,
      ),
    ).toBe('00:00'); // past datetime clamps
    const wall = clockInitialText({ mode: 'wall', format: 'ss', digits: 'latin' }, 5000);
    expect(wall).toBe(String(new Date(5000).getSeconds()).padStart(2, '0'));
  });
});

describe('ClockDriver — blinking colon (D-103)', () => {
  const colon = (node: HTMLElement): HTMLElement | null =>
    node.querySelector<HTMLElement>('[data-cg-clock-colon]');

  it('renders colon spans and toggles ONLY their opacity at the period', () => {
    const h = make({ mode: 'countup', format: 'HH:mm:ss', blinkColon: true, blinkPeriodMs: 1000 });
    h.driver.start(); // now=0 → floor(0/1000)%2=0 → visible
    const colons = h.node.querySelectorAll<HTMLElement>('[data-cg-clock-colon]');
    expect(colons.length).toBe(2); // HH:mm:ss has two colons
    expect(colons[0]?.style.opacity).toBe('1');
    expect(colons[1]?.style.opacity).toBe('1');

    h.clock.advance(1000); // now=1000 → floor=1 → hidden
    expect(colon(h.node)?.style.opacity).toBe('0');
    h.clock.advance(1000); // now=2000 → floor=2%2=0 → visible again
    expect(colon(h.node)?.style.opacity).toBe('1');
    h.driver.stop();
  });

  it('only the opacity toggles — the digits do not change or reflow within a second', () => {
    const h = make({ mode: 'countup', format: 'HH:mm:ss', blinkColon: true, blinkPeriodMs: 500 });
    h.driver.start(); // now=0 → "00:00:00", colon visible
    const text0 = h.node.textContent;
    expect(colon(h.node)?.style.opacity).toBe('1');

    h.clock.advance(500); // now=500 → same second, colon now hidden
    expect(h.node.textContent).toBe(text0); // digit text unchanged — only opacity differs
    expect(colon(h.node)?.style.opacity).toBe('0');
    h.driver.stop();
  });

  it('the rate (period) sets the cadence', () => {
    const fast = make({ mode: 'countup', format: 'mm:ss', blinkColon: true, blinkPeriodMs: 500 });
    const slow = make({ mode: 'countup', format: 'mm:ss', blinkColon: true, blinkPeriodMs: 1000 });
    fast.driver.start();
    slow.driver.start();
    fast.clock.advance(500); // floor(500/500)%2=1 → hidden
    slow.clock.advance(500); // floor(500/1000)%2=0 → still visible
    expect(colon(fast.node)?.style.opacity).toBe('0');
    expect(colon(slow.node)?.style.opacity).toBe('1');
    fast.driver.stop();
    slow.driver.stop();
  });

  it('off (default) keeps steady colons — plain textContent, no colon spans', () => {
    const h = make({ mode: 'countup', format: 'HH:mm:ss' });
    h.driver.start();
    expect(h.node.querySelector('[data-cg-clock-colon]')).toBeNull();
    expect(h.node.textContent).toBe('00:00:00');
    h.driver.stop();
  });
});
