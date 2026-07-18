import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRuntime } from '../src/runtime.js';
import { lowerThirdScene } from './fixtures.js';

/**
 * B-088 — a clock WITH rAF, so a test can drive a frame SWEEP deterministically.
 * (`makeTimerClock` further down carries timers only, which is enough for hold timing
 * but cannot step a `FrameDriver`.) `advance` walks in 20 ms steps = one frame at the
 * fixtures' 50 fps, flushing rAF each step so every intermediate frame is really painted.
 */
function makeSweepClock() {
  let ms = 0;
  const rafs = new Map<number, (ts: number) => void>();
  const timers: { id: number; due: number; cb: () => void }[] = [];
  let nextId = 1;
  return {
    now: (): number => ms,
    raf: (cb: (ts: number) => void): number => {
      const id = nextId++;
      rafs.set(id, cb);
      return id;
    },
    cancel: (h: number): void => {
      rafs.delete(h);
    },
    setTimeout: (cb: () => void, delay: number): unknown => {
      const id = nextId++;
      timers.push({ id, due: ms + delay, cb });
      return id;
    },
    clearTimeout: (h: unknown): void => {
      const i = timers.findIndex((t) => t.id === h);
      if (i >= 0) timers.splice(i, 1);
    },
    advance: (deltaMs: number): void => {
      let left = deltaMs;
      while (left > 0) {
        const step = Math.min(20, left);
        ms += step;
        left -= step;
        const due = timers.filter((t) => t.due <= ms).sort((a, b) => a.due - b.due);
        for (const t of due) {
          const i = timers.indexOf(t);
          if (i >= 0) timers.splice(i, 1);
          t.cb();
        }
        const round = [...rafs.entries()];
        for (const [id] of round) rafs.delete(id);
        for (const [, cb] of round) cb(ms);
      }
    },
  };
}

describe('createRuntime — lifecycle', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.body.className = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
    document.body.className = '';
  });

  it('renders the stage and hides it via cg-pending initially', () => {
    createRuntime(lowerThirdScene, { skipFontLoad: true });
    expect(document.body.classList.contains('cg-pending')).toBe(true);
    expect(document.querySelector('.cg-stage')).toBeTruthy();
  });

  it('reveals the stage after play()', async () => {
    const runtime = createRuntime(lowerThirdScene, { skipFontLoad: true });
    await runtime.ready;
    await runtime.play({ anchor: 'دکتر نادری' });
    expect(document.body.classList.contains('cg-pending')).toBe(false);
    const nameEl = document.querySelector<HTMLElement>('[data-cg-element-id="name"]');
    expect(nameEl?.textContent).toBe('دکتر نادری');
  });

  it('update() merges into existing values', async () => {
    const runtime = createRuntime(lowerThirdScene, { skipFontLoad: true });
    await runtime.play({ anchor: 'first' });
    await runtime.update({ anchor: 'second' });
    const nameEl = document.querySelector<HTMLElement>('[data-cg-element-id="name"]');
    expect(nameEl?.textContent).toBe('second');
  });

  it('update() before play() is retained — play with no data preserves it', async () => {
    const runtime = createRuntime(lowerThirdScene, { skipFontLoad: true });
    await runtime.ready;
    await runtime.update({ anchor: 'از CG ADD' });
    await runtime.play({}); // CG PLAY with no data must not wipe the prior update
    const nameEl = document.querySelector<HTMLElement>('[data-cg-element-id="name"]');
    expect(nameEl?.textContent).toBe('از CG ADD');
  });

  it('update() with replace mode clears omitted keys to defaults', async () => {
    const runtime = createRuntime(lowerThirdScene, { skipFontLoad: true });
    await runtime.play({ anchor: 'first' });
    await runtime.update({}, { mode: 'replace' });
    const nameEl = document.querySelector<HTMLElement>('[data-cg-element-id="name"]');
    // anchor falls back to its declared default 'سارا نادری'
    expect(nameEl?.textContent).toBe('سارا نادری');
  });

  it('stop() re-adds cg-pending', async () => {
    const runtime = createRuntime(lowerThirdScene, { skipFontLoad: true });
    await runtime.play({});
    await runtime.stop();
    expect(document.body.classList.contains('cg-pending')).toBe(true);
  });

  it('play() after stop() works (replay)', async () => {
    const runtime = createRuntime(lowerThirdScene, { skipFontLoad: true });
    await runtime.play({ anchor: 'first' });
    await runtime.stop();
    await runtime.play({ anchor: 'second' });
    const nameEl = document.querySelector<HTMLElement>('[data-cg-element-id="name"]');
    expect(nameEl?.textContent).toBe('second');
  });

  it('remove() detaches the stage and throws on subsequent play()', async () => {
    const runtime = createRuntime(lowerThirdScene, { skipFontLoad: true });
    await runtime.play({});
    runtime.remove();
    expect(document.querySelector('.cg-stage')).toBeNull();
    await expect(runtime.play({})).rejects.toThrow(/Runtime removed/);
  });

  it('emits ready / play.start / play.end / stop.start / stop.end', async () => {
    const runtime = createRuntime(lowerThirdScene, { skipFontLoad: true });
    const seen: string[] = [];
    runtime.on('ready', () => seen.push('ready'));
    runtime.on('play.start', () => seen.push('play.start'));
    runtime.on('play.end', () => seen.push('play.end'));
    runtime.on('stop.start', () => seen.push('stop.start'));
    runtime.on('stop.end', () => seen.push('stop.end'));
    await runtime.ready;
    await runtime.play({});
    await runtime.stop();
    expect(seen).toEqual(['ready', 'play.start', 'play.end', 'stop.start', 'stop.end']);
  });

  it('emits update events on update()', async () => {
    const runtime = createRuntime(lowerThirdScene, { skipFontLoad: true });
    const cb = vi.fn();
    runtime.on('update', cb);
    await runtime.play({});
    await runtime.update({ anchor: 'x' });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('subscriber cleanup unsubscribes', async () => {
    const runtime = createRuntime(lowerThirdScene, { skipFontLoad: true });
    const cb = vi.fn();
    const off = runtime.on('play.start', cb);
    off();
    await runtime.play({});
    expect(cb).not.toHaveBeenCalled();
  });

  it('tick() hides elements outside their lifespan and restores them inside', async () => {
    const scene: typeof lowerThirdScene = {
      ...lowerThirdScene,
      layers: lowerThirdScene.layers.map((layer) => ({
        ...layer,
        children: layer.children.map((c) =>
          c.id === 'bg' ? { ...c, lifespan: { in: 10, out: 20 } } : c,
        ),
      })),
    };
    const runtime = createRuntime(scene, { skipFontLoad: true });
    await runtime.play({});
    const node = document.querySelector<HTMLElement>('[data-cg-element-id="bg"]');
    expect(node).toBeTruthy();
    if (node === null) return;
    runtime.tick(5);
    expect(node.style.display).toBe('none');
    runtime.tick(15);
    expect(node.style.display).not.toBe('none');
    runtime.tick(25);
    expect(node.style.display).toBe('none');
  });

  // B-029 — a start-trimmed element (lifespan.in > 0) was DROPPED on play: the lifespan
  // gate was applied only by the scrubber `tick`, so once an open-time scrub to frame 0
  // hid it, PLAY never restored it. Now the gate is evaluated during playback too.
  function withBgLifespan(lifespan: { in: number; out: number }): typeof lowerThirdScene {
    return {
      ...lowerThirdScene,
      layers: lowerThirdScene.layers.map((layer) => ({
        ...layer,
        children: layer.children.map((c) => (c.id === 'bg' ? { ...c, lifespan } : c)),
      })),
    };
  }

  // B-088 CORRECTION — this test previously asserted `display !== 'none'` SYNCHRONOUSLY
  // after `play()`, commented "play must restore it — the played frame is within [5,50]".
  // That assertion encoded the bug: because `lowerThirdScene` has no keyframes the whole
  // intro collapsed to ONE paint at the out-point (50), which happens to sit inside [5,50],
  // so the element was revealed the instant play started instead of at frame 5. The correct
  // expectation is that it stays hidden until the SWEEP reaches its in-point.
  it('B-029/B-088 — a start-trimmed element appears at its IN-POINT during play (not at play)', async () => {
    const clock = makeSweepClock();
    const runtime = createRuntime(withBgLifespan({ in: 5, out: 50 }), {
      skipFontLoad: true,
      clock,
    });
    const node = document.querySelector<HTMLElement>('[data-cg-element-id="bg"]');
    expect(node).toBeTruthy();
    if (node === null) return;
    runtime.tick(0); // the preview-modal open-scrub at frame 0 (< in) hides it
    expect(node.style.display).toBe('none');
    await runtime.play({});
    // The sweep OPENS at frame 0, still before the in-point — it must remain hidden.
    expect(node.style.display).toBe('none');
    clock.advance(80); // → frame 4, still before the in-point
    expect(node.style.display).toBe('none');
    clock.advance(20); // → frame 5, the in-point: it appears HERE
    expect(node.style.display).not.toBe('none');
    clock.advance(2000); // sweep on to the held out-point (50) — still inside [5,50]
    expect(node.style.display).not.toBe('none');
  });

  // B-088 CORRECTION — this test previously asserted `display === 'none'` synchronously
  // after `play()`, commented "the played out-frame is past [0,3]". Also a product of the
  // collapse: the single paint landed at the out-point (50), past the lifespan, so the
  // element was NEVER shown at all — it should be visible for frames 0–3 and hide at 4.
  it('B-029/B-088 — play HONORS lifespan across the sweep (visible inside, hidden past out)', async () => {
    const clock = makeSweepClock();
    const runtime = createRuntime(withBgLifespan({ in: 0, out: 3 }), {
      skipFontLoad: true,
      clock,
    });
    const node = document.querySelector<HTMLElement>('[data-cg-element-id="bg"]');
    expect(node).toBeTruthy();
    if (node === null) return;
    await runtime.play({});
    // Frame 0 IS inside [0,3], so the sweep opens with the element visible.
    expect(node.style.display).not.toBe('none');
    clock.advance(60); // → frame 3, the last frame inside the lifespan
    expect(node.style.display).not.toBe('none');
    clock.advance(20); // → frame 4, past lifespan.out
    expect(node.style.display).toBe('none');
    clock.advance(2000); // held at the out-point, still past it
    expect(node.style.display).toBe('none');
  });
});

/** Minimal injectable timer clock for lifecycle timing. */
function makeTimerClock() {
  let ms = 0;
  const timers: { id: number; due: number; cb: () => void }[] = [];
  let nextId = 1;
  return {
    now: () => ms,
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
    },
  };
}

describe('createRuntime — D-020 lifecycle / playout', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.body.className = '';
  });

  it('manual lifecycle: play reveals and holds; stop re-hides via the outro', async () => {
    const scene: typeof lowerThirdScene = {
      ...lowerThirdScene,
      lifecycle: { outPoint: 45 },
      playout: { mode: 'manual' },
    };
    const runtime = createRuntime(scene, { skipFontLoad: true });
    await runtime.play({});
    expect(document.body.classList.contains('cg-pending')).toBe(false);
    await runtime.stop();
    expect(document.body.classList.contains('cg-pending')).toBe(true);
  });

  it('auto-out: re-hides automatically after the hold', async () => {
    const clock = makeTimerClock();
    const scene: typeof lowerThirdScene = {
      ...lowerThirdScene,
      lifecycle: { outPoint: 45 },
      playout: { mode: 'auto-out', holdMs: 1000 },
    };
    const runtime = createRuntime(scene, { skipFontLoad: true, clock });
    await runtime.play({});
    expect(document.body.classList.contains('cg-pending')).toBe(false);
    clock.advance(999);
    expect(document.body.classList.contains('cg-pending')).toBe(false); // still holding
    clock.advance(1);
    expect(document.body.classList.contains('cg-pending')).toBe(true); // outro settled
  });

  it('auto-out emits stop.start / stop.end when the outro runs', async () => {
    const clock = makeTimerClock();
    const scene: typeof lowerThirdScene = {
      ...lowerThirdScene,
      lifecycle: { outPoint: 45 },
      playout: { mode: 'auto-out', holdMs: 500 },
    };
    const runtime = createRuntime(scene, { skipFontLoad: true, clock });
    const seen: string[] = [];
    runtime.on('stop.start', () => seen.push('stop.start'));
    runtime.on('stop.end', () => seen.push('stop.end'));
    await runtime.play({});
    expect(seen).toEqual([]);
    clock.advance(500);
    expect(seen).toEqual(['stop.start', 'stop.end']);
  });

  it('pause() during the hold defers the auto-out until resume()', async () => {
    const clock = makeTimerClock();
    const scene: typeof lowerThirdScene = {
      ...lowerThirdScene,
      lifecycle: { outPoint: 45 },
      playout: { mode: 'auto-out', holdMs: 1000 },
    };
    const runtime = createRuntime(scene, { skipFontLoad: true, clock });
    await runtime.play({});
    clock.advance(400);
    runtime.pause();
    clock.advance(10_000); // paused — no auto-out
    expect(document.body.classList.contains('cg-pending')).toBe(false);
    runtime.resume();
    clock.advance(600); // remaining 600ms of the 1000ms hold
    expect(document.body.classList.contains('cg-pending')).toBe(true);
  });

  it('playoutOverride drives auto-out without mutating the stored scene (session-only)', async () => {
    const clock = makeTimerClock();
    // Stored defaults: an out-point but the default play-once-and-hold (manual).
    const scene: typeof lowerThirdScene = {
      ...lowerThirdScene,
      lifecycle: { outPoint: 45 },
    };
    const runtime = createRuntime(scene, {
      skipFontLoad: true,
      clock,
      // The preview's session override: auto-out after 500ms.
      playoutOverride: { mode: 'auto-out', holdMs: 500 },
    });
    await runtime.play({});
    expect(document.body.classList.contains('cg-pending')).toBe(false);
    clock.advance(500);
    expect(document.body.classList.contains('cg-pending')).toBe(true); // override ran the outro
    // The stored scene is untouched — the override never persists.
    expect(scene.playout).toBeUndefined();
    expect(scene.lifecycle).toEqual({ outPoint: 45 });
  });
});
