import { describe, expect, it } from 'vitest';
import type { Scene } from '@cg/shared-schema';
import { hashScene } from '../src/renderer/state/scene-hash.js';

/**
 * D-088 — the dirty signal hashes the document model. The hash MUST be stable across
 * object key order (scenes are spread-built + Zod-reparsed) and MUST exclude
 * `metadata.updatedAt` (bumped by saving, not by editing).
 */

function baseScene(): Scene {
  return {
    schemaVersion: 1,
    id: 'p1',
    name: 'Demo',
    templateType: 'lower-third',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    background: 'transparent',
    layers: [],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  } as Scene;
}

describe('hashScene (D-088)', () => {
  it('is stable across object key order', () => {
    const a = baseScene();
    // Same content, deliberately different key insertion order at two depths.
    const b = {
      metadata: { updatedAt: a.metadata.updatedAt, createdAt: a.metadata.createdAt },
      fonts: [],
      bindings: [],
      fields: [],
      layers: [],
      background: 'transparent',
      frameRange: { out: 50, in: 0 },
      safeAreas: { action: 5, title: 10 },
      frameRate: 50,
      resolution: { height: 1080, width: 1920 },
      templateType: 'lower-third',
      name: 'Demo',
      id: 'p1',
      schemaVersion: 1,
    } as Scene;
    expect(hashScene(a)).toBe(hashScene(b));
  });

  it('excludes metadata.updatedAt', () => {
    const a = baseScene();
    const b: Scene = {
      ...baseScene(),
      metadata: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2099-12-31T23:59:59.000Z' },
    };
    expect(hashScene(a)).toBe(hashScene(b));
  });

  it('changes when document content changes', () => {
    expect(hashScene(baseScene())).not.toBe(hashScene({ ...baseScene(), name: 'Renamed' }));
    expect(hashScene(baseScene())).not.toBe(
      hashScene({ ...baseScene(), frameRange: { in: 0, out: 51 } }),
    );
  });

  it('reflects nested array order (layers are order-significant)', () => {
    const withOrder = (names: string[]): Scene =>
      ({
        ...baseScene(),
        layers: names.map((name) => ({
          id: name,
          name,
          visible: true,
          locked: false,
          children: [],
          blendMode: 'normal',
        })),
      }) as Scene;
    expect(hashScene(withOrder(['a', 'b']))).not.toBe(hashScene(withOrder(['b', 'a'])));
  });
});
