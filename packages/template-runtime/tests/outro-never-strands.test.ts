import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as LottieBridge from '@cg/lottie-bridge';
import type { Scene } from '@cg/shared-schema';
import { LottieDriver } from '../src/lottie-driver.js';
import { VideoDriver, type VideoHandle } from '../src/video-driver.js';

/**
 * Session Z — §D6.4.1's "playOutro() ALWAYS resolves", checked on BOTH implementers and
 * on the exit that awaits them.
 *
 * The invariant matters because of what sits downstream of it: the runtime's exit awaits
 * the shared outro ledger BEFORE it plays the background outro, and `stop()`/`out()` are
 * guarded on the lifecycle state. An outro promise that never settles therefore does not
 * merely delay an animation — it strands the exit, and every later stop/out with it, with
 * nothing logged. The video driver has been bounded by a wall-clock backstop since the
 * sync-lifecycle fix; the Lottie driver had NONE until this session, so the invariant was
 * true of one implementer and merely intended of the other. Both are pinned here, along
 * with the runtime's own watchdog — which must never fire, and must be LOUD when it does.
 */

const { handles } = vi.hoisted(() => ({
  handles: [] as { frames: number[]; destroyed: boolean }[],
}));

vi.mock('@cg/lottie-bridge', async (importOriginal) => ({
  ...(await importOriginal<typeof LottieBridge>()),
  createLottiePlayer: (container: HTMLElement) => {
    const h = {
      element: container,
      el: container,
      frames: [] as number[],
      destroyed: false,
      play: () => undefined,
      pause: () => undefined,
      stop: () => undefined,
      destroy() {
        h.destroyed = true;
      },
      goToFrame(f: number) {
        h.frames.push(f);
      },
      applyOverride() {
        return true;
      },
      get isAlive() {
        return !h.destroyed;
      },
    };
    handles.push(h);
    return h;
  },
}));

const { createRuntime } = await import('../src/runtime.js');

interface Clock {
  now: () => number;
  raf: (cb: (t: number) => void) => number;
  cancel: (h: number) => void;
  setTimeout: (cb: () => void, ms: number) => number;
  clearTimeout: (h: unknown) => void;
  advance: (ms: number) => void;
}

function makeClock(): Clock {
  let ms = 0;
  let rafs: ((t: number) => void)[] = [];
  const timers: { id: number; due: number; cb: () => void }[] = [];
  let nextId = 1;
  return {
    now: () => ms,
    raf: (cb) => {
      rafs.push(cb);
      return rafs.length;
    },
    cancel: () => {
      rafs = [];
    },
    setTimeout: (cb, delay) => {
      const id = nextId++;
      timers.push({ id, due: ms + delay, cb });
      return id;
    },
    clearTimeout: (h) => {
      const i = timers.findIndex((t) => t.id === h);
      if (i >= 0) timers.splice(i, 1);
    },
    advance: (delta) => {
      ms += delta;
      const due = timers.filter((t) => t.due <= ms).sort((a, b) => a.due - b.due);
      for (const t of due) {
        const i = timers.indexOf(t);
        if (i >= 0) timers.splice(i, 1);
        t.cb();
      }
      const round = rafs;
      rafs = [];
      for (const cb of round) cb(ms);
    },
  };
}

async function run(clock: Clock, totalMs: number, step = 100): Promise<void> {
  for (let left = totalMs; left > 0; left -= step) {
    clock.advance(Math.min(step, left));
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  }
}

/** A `<video>` stand-in that never advances — the outro can only end via the backstop. */
function stalledVideo(): VideoHandle {
  return {
    play: () => undefined,
    pause: () => undefined,
    seek: () => undefined,
    currentTime: () => 0,
    seeking: () => false,
    dead: () => false,
    recover: () => undefined,
  } as unknown as VideoHandle;
}

const baseTransform = {
  position: { x: 0, y: 0 },
  size: { w: 400, h: 200 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
};

function lottieScene(): Scene {
  return {
    schemaVersion: 1,
    id: 'strand',
    name: 'strand',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    lifecycle: { outPoint: 25 },
    editorBackdrop: 'transparent',
    layers: [
      {
        id: 'L1',
        name: 'furniture',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [
          {
            id: 'lot',
            name: 'lower-third',
            type: 'lottie',
            transform: baseTransform,
            opacity: 1,
            visible: true,
            locked: false,
            zIndex: 0,
            assetId: 'a',
            speed: 1,
            loopMode: 'none',
            holdBehavior: 'freeze',
            phases: { introEnd: 5, outroStart: 50, source: 'markers' },
          },
        ],
      },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-08-13T00:00:00.000Z', updatedAt: '2026-08-13T00:00:00.000Z' },
  } as unknown as Scene;
}

const lottieAssets = { a: { ip: 0, op: 100, fr: 100, w: 400, h: 200, layers: [] } };
const onAir = (): boolean => !document.body.classList.contains('cg-pending');

beforeEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
  handles.length = 0;
});

describe('VideoDriver.playOutro under session Y’s anchors', () => {
  const opts = (over: Record<string, unknown>) => ({
    handle: stalledVideo(),
    durationMs: 10_000,
    introEndMs: 2000,
    loopStartMs: 2000,
    loopEndMs: 8000,
    holdBehavior: 'loop' as const,
    driftThresholdMs: 80,
    ...over,
  });

  it('a DEGENERATE outro (outroStart === outroEnd) resolves at once', async () => {
    const clock = makeClock();
    // Session Y's zero-length OUT segment: the window carries no outro at all.
    const d = new VideoDriver(opts({ outroStartMs: 5000, outroEndMs: 5000, clock }));
    await expect(d.playOutro()).resolves.toBeUndefined();
  });

  it('a WHOLE-CLIP outro is still BOUNDED — the backstop is the clip plus the margin', async () => {
    const clock = makeClock();
    // Session Y's `wholeClipOutro` clamp: outSpan >= durationMs, so the outro is [0 → 10 s].
    const d = new VideoDriver(opts({ outroStartMs: 0, outroEndMs: 10_000, clock }));
    let settled = false;
    const p = d.playOutro().then(() => (settled = true));
    clock.advance(50);
    d.pause(); // the rAF loop stops here — only the backstop can end this outro
    await run(clock, 11_000, 500);
    expect(settled).toBe(false); // not yet: the bound is the clip's own length…
    await run(clock, 2000, 500); // …plus the margin
    await p;
    expect(settled).toBe(true);
  });
});

describe('LottieDriver.playOutro is bounded too (session Z)', () => {
  it('a pause mid-outro still settles, via the wall-clock backstop', async () => {
    const clock = makeClock();
    const painted: number[] = [];
    const d = new LottieDriver({
      handle: {
        goToFrame: (f: number) => painted.push(f),
        destroy: () => undefined,
      } as never,
      ip: 0,
      op: 100,
      fr: 100,
      speed: 1,
      introEnd: 5,
      outroStart: 50,
      hasOutro: true,
      idleIn: 0,
      idleOut: 0,
      holdBehavior: 'freeze',
      clock,
    });
    let settled = false;
    const p = d.playOutro().then(() => (settled = true));
    clock.advance(50);
    d.pause(); // rAF stops; `tick()` can never reach `outro-end`
    await run(clock, 400, 100);
    expect(settled).toBe(false);
    // outro [50 → 100] at fr 100 = 500 ms, plus the 2000 ms margin.
    await run(clock, 2500, 250);
    await p;
    expect(settled).toBe(true);
  });

  it('a DEGENERATE outro (hasOutro false) resolves at once, as it always did', async () => {
    const clock = makeClock();
    const d = new LottieDriver({
      handle: { goToFrame: () => undefined, destroy: () => undefined } as never,
      ip: 0,
      op: 100,
      fr: 100,
      speed: 1,
      introEnd: 5,
      outroStart: 100,
      hasOutro: false,
      idleIn: 0,
      idleOut: 0,
      holdBehavior: 'freeze',
      clock,
    });
    await expect(d.playOutro()).resolves.toBeUndefined();
  });
});

describe('the exit never strands on an element outro, and says so if one tries', () => {
  it('a playOutro that NEVER settles: the exit completes anyway and emits exit.outro-timeout', async () => {
    const clock = makeClock();
    // Defeat both driver backstops at once: the promise simply never resolves.
    const spy = vi
      .spyOn(LottieDriver.prototype, 'playOutro')
      .mockReturnValue(new Promise<void>(() => undefined));
    try {
      const r = createRuntime(lottieScene(), {
        skipFontLoad: true,
        installGlobals: false,
        lottieAssets,
        clock,
      });
      const errs: { code: string }[] = [];
      r.on('error', (e) => errs.push(e));
      await r.play({});
      await run(clock, 500);
      expect(onAir()).toBe(true);

      void r.stop();
      await run(clock, 2000, 250);
      expect(onAir()).toBe(true); // still waiting on the stranded outro
      expect(errs).toHaveLength(0);

      await run(clock, 31_000, 1000); // past the watchdog
      expect(errs.map((e) => e.code)).toContain('exit.outro-timeout');
      await run(clock, 2000, 250); // the background outro then runs to its end
      expect(onAir()).toBe(false); // …and the graphic IS off air
      r.remove();
    } finally {
      spy.mockRestore();
    }
  });
});
