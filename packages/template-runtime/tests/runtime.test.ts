import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRuntime } from '../src/runtime.js';
import { lowerThirdScene } from './fixtures.js';

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
