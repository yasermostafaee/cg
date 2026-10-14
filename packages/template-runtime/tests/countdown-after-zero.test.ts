import { beforeEach, describe, expect, it } from 'vitest';
import type { AfterZero, CountdownSteps } from '@cg/shared-schema';
import {
  ClockDriver,
  countdownText,
  PAST_ZERO_SIGN,
  type ClockDriverOptions,
} from '../src/clock-driver.js';

/**
 * 🔴 `DELTA-RUN-NEXT-VERSION-01-D` / `-E` — WHAT A COUNTDOWN DOES AFTER ZERO, chosen by its author:
 * Hold at zero (default), Count past zero, Hide the digits, Close the graphic — the same whether
 * zero is reached on air or the target was already past at Take — and the steps "after zero".
 */

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

const AFTER: CountdownSteps = {
  steps: [
    { name: 'At zero', atMs: 0, changes: [] },
    { name: '1 min after zero', atMs: -60_000, changes: [] },
  ],
};

function make(
  afterZero: AfterZero | undefined,
  opts: Partial<ClockDriverOptions> = {},
  startMs = 0,
) {
  const clock = makeClock(startMs);
  const node = document.createElement('span');
  const root = document.createElement('div');
  root.appendChild(node);
  document.body.appendChild(root);
  const driver = new ClockDriver({
    node,
    mode: 'countdown',
    format: 'mm:ss',
    digits: 'latin',
    target: { kind: 'duration', ms: 30_000 },
    afterZero,
    stepRoot: root,
    stepAttr: 'data-cg-cd0',
    clock,
    ...opts,
  });
  const completion = { done: false };
  void driver.whenComplete().then(() => {
    completion.done = true;
  });
  return { clock, node, root, driver, completion };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('the countdown text after zero', () => {
  it('Hold at zero and Close the graphic keep 00:00; Hide the digits writes nothing', () => {
    for (const az of ['hold', 'close', undefined] as const) {
      expect(countdownText(-12_000, 'mm:ss', 'latin', az)).toBe('00:00');
    }
    expect(countdownText(-12_000, 'mm:ss', 'latin', 'hide-digits')).toBe('');
  });

  it('Count past zero writes the time since zero behind a MINUS SIGN, in the clock’s own digits', () => {
    expect(countdownText(-12_000, 'mm:ss', 'latin', 'count-past')).toBe(`${PAST_ZERO_SIGN}00:12`);
    expect(countdownText(-12_000, 'mm:ss', 'persian', 'count-past')).toBe(`${PAST_ZERO_SIGN}۰۰:۱۲`);
    expect(PAST_ZERO_SIGN).toBe('−');
    // The first second past zero still reads 00:00 — the sign never flashes on a zero.
    expect(countdownText(-400, 'mm:ss', 'latin', 'count-past')).toBe('00:00');
    // Above zero every choice reads the remaining time.
    expect(countdownText(5_000, 'mm:ss', 'latin', 'count-past')).toBe('00:05');
  });
});

describe('🔴 completion — what ends a content-driven hold', () => {
  it.each(['hold', 'hide-digits', 'close', undefined] as const)(
    '%s signals completion at zero, exactly as every countdown did',
    async (az) => {
      const h = make(az);
      h.driver.start();
      h.clock.advance(30_000);
      await flush();
      expect(h.completion.done).toBe(true);
    },
  );

  it('Count past zero NEVER completes — the graphic must not leave air while still counting', async () => {
    const h = make('count-past');
    h.driver.start();
    h.clock.advance(30_000);
    h.clock.advance(12_000);
    await flush();
    expect(h.completion.done).toBe(false);
    expect(h.node.textContent).toBe(`${PAST_ZERO_SIGN}00:12`);
  });
});

describe('a target already PAST at Take', () => {
  const PAST = { kind: 'datetime' as const, iso: new Date(-90_000).toISOString() };

  it('Hold at zero: 00:00 and completes at once', async () => {
    const h = make('hold', { target: PAST });
    h.driver.start();
    await flush();
    expect(h.node.textContent).toBe('00:00');
    expect(h.completion.done).toBe(true);
  });

  it('Count past zero: the time since zero from the first frame, and no completion', async () => {
    const h = make('count-past', { target: PAST });
    h.driver.start();
    await flush();
    expect(h.node.textContent).toBe(`${PAST_ZERO_SIGN}01:30`);
    expect(h.completion.done).toBe(false);
  });

  it('Hide the digits: nothing written, and completes at once', async () => {
    const h = make('hide-digits', { target: PAST });
    h.driver.start();
    await flush();
    expect(h.node.textContent).toBe('');
    expect(h.completion.done).toBe(true);
  });

  it('Close the graphic: completes at once (the entrance, then the exit)', async () => {
    const h = make('close', { target: PAST });
    h.driver.start();
    await flush();
    expect(h.completion.done).toBe(true);
  });
});

describe('steps AFTER zero (-D §2)', () => {
  const tokenOf = (root: HTMLElement): string | null => root.getAttribute('data-cg-cd0');

  it.each(['count-past', 'hold', 'hide-digits'] as const)(
    'with %s, time keeps passing after zero and the "1 min after zero" step is reached',
    (az) => {
      const h = make(az, { steps: AFTER });
      h.driver.start();
      h.clock.advance(30_000);
      expect(tokenOf(h.root)).toBe('0'); // At zero
      h.clock.advance(59_000);
      expect(tokenOf(h.root)).toBe('0');
      h.clock.advance(1_000);
      expect(tokenOf(h.root)).toBe('1'); // −01:00 — exactly as the display reaches it
    },
  );

  it('with Hold at zero and no step after zero, the countdown freezes at zero as it always did', () => {
    const h = make('hold', { steps: { steps: [{ name: 'At zero', atMs: 0, changes: [] }] } });
    h.driver.start();
    h.clock.advance(30_000);
    const text = h.node.textContent;
    h.clock.advance(120_000);
    expect(h.node.textContent).toBe(text);
  });
});

describe('🔴 -E — an on-air re-target into the future BEFORE zero closes nothing', () => {
  it('Close the graphic: moving the target later keeps the run, and nothing completes at the old time', async () => {
    const h = make('close', { target: { kind: 'datetime', iso: new Date(30_000).toISOString() } });
    h.driver.start();
    h.clock.advance(20_000); // 10 s before the old target
    h.driver.retarget({ kind: 'datetime', iso: new Date(90_000).toISOString() });
    h.clock.advance(15_000); // past the OLD target
    await flush();
    expect(h.completion.done).toBe(false);
    expect(h.node.textContent).toBe('00:55');
    h.clock.advance(55_000); // the NEW target
    await flush();
    expect(h.completion.done).toBe(true);
  });
});

describe('the step a driver is in, for Take and for rehearsal', () => {
  const STEPS: CountdownSteps = {
    before: { name: 'Before', changes: [] },
    steps: [{ name: 'Step 1', atMs: 10_000, changes: [] }],
  };

  it('currentStep reads the step without publishing it; syncStep publishes it outside a run', () => {
    const h = make('hold', { steps: STEPS });
    expect(h.driver.currentStep).toBe('before');
    expect(h.root.hasAttribute('data-cg-cd0')).toBe(false);
    h.driver.syncStep();
    expect(h.root.getAttribute('data-cg-cd0')).toBe('b');
  });

  it('forceStep shows a step whatever the time, through the same latch and onStep, until cleared', () => {
    const seen: [string | number | null, string | number | null, string][] = [];
    const h = make('hold', {
      steps: STEPS,
      onStep: (entered, left, reason) => seen.push([entered, left, reason]),
    });
    h.driver.start();
    h.driver.forceStep(0);
    expect(h.root.getAttribute('data-cg-cd0')).toBe('0');
    h.driver.forceStep(undefined);
    expect(h.root.getAttribute('data-cg-cd0')).toBe('b');
    h.driver.reset();
    expect(seen).toEqual([
      ['before', null, 'step'],
      [0, 'before', 'step'],
      ['before', 0, 'step'],
      [null, 'before', 'reset'],
    ]);
  });
});
