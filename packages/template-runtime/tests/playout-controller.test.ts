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
    lifecycle?: Lifecycle;
    hasAnimation?: boolean;
    waitForContent?: () => Promise<void> | null;
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
    clock,
  });
  return { controller, frames, events, clock };
}

describe('PlayoutController', () => {
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
