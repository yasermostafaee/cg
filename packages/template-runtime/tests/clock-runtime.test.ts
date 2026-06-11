import { beforeEach, describe, expect, it } from 'vitest';
import type { ClockElement, Scene } from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';

/** Fake rAF + timer clock (same pattern as the ticker-runtime tests). */
function makeClock() {
  let ms = 0;
  let rafQueue: ((ts: number) => void)[] = [];
  const timers: { id: number; due: number; cb: () => void }[] = [];
  let nextId = 1;
  return {
    now: () => ms,
    raf: (cb: (ts: number) => void) => {
      rafQueue.push(cb);
      return rafQueue.length;
    },
    cancel: () => {
      rafQueue = [];
    },
    setTimeout: (cb: () => void, delay: number) => {
      const id = nextId++;
      timers.push({ id, due: ms + delay, cb });
      return id;
    },
    clearTimeout: (h: unknown) => {
      const i = timers.findIndex((t) => t.id === h);
      if (i >= 0) timers.splice(i, 1);
    },
    advance: (delta: number) => {
      ms += delta;
      const due = timers.filter((t) => t.due <= ms).sort((a, b) => a.due - b.due);
      for (const t of due) {
        const i = timers.indexOf(t);
        if (i >= 0) timers.splice(i, 1);
        t.cb();
      }
      const cbs = rafQueue;
      rafQueue = [];
      for (const cb of cbs) cb(ms);
    },
  };
}

async function run(
  clock: ReturnType<typeof makeClock>,
  totalMs: number,
  step = 100,
): Promise<void> {
  let left = totalMs;
  while (left > 0) {
    const d = Math.min(step, left);
    clock.advance(d);
    left -= d;
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  }
}

/** Deterministic ticker width: 10px per code unit (the ticker fixture math). */
const tickerMeasure = (node: HTMLElement): number => (node.textContent?.length ?? 0) * 10;

const baseTransform = {
  position: { x: 0, y: 0 },
  size: { w: 400, h: 60 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
};

function clockElement(overrides: Partial<ClockElement>): ClockElement {
  return {
    id: 'clk',
    name: 'clock',
    type: 'clock',
    transform: baseTransform,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    font: {
      family: 'Vazirmatn',
      weight: 600,
      style: 'normal',
      size: 48,
      lineHeight: 1.2,
      letterSpacing: 0,
    },
    color: '#FFFFFF',
    align: 'center',
    mode: 'wall',
    format: 'mm:ss',
    digits: 'latin',
    ...overrides,
  };
}

// Fixture math (cf. ticker-runtime): items a(100px) + b(200px), gap 10,
// viewport 400, speed 100 ⇒ repeat 1 completes at d ≥ 710 (7100ms of crawl).
const tickerElement = {
  id: 'crawl',
  name: 'news-crawl',
  type: 'ticker' as const,
  transform: baseTransform,
  opacity: 1,
  visible: true,
  locked: false,
  zIndex: 0,
  font: {
    family: 'Vazirmatn',
    weight: 500,
    style: 'normal' as const,
    size: 36,
    lineHeight: 1.4,
    letterSpacing: 0,
  },
  color: '#FFFFFF',
  direction: 'rtl' as const,
  speed: 100,
  gap: 10,
  repeat: 1,
  cycleBoundary: 'seamless' as const,
  items: [
    { id: 'a', text: 'aaaaaaaaaa' },
    { id: 'b', text: 'bbbbbbbbbbbbbbbbbbbb' },
  ],
};

function clockScene(opts: {
  playout?: Scene['playout'];
  clock: Partial<ClockElement>;
  withTicker?: boolean;
}): Scene {
  return {
    schemaVersion: 1,
    id: 'scene-clock',
    name: 'clock',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    background: 'transparent',
    ...(opts.playout !== undefined ? { playout: opts.playout } : {}),
    layers: [
      {
        id: 'L1',
        name: 'band',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [clockElement(opts.clock), ...(opts.withTicker === true ? [tickerElement] : [])],
      },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-06-11T00:00:00.000Z', updatedAt: '2026-06-11T00:00:00.000Z' },
  };
}

function spanText(): string {
  const span = document.querySelector<HTMLElement>(
    '[data-cg-element-id="clk"] [data-cg-clock-time]',
  );
  if (span === null) throw new Error('clock span not rendered');
  return span.textContent ?? '';
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
});

describe('createRuntime — clock content sources (D-027)', () => {
  it('auto-out + content-driven: a countdown alone governs the hold (exits at 00:00)', async () => {
    const clock = makeClock();
    const runtime = createRuntime(
      clockScene({
        playout: { mode: 'auto-out', holdSource: 'content-driven' },
        clock: { mode: 'countdown', target: { kind: 'duration', ms: 2000 } },
      }),
      { skipFontLoad: true, clock },
    );
    const events: string[] = [];
    runtime.on('stop.start', () => events.push('stop.start'));
    runtime.on('stop.end', () => events.push('stop.end'));
    await runtime.play({});
    await run(clock, 1800);
    expect(events).toEqual([]);
    await run(clock, 400);
    expect(events).toEqual(['stop.start', 'stop.end']);
    expect(document.body.classList.contains('cg-pending')).toBe(true);
  });

  it('wall and countup clocks are NOT content sources — the hold is zero-length', async () => {
    for (const mode of ['wall', 'countup'] as const) {
      document.body.innerHTML = '';
      document.body.className = '';
      const clock = makeClock();
      const runtime = createRuntime(
        clockScene({
          playout: { mode: 'auto-out', holdSource: 'content-driven' },
          clock: { mode },
        }),
        { skipFontLoad: true, clock },
      );
      const events: string[] = [];
      runtime.on('stop.end', () => events.push('stop.end'));
      await runtime.play({});
      await run(clock, 500);
      expect(events).toEqual(['stop.end']); // exited on its own — nothing held
    }
  });

  it('mixed ticker + countdown: Promise.all — the ticker finishes last and governs', async () => {
    const clock = makeClock();
    const runtime = createRuntime(
      clockScene({
        playout: { mode: 'auto-out', holdSource: 'content-driven' },
        clock: { mode: 'countdown', target: { kind: 'duration', ms: 2000 } },
        withTicker: true, // repeat 1 ⇒ completes at 7100ms of crawl
      }),
      { skipFontLoad: true, clock, tickerMeasure },
    );
    const events: string[] = [];
    runtime.on('stop.end', () => events.push('stop.end'));
    await runtime.play({});
    await run(clock, 6900); // countdown done long ago — the hold must still be on
    expect(events).toEqual([]);
    await run(clock, 500);
    expect(events).toEqual(['stop.end']);
  });

  it('mixed ticker + countdown: the countdown finishes last and governs', async () => {
    const clock = makeClock();
    const runtime = createRuntime(
      clockScene({
        playout: { mode: 'auto-out', holdSource: 'content-driven' },
        clock: { mode: 'countdown', target: { kind: 'duration', ms: 9000 } },
        withTicker: true, // completes at 7100ms — before the countdown
      }),
      { skipFontLoad: true, clock, tickerMeasure },
    );
    const events: string[] = [];
    runtime.on('stop.end', () => events.push('stop.end'));
    await runtime.play({});
    await run(clock, 8800);
    expect(events).toEqual([]);
    await run(clock, 500);
    expect(events).toEqual(['stop.end']);
  });

  it('stop() during a countdown hold is IMMEDIATE — hard out, and the stale completion is ignored', async () => {
    const clock = makeClock();
    const runtime = createRuntime(
      clockScene({
        playout: { mode: 'auto-out', holdSource: 'content-driven' },
        clock: { mode: 'countdown', target: { kind: 'duration', ms: 60_000 } },
      }),
      { skipFontLoad: true, clock },
    );
    const events: string[] = [];
    runtime.on('stop.start', () => events.push('stop.start'));
    runtime.on('stop.end', () => events.push('stop.end'));
    await runtime.play({});
    await run(clock, 2000);
    await runtime.stop(); // must NOT wait the remaining 58s
    expect(events).toEqual(['stop.start', 'stop.end']);
    await run(clock, 120_000, 5000); // the abandoned run can never replay the outro
    expect(events).toEqual(['stop.start', 'stop.end']);
  });

  it('loop-cycle × countdown: each cycle re-runs the FULL count', async () => {
    const clock = makeClock();
    const runtime = createRuntime(
      clockScene({
        playout: { mode: 'loop-cycle', holdSource: 'content-driven', repeat: 2 },
        clock: { mode: 'countdown', target: { kind: 'duration', ms: 2000 } },
      }),
      { skipFontLoad: true, clock },
    );
    const events: string[] = [];
    runtime.on('stop.end', () => events.push('stop.end'));
    await runtime.play({});
    await run(clock, 2600); // inside cycle 2 — the count restarted from the top
    expect(events).toEqual([]);
    expect(spanText()).not.toBe('00:00');
    await run(clock, 1800); // ≈4s total: both 2s counts played out
    expect(events).toEqual(['stop.end']);
  });

  it('loop-cycle × countup: the stopwatch RESTARTS from zero at each hold entry', async () => {
    const clock = makeClock();
    const runtime = createRuntime(
      clockScene({
        playout: { mode: 'loop-cycle', holdSource: 'timed', holdMs: 3000, repeat: 2 },
        clock: { mode: 'countup', format: 'ss' },
      }),
      { skipFontLoad: true, clock },
    );
    await runtime.play({});
    await run(clock, 2500); // cycle 1, ~2.5s into its hold
    expect(spanText()).toBe('02');
    await run(clock, 3000); // ≈5.5s total — ~2.5s into CYCLE 2's hold
    // A fresh count per cycle: ~02 again, NOT the ~05 a continuous count shows.
    expect(spanText()).toBe('02');
  });

  it('loop-cycle × wall: the clock keeps showing the TRUE time across cycles (no jump)', async () => {
    const clock = makeClock();
    const runtime = createRuntime(
      clockScene({
        playout: { mode: 'loop-cycle', holdSource: 'timed', holdMs: 3000, repeat: 2 },
        clock: { mode: 'wall', format: 'ss' },
      }),
      { skipFontLoad: true, clock },
    );
    const expectSecs = (ms: number): string => String(new Date(ms).getSeconds()).padStart(2, '0');
    await runtime.play({});
    await run(clock, 2000); // cycle 1
    expect(spanText()).toBe(expectSecs(2000));
    await run(clock, 3000); // ≈5s total — inside cycle 2, across the hold-entry reset
    expect(spanText()).toBe(expectSecs(5000));
  });

  it('loop-cycle × datetime countdown: the ABSOLUTE deadline governs across cycles', async () => {
    const clock = makeClock();
    const runtime = createRuntime(
      clockScene({
        playout: { mode: 'loop-cycle', holdSource: 'content-driven', repeat: 2 },
        clock: {
          mode: 'countdown',
          target: { kind: 'datetime', iso: new Date(8000).toISOString() },
        },
      }),
      { skipFontLoad: true, clock },
    );
    const events: string[] = [];
    runtime.on('stop.end', () => events.push('stop.end'));
    await runtime.play({});
    await run(clock, 7800); // cycle 1 holds until the real deadline…
    expect(events).toEqual([]);
    // …then cycle 2's fresh run finds the deadline already past, completes
    // immediately (zero-length hold), and the composition settles — it does
    // NOT wait another 8s (the deadline is absolute, not per-cycle).
    await run(clock, 800);
    expect(events).toEqual(['stop.end']);
    expect(spanText()).toBe('00:00');
  });

  it('pause()/resume() freeze the countdown and the hold in lockstep', async () => {
    const clock = makeClock();
    const runtime = createRuntime(
      clockScene({
        playout: { mode: 'auto-out', holdSource: 'content-driven' },
        clock: { mode: 'countdown', target: { kind: 'duration', ms: 2000 } },
      }),
      { skipFontLoad: true, clock },
    );
    const events: string[] = [];
    runtime.on('stop.end', () => events.push('stop.end'));
    await runtime.play({});
    await run(clock, 1000);
    runtime.pause();
    await run(clock, 8000); // frozen — no exit, display held at 00:01
    expect(events).toEqual([]);
    expect(spanText()).toBe('00:01');
    runtime.resume();
    await run(clock, 1300);
    expect(events).toEqual(['stop.end']);
  });

  it('a datetime target already in the past gives a zero-length content hold', async () => {
    const clock = makeClock();
    clock.advance(60_000); // "now" is already past the epoch-0 deadline
    const runtime = createRuntime(
      clockScene({
        playout: { mode: 'auto-out', holdSource: 'content-driven' },
        clock: { mode: 'countdown', target: { kind: 'datetime', iso: new Date(0).toISOString() } },
      }),
      { skipFontLoad: true, clock },
    );
    const events: string[] = [];
    runtime.on('stop.end', () => events.push('stop.end'));
    await runtime.play({});
    await run(clock, 500);
    expect(events).toEqual(['stop.end']);
    expect(spanText()).toBe('00:00');
  });

  it('wall ticks once per second during playback; tick(frame) never moves it', async () => {
    const clock = makeClock();
    const runtime = createRuntime(
      clockScene({ playout: { mode: 'manual' }, clock: { mode: 'wall', format: 'ss' } }),
      { skipFontLoad: true, clock },
    );
    await runtime.play({});
    await run(clock, 200);
    const t0 = spanText();
    await run(clock, 1000);
    const t1 = spanText();
    expect(t1).not.toBe(t0); // ticked with the (fake) wall time
    // Scrubbing the timeline must not move a time-driven element.
    runtime.tick(0);
    runtime.tick(42);
    expect(spanText()).toBe(t1);
  });
});
