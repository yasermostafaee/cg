import { describe, expect, it } from 'vitest';
import { SceneSchema, playoutOf, type Composition, type Scene } from '@cg/shared-schema';
import { defaultShape } from '../src/renderer/state/element-defaults.js';
import { ensureCompositions } from '../src/renderer/state/scene-doc.js';

/**
 * B-068 — a legacy scene keeps its content in top-level `scene.layers` with NO
 * `compositions`; the schema deliberately still accepts that shape, root
 * `lifecycle`/`playout` included. `ensureCompositions` migrates those layers into
 * one composition on load, so it must carry the root's lifecycle/playout across —
 * otherwise `playoutOf` resolves the migrated comp to `static`: the whole timeline
 * plays as ONE entrance (exit keyframes swept in), the hold freezes on the
 * post-exit (usually transparent) pose, and stop is a hard cut. The graphic
 * "disappears" after its intro.
 */

/** A legacy scene — content in root `layers`, NO `compositions`. Schema-valid by construction. */
function legacyScene(over: Partial<Scene> = {}): Scene {
  return SceneSchema.parse({
    schemaVersion: 1,
    id: 'p1',
    name: 'Legacy lower third',
    templateType: 'lower-third',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 100 },
    activeRange: { in: 0, out: 80 },
    editorBackdrop: 'transparent',
    layers: [
      {
        id: 'L1',
        name: 'Layer 1',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [defaultShape('e1', 100, 100)],
      },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    ...over,
  });
}

/** The composition `ensureCompositions` migrated the root layers into. */
function migrate(scene: Scene): Composition {
  const { scene: next, activeId } = ensureCompositions(scene);
  const comp = (next.compositions ?? []).find((c) => c.id === activeId);
  expect(comp).toBeDefined();
  return comp!;
}

describe('B-068 — ensureCompositions migrates a legacy root-layers scene', () => {
  it('carries the root lifecycle + playout into the migrated composition', () => {
    const playout = { mode: 'auto-out', holdSource: 'timed', holdMs: 3000 } as const;
    const scene = legacyScene({ lifecycle: { outPoint: 60 }, playout });
    expect(scene.compositions).toBeUndefined(); // the legacy shape: root layers, no comps

    const comp = migrate(scene);

    expect(comp.lifecycle).toEqual({ outPoint: 60 });
    expect(comp.playout).toEqual(playout);
    // The symptom that follows from dropping them: the comp must NOT resolve to
    // `static` (which plays the authored exit as part of the entrance, then cuts).
    expect(playoutOf(comp).mode).toBe('auto-out');
  });

  it('leaves lifecycle / playout ABSENT when the root has none (a conditional carry)', () => {
    const scene = legacyScene();
    expect(scene.lifecycle).toBeUndefined();
    expect(scene.playout).toBeUndefined();

    const comp = migrate(scene);

    // Absent stays absent — NOT a materialized `lifecycle: undefined` / `playout: undefined`
    // key, which would serialize differently and dirty the saved scene.
    expect('lifecycle' in comp).toBe(false);
    expect('playout' in comp).toBe(false);
    // No out-point + the default mode still resolves to `static` — D-114, unchanged.
    expect(playoutOf(comp).mode).toBe('static');
  });

  it('still carries resolution / frameRange / activeRange / editorBackdrop / layers', () => {
    const scene = legacyScene({ lifecycle: { outPoint: 60 } });

    const comp = migrate(scene);

    expect(comp.name).toBe('Legacy lower third');
    expect(comp.resolution).toEqual({ width: 1920, height: 1080 });
    expect(comp.frameRange).toEqual({ in: 0, out: 100 });
    expect(comp.activeRange).toEqual({ in: 0, out: 80 });
    expect(comp.editorBackdrop).toBe('transparent');
    expect(comp.layers).toEqual(scene.layers);
    // The root is drained — the layers now live in the composition.
    expect(ensureCompositions(scene).scene.layers).toEqual([]);
    // The migrated scene stays schema-valid (refineLifecycle: in ≤ outPoint ≤ out).
    expect(() => SceneSchema.parse(ensureCompositions(scene).scene)).not.toThrow();
  });

  it('leaves activeRange absent when the root has none', () => {
    const scene = legacyScene();
    delete scene.activeRange;

    expect('activeRange' in migrate(scene)).toBe(false);
  });
});
