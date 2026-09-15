import { describe, expect, it } from 'vitest';
import { templateTimingOf, playoutOf, TEMPLATE_TIMING_VERSION } from '../src/scene.js';
import type { Scene } from '../src/scene.js';

/**
 * 🔴 `TIMING-WIRE-22 · DELTA B1` — **THE TIMING A CONSOLE STATES IS THE TIMING OF THE GRAPHIC
 * THE RUNTIME ACTUALLY PLAYS.**
 *
 * ── THE TWO WRONG ANSWERS THIS FILE HAS NOW SEEN ─────────────────────────────
 *
 * 1. **The scene ROOT** — correct, and the answer here. An EXPORTED template's root IS the
 *    composition the designer chose; the exporter flattens it there.
 * 2. **The ENTRY composition** — what this file used to assert, and wrong on the shape that
 *    reaches air. It was measured on STARTER PROJECT SCENES (`layers: []`, content in
 *    `compositions`), which the Runtime never imports.
 *
 * ⚠ **AND THE FALLBACK WAS WORSE THAN THE RULE.** `entryCompositionId` names a composition a
 * per-composition export does not contain, so `find(entryId) ?? comps[0]` silently answered for
 * whichever panel happened to be listed first. Measured on the plant's own saved records
 * (`~/.cg-runtime/bridge-templates/`, 2026-09-15): `میان‌برنامه (روی آنتن)` published
 * `static / timed` — a clock panel's defaults — over a crawler whose root is
 * `auto-out / content-driven`.
 *
 * ⭐ **`entryCompositionId` IS A DESIGNER-SIDE POINTER AND THE RUNTIME NEVER READS IT.** Swept
 * across the render path with each pathspec proven non-empty first:
 * `template-runtime/src` (29 files), `shared-schema/src` (34), `single-file-export/src` (6),
 * `vcg-format/src` (11), `caspar-bridge/src` (24) — the only hits are the schema's own
 * declaration and this resolver.
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

/** A layer holding the given elements. */
const layer = (children: unknown[]): unknown => ({
  id: 'L1',
  name: 'l',
  visible: true,
  locked: false,
  blendMode: 'normal',
  children,
});

/** A `composition` ELEMENT — the thing that makes a definition into a scope. */
const instance = (compositionId: string): unknown => ({
  id: `inst-${compositionId}`,
  name: compositionId,
  type: 'composition',
  compositionId,
  visible: true,
});

/**
 * A composition DEFINITION. ⚠ A bare one (no `playout`) also carries NO `lifecycle`, which is
 * the plant's actual shape for the panels a crawler nests — and it matters: `playoutOf` resolves
 * a no-out-point composition to `static`, which is precisely the value the old `comps[0]`
 * fallback published over a live crawler.
 */
const comp = (id: string, playout?: unknown, children: unknown[] = []): unknown => ({
  id,
  name: id,
  resolution: { width: 1920, height: 1080 },
  frameRange: { in: 0, out: 100 },
  layers: [layer(children)],
  ...(playout !== undefined ? { playout, lifecycle: { outPoint: 50 } } : {}),
});

describe('DELTA B1 — the ROOT is the graphic', () => {
  it("states the ROOT's mode, which is where an export puts the chosen composition", () => {
    const s = scene({
      playout: { mode: 'auto-out', holdSource: 'content-driven' },
      lifecycle: { outPoint: 60 },
      layers: [layer([])],
    } as Partial<Scene>);

    expect(templateTimingOf(s).mode).toBe('auto-out');
    expect(templateTimingOf(s).holdSource).toBe('content-driven');
  });

  it('🔴 IGNORES a dangling entryCompositionId — never falls back to comps[0]', () => {
    /*
      The plant's `میان‌برنامه (روی آنتن)` exactly: the root is the crawler, `entryCompositionId`
      names `comp-irib` which is NOT in the package, and `compositions` holds only the panels it
      nests. The old fallback answered with the first panel's `static / timed`.
    */
    const s = scene({
      entryCompositionId: 'comp-irib',
      playout: { mode: 'auto-out', holdSource: 'content-driven' },
      lifecycle: { outPoint: 60 },
      layers: [layer([instance('panel-t')])],
      compositions: [comp('panel-t'), comp('panel-g'), comp('panel-b')],
    } as Partial<Scene>);

    expect(templateTimingOf(s).mode, 'it answered for a panel again').toBe('auto-out');
    // The panels resolve to `static`; that is what the old fallback published.
    const firstPanel = (s.compositions ?? [])[0];
    expect(firstPanel).toBeDefined();
    if (firstPanel !== undefined) expect(playoutOf(firstPanel).mode).toBe('static');
  });

  it('a scene with no compositions reads its own root', () => {
    // The plant's `آرم (روی آنتن)` shape — `compositions: []`, root `loop-cycle`. It used to be
    // right BY ACCIDENT (the fallback found nothing and fell through); now it is right by rule.
    const s = scene({
      playout: { mode: 'loop-cycle', holdMs: 10_000, repeat: 'infinite', delayMs: 2000 },
      lifecycle: { outPoint: 70 },
      layers: [layer([])],
      compositions: [],
    } as Partial<Scene>);

    const t = templateTimingOf(s);
    expect(t.mode).toBe('loop-cycle');
    expect(t.loop).toEqual({ repeat: 'infinite', delayMs: 2000 });
  });
});

describe('DELTA B1 — a looping scope is one the runtime would WIRE', () => {
  it('finds a loop in a REACHABLE nested instance', () => {
    const s = scene({
      playout: { mode: 'manual' },
      lifecycle: { outPoint: 70 },
      layers: [layer([instance('mark')])],
      compositions: [comp('mark', { mode: 'loop-cycle', repeat: 'infinite' })],
    } as Partial<Scene>);

    const t = templateTimingOf(s);
    expect(t.mode, "the ROW's mode is the root's").toBe('manual');
    expect(t.loop).toEqual({ repeat: 'infinite' });
  });

  it('🔴 IGNORES a looping composition NOTHING references', () => {
    /*
      A `compositions` entry is a DEFINITION, not a scope — it becomes one only where a
      `composition` element references it. A flat scan would name this orphan, and
      `applyPassTiming`, which walks the real scope tree, would then act on a different set than
      the display named. One resolution, shared.
    */
    const s = scene({
      playout: { mode: 'auto-out' },
      lifecycle: { outPoint: 50 },
      layers: [layer([])],
      compositions: [comp('orphan', { mode: 'loop-cycle', repeat: 4 })],
    } as Partial<Scene>);

    expect(
      templateTimingOf(s).loop,
      'an unreferenced definition was treated as a scope',
    ).toBeUndefined();
  });

  it('a loop with NO authored count still reports that it loops', () => {
    // The bit that makes `loops` separate from `repeat`: the Designer never wrote
    // `playout.repeat` before TIMING-BUILD-21, so this is the common shape.
    const s = scene({
      playout: { mode: 'loop-cycle' },
      lifecycle: { outPoint: 50 },
      layers: [layer([])],
    } as Partial<Scene>);

    expect(templateTimingOf(s).loop).toEqual({});
  });

  it('reports NO loop when nothing loops', () => {
    const s = scene({
      playout: { mode: 'auto-out' },
      lifecycle: { outPoint: 50 },
      layers: [layer([])],
    } as Partial<Scene>);
    expect(templateTimingOf(s).loop).toBeUndefined();
  });

  it('🔴 DELTA A5 (re-run) — a STATED LIMIT: two looping scopes, and only the first is named', () => {
    // Re-measured with the fixed resolver: still zero such templates in the corpus, so this
    // stays a documented limit rather than a live bug. What "2" means there is the owner's call.
    const s = scene({
      playout: { mode: 'loop-cycle', repeat: 3, delayMs: 1000 },
      lifecycle: { outPoint: 50 },
      layers: [layer([instance('second')])],
      compositions: [comp('second', { mode: 'loop-cycle', repeat: 7, delayMs: 9000 })],
    } as Partial<Scene>);

    // The ROOT wins — it is the graphic — and the nested loop's 7 / 9000 are not shown.
    expect(templateTimingOf(s).loop).toEqual({ repeat: 3, delayMs: 1000 });
  });
});

describe('DELTA B1.3 — a hold is stated only where one runs', () => {
  it.each([
    ['manual', 'ends on stop()'],
    ['static', 'hard-cuts'],
  ])('states no hold source for %s (%s)', (mode) => {
    const s = scene({
      playout: { mode, holdSource: 'timed' },
      lifecycle: { outPoint: 50 },
      layers: [layer([])],
    } as unknown as Partial<Scene>);
    expect(templateTimingOf(s).holdSource).toBeUndefined();
  });

  it.each([['auto-out'], ['loop-cycle']])('states it for %s', (mode) => {
    const s = scene({
      playout: { mode, holdSource: 'timed' },
      lifecycle: { outPoint: 50 },
      layers: [layer([])],
    } as unknown as Partial<Scene>);
    expect(templateTimingOf(s).holdSource).toBe('timed');
  });
});

describe('DELTA B1.4 — the derivation is versioned', () => {
  it('has a current version a consumer can compare against', () => {
    // A record without it was derived by the entry-composition resolver and is WRONG, not old.
    expect(TEMPLATE_TIMING_VERSION).toBeGreaterThanOrEqual(2);
  });
});
