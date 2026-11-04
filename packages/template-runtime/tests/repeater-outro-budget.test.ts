import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Scene } from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';
import { RepeaterDriver } from '../src/repeater-driver.js';
import { elementOutroWatchdogMs } from '../src/video-driver.js';

function clockOf() {
  let now = 0;
  let next = 0;
  const frames = new Map<number, (time: number) => void>();
  const timers = new Map<number, { at: number; cb: () => void }>();
  return {
    now: () => now,
    raf: (cb: (time: number) => void) => {
      frames.set(++next, cb);
      return next;
    },
    cancel: (id: number) => {
      frames.delete(id);
    },
    setTimeout: (cb: () => void, ms: number) => {
      timers.set(++next, { at: now + ms, cb });
      return next;
    },
    clearTimeout: (id: unknown) => {
      timers.delete(id as number);
    },
    async advance(ms: number) {
      for (let left = ms; left > 0; left -= 100) {
        now += Math.min(100, left);
        for (const [id, timer] of [...timers]) if (timer.at <= now && timers.delete(id)) timer.cb();
        const round = [...frames];
        frames.clear();
        for (const [, cb] of round) cb(now);
        for (let i = 0; i < 12; i += 1) await Promise.resolve();
      }
    },
    pending: () => frames.size + timers.size,
  };
}

const base = {
  transform: {
    position: { x: 0, y: 0 },
    size: { w: 300, h: 40 },
    scale: { x: 1, y: 1 },
    rotation: 0,
    anchor: { x: 0, y: 0 },
  },
  visible: true,
  locked: false,
  opacity: 1,
  zIndex: 0,
};
const layer = (children: unknown[]) => ({
  id: 'layer',
  name: 'Layer',
  visible: true,
  locked: false,
  blendMode: 'normal',
  children,
});
function sceneOf(nested: boolean): Scene {
  const row = {
    id: 'row',
    name: 'Row',
    resolution: { width: 300, height: 40 },
    frameRange: { in: 0, out: 50 },
    layers: [
      layer([
        {
          ...base,
          id: 'shape',
          name: 'Shape',
          type: 'shape',
          shape: 'rect',
          fill: { kind: 'solid', color: '#ffffff' },
        },
      ]),
    ],
    fields: [],
    bindings: [],
  };
  const rep = {
    ...base,
    id: 'rep',
    name: 'Rows',
    type: 'repeater',
    compositionId: 'row',
    layout: 'vertical',
    gap: 0,
    columns: 1,
    items: Array.from({ length: 18 }, (_, i) => ({ id: `r${i}` })),
    itemExit: 'fade',
    itemExitTransitionMs: 400,
    itemStaggerMs: 2000,
  };
  const page = {
    id: 'page',
    name: 'Page',
    resolution: { width: 300, height: 800 },
    frameRange: { in: 0, out: 50 },
    layers: [layer([rep])],
    fields: [],
    bindings: [],
  };
  const seq = {
    ...base,
    id: 'sequence',
    name: 'Pages',
    type: 'sequence',
    direction: 'ltr',
    font: {
      family: 'Arial',
      weight: 400,
      style: 'normal',
      size: 20,
      lineHeight: 1.2,
      letterSpacing: 0,
    },
    color: '#ffffff',
    align: 'start',
    items: [{ id: 'p', kind: 'composition', compositionId: 'page' }],
    advance: 'manual',
    repeat: 'infinite',
    defaultDwellMs: 1000,
    transitionIn: 'none',
    transitionOut: 'fade',
    transitionTiming: 'simultaneous',
    transitionMs: 400,
  };
  return {
    schemaVersion: 1,
    id: 'long-outro',
    name: 'Long outro',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    frameRange: { in: 0, out: 50 },
    lifecycle: { outPoint: 25 },
    safeAreas: { title: 10, action: 5 },
    editorBackdrop: 'transparent',
    playout: { mode: 'manual' },
    layers: [layer([nested ? seq : rep])],
    compositions: nested ? [row, page] : [row],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-11-04T00:00:00Z', updatedAt: '2026-11-04T00:00:00Z' },
  } as unknown as Scene;
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
});

describe('finite authored repeater exit watchdog budget', () => {
  it.each([false, true])(
    'does not truncate a 34.4-second exit (inside Sequence: %s)',
    async (nested) => {
      const clock = clockOf();
      const rt = createRuntime(sceneOf(nested), { clock, skipFontLoad: true });
      const errors: string[] = [];
      rt.on('error', (error) => errors.push(error.code));
      await rt.play({});
      await clock.advance(1000);
      let done = false;
      const closing = rt.stop().then(() => {
        done = true;
      });
      await clock.advance(31_000);
      expect(done).toBe(false);
      expect(document.body.classList.contains('cg-pending')).toBe(false);
      expect(errors).toEqual([]);
      await clock.advance(5000);
      await closing;
      expect(done).toBe(true);
      expect(document.body.classList.contains('cg-pending')).toBe(true);
      expect(errors).toEqual([]);
      rt.remove();
      expect(clock.pending()).toBe(0);
    },
  );

  it('still times out a stranded long owner after its finite reported duration plus grace', async () => {
    const clock = clockOf();
    const original = RepeaterDriver.prototype.playOutro;
    const spy = vi.spyOn(RepeaterDriver.prototype, 'playOutro').mockImplementation(function (
      this: RepeaterDriver,
    ) {
      void original.call(this);
      return new Promise<void>(() => undefined);
    });
    const rt = createRuntime(sceneOf(false), { clock, skipFontLoad: true });
    const errors: string[] = [];
    rt.on('error', (error) => errors.push(error.code));
    try {
      await rt.play({});
      await clock.advance(1000);
      const closing = rt.stop();
      await clock.advance(31_000);
      expect(errors).toEqual([]);
      expect(document.body.classList.contains('cg-pending')).toBe(false);
      await clock.advance(9000);
      await closing;
      expect(errors).toEqual(['exit.outro-timeout']);
      expect(document.body.classList.contains('cg-pending')).toBe(true);
    } finally {
      spy.mockRestore();
      rt.remove();
    }
    expect(clock.pending()).toBe(0);
  });

  it('rejects non-finite budgets and never overflows the platform timer range', () => {
    const playOutro = () => Promise.resolve();
    for (const invalid of [NaN, Infinity, -1])
      expect(elementOutroWatchdogMs({ playOutro, outroDurationMs: () => invalid })).toBe(30_000);
    expect(elementOutroWatchdogMs({ playOutro, outroDurationMs: () => Number.MAX_VALUE })).toBe(
      2_147_483_647,
    );
  });

  it.each([false, true])(
    'does not spend the watchdog budget while paused (inside Sequence: %s)',
    async (nested) => {
      const clock = clockOf();
      const rt = createRuntime(sceneOf(nested), { clock, skipFontLoad: true });
      const errors: string[] = [];
      rt.on('error', (error) => errors.push(error.code));
      await rt.play({});
      await clock.advance(1000);
      let done = false;
      const closing = rt.stop().then(() => {
        done = true;
      });
      await clock.advance(1000);
      rt.pause();
      await clock.advance(100_000);
      expect(done).toBe(false);
      expect(errors).toEqual([]);
      rt.resume();
      await clock.advance(35_000);
      await closing;
      expect(errors).toEqual([]);
      expect(document.body.classList.contains('cg-pending')).toBe(true);
      rt.remove();
      expect(clock.pending()).toBe(0);
    },
  );

  it('cancels old watchdogs on replay and removal, even when a driver promise is broken', async () => {
    const clock = clockOf();
    const spy = vi
      .spyOn(RepeaterDriver.prototype, 'playOutro')
      .mockReturnValue(new Promise<void>(() => undefined));
    const rt = createRuntime(sceneOf(false), { clock, skipFontLoad: true });
    const errors: string[] = [];
    rt.on('error', (error) => errors.push(error.code));
    try {
      await rt.play({});
      const oldStop = rt.stop();
      await clock.advance(500);
      rt.pause();
      await rt.play({});
      await oldStop;
      await clock.advance(31_000);
      expect(errors).toEqual([]);
      expect(document.body.classList.contains('cg-pending')).toBe(false);
      const finalStop = rt.stop();
      rt.remove();
      await finalStop;
      expect(clock.pending()).toBe(0);
    } finally {
      spy.mockRestore();
      rt.remove();
    }
  });
});
