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

  it('🔴 DELTA A5 — A STATED KNOWN LIMIT: with TWO looping scopes, the display names only the first', () => {
    /*
      🔴 **THE DISPLAY READS ONE SCOPE; THE APPLY REACHES EVERY ONE.** `templateTimingOf` takes
      the count and gap an override inherits from the FIRST looping scope, while
      `applyPassTiming` walks the whole scope tree. For a template with two loops that authored
      DIFFERENT counts, the console would name one of them and set both.

      ⚠ **MEASURED BEFORE BEING FILED AS A LIMIT RATHER THAN A BUG: the case does not exist in
      this corpus.** Across all five starter templates and the one scene fixture in
      `tools/template-fixtures`, the count of templates with more than one looping scope is
      ZERO — `ticker` and `logo-bug` have exactly one each (`comp-ticker-pulse`,
      `comp-logo-mark`), the other four have none. So nothing today displays a number it then
      applies somewhere else.

      This case exists so the limit is a STATED one with a test showing what happens, rather
      than a surprise the day a template authors two loops. What "2" should mean on such a
      template is the owner's call — `R-064` is the per-scope stage — and until then the
      honest reading of this assertion is "documented, not endorsed".
    */
    const s = scene({
      entryCompositionId: 'entry',
      compositions: [
        comp('entry', { mode: 'loop-cycle', repeat: 3, delayMs: 1000 }, { outPoint: 50 }),
        comp('second', { mode: 'loop-cycle', repeat: 7, delayMs: 9000 }, { outPoint: 50 }),
      ],
    } as Partial<Scene>);

    // The FIRST looping scope, depth-first from the entry — the second's 7 and 9000 are not
    // shown anywhere, and an override typed against this display reaches both scopes.
    expect(templateTimingOf(s).loop).toEqual({ repeat: 3, delayMs: 1000 });
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
