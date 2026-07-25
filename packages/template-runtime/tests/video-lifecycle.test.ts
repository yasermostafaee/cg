import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type * as LottieBridge from '@cg/lottie-bridge';
import type { Element, Playout, Scene } from '@cg/shared-schema';

/**
 * D-128 Phase 4 — the video element joining the composition LIFECYCLE on the
 * injected clock: the IN/HOLD/OUT mapping, the SHARED element-outro seam (§D6.2 —
 * `stop()`/`out()` play the video's outro through the ONE ledger, content-first /
 * background-last), the opt-in `drivesHold` hold aggregation (§D6.3), and — the
 * regression guard for the Phase-4 type widening — a Lottie AND a video exiting
 * through the SAME ledger with no cross-talk.
 *
 * The `<video>`'s `currentTime` is spied with a plain backing store (jsdom has no
 * real decode); the driver's seeks land there, so the outro/hold are observable
 * off the fake clock exactly like the Lottie's painted frames.
 */

const { handles } = vi.hoisted(() => ({
  handles: [] as { frames: number[]; destroyed: boolean; el: HTMLElement }[],
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
      get isAlive() {
        return !h.destroyed;
      },
    };
    handles.push(h);
    return h;
  },
}));

const { createRuntime } = await import('../src/runtime.js');

function makeClock() {
  let ms = 0;
  const rafs = new Map<number, (ts: number) => void>();
  const timers: { id: number; due: number; cb: () => void }[] = [];
  let nextId = 1;
  return {
    now: () => ms,
    raf: (cb: (ts: number) => void) => {
      const id = nextId++;
      rafs.set(id, cb);
      return id;
    },
    cancel: (h: number) => {
      rafs.delete(h);
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
      const round = [...rafs.entries()];
      for (const [id] of round) rafs.delete(id);
      for (const [, cb] of round) cb(ms);
    },
  };
}

async function run(clock: ReturnType<typeof makeClock>, totalMs: number, step = 20): Promise<void> {
  let left = totalMs;
  while (left > 0) {
    const d = Math.min(step, left);
    clock.advance(d);
    left -= d;
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  }
}

const baseTransform = {
  position: { x: 0, y: 0 },
  size: { w: 400, h: 200 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
};

interface VideoOpts {
  drivesHold?: boolean;
  holdBehavior?: 'loop' | 'freeze';
  /** Omit `phases` — the whole-clip-loop / no-outro case (decision (b)). */
  noPhases?: boolean;
  durationMs?: number;
  /** B-034 — a hidden video must be inert (never gates a hold, never awaited on exit). */
  visible?: boolean;
}
function video(id: string, o: VideoOpts = {}): Element {
  const el: Record<string, unknown> = {
    id,
    name: id,
    type: 'video',
    transform: baseTransform,
    opacity: 1,
    visible: o.visible ?? true,
    locked: false,
    zIndex: 0,
    assetId: `asset-${id}`,
    durationMs: o.durationMs ?? 1000,
    holdBehavior: o.holdBehavior ?? 'loop',
  };
  if (o.drivesHold !== undefined) el['drivesHold'] = o.drivesHold;
  if (o.noPhases !== true) el['phases'] = { introEnd: 200, outroStart: 800 };
  return el as unknown as Element;
}

const lottieAssets = { a: { ip: 0, op: 100, fr: 100, w: 400, h: 200, layers: [] } };
function lottie(id: string, o: { drivesHold?: boolean } = {}): Element {
  return {
    id,
    name: id,
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
    phases: { introEnd: 10, outroStart: 20, source: 'markers' },
    ...(o.drivesHold !== undefined ? { drivesHold: o.drivesHold } : {}),
  } as unknown as Element;
}

function bgShape(id: string): Element {
  return {
    id,
    name: id,
    type: 'shape',
    shape: 'rect',
    fill: { kind: 'solid', color: '#123456' },
    transform: baseTransform,
    opacity: 0,
    visible: true,
    locked: false,
    zIndex: 0,
    animation: {
      tracks: {
        opacity: {
          keyframes: [
            { frame: 0, value: 0, easing: 'linear' },
            { frame: 50, value: 1, easing: 'linear' },
          ],
        },
      },
    },
  } as unknown as Element;
}

function infiniteTicker(id: string): Element {
  return {
    id,
    name: id,
    type: 'ticker',
    transform: baseTransform,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    font: {
      family: 'Vazirmatn',
      weight: 500,
      style: 'normal',
      size: 36,
      lineHeight: 1.4,
      letterSpacing: 0,
    },
    color: '#FFFFFF',
    direction: 'rtl',
    speed: 100,
    gap: 10,
    repeat: 'infinite',
    cycleBoundary: 'seamless',
    items: [{ id: 'a', text: 'aaaaaaaaaa' }],
  } as unknown as Element;
}

function scene(children: Element[], playout?: Playout): Scene {
  return {
    schemaVersion: 1,
    id: 's',
    name: 's',
    templateType: 'custom',
    resolution: { width: 400, height: 200 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    activeRange: { in: 0, out: 50 },
    lifecycle: { outPoint: 25 },
    ...(playout !== undefined ? { playout } : {}),
    background: 'transparent',
    layers: [
      { id: 'pl', name: 'main', visible: true, locked: false, blendMode: 'normal', children },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-07-18T00:00:00.000Z', updatedAt: '2026-07-18T00:00:00.000Z' },
  } as unknown as Scene;
}

const onAir = (): boolean => !document.body.classList.contains('cg-pending');
const tickerMeasure = (node: HTMLElement): number => (node.textContent?.length ?? 0) * 10;

/** Replace each `<video>`'s currentTime with a plain tracked store, so the driver's seeks are observable. */
function spyVideoTimes(): Map<string, () => number> {
  const getters = new Map<string, () => number>();
  document.querySelectorAll<HTMLVideoElement>('video[data-cg-element-id]').forEach((v) => {
    let t = 0;
    Object.defineProperty(v, 'currentTime', {
      get: () => t,
      set: (x: number) => {
        t = x;
      },
      configurable: true,
    });
    getters.set(v.dataset['cgElementId']!, () => t);
  });
  return getters;
}
const vidEl = (id: string): HTMLVideoElement =>
  document.querySelector<HTMLVideoElement>(`video[data-cg-element-id="${id}"]`)!;

beforeEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
  handles.length = 0;
});
afterEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
});

describe('D-128 Phase 4 — the video composition lifecycle', () => {
  it('stop() plays the video outro BEFORE the background, then settles CLEARED', async () => {
    const clock = makeClock();
    const r = createRuntime(scene([bgShape('bg'), video('v')]), {
      skipFontLoad: true,
      installGlobals: false,
      clock,
      tickerMeasure,
    });
    const times = spyVideoTimes();
    await r.play({});
    await run(clock, 600); // intro (200ms) → loop hold
    expect(onAir()).toBe(true);

    const stopP = r.stop();
    await run(clock, 100); // mid-outro (the 200ms outro has NOT finished)
    expect(onAir()).toBe(true); // background is WAITING on the video outro
    // The outro ENTRY seek parked the head at outroStart. In jsdom the head only
    // moves on a driver seek, and the SIGNED drift policy (2026-07-25) re-bases
    // a lagging head instead of seeking it forward — so mid-outro it holds at
    // exactly 800ms here (a real element advances on its own media clock).
    expect(times.get('v')!() * 1000).toBeGreaterThanOrEqual(800);

    await run(clock, 400); // the outro completes
    await stopP;
    await run(clock, 1000);
    expect(onAir()).toBe(false); // CLEARED
    expect(vidEl('v').currentTime).toBeCloseTo(1.0, 2); // clamped to the clip end
    r.remove();
  });

  it('a NO-PHASE video has no outro and is carried by the normal content exit', async () => {
    const clock = makeClock();
    const r = createRuntime(scene([bgShape('bg'), video('v', { noPhases: true })]), {
      skipFontLoad: true,
      installGlobals: false,
      clock,
      tickerMeasure,
    });
    spyVideoTimes();
    await r.play({});
    await run(clock, 600);
    // decision (b): no phases ⇒ no outro ⇒ NOT flagged as a self-exiting element
    expect(vidEl('v').dataset['cgOutro']).toBeUndefined();
    const stopP = r.stop();
    await run(clock, 1000);
    await stopP;
    expect(onAir()).toBe(false); // still settles CLEARED via the content exit
    r.remove();
  });

  it('drivesHold: an opted-in FREEZE video drives the content hold and auto-outs at its intro end', async () => {
    const clock = makeClock();
    const r = createRuntime(
      scene([bgShape('bg'), video('v', { holdBehavior: 'freeze', drivesHold: true })], {
        mode: 'auto-out',
        holdSource: 'content-driven',
      } as unknown as Playout),
      { skipFontLoad: true, installGlobals: false, clock, tickerMeasure },
    );
    spyVideoTimes();
    await r.play({});
    // intro is [0,200]; the freeze hold completes at 200ms ⇒ auto-out ⇒ the video
    // outro [800→1000] plays ⇒ background ⇒ CLEARED, all without an operator stop().
    await run(clock, 2000);
    expect(onAir()).toBe(false);
    r.remove();
  });

  it('drivesHold ABSENT: a ticker on top drives the hold and the video holds beneath (never auto-outs)', async () => {
    const clock = makeClock();
    const r = createRuntime(
      // the video opts OUT of the hold (absent drivesHold); the infinite ticker drives it
      scene([bgShape('bg'), video('v', { holdBehavior: 'loop' }), infiniteTicker('crawl')], {
        mode: 'auto-out',
        holdSource: 'content-driven',
      } as unknown as Playout),
      { skipFontLoad: true, installGlobals: false, clock, tickerMeasure },
    );
    spyVideoTimes();
    await r.play({});
    await run(clock, 3000); // long past the video's intro — the ticker holds it on air
    expect(onAir()).toBe(true); // the video did NOT drive an auto-out; the ticker holds
    r.remove();
  });

  it('pause() freezes the video in lockstep; resume() re-engages it on the injected clock', async () => {
    const clock = makeClock();
    const r = createRuntime(scene([bgShape('bg'), video('v')]), {
      skipFontLoad: true,
      installGlobals: false,
      clock,
      tickerMeasure,
    });
    const times = spyVideoTimes();
    await r.play({});
    await run(clock, 400); // into the loop hold — the head is tracking the clock
    const atPause = times.get('v')!();
    r.pause();
    await run(clock, 500); // the clock keeps advancing WHILE the composition is paused
    // the composition pause() reached the video: its head did NOT advance (a driver
    // left ticking would have kept seeking the head forward off the clock).
    expect(times.get('v')!()).toBe(atPause);
    // SEEK-FREE RESUME + SIGNED DRIFT (2026-07-25): resume re-anchors the driver
    // clock to the media and re-engages via play(); a lagging head is never
    // seeked forward again (the fragile-alpha trigger). In jsdom the head only
    // moves on a driver seek, so the PROOF of re-engagement is the play() call
    // on the SAME element — and the head staying put proves the fragile op is gone.
    const el = vidEl('v');
    let playsAfterResume = 0;
    Object.defineProperty(el, 'play', {
      configurable: true,
      value: () => {
        playsAfterResume++;
        return Promise.resolve();
      },
    });
    r.resume();
    await run(clock, 900);
    expect(playsAfterResume).toBeGreaterThan(0); // re-engaged on the same element…
    expect(times.get('v')!()).toBe(atPause); // …with NO forward seek of the lagging head
    r.remove();
  });

  it('B-034: a HIDDEN video is inert — it never plays an outro or stalls the exit', async () => {
    const clock = makeClock();
    // the video has phases (an outro) but is INVISIBLE: it must NOT be enrolled in the
    // outro ledger, so stop() must not hold the background for a clip nobody can see.
    const r = createRuntime(scene([bgShape('bg'), video('v', { visible: false })]), {
      skipFontLoad: true,
      installGlobals: false,
      clock,
      tickerMeasure,
    });
    const times = spyVideoTimes();
    await r.play({});
    await run(clock, 600);
    const stopP = r.stop();
    await run(clock, 1200);
    await stopP;
    await run(clock, 300);
    expect(onAir()).toBe(false); // CLEARED — the invisible video did not gate the exit
    // and its outro was NEVER invoked: the head stayed inside the loop hold window
    // [0, outroStart=800ms) and never entered the outro region — proof it is out of the ledger.
    expect(times.get('v')!() * 1000).toBeLessThan(800);
    r.remove();
  });

  it('SHARED LEDGER, no cross-talk: a Lottie AND a video in one composition each play their outro once', async () => {
    const clock = makeClock();
    const r = createRuntime(scene([bgShape('bg'), lottie('lot'), video('v')]), {
      skipFontLoad: true,
      installGlobals: false,
      lottieAssets,
      clock,
      tickerMeasure,
    });
    spyVideoTimes();
    await r.play({});
    await run(clock, 600); // both hold
    const stopP = r.stop();
    await run(clock, 1200); // both outros complete (lottie 800ms, video 200ms)
    await stopP;
    await run(clock, 500);

    // BOTH element outros ran through the ONE ledger — neither starved the other.
    const lottieOutroFrames = (handles[0]?.frames ?? []).filter((f) => f > 20);
    expect(lottieOutroFrames.length).toBeGreaterThan(0); // the Lottie outro played
    expect(handles[0]?.frames.at(-1)).toBe(100); // …clamped to op
    expect(vidEl('v').currentTime).toBeCloseTo(1.0, 2); // the video outro played to the clip end
    expect(onAir()).toBe(false); // and the composition settled CLEARED
    r.remove();
  });

  it("drivesHold video + INFINITE ticker: the content hold runs until stop (all-complete, the owner's case)", async () => {
    const clock = makeClock();
    // the owner's setup: a drivesHold FREEZE video AND an infinite ticker both drive a
    // content-driven auto-out. The hold is ALL-COMPLETE, so the never-completing ticker
    // keeps the graphic on air even though the video finished — it does NOT auto-close.
    const r = createRuntime(
      scene(
        [
          bgShape('bg'),
          video('v', { holdBehavior: 'freeze', drivesHold: true }),
          infiniteTicker('crawl'),
        ],
        {
          mode: 'auto-out',
          holdSource: 'content-driven',
        } as unknown as Playout,
      ),
      { skipFontLoad: true, installGlobals: false, clock, tickerMeasure },
    );
    spyVideoTimes();
    await r.play({});
    await run(clock, 3000); // long past the video's freeze-complete (intro 200ms)
    expect(onAir()).toBe(true); // the infinite ticker holds it — the video being a driver too didn't change that
    r.remove();
  });

  it('a Lottie AND a video BOTH driving the hold (freeze) auto-out consistently — CLEARED, no cross-talk', async () => {
    const clock = makeClock();
    const r = createRuntime(
      scene(
        [
          bgShape('bg'),
          lottie('lot', { drivesHold: true }),
          video('v', { holdBehavior: 'freeze', drivesHold: true }),
        ],
        {
          mode: 'auto-out',
          holdSource: 'content-driven',
        } as unknown as Playout,
      ),
      { skipFontLoad: true, installGlobals: false, lottieAssets, clock, tickerMeasure },
    );
    spyVideoTimes();
    await r.play({});
    // both freeze-holds complete (lottie at its intro, video at 200ms) ⇒ the content
    // hold completes ⇒ both outros play through the ONE ledger ⇒ CLEARED, no stop().
    await run(clock, 2500);
    expect(onAir()).toBe(false);
    const lottieOutroFrames = (handles[0]?.frames ?? []).filter((f) => f > 20);
    expect(lottieOutroFrames.length).toBeGreaterThan(0); // the Lottie outro ran
    expect(vidEl('v').currentTime).toBeCloseTo(1.0, 2); // the video outro ran to the clip end
    r.remove();
  });
});
