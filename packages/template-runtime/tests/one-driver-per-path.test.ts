import { describe, expect, it } from 'vitest';
import { Window } from 'happy-dom';
import type { Element, Scene } from '@cg/shared-schema';
import { withCgControl } from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';

/**
 * 🔴 **ONE DRIVER PER ENTRY PATH — the structural guard against a doubled playback rate.**
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────────
 *
 * An on-air report of media running at ~2× sent session BE hunting for a duplicated driver:
 * if two rAF loops pump the same scene, anything that ADVANCES per tick runs twice as fast,
 * and nothing errors — the worst shape of broadcast defect, because it is silent.
 *
 * The runtime turned out to be clean (one loop, exactly 1×, on every path), and every driver
 * derives its playhead from ELAPSED WALL-TIME rather than a tick count, which is what makes
 * it structurally immune: two loops would recompute the same frame, not double it. **These
 * tests pin BOTH properties**, because the immunity is a property of the current design and a
 * future driver that accumulates per tick would silently give it up.
 *
 * ⚠ **They assert LOOP COUNT and a MEASURED ratio against an injected clock — never an
 * observed wall-clock rate**, which would be timing-dependent and flaky. The clock is fake
 * and the arithmetic is exact.
 */

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
    /** How many rAF callbacks are pending — i.e. how many independent loops are pumping. */
    loops: () => rafs.size,
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

const baseTransform = {
  position: { x: 0, y: 0 },
  size: { w: 200, h: 100 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
};

/**
 * A shape that travels 0 → 500 px over frames 0 → 50 — ten px per frame. At 50 fps that is
 * 500 px per second, so **`left` in px is exactly half the elapsed milliseconds** at 1×, and
 * the ratio reads straight off the style with no timing tolerance anywhere.
 */
const mover = (id: string): Element =>
  ({
    id,
    name: id,
    type: 'shape',
    shape: 'rectangle',
    fill: { kind: 'solid', color: '#fff' },
    transform: baseTransform,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 1,
    animation: {
      tracks: {
        'position.x': {
          keyframes: [
            { frame: 0, value: 0, easing: 'linear' },
            { frame: 50, value: 500, easing: 'linear' },
          ],
        },
      },
    },
  }) as unknown as Element;

function scene(): Scene {
  return {
    schemaVersion: 1,
    id: 's',
    name: 's',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    editorBackdrop: 'transparent',
    layers: [
      {
        id: 'L1',
        name: 'main',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [mover('m1')],
      },
    ],
    fonts: [],
    fields: [],
    bindings: [],
  } as unknown as Scene;
}

function boot() {
  const clock = makeClock();
  const window = new Window();
  const doc = window.document as unknown as Document;
  const host = doc.createElement('div');
  doc.body.appendChild(host);
  const runtime = createRuntime(scene(), { root: host, clock });
  return { runtime, host, clock };
}

/** Where the mover currently sits, in px — exactly `elapsedMs / 2` at 1× (10 px per frame). */
const xOf = (host: HTMLElement): number =>
  Number(
    (host.querySelector<HTMLElement>('[data-cg-element-id="m1"]')?.style.left ?? '').replace(
      'px',
      '',
    ),
  );

async function advance(clock: ReturnType<typeof makeClock>, totalMs: number): Promise<void> {
  let left = totalMs;
  while (left > 0) {
    clock.advance(Math.min(100, left));
    left -= Math.min(100, left);
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  }
}

describe('🔴 exactly ONE rAF loop, on every entry path', () => {
  it('build alone starts none, and play starts exactly one', async () => {
    const { runtime, clock } = boot();
    expect(clock.loops(), 'a built-but-unplayed page must drive nothing').toBe(0);

    await runtime.play({} as never);

    expect(clock.loops()).toBe(1);
  });

  it('an ordinary update does not add a loop', async () => {
    const { runtime, clock } = boot();
    await runtime.play({} as never);

    await runtime.update({ some: 'field' } as never);

    expect(clock.loops()).toBe(1);
  });

  it('🔴 an update carrying a LOOK does not add a loop', async () => {
    // 6.7 put a second entry into the page's switch path. A switch is a visibility flip and a
    // re-punch; if it ever started or restarted a driver, two loops would pump the scene.
    const { runtime, clock } = boot();
    await runtime.play({} as never);

    await runtime.update(withCgControl({}, { look: 'anything' }) as never);

    expect(clock.loops()).toBe(1);
  });

  it('🔴 a PLAY carrying a look does not add a loop — the re-take path', async () => {
    const { runtime, clock } = boot();
    await runtime.play(withCgControl({}, { look: 'anything' }) as never);

    expect(clock.loops()).toBe(1);
  });

  it('🔴 a RE-PLAY leaves exactly one loop — the old one is not left running', async () => {
    /*
      The re-take path, and the one that would actually double a per-tick driver: `play()` on a
      runtime that is already playing must not build a second driver set beside the first.
    */
    const { runtime, clock } = boot();
    await runtime.play({} as never);
    await advance(clock, 300);

    await runtime.play({} as never);
    await advance(clock, 100);

    expect(clock.loops()).toBe(1);
  });
});

describe('🔴 the playhead advances at exactly 1× real time', () => {
  it('500 ms of clock moves a 500 px/s animation exactly 250 px', async () => {
    const { runtime, host, clock } = boot();
    await runtime.play({} as never);

    await advance(clock, 500);

    // 1× is 250 (25 frames × 10 px). A DOUBLED rate would read 500, a halved one 125.
    expect(xOf(host)).toBe(250);
  });

  it('the rate is CONSTANT, not accelerating — three samples on one line', async () => {
    /*
      An exactly-2× cause and a progressively-accelerating one are different defects, so the
      rate is sampled rather than spot-checked: every driver here derives its frame from
      elapsed wall-time rather than a tick count, which is precisely what makes the rate
      immune to how many times it is ticked.
    */
    const { runtime, host, clock } = boot();
    await runtime.play({} as never);

    await advance(clock, 200);
    expect(xOf(host), '200 ms ⇒ 10 frames ⇒ 100 px').toBe(100);
    await advance(clock, 200);
    expect(xOf(host), '400 ms ⇒ 20 frames ⇒ 200 px — the SAME slope, not a growing one').toBe(200);
    await advance(clock, 100);
    expect(xOf(host), '500 ms ⇒ 25 frames ⇒ 250 px').toBe(250);
  });

  it('🔴 an update mid-run does not shift the playhead or the rate', async () => {
    // The 6.7 path runs `enterLook` INSTEAD of the ordinary re-punch. Neither touches the
    // playhead — pinned here so a future switch that restarted the clock would be caught.
    const { runtime, host, clock } = boot();
    await runtime.play({} as never);
    await advance(clock, 200);

    await runtime.update(withCgControl({ f: '1' }, { look: 'anything' }) as never);
    await advance(clock, 200);

    // 400 ms total ⇒ 200 px. An update that restarted the clock would read 100.
    expect(xOf(host)).toBe(200);
  });
});
