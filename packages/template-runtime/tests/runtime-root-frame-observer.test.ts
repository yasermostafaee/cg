/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Composition, Element, Playout, Scene } from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';

function makeClock() {
  let ms = 0;
  const rafs = new Map<number, (timestamp: number) => void>();
  const timers: { id: number; due: number; callback: () => void }[] = [];
  let nextId = 1;
  return {
    now: () => ms,
    raf: (callback: (timestamp: number) => void) => {
      const id = nextId++;
      rafs.set(id, callback);
      return id;
    },
    cancel: (id: number) => rafs.delete(id),
    setTimeout: (callback: () => void, delay: number) => {
      const id = nextId++;
      timers.push({ id, due: ms + delay, callback });
      return id;
    },
    clearTimeout: (handle: unknown) => {
      const index = timers.findIndex((timer) => timer.id === handle);
      if (index >= 0) timers.splice(index, 1);
    },
    advance: (delta: number) => {
      ms += delta;
      const due = timers.filter((timer) => timer.due <= ms).sort((a, b) => a.due - b.due);
      for (const timer of due) {
        const index = timers.indexOf(timer);
        if (index >= 0) timers.splice(index, 1);
        timer.callback();
      }
      const round = [...rafs.entries()];
      for (const [id] of round) rafs.delete(id);
      for (const [, callback] of round) callback(ms);
    },
  };
}

type Clock = ReturnType<typeof makeClock>;

async function run(clock: Clock, totalMs: number, step = 20): Promise<void> {
  let remaining = totalMs;
  while (remaining > 0) {
    const delta = Math.min(step, remaining);
    clock.advance(delta);
    remaining -= delta;
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  }
}

const transform = {
  position: { x: 0, y: 0 },
  size: { w: 100, h: 50 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
};

function animatedShape(id: string, out = 50): Element {
  return {
    id,
    name: id,
    type: 'shape',
    transform,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    shape: 'rect',
    fill: { kind: 'solid', color: '#FFFFFF' },
    animation: {
      tracks: {
        opacity: {
          keyframes: [
            { frame: 0, value: 0, easing: 'linear' },
            { frame: out, value: 1, easing: 'linear' },
          ],
        },
      },
    },
  } as unknown as Element;
}

function instance(id: string, compositionId: string): Element {
  return {
    id,
    name: id,
    type: 'composition',
    compositionId,
    transform,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
  } as unknown as Element;
}

function composition(id: string, children: Element[]): Composition {
  return {
    id,
    name: id,
    resolution: { width: 100, height: 50 },
    frameRange: { in: 0, out: 20 },
    lifecycle: { outPoint: 15 },
    editorBackdrop: 'transparent',
    layers: [
      {
        id: `${id}-layer`,
        name: 'main',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children,
      },
    ],
  } as unknown as Composition;
}

function scene(children: Element[], playout: Playout = { mode: 'manual' }): Scene {
  return {
    schemaVersion: 1,
    id: 'root',
    name: 'root',
    templateType: 'custom',
    resolution: { width: 100, height: 50 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    lifecycle: { outPoint: 40 },
    playout,
    editorBackdrop: 'transparent',
    layers: [
      {
        id: 'root-layer',
        name: 'main',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children,
      },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-11-02T00:00:00.000Z', updatedAt: '2026-11-02T00:00:00.000Z' },
  } as unknown as Scene;
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  document.body.className = '';
});

describe('D-182 — root runtime frame observer', () => {
  it('freezes at the hold frame and resumes through the outro', async () => {
    const clock = makeClock();
    const frames: number[] = [];
    const root = {
      ...scene([animatedShape('root-probe')]),
      lifecycle: { contentStart: 10, outPoint: 40 },
    } as Scene;
    const runtime = createRuntime(root, {
      skipFontLoad: true,
      clock,
      onRootFrame: (frame) => frames.push(frame),
    });

    await runtime.play({});
    await run(clock, 820);
    expect(frames[0]).toBe(0);
    expect(frames.at(-1)).toBe(40);

    const heldCount = frames.length;
    await run(clock, 500);
    expect(frames).toHaveLength(heldCount);
    expect(frames.at(-1)).toBe(40);
    expect(
      document.querySelector<HTMLElement>('[data-cg-element-id="root-probe"]')?.style.opacity,
    ).toBe('0.8');

    const exit = runtime.out();
    // Coordinated Out first fades content for 400 ms, then runs the 200 ms background outro.
    await run(clock, 700);
    await exit;
    expect(frames.some((frame) => frame > 40 && frame < 50)).toBe(true);
    expect(frames.at(-1)).toBe(50);
  });

  it('reports a collapsed static leg wrap without changing its zero-duration timing', async () => {
    const clock = makeClock();
    const frames: number[] = [];
    const runtime = createRuntime(
      scene([], {
        mode: 'loop-cycle',
        holdSource: 'timed',
        holdMs: 100,
        repeat: 'infinite',
      }),
      {
        skipFontLoad: true,
        clock,
        onRootFrame: (frame) => frames.push(frame),
      },
    );

    await runtime.play({});
    // No frame-dependent pixels: the intro remains an instantaneous 0 -> 40 collapse.
    expect(frames.slice(0, 2)).toEqual([0, 40]);
    expect(frames.some((frame) => frame > 0 && frame < 40)).toBe(false);

    await run(clock, 100);
    expect(
      frames.some((frame, index) => index > 0 && frame === 0 && (frames[index - 1] ?? 0) === 50),
    ).toBe(true);
    expect(frames.some((frame) => frame > 40 && frame < 50)).toBe(false);
  });

  it('does not report an independently advancing nested composition frame', async () => {
    const clock = makeClock();
    const frames: number[] = [];
    const elementIds: string[] = [];
    const child = composition('child', [animatedShape('child-probe', 20)]);
    const root = {
      ...scene([instance('child-instance', child.id)]),
      frameRange: { in: 100, out: 150 },
      lifecycle: { outPoint: 140 },
      compositions: [child],
    } as Scene;
    const runtime = createRuntime(root, {
      skipFontLoad: true,
      clock,
      onRootFrame: (frame) => frames.push(frame),
    });

    await runtime.play({});
    await run(clock, 500);
    expect(frames.length).toBeGreaterThan(1);
    expect(frames.every((frame) => frame >= 100)).toBe(true);
    // The root is visually static and truthfully collapses to its hold boundary; the nested
    // 0..20 timeline must never leak into the root readout.
    expect(frames.at(-1)).toBe(140);
    expect(elementIds).not.toContain('child-probe');
  });
});
