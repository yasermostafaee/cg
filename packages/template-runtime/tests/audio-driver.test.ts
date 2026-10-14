import { describe, expect, it } from 'vitest';
import { AudioDriver, gainOfDb, type AudioHandle } from '../src/audio-driver.js';
import { envelopeAt } from '../src/audio-graph.js';

/**
 * `D-165` — the audio element's DRIVER on an injected clock: when a sound starts (entrance, a time
 * after it, the exit), that a pause holds a timed sound's countdown, that the exit never waits on a
 * sound and the settle never cuts an exit sound, and that a hard Clear plays nothing.
 */

function fakeHandle() {
  const calls: string[] = [];
  let playing = false;
  const handle: AudioHandle = {
    play: () => {
      calls.push('play');
      playing = true;
    },
    pause: () => {
      calls.push('pause');
      playing = false;
    },
    resume: () => {
      calls.push('resume');
      playing = true;
    },
    halt: () => {
      calls.push('halt');
      playing = false;
    },
    playing: () => playing,
  };
  return { handle, calls };
}

function fakeClock() {
  let ms = 0;
  const timers: { id: number; due: number; cb: () => void }[] = [];
  let next = 1;
  return {
    now: () => ms,
    setTimeout: (cb: () => void, delay: number) => {
      const id = next++;
      timers.push({ id, due: ms + delay, cb });
      return id;
    },
    clearTimeout: (h: unknown) => {
      const i = timers.findIndex((t) => t.id === h);
      if (i >= 0) timers.splice(i, 1);
    },
    advance(delta: number) {
      ms += delta;
      for (const t of timers.filter((x) => x.due <= ms)) {
        timers.splice(timers.indexOf(t), 1);
        t.cb();
      }
    },
  };
}

describe('D-165 — AudioDriver', () => {
  it('🔴 an ENTRANCE sound starts at start(), once — nothing replays it', () => {
    const { handle, calls } = fakeHandle();
    const d = new AudioDriver({ handle, start: { at: 'entrance' }, clock: fakeClock() });
    d.start();
    expect(calls).toEqual(['play']);
    d.pause();
    d.resume();
    expect(calls.filter((c) => c === 'play')).toHaveLength(1);
  });

  it('🔴 a TIMED sound starts its ms after the entrance; a pause holds the countdown', () => {
    const clock = fakeClock();
    const { handle, calls } = fakeHandle();
    const d = new AudioDriver({ handle, start: { at: 'time', ms: 500 }, clock });
    d.start();
    clock.advance(200);
    expect(calls).not.toContain('play');
    d.pause(); // 300 ms left
    clock.advance(5000);
    expect(calls).not.toContain('play');
    d.resume();
    clock.advance(299);
    expect(calls).not.toContain('play');
    clock.advance(1);
    expect(calls).toContain('play');
  });

  it('🔴 an EXIT sound starts at playOutro(), which resolves AT ONCE — a sound never holds the exit', async () => {
    const { handle, calls } = fakeHandle();
    const d = new AudioDriver({ handle, start: { at: 'exit' }, clock: fakeClock() });
    d.start();
    expect(calls).not.toContain('play');
    let resolved = false;
    void d.playOutro().then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(true);
    expect(calls).toContain('play');
  });

  it('⭐ the settle after the exit does NOT cut an exit sound; a new play does', () => {
    const { handle, calls } = fakeHandle();
    const d = new AudioDriver({ handle, start: { at: 'exit' }, clock: fakeClock() });
    d.start();
    void d.playOutro();
    calls.length = 0;
    d.stop(); // the root settle
    expect(calls).toEqual([]); // still sounding
    expect(d.isRunning()).toBe(true);
    d.reset(); // the next take
    expect(calls).toEqual(['halt']);
  });

  it('the settle DOES cut an entrance sound still playing (the control for the exit case)', () => {
    const { handle, calls } = fakeHandle();
    const d = new AudioDriver({ handle, start: { at: 'entrance' }, clock: fakeClock() });
    d.start();
    calls.length = 0;
    d.stop();
    expect(calls).toEqual(['halt']);
  });

  it('a timed sound whose moment has not come when the exit begins never starts', () => {
    const clock = fakeClock();
    const { handle, calls } = fakeHandle();
    const d = new AudioDriver({ handle, start: { at: 'time', ms: 1000 }, clock });
    d.start();
    clock.advance(400);
    void d.playOutro();
    clock.advance(5000);
    expect(calls).not.toContain('play');
  });

  it('🔴 destroy() (the page removed — a hard Clear) silences everything, for good', () => {
    const { handle, calls } = fakeHandle();
    const d = new AudioDriver({ handle, start: { at: 'exit' }, clock: fakeClock() });
    d.start();
    d.destroy();
    void d.playOutro();
    d.start();
    expect(calls).not.toContain('play');
  });
});

describe('D-165 — gainOfDb and the fade envelope', () => {
  it('converts dB to a linear gain, clamped to −60…+6', () => {
    expect(gainOfDb(0)).toBe(1);
    expect(gainOfDb(-6.0206)).toBeCloseTo(0.5, 4);
    expect(gainOfDb(-12)).toBeCloseTo(0.2512, 4);
    expect(gainOfDb(6)).toBeCloseTo(1.9953, 4);
    expect(gainOfDb(-60)).toBeCloseTo(0.001, 6);
    expect(gainOfDb(-100)).toBeCloseTo(0.001, 6); // clamped, never silence
    expect(gainOfDb(20)).toBeCloseTo(1.9953, 4);
    expect(gainOfDb(Number.NaN)).toBe(1);
  });

  it('fades in from 0 and out to 0, at the level in between', () => {
    const shape = { gain: 0.5, fadeInMs: 100, fadeOutMs: 200, durationMs: 1000 };
    expect(envelopeAt(shape, 0)).toBe(0);
    expect(envelopeAt(shape, 0.05)).toBeCloseTo(0.25, 6);
    expect(envelopeAt(shape, 0.5)).toBe(0.5);
    expect(envelopeAt(shape, 0.9)).toBeCloseTo(0.25, 6);
    expect(envelopeAt(shape, 1)).toBe(0);
    // No fades: the level throughout.
    expect(envelopeAt({ ...shape, fadeInMs: 0, fadeOutMs: 0 }, 0)).toBe(0.5);
  });
});
