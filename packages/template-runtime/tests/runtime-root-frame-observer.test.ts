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

function movingShape(id: string): Element {
  return {
    ...animatedShape(id),
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
  } as unknown as Element;
}

function infiniteTicker(id: string): Element {
  return {
    id,
    name: id,
    type: 'ticker',
    transform,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    font: {
      family: 'Vazirmatn',
      weight: 500,
      style: 'normal',
      size: 24,
      lineHeight: 1.2,
      letterSpacing: 0,
    },
    color: '#FFFFFF',
    direction: 'rtl',
    speed: 100,
    gap: 10,
    repeat: 'infinite',
    cycleBoundary: 'seamless',
    items: [{ id: 'ticker-item', text: 'content-driven hold' }],
  } as unknown as Element;
}

function followVideo(id: string): Element {
  return {
    id,
    name: id,
    type: 'video',
    transform,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    assetId: `${id}-asset`,
    durationMs: 1_000,
    holdBehavior: 'freeze',
    phases: { source: 'composition' },
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

  it('reports an observer-only hold loop when the root has no frame-dependent paint (B-376)', async () => {
    const clock = makeClock();
    const frames: number[] = [];
    const root = {
      ...scene([infiniteTicker('hold-driver')], {
        mode: 'auto-out',
        holdSource: 'content-driven',
        holdBehavior: 'loop',
      }),
      lifecycle: { contentStart: 10, outPoint: 40 },
    } as Scene;
    const runtime = createRuntime(root, {
      skipFontLoad: true,
      clock,
      contentHold: () => new Promise<void>(() => undefined),
      onRootFrame: (frame) => frames.push(frame),
    });

    await runtime.play({});
    await run(clock, 1500);

    const wrap = frames.findIndex(
      (frame, index) => index > 0 && frame === 10 && (frames[index - 1] ?? 0) === 40,
    );
    expect(wrap).toBeGreaterThan(0);
    expect(frames.slice(wrap + 1).some((frame) => frame > 10 && frame < 40)).toBe(true);
  });

  it('reports the painted frame of checked and unchecked root elements independently (B-381)', async () => {
    const clock = makeClock();
    const painted = new Map<string, number[]>();
    const root = {
      ...scene([movingShape('checked'), movingShape('unchecked')], {
        mode: 'manual',
        holdBehavior: 'loop',
        holdLoopElementIds: ['checked'],
      } as Playout),
      lifecycle: { contentStart: 10, outPoint: 40 },
    } as Scene;
    const runtime = createRuntime(root, {
      skipFontLoad: true,
      clock,
      onRootElementFrames: (entries) => {
        for (const entry of entries) {
          const frames = painted.get(entry.elementId) ?? [];
          frames.push(entry.frame);
          painted.set(entry.elementId, frames);
        }
      },
    });

    await runtime.play({});
    // Intro is 800 ms. The checked member then completes more than one 10 → 40 Middle pass,
    // while the unchecked member owns a once-only 40 → 50 tail and remains at its end.
    await run(clock, 1_700);

    const checked = painted.get('checked') ?? [];
    const unchecked = painted.get('unchecked') ?? [];
    expect(checked.some((frame, index) => index > 0 && frame < checked[index - 1]!)).toBe(true);
    expect(unchecked.every((frame, index) => index === 0 || frame >= unchecked[index - 1]!)).toBe(
      true,
    );
    expect(unchecked.at(-1)).toBe(50);
    expect(checked.at(-1)).toBeGreaterThanOrEqual(10);
    expect(checked.at(-1)).toBeLessThan(40);
    const checkedNode = document.querySelector<HTMLElement>('[data-cg-element-id="checked"]');
    const uncheckedNode = document.querySelector<HTMLElement>('[data-cg-element-id="unchecked"]');
    expect(Number.parseFloat(checkedNode?.style.left ?? '')).toBe((checked.at(-1) ?? -1) * 10);
    expect(Number.parseFloat(uncheckedNode?.style.left ?? '')).toBe(500);
  });

  it('keeps Follow Video Freeze cursor and native furniture together at Out point (B-377)', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const clock = makeClock();
    const frames: number[] = [];
    const furnitureFrames: number[] = [];
    const root = {
      ...scene(
        [followVideo('frozen-video'), movingShape('furniture'), infiniteTicker('hold-driver')],
        {
          mode: 'auto-out',
          holdSource: 'content-driven',
        },
      ),
      lifecycle: { contentStart: 10, outPoint: 40 },
    } as Scene;
    const runtime = createRuntime(root, {
      skipFontLoad: true,
      clock,
      contentHold: () => new Promise<void>(() => undefined),
      assetUrls: { 'frozen-video-asset': 'data:video/webm;base64,' },
      onRootFrame: (frame) => frames.push(frame),
      onRootElementFrames: (entries) => {
        const furniture = entries.find((entry) => entry.elementId === 'furniture');
        if (furniture !== undefined) furnitureFrames.push(furniture.frame);
      },
    });

    await runtime.play({});
    await run(clock, 1_500);
    expect(frames.at(-1)).toBe(40);
    // Follow Video and native furniture share the composition's Freeze cursor even though the
    // Video's own source picture is parked at its derived Outro-start boundary.
    expect(furnitureFrames.at(-1)).toBe(40);
    expect(
      document.querySelector<HTMLElement>('[data-cg-element-id="furniture"]')?.style.left,
    ).toBe('400px');
    const parked = [...frames];
    await run(clock, 1_000);
    expect(frames).toEqual(parked);
  });

  it('uses the derived Outro start for a Follow Video Freeze poster', () => {
    const root = {
      ...scene([followVideo('derived-freeze')]),
      lifecycle: { contentStart: 10, outPoint: 40 },
    } as Scene;
    createRuntime(root, {
      skipFontLoad: true,
      assetUrls: { 'derived-freeze-asset': 'data:video/webm;base64,' },
    });
    expect(
      document.querySelector<HTMLVideoElement>('[data-cg-element-id="derived-freeze"]')?.dataset[
        'cgPosterMs'
      ],
    ).toBe('800');
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
      onRootElementFrames: (entries) => elementIds.push(...entries.map((entry) => entry.elementId)),
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

  it.each([
    { mode: 'static' as const, holdSource: 'timed' as const },
    { mode: 'static' as const, holdSource: 'content-driven' as const },
    { mode: 'manual' as const, holdSource: 'timed' as const },
    { mode: 'manual' as const, holdSource: 'content-driven' as const },
  ])('$mode / $holdSource parks at the hold frame until an operator exit', async (playout) => {
    const clock = makeClock();
    const frames: number[] = [];
    const contentDriven = playout.holdSource === 'content-driven';
    const runtime = createRuntime(
      scene(contentDriven ? [infiniteTicker('hold-driver')] : [], playout),
      {
        skipFontLoad: true,
        clock,
        ...(contentDriven ? { contentHold: () => new Promise<void>(() => undefined) } : {}),
        onRootFrame: (frame) => frames.push(frame),
      },
    );

    await runtime.play({});
    await run(clock, 1_500);
    expect(frames.at(-1)).toBe(40);
    const parked = [...frames];
    await run(clock, 1_000);
    expect(frames).toEqual(parked);

    const stopping = runtime.stop();
    await run(clock, 300);
    await stopping;
    expect(frames.at(-1)).toBe(50);
  });

  it('auto-out / timed parks for its authored hold and then completes the outro', async () => {
    const clock = makeClock();
    const frames: number[] = [];
    const runtime = createRuntime(
      scene([], { mode: 'auto-out', holdSource: 'timed', holdMs: 500 }),
      {
        skipFontLoad: true,
        clock,
        onRootFrame: (frame) => frames.push(frame),
      },
    );

    await runtime.play({});
    expect(frames.at(-1)).toBe(40);
    await run(clock, 499);
    expect(frames.at(-1)).toBe(40);
    await run(clock, 1);
    expect(frames.at(-1)).toBe(50);
  });

  it('auto-out / content-driven parks until content completes and then advances the outro', async () => {
    const clock = makeClock();
    const frames: number[] = [];
    let completeContent: () => void = () => undefined;
    const runtime = createRuntime(
      scene([infiniteTicker('hold-driver')], {
        mode: 'auto-out',
        holdSource: 'content-driven',
      }),
      {
        skipFontLoad: true,
        clock,
        contentHold: () => new Promise<void>((resolve) => (completeContent = resolve)),
        onRootFrame: (frame) => frames.push(frame),
      },
    );

    await runtime.play({});
    expect(frames.at(-1)).toBe(40);
    await run(clock, 2_000);
    expect(frames.at(-1)).toBe(40);
    completeContent();
    for (let index = 0; index < 6; index += 1) await Promise.resolve();
    await run(clock, 250);
    expect(frames.at(-1)).toBe(50);
  });

  it('loop-cycle / timed restarts every finite pass and settles on the last frame', async () => {
    const clock = makeClock();
    const frames: number[] = [];
    const runtime = createRuntime(
      scene([], { mode: 'loop-cycle', holdSource: 'timed', holdMs: 100, repeat: 2 }),
      {
        skipFontLoad: true,
        clock,
        onRootFrame: (frame) => frames.push(frame),
      },
    );

    await runtime.play({});
    await run(clock, 200);
    expect(frames.filter((frame) => frame === 0)).toHaveLength(2);
    expect(frames.at(-1)).toBe(50);
  });

  it('loop-cycle / content-driven obtains a fresh hold per pass and reports each wrap', async () => {
    const clock = makeClock();
    const frames: number[] = [];
    const resolvers: (() => void)[] = [];
    const runtime = createRuntime(
      scene([infiniteTicker('hold-driver')], {
        mode: 'loop-cycle',
        holdSource: 'content-driven',
        repeat: 2,
      }),
      {
        skipFontLoad: true,
        clock,
        contentHold: () => new Promise<void>((resolve) => resolvers.push(resolve)),
        onRootFrame: (frame) => frames.push(frame),
      },
    );

    await runtime.play({});
    expect(resolvers).toHaveLength(1);
    expect(frames.at(-1)).toBe(40);
    resolvers[0]?.();
    for (let index = 0; index < 6; index += 1) await Promise.resolve();
    await run(clock, 250);
    expect(resolvers).toHaveLength(2);
    expect(frames.filter((frame) => frame === 0)).toHaveLength(2);
    expect(frames.at(-1)).toBe(40);

    resolvers[1]?.();
    for (let index = 0; index < 6; index += 1) await Promise.resolve();
    await run(clock, 250);
    expect(frames.at(-1)).toBe(50);
  });

  it('pause/resume freezes both an active leg and a timed hold without losing the frame', async () => {
    const introClock = makeClock();
    const introFrames: number[] = [];
    const manual = createRuntime(scene([animatedShape('root-probe')]), {
      skipFontLoad: true,
      clock: introClock,
      onRootFrame: (frame) => introFrames.push(frame),
    });
    await manual.play({});
    await run(introClock, 200);
    manual.pause();
    const pausedIntro = [...introFrames];
    await run(introClock, 1_000);
    expect(introFrames).toEqual(pausedIntro);
    manual.resume();
    await run(introClock, 650);
    expect(introFrames.at(-1)).toBe(40);

    const holdClock = makeClock();
    const holdFrames: number[] = [];
    const auto = createRuntime(scene([], { mode: 'auto-out', holdSource: 'timed', holdMs: 400 }), {
      skipFontLoad: true,
      clock: holdClock,
      onRootFrame: (frame) => holdFrames.push(frame),
    });
    await auto.play({});
    await run(holdClock, 150);
    auto.pause();
    const pausedHold = [...holdFrames];
    await run(holdClock, 1_000);
    expect(holdFrames).toEqual(pausedHold);
    auto.resume();
    await run(holdClock, 249);
    expect(holdFrames.at(-1)).toBe(40);
    await run(holdClock, 1);
    expect(holdFrames.at(-1)).toBe(50);
  });
});
