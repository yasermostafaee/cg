import { describe, expect, it } from 'vitest';
import { templateTimingOf, playoutOf } from '../src/scene.js';
import type { Scene } from '../src/scene.js';

/**
 * 🔴 `TIMING-WIRE-22` — **THE TIMING A CONSOLE STATES FOR A WHOLE TEMPLATE.**
 *
 * The bug this exists to prevent shipped silently once and was caught by a SCREENSHOT, not by a
 * test: the console read `playoutOf(scene)` — the scene ROOT — and every real template has
 * `layers: []` with a set `entryCompositionId`, so the root resolves to `static`. The section
 * stated `Static` for every template in existence and never offered a pass control. Green, and
 * completely wrong.
 *
 * Two facts make it wrong, and both are pinned below:
 *
 *  1. The row's MODE is the ENTRY composition's, not the root's.
 *  2. The scope that actually LOOPS is often a level below the entry again — `logo-bug`'s entry
 *     is `manual` while its `comp-logo-mark` child repeats forever. So "does this template loop"
 *     cannot be answered from the entry's mode either.
 */

function scene(over: Partial<Scene>): Scene {
  return {
    schemaVersion: 1,
    id: 'scene-1',
    name: 'T',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 25,
    frameRange: { in: 0, out: 100 },
    layers: [],
    fields: [],
    ...over,
  } as unknown as Scene;
}

const comp = (id: string, playout?: unknown, lifecycle?: unknown): unknown => ({
  id,
  name: id,
  resolution: { width: 1920, height: 1080 },
  frameRange: { in: 0, out: 100 },
  layers: [],
  ...(playout !== undefined ? { playout } : {}),
  ...(lifecycle !== undefined ? { lifecycle } : {}),
});

describe('templateTimingOf — the ENTRY composition, not the scene root', () => {
  it('reads the entry composition named by entryCompositionId', () => {
    const s = scene({
      entryCompositionId: 'entry',
      compositions: [
        comp('other', { mode: 'loop-cycle' }, { outPoint: 50 }),
        comp('entry', { mode: 'auto-out', holdSource: 'timed', holdMs: 6000 }, { outPoint: 65 }),
      ],
    } as Partial<Scene>);

    expect(templateTimingOf(s).mode).toBe('auto-out');
    // …and the root would have said something else entirely, which is the whole point.
    expect(playoutOf(s).mode, 'the root is a wrapper — this is the trap').toBe('static');
  });

  it('falls back to the FIRST composition when no entry is named', () => {
    const s = scene({
      compositions: [comp('first', { mode: 'manual' }, { outPoint: 50 }), comp('second')],
    } as Partial<Scene>);
    expect(templateTimingOf(s).mode).toBe('manual');
  });

  it('a scene with NO compositions IS the graphic', () => {
    const s = scene({
      playout: { mode: 'auto-out' },
      lifecycle: { outPoint: 50 },
    } as Partial<Scene>);
    expect(templateTimingOf(s).mode).toBe('auto-out');
  });
});

describe('templateTimingOf — the loop is found wherever it sits', () => {
  it('finds a loop BELOW the entry, whose own mode does not loop', () => {
    // `logo-bug`'s exact shape: a `manual` entry over a child that repeats forever.
    const s = scene({
      entryCompositionId: 'entry',
      compositions: [
        comp('entry', { mode: 'manual' }, { outPoint: 70 }),
        comp('mark', { mode: 'loop-cycle', holdMs: 8000, repeat: 'infinite' }, { outPoint: 70 }),
      ],
    } as Partial<Scene>);

    const t = templateTimingOf(s);
    expect(t.mode, "the ROW's mode is still the entry's").toBe('manual');
    expect(t.loop, 'the loop was not found — the pass controls would be hidden').toEqual({
      repeat: 'infinite',
    });
  });

  it('a looping scope with NO authored count still reports that it loops', () => {
    /*
      🔴 The case that makes `loops` a separate bit from `repeat`. The Designer never wrote
      `playout.repeat` before TIMING-BUILD-21, so this is the COMMON shape — and deriving "does
      it loop" from `repeat !== undefined` would hide the controls on exactly those templates.
    */
    const s = scene({
      entryCompositionId: 'entry',
      compositions: [comp('entry', { mode: 'loop-cycle' }, { outPoint: 50 })],
    } as Partial<Scene>);

    const t = templateTimingOf(s);
    expect(t.loop, 'a loop with no authored count reads as no loop').toEqual({});
    expect(t.loop).toBeDefined();
  });

  it('reports NO loop when nothing loops', () => {
    const s = scene({
      entryCompositionId: 'entry',
      compositions: [comp('entry', { mode: 'auto-out' }, { outPoint: 50 })],
    } as Partial<Scene>);
    expect(templateTimingOf(s).loop).toBeUndefined();
  });

  it('carries the looping scope’s authored gap, which is what an override inherits', () => {
    const s = scene({
      entryCompositionId: 'entry',
      compositions: [
        comp('entry', { mode: 'loop-cycle', repeat: 3, delayMs: 2000 }, { outPoint: 50 }),
      ],
    } as Partial<Scene>);
    expect(templateTimingOf(s).loop).toEqual({ repeat: 3, delayMs: 2000 });
  });
});
