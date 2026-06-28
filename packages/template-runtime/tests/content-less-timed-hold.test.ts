import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Element, Playout, Scene } from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';

/**
 * B-032 — a CONTENT-LESS composition (no ticker / sequence / countdown) set to
 * `auto-out` (or `loop-cycle`) with a TIMED hold (`holdMs`) must hold for `holdMs`
 * before its outro — `holdMs` is NOT ignored / collapsed to 0. Reproduced at the
 * RUNTIME level (the controller honors `holdMs`; this pins the full wiring —
 * `effectivePlayoutFor` → controller — for both a STORED holdMs and a preview-style
 * override).
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

const baseTransform = {
  position: { x: 0, y: 0 },
  size: { w: 200, h: 80 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
};

/** A content-LESS scene (just a static shape); `outPoint` null ⇒ no explicit lifecycle. */
function contentLessScene(playout: Playout, outPoint: number | null = 25): Scene {
  const rect = {
    id: 'bg',
    name: 'bg',
    type: 'shape',
    transform: baseTransform,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    shape: 'rect',
    fill: { kind: 'solid', color: '#FF0000' },
  } as unknown as Element;
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
    ...(outPoint !== null ? { lifecycle: { outPoint } } : {}),
    playout,
    background: 'transparent',
    layers: [
      {
        id: 'l',
        name: 'main',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [rect],
      },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    compositions: [],
    metadata: { createdAt: '2026-06-28T00:00:00.000Z', updatedAt: '2026-06-28T00:00:00.000Z' },
  } as unknown as Scene;
}

const onAir = (): boolean => !document.body.classList.contains('cg-pending');

beforeEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
});
afterEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
});

describe('B-032 — content-less timed hold honors holdMs', () => {
  it('STORED auto-out holdMs: holds ~holdMs before the outro (not ~0)', async () => {
    const clock = makeClock();
    const r = createRuntime(contentLessScene({ mode: 'auto-out', holdMs: 10_000 }), {
      skipFontLoad: true,
      clock,
    });
    await r.play({});

    await run(clock, 5_000); // intro (500ms) + 4.5s into the 10s hold
    expect(onAir()).toBe(true); // STILL holding — holdMs is not 0

    await run(clock, 6_500); // ~11.5s total: 10s hold done → outro (500ms) → settle
    expect(onAir()).toBe(false);
    r.remove();
  });

  it('preview OVERRIDE auto-out holdMs reaches the controller (mode + holdMs from the override)', async () => {
    const clock = makeClock();
    // Stored playout is the fresh default (manual); the preview override sets auto-out + holdMs.
    const r = createRuntime(contentLessScene({ mode: 'manual' }), {
      skipFontLoad: true,
      clock,
      playoutOverride: { mode: 'auto-out', holdMs: 10_000 },
    });
    await r.play({});

    await run(clock, 5_000);
    expect(onAir()).toBe(true); // the override's holdMs governs — still holding

    await run(clock, 6_500);
    expect(onAir()).toBe(false);
    r.remove();
  });

  it('LOOP-CYCLE: each between-cycle hold honors holdMs (not collapsed to ~0 per cycle)', async () => {
    const clock = makeClock();
    // repeat 2 × holdMs 3000. Per cycle = intro + 3000ms hold + outro. If the loop-back
    // path bypassed scheduleHold(holdMs), each cycle's hold would be ~0 and the two cycles
    // would finish in ~2×(intro+outro) ≈ 2s; with holdMs honored it runs far longer.
    const r = createRuntime(contentLessScene({ mode: 'loop-cycle', holdMs: 3000, repeat: 2 }), {
      skipFontLoad: true,
      clock,
    });
    await r.play({});

    await run(clock, 4_000);
    expect(onAir()).toBe(true); // still cycling — cycle 2's hold is honored (would be settled by ~2s if collapsed)

    await run(clock, 6_000); // ~10s total: both finite cycles' holds elapsed → settle
    expect(onAir()).toBe(false);
    r.remove();
  });

  it('NO explicit out-point (implicit active.out, empty outro): still holds holdMs', async () => {
    const clock = makeClock();
    // outPoint null ⇒ no lifecycle ⇒ outPoint defaults to active.out (50); the intro is
    // the whole timeline, the hold is the last frame, the outro is EMPTY. holdMs must
    // still hold the last frame before the (instant) settle.
    const r = createRuntime(contentLessScene({ mode: 'auto-out', holdMs: 8_000 }, null), {
      skipFontLoad: true,
      clock,
    });
    await r.play({});

    await run(clock, 4_000);
    expect(onAir()).toBe(true); // holding the last frame for holdMs (not ~0)

    await run(clock, 5_500); // > 8s hold: empty outro → settle
    expect(onAir()).toBe(false);
    r.remove();
  });
});
