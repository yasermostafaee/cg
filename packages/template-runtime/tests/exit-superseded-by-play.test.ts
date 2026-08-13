import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Element, Scene } from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';

/**
 * B — THE PREVIEW'S DEAD STOP/OUT (session Z, owner-reported 2026-08-13).
 *
 * `play()` SUPERSEDES an in-flight exit — the runtime implements that everywhere:
 * it bumps `exitGen` (so the exit's continuation bails), clears `pendingExitOutro`,
 * empties the one-shot outro ledger, calls `restoreContent()` and re-cascades
 * `play()` into every controller. The graphic really does come back on air.
 *
 * The LIFECYCLE MACHINE did not model that move: `exiting` could only go to
 * `stopped` or `removed`, so `machine.transition('playing')` returned FALSE — and
 * `play()` discarded the boolean. The machine stayed in `exiting` forever while the
 * graphic played, and `stop()`/`out()` — whose first line is
 * `if (state !== 'on-air' && state !== 'playing') return` — became SILENT no-ops for
 * the rest of that runtime's life. Nothing moved, at any phase, with no diagnostic
 * anywhere; only a rebuild (close/reopen the preview, switch playout mode) cleared it.
 *
 * The trigger is the most ordinary operator loop there is: stop (or let the scene
 * auto-out), then press play again before the background outro has finished.
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

const tickerMeasure = (node: HTMLElement): number => (node.textContent?.length ?? 0) * 10;

const baseTransform = {
  position: { x: 0, y: 0 },
  size: { w: 400, h: 60 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
};

function bgShape(id: string): Element {
  return {
    id,
    name: id,
    type: 'shape',
    transform: baseTransform,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    shape: 'rect',
    fill: { kind: 'solid', color: '#FF0000' },
    animation: {
      tracks: {
        opacity: {
          keyframes: [
            { frame: 0, value: 0, easing: 'linear' },
            { frame: 40, value: 1, easing: 'linear' },
          ],
        },
      },
    },
  } as unknown as Element;
}

function ticker(id: string): Element {
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

/** intro [0 to 20], hold at 20, background outro [20 to 40] = 400 ms at 50 fps. */
function scene(): Scene {
  return {
    schemaVersion: 1,
    id: 'wedge',
    name: 'wedge',
    templateType: 'custom',
    resolution: { width: 400, height: 120 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 40 },
    lifecycle: { outPoint: 20 },
    editorBackdrop: 'transparent',
    layers: [
      {
        id: 'l',
        name: 'main',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [bgShape('bg'), ticker('crawl')],
      },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-08-13T00:00:00.000Z', updatedAt: '2026-08-13T00:00:00.000Z' },
  } as unknown as Scene;
}

const onAir = (): boolean => !document.body.classList.contains('cg-pending');
const content = (): HTMLElement | null => document.querySelector<HTMLElement>('[data-cg-content]');

beforeEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
});
afterEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
});

describe('a play() that supersedes an in-flight exit leaves stop()/out() ALIVE', () => {
  it('stop() still acts after a replay landed mid background-outro', async () => {
    const clock = makeClock();
    const r = createRuntime(scene(), { skipFontLoad: true, clock, tickerMeasure });
    const seen: string[] = [];
    r.on('stop.start', () => seen.push('stop.start'));
    r.on('stop.end', () => seen.push('stop.end'));
    await r.play({});
    await run(clock, 1000); // intro then hold, on air

    void r.stop(); // content hidden NOW; the background outro starts, machine 'exiting'
    await run(clock, 100); // 100 ms into the 400 ms background outro, NOT settled yet
    expect(onAir()).toBe(true);
    expect(seen).toEqual(['stop.start']);

    // The operator presses PLAY again before the close finished — the ordinary loop.
    await r.play({});
    await run(clock, 600); // intro then hold; the graphic is unmistakably live again
    expect(onAir()).toBe(true);
    expect(content()?.style.visibility).not.toBe('hidden');

    // and STOP must still work. Before the fix this returned silently: the machine
    // was wedged in 'exiting' because play()'s transition had been refused.
    seen.length = 0;
    await r.stop();
    expect(seen).toEqual(['stop.start']);
    expect(content()?.style.visibility).toBe('hidden');
    await run(clock, 2000);
    expect(onAir()).toBe(false);
    r.remove();
  });

  it('out() still acts after a replay landed mid background-outro', async () => {
    const clock = makeClock();
    const r = createRuntime(scene(), { skipFontLoad: true, clock, tickerMeasure });
    await r.play({});
    await run(clock, 1000);
    void r.stop();
    await run(clock, 100);
    await r.play({});
    await run(clock, 600);
    expect(onAir()).toBe(true);

    const outP = r.out();
    expect(content()?.style.opacity).toBe('0'); // the 400 ms content fade began
    await run(clock, 2500);
    await outP;
    expect(onAir()).toBe(false);
    r.remove();
  });

  it('the SUPERSEDED exit never settles the replayed run (no late blank)', async () => {
    const clock = makeClock();
    const r = createRuntime(scene(), { skipFontLoad: true, clock, tickerMeasure });
    await r.play({});
    await run(clock, 1000);
    void r.stop();
    await run(clock, 100);
    await r.play({});
    // Run far past the moment the superseded background outro would have settled.
    await run(clock, 3000);
    expect(onAir()).toBe(true);
    expect(content()?.style.visibility).not.toBe('hidden');
    r.remove();
  });
});
