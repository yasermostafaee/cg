import { describe, expect, it } from 'vitest';
import { CompositionSchema, SceneSchema } from '@cg/shared-schema';
import type { Composition, Element, Layer, Scene } from '@cg/shared-schema';
import { scopeSceneToComposition } from '../src/renderer/state/scene-doc.js';

/**
 * D-086 Phase B — `Composition.playoutTarget` is the persisted per-composition export
 * target (CasparCG-only for now; the visible selector is deferred to a 2nd target).
 * It is optional + backward-compatible, survives a Scene round-trip (save/reload), and
 * travels into a per-composition export for any composition in the root's closure.
 */

function comp(id: string, over: Partial<Composition> = {}): Composition {
  return {
    id,
    name: id,
    resolution: { width: 1920, height: 1080 },
    frameRange: { in: 0, out: 50 },
    background: 'transparent',
    layers: [],
    fields: [],
    bindings: [],
    ...over,
  };
}

function compInstance(id: string, compositionId: string): Element {
  return {
    id,
    name: id,
    type: 'composition',
    compositionId,
    transform: {
      position: { x: 0, y: 0 },
      size: { w: 100, h: 50 },
      scale: { x: 1, y: 1 },
      rotation: 0,
      anchor: { x: 0, y: 0 },
    },
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
  };
}

function layerOf(children: Element[]): Layer {
  return { id: 'L1', name: 'L', visible: true, locked: false, blendMode: 'normal', children };
}

/** Root R nests child C (a `composition` instance); C carries a playoutTarget. */
function sceneWithTargetedChild(): Scene {
  return {
    schemaVersion: 1,
    id: 's-pt',
    name: 'project',
    templateType: 'lower-third',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    background: 'transparent',
    layers: [],
    compositions: [
      comp('R', { layers: [layerOf([compInstance('instC', 'C')])], playoutTarget: 'casparcg' }),
      comp('C', { playoutTarget: 'casparcg' }),
    ],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  };
}

describe('Composition.playoutTarget (D-086 Phase B)', () => {
  it('accepts the casparcg target and round-trips it', () => {
    expect(CompositionSchema.parse(comp('c', { playoutTarget: 'casparcg' })).playoutTarget).toBe(
      'casparcg',
    );
  });

  it('is optional — a composition without it parses (absent ⇒ undefined)', () => {
    expect(CompositionSchema.parse(comp('c')).playoutTarget).toBeUndefined();
  });

  it('rejects an unknown target', () => {
    expect(() =>
      CompositionSchema.parse(comp('c', { playoutTarget: 'vmix' as 'casparcg' })),
    ).toThrow();
  });

  it('survives a full Scene round-trip (save/reload preserves each comp target)', () => {
    const parsed = SceneSchema.parse(sceneWithTargetedChild());
    const byId = new Map((parsed.compositions ?? []).map((c) => [c.id, c]));
    expect(byId.get('R')?.playoutTarget).toBe('casparcg');
    expect(byId.get('C')?.playoutTarget).toBe('casparcg');
  });

  it('travels into a per-composition export — the closure keeps the child target', () => {
    const scoped = scopeSceneToComposition(sceneWithTargetedChild(), 'R');
    expect(scoped).not.toBeNull();
    // The nested child C is in R's closure and retains its target in what gets packed.
    const child = (scoped?.compositions ?? []).find((c) => c.id === 'C');
    expect(child?.playoutTarget).toBe('casparcg');
  });
});
