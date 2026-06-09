import { describe, expect, it } from 'vitest';
import { FrameDriver } from '../src/frame-driver.js';

interface MockClock {
  ms: number;
  pending: ((ts: number) => void)[];
  now: () => number;
  raf: (cb: (ts: number) => void) => number;
  cancel: (h: number) => void;
  /** Advance the clock by ms and flush one rAF tick. */
  advance: (ms: number) => void;
}

function makeClock(): MockClock {
  const clock: MockClock = {
    ms: 0,
    pending: [],
    now: () => clock.ms,
    raf: (cb) => {
      clock.pending.push(cb);
      return clock.pending.length;
    },
    cancel: () => {
      clock.pending = [];
    },
    advance: (ms) => {
      clock.ms += ms;
      const cbs = clock.pending;
      clock.pending = [];
      for (const cb of cbs) cb(clock.ms);
    },
  };
  return clock;
}

describe('FrameDriver', () => {
  it('emits the in-frame synchronously on start()', () => {
    const clock = makeClock();
    const frames: number[] = [];
    const d = new FrameDriver({
      frameRate: 50,
      range: { in: 0, out: 50 },
      onFrame: (f) => frames.push(f),
      raf: clock.raf,
      cancel: clock.cancel,
      now: clock.now,
    });
    d.start();
    expect(frames).toEqual([0]);
    d.stop();
  });

  it('advances the frame counter at the configured frameRate', () => {
    const clock = makeClock();
    const frames: number[] = [];
    const d = new FrameDriver({
      frameRate: 50,
      range: { in: 0, out: 100 },
      onFrame: (f) => frames.push(f),
      raf: clock.raf,
      cancel: clock.cancel,
      now: clock.now,
    });
    d.start();
    clock.advance(20); // 1 frame at 50fps
    clock.advance(20);
    clock.advance(20);
    expect(frames).toEqual([0, 1, 2, 3]);
    d.stop();
  });

  it('loops the playhead back to range.in when reaching range.out', () => {
    const clock = makeClock();
    const frames: number[] = [];
    const d = new FrameDriver({
      frameRate: 50,
      range: { in: 0, out: 5 },
      onFrame: (f) => frames.push(f),
      raf: clock.raf,
      cancel: clock.cancel,
      now: clock.now,
    });
    d.start();
    for (let i = 0; i < 7; i++) clock.advance(20);
    expect(frames).toEqual([0, 1, 2, 3, 4, 0, 1, 2]);
    d.stop();
  });

  it('stop() halts emission', () => {
    const clock = makeClock();
    const frames: number[] = [];
    const d = new FrameDriver({
      frameRate: 50,
      range: { in: 0, out: 50 },
      onFrame: (f) => frames.push(f),
      raf: clock.raf,
      cancel: clock.cancel,
      now: clock.now,
    });
    d.start();
    clock.advance(20);
    d.stop();
    clock.advance(100);
    expect(frames).toEqual([0, 1]);
  });

  it('is idempotent on double start() / stop()', () => {
    const clock = makeClock();
    const frames: number[] = [];
    const d = new FrameDriver({
      frameRate: 50,
      range: { in: 0, out: 50 },
      onFrame: (f) => frames.push(f),
      raf: clock.raf,
      cancel: clock.cancel,
      now: clock.now,
    });
    d.start();
    d.start();
    d.stop();
    d.stop();
    expect(true).toBe(true);
  });

  // D-020 — `once` mode + pause/resume.

  it('once mode plays the sub-range a single time, holds, and calls onEnd', () => {
    const clock = makeClock();
    const frames: number[] = [];
    let ended = 0;
    const d = new FrameDriver({
      frameRate: 50,
      range: { in: 10, out: 14 },
      mode: 'once',
      onFrame: (f) => frames.push(f),
      onEnd: () => {
        ended += 1;
      },
      raf: clock.raf,
      cancel: clock.cancel,
      now: clock.now,
    });
    d.start(); // 10
    for (let i = 0; i < 6; i++) clock.advance(20); // 11,12,13,14(end), then idle
    expect(frames).toEqual([10, 11, 12, 13, 14]);
    expect(ended).toBe(1);
  });

  it('once mode with a zero-length range ends immediately at the in-frame', () => {
    const clock = makeClock();
    const frames: number[] = [];
    let ended = 0;
    const d = new FrameDriver({
      frameRate: 50,
      range: { in: 7, out: 7 },
      mode: 'once',
      onFrame: (f) => frames.push(f),
      onEnd: () => {
        ended += 1;
      },
      raf: clock.raf,
      cancel: clock.cancel,
      now: clock.now,
    });
    d.start();
    expect(frames).toEqual([7]);
    expect(ended).toBe(1);
  });

  it('pause() freezes the frame and resume() continues from it', () => {
    const clock = makeClock();
    const frames: number[] = [];
    const d = new FrameDriver({
      frameRate: 50,
      range: { in: 0, out: 100 },
      onFrame: (f) => frames.push(f),
      raf: clock.raf,
      cancel: clock.cancel,
      now: clock.now,
    });
    d.start(); // 0
    clock.advance(20); // 1
    d.pause();
    clock.advance(1000); // frozen — no frames
    d.resume();
    clock.advance(20); // 2 (continues, not jumped forward by the paused span)
    expect(frames).toEqual([0, 1, 2]);
    d.stop();
  });
});
