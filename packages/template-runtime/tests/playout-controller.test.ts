import { describe, expect, it } from 'vitest';
import type { Lifecycle, Playout } from '@cg/shared-schema';
import { PlayoutController } from '../src/playout-controller.js';

/** Fake rAF + timer clock so lifecycle timing is deterministic. */
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
    /** Advance time, firing due timers then flushing one rAF round. */
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

const active = { in: 0, out: 50 };
// Single out-point: intro [0, 40], hold at 40, outro [40, 50].
const lifecycle: Lifecycle = { outPoint: 40 };

interface Harness {
  controller: PlayoutController;
  frames: number[];
  events: string[];
  clock: ReturnType<typeof makeClock>;
}

function make(
  playout: Playout,
  opts: {
    /** Read by KEY PRESENCE below: `{ lifecycle: undefined }` means "no out-point". */
    lifecycle?: Lifecycle | undefined;
    hasAnimation?: boolean;
    waitForContent?: () => Promise<void> | null;
    observeFrame?: (frame: number) => void;
  } = {},
): Harness {
  const clock = makeClock();
  const frames: number[] = [];
  const events: string[] = [];
  const controller = new PlayoutController({
    frameRate: 50,
    active,
    lifecycle: 'lifecycle' in opts ? opts.lifecycle : lifecycle,
    playout,
    hasAnimation: opts.hasAnimation ?? false,
    applyFrame: (f) => frames.push(f),
    onExitStart: () => events.push('exit'),
    onSettle: () => events.push('settle'),
    waitForContent: opts.waitForContent,
    observeFrame: opts.observeFrame,
    clock,
  });
  return { controller, frames, events, clock };
}

describe('PlayoutController', () => {
  it('reports collapsed root boundaries without adding paint or lifecycle duration', () => {
    const observed: number[] = [];
    const h = make({ mode: 'manual' }, { observeFrame: (frame) => observed.push(frame) });
    h.controller.play();
    expect(h.frames).toEqual([40]);
    expect(observed).toEqual([0, 40]);
    h.controller.stop();
    expect(h.frames).toEqual([40, 50]);
    expect(observed).toEqual([0, 40, 40, 50]);
    expect(h.clock.now()).toBe(0);
    expect(h.events).toEqual(['exit', 'settle']);
  });

  it('observes animated root frames, a parked hold and pause/resume without extra paints', () => {
    const observed: number[] = [];
    const h = make(
      { mode: 'manual' },
      { hasAnimation: true, observeFrame: (frame) => observed.push(frame) },
    );
    h.controller.play();
    h.clock.advance(200);
    expect(observed.at(-1)).toBe(10);
    h.controller.pause();
    const paused = observed.length;
    h.clock.advance(500);
    expect(observed).toHaveLength(paused);
    h.controller.resume();
    h.clock.advance(1000);
    expect(observed.at(-1)).toBe(40);
    const held = observed.length;
    h.clock.advance(1000);
    expect(observed).toHaveLength(held);
    h.controller.stop();
    h.clock.advance(500);
    expect(observed.at(-1)).toBe(50);
    expect(observed).toEqual(h.frames);
  });

  it('manual: play runs the full intro and holds at the out-point (no loop, no auto-outro)', () => {
    const h = make({ mode: 'manual' });
    h.controller.play();
    expect(h.frames).toEqual([40]); // held at outPoint
    expect(h.events).toEqual([]); // no exit while holding
    h.clock.advance(10_000); // time passes — still holding, nothing changes
    expect(h.frames).toEqual([40]);
    expect(h.events).toEqual([]);
  });

  it('manual: stop runs the outro then settles', () => {
    const h = make({ mode: 'manual' });
    h.controller.play();
    h.controller.stop();
    expect(h.frames).toEqual([40, 50]); // outro played to active.out
    expect(h.events).toEqual(['exit', 'settle']);
  });

  it('hold freezes at the out-point — the entrance plays once and does not loop', () => {
    const h = make({ mode: 'manual' }, { hasAnimation: true });
    h.controller.play();
    for (let i = 0; i < 60; i++) h.clock.advance(20); // run well past the intro
    expect(Math.max(...h.frames)).toBe(40); // never past outPoint
    expect(h.frames[h.frames.length - 1]).toBe(40); // settled frozen at outPoint
    const len = h.frames.length;
    h.clock.advance(5000);
    expect(h.frames.length).toBe(len); // frozen — no new frames (not looping)
  });

  it('no out-point: play plays the whole timeline once and holds the last frame (not loop)', () => {
    const h = make({ mode: 'manual' }, { lifecycle: undefined, hasAnimation: true });
    h.controller.play();
    for (let i = 0; i < 70; i++) h.clock.advance(20);
    expect(Math.max(...h.frames)).toBe(50); // implicit out-point = active.out
    expect(h.frames[h.frames.length - 1]).toBe(50); // holds the last frame
    const len = h.frames.length;
    h.clock.advance(5000);
    expect(h.frames.length).toBe(len); // frozen, not looping
  });

  it('no out-point: stop plays the (empty) outro and settles', () => {
    const h = make({ mode: 'manual' }, { lifecycle: undefined });
    h.controller.play();
    expect(h.events).toEqual([]);
    h.controller.stop();
    expect(h.events).toEqual(['exit', 'settle']);
  });

  it('D-114 static: plays in, holds at the implicit out-point, and never auto-outs', () => {
    const h = make({ mode: 'static' }, { lifecycle: undefined });
    h.controller.play();
    expect(h.frames).toEqual([50]); // held at active.out (no marker)
    expect(h.events).toEqual([]);
    h.clock.advance(10_000); // no holdMs / content — holds until stop()
    expect(h.events).toEqual([]);
    expect(h.frames).toEqual([50]); // frozen, not looping
  });

  it('D-114 static: stop cuts cleanly — settles with no outro animation', () => {
    const h = make({ mode: 'static' }, { lifecycle: undefined });
    h.controller.play();
    h.controller.stop();
    expect(h.events).toEqual(['exit', 'settle']); // exits + settles immediately
    expect(h.frames.every((f) => f === 50)).toBe(true); // no frames below the held cut frame
  });

  it('D-114 static: ignores a stray out-point and still cuts (empty outro, no animation)', () => {
    const h = make({ mode: 'static' }, { lifecycle: { outPoint: 40 } });
    h.controller.play();
    expect(h.frames[h.frames.length - 1]).toBe(40); // held at the marker
    h.controller.stop();
    expect(h.events).toEqual(['exit', 'settle']);
    // The static outro is forced empty (from = active.out): no animated frames between 40 and 50.
    expect(h.frames.filter((f) => f > 40 && f < 50)).toEqual([]);
  });

  it('auto-out: plays the outro automatically after holdMs', () => {
    const h = make({ mode: 'auto-out', holdMs: 2000 });
    h.controller.play();
    expect(h.events).toEqual([]); // still holding
    h.clock.advance(1999);
    expect(h.events).toEqual([]); // not yet
    h.clock.advance(1);
    expect(h.events).toEqual(['exit', 'settle']);
    expect(h.frames).toEqual([40, 50]);
  });

  it('loop-cycle: repeats N times then settles once', () => {
    const h = make({ mode: 'loop-cycle', holdMs: 1000, repeat: 2 });
    h.controller.play();
    h.clock.advance(1000); // cycle 1 outro → cycle 2 intro (not final, no exit)
    expect(h.events).toEqual([]);
    h.clock.advance(1000); // cycle 2 outro → final settle
    expect(h.events).toEqual(['exit', 'settle']);
  });

  it('loop-cycle infinite: never settles on its own; stop() ends it', () => {
    const h = make({ mode: 'loop-cycle', holdMs: 500, repeat: 'infinite' });
    h.controller.play();
    for (let i = 0; i < 5; i++) h.clock.advance(500);
    expect(h.events).toEqual([]); // keeps looping
    h.controller.stop();
    expect(h.events).toEqual(['exit', 'settle']);
  });

  it('pause/resume freezes the hold countdown', () => {
    const h = make({ mode: 'auto-out', holdMs: 2000 });
    h.controller.play();
    h.clock.advance(1000); // half the hold elapsed
    h.controller.pause();
    h.clock.advance(5000); // paused — countdown frozen
    expect(h.events).toEqual([]);
    h.controller.resume();
    h.clock.advance(999);
    expect(h.events).toEqual([]); // 1000 + 999 < 2000
    h.clock.advance(1);
    expect(h.events).toEqual(['exit', 'settle']);
  });

  it('D-104 follow-up — content starts at the entrance-settle frame, not the out-point', () => {
    // The entrance settles at frame 10, but the out-point is frame 40 — a static hold
    // region [10 → 40]. Content must start the moment the entrance completes (frame 10),
    // yet the playhead must still reach + hold at the out-point (frame 40).
    const clock = makeClock();
    const frames: number[] = [];
    let contentAtFrame: number | null = null;
    const controller = new PlayoutController({
      frameRate: 50,
      active,
      lifecycle: { outPoint: 40 },
      holdEntryFrame: 10,
      playout: { mode: 'manual' },
      hasAnimation: true,
      applyFrame: (f) => frames.push(f),
      onExitStart: () => undefined,
      onSettle: () => undefined,
      onContentStart: () => {
        contentAtFrame = Math.max(...frames);
      },
      clock,
    });
    controller.play();
    for (let i = 0; i < 60; i++) clock.advance(20); // run well past the whole intro
    expect(contentAtFrame).toBe(10); // started at the entrance settle, NOT 40 (the out-point)
    expect(Math.max(...frames)).toBe(40); // …yet the playhead reached the out-point
    expect(frames[frames.length - 1]).toBe(40); // …and holds there
  });

  it('D-104 follow-up — no early settle (entrance ends AT the out-point): content fires at the out-point', () => {
    const clock = makeClock();
    let contentAtFrame: number | null = null;
    const frames: number[] = [];
    const controller = new PlayoutController({
      frameRate: 50,
      active,
      lifecycle: { outPoint: 40 },
      holdEntryFrame: 40, // entrance animates right up to the out-point
      playout: { mode: 'manual' },
      hasAnimation: true,
      applyFrame: (f) => frames.push(f),
      onExitStart: () => undefined,
      onSettle: () => undefined,
      onContentStart: () => {
        contentAtFrame = Math.max(...frames);
      },
      clock,
    });
    controller.play();
    for (let i = 0; i < 60; i++) clock.advance(20);
    expect(contentAtFrame).toBe(40); // unchanged: content at the out-point/hold-entry
    expect(frames.filter((f) => f === 40).length).toBe(1); // no redundant double-paint of 40
  });

  it('content-driven hold ends when waitForContent resolves (holdMs ignored)', async () => {
    // holdMs is present but MUST be ignored — the completion promise wins.
    let resolveContent: () => void = () => undefined;
    const h = make(
      { mode: 'auto-out', holdSource: 'content-driven', holdMs: 99 },
      { waitForContent: () => new Promise<void>((res) => (resolveContent = res)) },
    );
    h.controller.play();
    h.clock.advance(10_000); // time alone never ends a content hold
    expect(h.events).toEqual([]);
    resolveContent();
    await flushMicrotasks();
    expect(h.events).toEqual(['exit', 'settle']);
  });

  it('D-187 — content completion drains the current Middle pass before Outro', async () => {
    const clock = makeClock();
    const middle: number[] = [];
    const outro: number[] = [];
    const events: string[] = [];
    let completeContent: () => void = () => undefined;
    const controller = new PlayoutController({
      frameRate: 10,
      active: { in: 0, out: 50 },
      lifecycle: { contentStart: 10, outPoint: 30 },
      holdEntryFrame: 10,
      playout: { mode: 'auto-out', holdSource: 'content-driven', holdBehavior: 'loop' },
      hasAnimation: true,
      applyFrame: () => undefined,
      applyHoldFrame: (frame) => middle.push(frame),
      holdLoopEnabled: true,
      holdFrameDependent: true,
      applyOutroFrame: (frame) => outro.push(frame),
      outroFrameDependent: true,
      waitForContent: () =>
        new Promise<void>((resolve) => {
          completeContent = resolve;
        }),
      onExitStart: () => events.push('exit'),
      onSettle: () => events.push('settle'),
      clock,
    });

    controller.play();
    for (let index = 0; index < 37; index += 1) clock.advance(100);
    expect(middle.at(-1)).toBe(17); // seven frames into the 10 → 30 pass

    completeContent();
    await flushMicrotasks();
    expect(events).toEqual([]); // no jump to the Outro start at content completion
    const completionIndex = middle.length - 1;

    for (let index = 0; index < 12; index += 1) clock.advance(100);
    expect(middle.at(-1)).toBe(29);
    expect(events).toEqual([]);

    clock.advance(100); // the current pass reaches 30, then Outro owns the clock
    expect(middle.slice(completionIndex)).toEqual([
      17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30,
    ]);
    expect(events).toEqual(['exit']);
    expect(outro.at(0)).toBe(30);
  });

  it('D-187 — Pause/Resume preserves a pending graceful Middle exit', async () => {
    const clock = makeClock();
    const middle: number[] = [];
    const events: string[] = [];
    let completeContent: () => void = () => undefined;
    const controller = new PlayoutController({
      frameRate: 10,
      active: { in: 0, out: 50 },
      lifecycle: { contentStart: 10, outPoint: 30 },
      holdEntryFrame: 10,
      playout: { mode: 'auto-out', holdSource: 'content-driven', holdBehavior: 'loop' },
      hasAnimation: true,
      applyFrame: () => undefined,
      applyHoldFrame: (frame) => middle.push(frame),
      holdLoopEnabled: true,
      holdFrameDependent: true,
      outroFrameDependent: true,
      waitForContent: () =>
        new Promise<void>((resolve) => {
          completeContent = resolve;
        }),
      onExitStart: () => events.push('exit'),
      onSettle: () => events.push('settle'),
      clock,
    });

    controller.play();
    for (let index = 0; index < 37; index += 1) clock.advance(100);
    completeContent();
    await flushMicrotasks();
    controller.pause();
    const held = middle.at(-1);
    clock.advance(5_000);
    expect(middle.at(-1)).toBe(held);
    expect(events).toEqual([]);

    controller.resume();
    for (let index = 0; index < 13; index += 1) clock.advance(100);
    expect(middle.at(-1)).toBe(30);
    expect(events).toEqual(['exit']);
  });

  it('D-187 — operator Stop overrides a pending graceful exit immediately', async () => {
    const clock = makeClock();
    const middle: number[] = [];
    const events: string[] = [];
    let completeContent: () => void = () => undefined;
    const controller = new PlayoutController({
      frameRate: 10,
      active: { in: 0, out: 50 },
      lifecycle: { contentStart: 10, outPoint: 30 },
      holdEntryFrame: 10,
      playout: { mode: 'auto-out', holdSource: 'content-driven', holdBehavior: 'loop' },
      hasAnimation: true,
      applyFrame: () => undefined,
      applyHoldFrame: (frame) => middle.push(frame),
      holdLoopEnabled: true,
      holdFrameDependent: true,
      outroFrameDependent: true,
      waitForContent: () =>
        new Promise<void>((resolve) => {
          completeContent = resolve;
        }),
      onExitStart: () => events.push('exit'),
      onSettle: () => events.push('settle'),
      clock,
    });

    controller.play();
    for (let index = 0; index < 37; index += 1) clock.advance(100);
    completeContent();
    await flushMicrotasks();
    expect(events).toEqual([]); // automatic exit is draining the pass

    controller.stop();
    expect(events).toEqual(['exit']); // operator command does not wait for frame 30
    const middleAtStop = [...middle];
    clock.advance(2_000);
    expect(middle).toEqual(middleAtStop);
  });

  it('D-187 — a degenerate Middle range exits immediately when content completes', async () => {
    const clock = makeClock();
    const events: string[] = [];
    let completeContent: () => void = () => undefined;
    const controller = new PlayoutController({
      frameRate: 10,
      active: { in: 0, out: 30 },
      lifecycle: { contentStart: 20, outPoint: 20 },
      holdEntryFrame: 20,
      playout: { mode: 'auto-out', holdSource: 'content-driven', holdBehavior: 'loop' },
      hasAnimation: false,
      applyFrame: () => undefined,
      holdLoopEnabled: true,
      holdFrameDependent: false,
      waitForContent: () =>
        new Promise<void>((resolve) => {
          completeContent = resolve;
        }),
      onExitStart: () => events.push('exit'),
      onSettle: () => events.push('settle'),
      clock,
    });

    controller.play();
    for (let index = 0; index < 20; index += 1) clock.advance(100);
    completeContent();
    await flushMicrotasks();
    expect(events).toEqual(['exit', 'settle']);
  });

  it('D-187 — selected time-driven media gets a clock-only graceful boundary on air', async () => {
    const clock = makeClock();
    const events: string[] = [];
    let completeContent: () => void = () => undefined;
    const controller = new PlayoutController({
      frameRate: 10,
      active: { in: 0, out: 50 },
      lifecycle: { contentStart: 10, outPoint: 30 },
      holdEntryFrame: 10,
      playout: { mode: 'auto-out', holdSource: 'content-driven', holdBehavior: 'loop' },
      hasAnimation: false,
      applyFrame: () => undefined,
      // Runtime sets this for a selected Video/Lottie even when no native frame needs paint.
      holdLoopEnabled: true,
      holdFrameDependent: false,
      waitForContent: () =>
        new Promise<void>((resolve) => {
          completeContent = resolve;
        }),
      onExitStart: () => events.push('exit'),
      onSettle: () => events.push('settle'),
      clock,
    });

    controller.play();
    for (let index = 0; index < 17; index += 1) clock.advance(100);
    completeContent();
    await flushMicrotasks();
    expect(events).toEqual([]); // clock-only pass still drains; no immediate media jump

    for (let index = 0; index < 12; index += 1) clock.advance(100);
    expect(events).toEqual([]);
    clock.advance(100);
    expect(events).toEqual(['exit', 'settle']);
  });

  it.each<{ label: string; playout: Playout; waitForContent?: () => Promise<void> }>([
    {
      label: 'manual',
      playout: { mode: 'manual', holdBehavior: 'freeze' },
    },
    {
      label: 'timed',
      playout: {
        mode: 'auto-out',
        holdSource: 'timed',
        holdMs: 1_000,
        holdBehavior: 'freeze',
      },
    },
    {
      label: 'content-driven',
      playout: {
        mode: 'auto-out',
        holdSource: 'content-driven',
        holdBehavior: 'freeze',
      },
      waitForContent: () => new Promise<void>(() => undefined),
    },
  ])('B-379 — $label native Freeze keeps telemetry on the Out-point picture', (scenario) => {
    const clock = makeClock();
    const painted: number[] = [];
    const observed: number[] = [];
    const controller = new PlayoutController({
      frameRate: 50,
      active,
      lifecycle: { contentStart: 10, outPoint: 40 },
      holdEntryFrame: 10,
      playout: scenario.playout,
      hasAnimation: true,
      applyFrame: (frame) => painted.push(frame),
      observeFrame: (frame) => observed.push(frame),
      ...(scenario.waitForContent === undefined ? {} : { waitForContent: scenario.waitForContent }),
      onExitStart: () => undefined,
      onSettle: () => undefined,
      clock,
    });

    controller.play();
    // Intro reaches Out point after 800 ms. Keep every scenario inside its active Hold.
    for (let index = 0; index < 45; index += 1) clock.advance(20);

    expect(painted.at(-1)).toBe(40);
    expect(observed.at(-1)).toBe(40);
    expect(observed.slice(observed.lastIndexOf(40) + 1)).not.toContain(10);
  });

  it('D-186 — Follow Lottie parks telemetry at Out point, then Outro advances it once', async () => {
    const clock = makeClock();
    const observed: number[] = [];
    const events: string[] = [];
    let completeContent: () => void = () => undefined;
    let completeMediaOutro: () => void = () => undefined;
    const controller = new PlayoutController({
      frameRate: 50,
      active,
      lifecycle: { contentStart: 10, outPoint: 40 },
      holdEntryFrame: 10,
      playout: { mode: 'auto-out', holdSource: 'content-driven', holdBehavior: 'freeze' },
      hasAnimation: false,
      applyFrame: () => undefined,
      observeFrame: (frame) => observed.push(frame),
      observeOutroGate: true,
      waitForContent: () =>
        new Promise<void>((resolve) => {
          completeContent = resolve;
        }),
      beforeOutro: () =>
        new Promise<void>((resolve) => {
          completeMediaOutro = resolve;
        }),
      onExitStart: () => events.push('exit'),
      onSettle: () => events.push('settle'),
      clock,
    });

    controller.play();
    // Authored Content start consumes 200 ms, then the static settle collapses to Out point.
    for (let index = 0; index < 12; index += 1) clock.advance(20);
    expect(observed.at(-1)).toBe(40);
    const held = [...observed];
    for (let index = 0; index < 60; index += 1) clock.advance(20);
    expect(observed).toEqual(held); // no observer-only Middle loop under Freeze

    completeContent();
    await flushMicrotasks();
    expect(events).toEqual(['exit']);
    expect(observed.at(-1)).toBe(40); // visible media Outro starts at the composition Out point

    for (let index = 0; index < 5; index += 1) clock.advance(20);
    expect(observed.some((frame) => frame > 40 && frame < 50)).toBe(true);

    completeMediaOutro();
    await flushMicrotasks();
    expect(observed.at(-1)).toBe(50);
    // The visually-static background leg collapses without replaying 40 -> 50 telemetry.
    expect(observed.slice(-2)).not.toEqual([40, 50]);
    expect(events).toEqual(['exit', 'settle']);
  });

  it('D-187 — selected Middle wraps while the unchecked tail stays monotonic through pause and exit', async () => {
    let ms = 0;
    let nextId = 1;
    const rafs = new Map<number, (timestamp: number) => void>();
    const timers = new Map<number, { due: number; callback: () => void }>();
    const clock = {
      now: () => ms,
      raf: (callback: (timestamp: number) => void) => {
        const id = nextId++;
        rafs.set(id, callback);
        return id;
      },
      cancel: (id: number) => rafs.delete(id),
      setTimeout: (callback: () => void, delay: number) => {
        const id = nextId++;
        timers.set(id, { due: ms + delay, callback });
        return id;
      },
      clearTimeout: (handle: unknown) => {
        if (typeof handle === 'number') timers.delete(handle);
      },
      advance: (delta: number) => {
        ms += delta;
        const due = [...timers.entries()]
          .filter(([, timer]) => timer.due <= ms)
          .sort((a, b) => a[1].due - b[1].due);
        for (const [id, timer] of due) {
          timers.delete(id);
          timer.callback();
        }
        const round = [...rafs.entries()];
        for (const [id] of round) rafs.delete(id);
        for (const [, callback] of round) callback(ms);
      },
    };
    const advance = async (duration: number): Promise<void> => {
      for (let left = duration; left > 0; left -= 100) {
        clock.advance(Math.min(100, left));
        await flushMicrotasks();
      }
    };

    const middle: number[] = [];
    const tail: number[] = [];
    const outro: number[] = [];
    const events: string[] = [];
    const controller = new PlayoutController({
      frameRate: 10,
      active: { in: 0, out: 80 },
      lifecycle: { contentStart: 10, outPoint: 30 },
      holdEntryFrame: 10,
      playout: { mode: 'manual', holdBehavior: 'loop' },
      hasAnimation: true,
      applyFrame: () => undefined,
      applyHoldFrame: (frame) => middle.push(frame),
      holdLoopEnabled: true,
      holdFrameDependent: true,
      applyHoldTailFrame: (frame) => tail.push(frame),
      holdTailEnabled: true,
      applyOutroFrame: (frame) => outro.push(frame),
      outroFrameDependent: true,
      onExitStart: () => events.push('exit'),
      onSettle: () => events.push('settle'),
      clock,
    });

    controller.play();
    await advance(5_500); // Intro 3 s, then more than one full 10→30 Middle pass.
    expect(middle.some((frame, index) => index > 0 && frame < middle[index - 1]!)).toBe(true);
    expect(tail.every((frame, index) => index === 0 || frame >= tail[index - 1]!)).toBe(true);

    const middleAtPause = middle.length;
    const tailAtPause = tail.length;
    controller.pause();
    await advance(1_000);
    expect(middle).toHaveLength(middleAtPause);
    expect(tail).toHaveLength(tailAtPause);

    controller.resume();
    await advance(500);
    expect(middle.length).toBeGreaterThan(middleAtPause);
    expect(tail.length).toBeGreaterThan(tailAtPause);

    controller.stop();
    expect(events).toEqual(['exit']);
    const tailAtExit = tail.at(-1) ?? 0;
    await advance(1_000);
    // Selected Outro and unchecked tail move concurrently; neither waits for the other to start.
    expect(outro.at(-1)).toBeGreaterThan(30);
    expect(tail.at(-1)).toBeGreaterThan(tailAtExit);
    expect(events).toEqual(['exit']);

    await advance(5_000);
    expect(tail.at(-1)).toBe(80);
    expect(outro.at(-1)).toBe(80);
    expect(events).toEqual(['exit', 'settle']);
  });

  it('a null waitForContent (no content elements) is a zero-length hold', () => {
    const h = make(
      { mode: 'auto-out', holdSource: 'content-driven' },
      { waitForContent: () => null },
    );
    h.controller.play();
    // Deferred like a 0ms timed hold (NOT synchronous — a zero-hold root must
    // not settle before its children receive the play() cascade).
    expect(h.events).toEqual([]);
    h.clock.advance(0);
    expect(h.events).toEqual(['exit', 'settle']);
  });

  it('a never-resolving wait (infinite ticker) holds until stop()', () => {
    const h = make(
      { mode: 'loop-cycle', holdSource: 'content-driven', repeat: 'infinite' },
      { waitForContent: () => new Promise<void>(() => undefined) },
    );
    h.controller.play();
    h.clock.advance(100_000);
    expect(h.events).toEqual([]); // still holding
    h.controller.stop();
    expect(h.events).toEqual(['exit', 'settle']);
  });

  it('a STALE content resolution (after stop) is ignored — the hold token guards', async () => {
    let resolveContent: () => void = () => undefined;
    const h = make(
      { mode: 'auto-out', holdSource: 'content-driven' },
      { waitForContent: () => new Promise<void>((res) => (resolveContent = res)) },
    );
    h.controller.play();
    h.controller.stop(); // operator stops mid-hold → outro + settle now
    expect(h.events).toEqual(['exit', 'settle']);
    const frames = h.frames.length;
    resolveContent(); // the abandoned hold's promise resolves late
    await flushMicrotasks();
    expect(h.events).toEqual(['exit', 'settle']); // no second exit
    expect(h.frames.length).toBe(frames); // no replayed outro frames
  });

  it('loop-cycle × content-driven: a FRESH wait per cycle; repeat N exits after N cycles', async () => {
    const resolvers: (() => void)[] = [];
    let calls = 0;
    const h = make(
      { mode: 'loop-cycle', holdSource: 'content-driven', repeat: 2 },
      {
        waitForContent: () => {
          calls += 1;
          return new Promise<void>((res) => resolvers.push(res));
        },
      },
    );
    h.controller.play();
    expect(calls).toBe(1); // cycle 1 holding on content
    resolvers[0]?.();
    await flushMicrotasks();
    expect(h.events).toEqual([]); // cycle 1 outro→intro → cycle 2 holds
    expect(calls).toBe(2); // re-invoked — cycle 2 awaits a NEW run
    resolvers[1]?.();
    await flushMicrotasks();
    expect(h.events).toEqual(['exit', 'settle']); // 2 cycles done
  });
});

/** Content-completion resolutions land on microtasks — drain them. */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
}

describe('PlayoutController — D-026 state-aware stop', () => {
  it('stop() on a SETTLED auto-out controller is a no-op (does not replay the exit)', () => {
    const h = make({ mode: 'auto-out', holdMs: 1000 });
    h.controller.play();
    h.clock.advance(1000); // hold elapses → outro → settle
    expect(h.events).toEqual(['exit', 'settle']);
    expect(h.controller.isSettled()).toBe(true);
    h.controller.stop(); // already finished — must NOT re-exit
    expect(h.events).toEqual(['exit', 'settle']); // unchanged
  });

  it('stop() on a COMPLETED finite loop-cycle is a no-op', () => {
    const h = make({ mode: 'loop-cycle', holdMs: 500, repeat: 2 });
    h.controller.play();
    h.clock.advance(500); // cycle 1 → cycle 2
    h.clock.advance(500); // cycle 2 → settle
    expect(h.events).toEqual(['exit', 'settle']);
    expect(h.controller.isSettled()).toBe(true);
    h.controller.stop();
    expect(h.events).toEqual(['exit', 'settle']); // not re-exited
  });

  it('stop() still exits an INFINITE loop (it never settles on its own)', () => {
    const h = make({ mode: 'loop-cycle', holdMs: 500, repeat: 'infinite' });
    h.controller.play();
    for (let i = 0; i < 4; i++) h.clock.advance(500);
    expect(h.events).toEqual([]); // looping, not settled
    expect(h.controller.isSettled()).toBe(false);
    h.controller.stop();
    expect(h.events).toEqual(['exit', 'settle']);
  });

  it('stop() still exits a MANUAL hold', () => {
    const h = make({ mode: 'manual' });
    h.controller.play();
    expect(h.controller.isSettled()).toBe(false);
    h.controller.stop();
    expect(h.events).toEqual(['exit', 'settle']);
  });

  it('stop() still exits a PAUSED controller', () => {
    const h = make({ mode: 'auto-out', holdMs: 1000 });
    h.controller.play();
    h.clock.advance(400);
    h.controller.pause();
    expect(h.controller.isSettled()).toBe(false);
    h.controller.stop();
    expect(h.events).toEqual(['exit', 'settle']);
  });
});
