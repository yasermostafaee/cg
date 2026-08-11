import { describe, expect, it } from 'vitest';
import { SceneSchema, withoutEditorBackdrop, type Scene } from '../src/index.js';

/**
 * B-129 — `withoutEditorBackdrop` is what BOTH exporters call, so an artifact cannot
 * carry the editor's backdrop.
 *
 * ⚠ **This is DEFENCE IN DEPTH, not the guard.** The guard is the render path's
 * `author`-mode check (`@cg/template-runtime`'s `editor-backdrop.test.ts`). This layer
 * exists so the value cannot travel at all — belt to the render path's braces — and it
 * is ONE implementation precisely so the `.vcg` and the single-file export can never
 * disagree about it.
 */

const scene = (over: Partial<Scene> = {}): Scene =>
  SceneSchema.parse({
    schemaVersion: 1,
    id: 'scene-1',
    name: 's',
    templateType: 'lower-third',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    editorBackdrop: 'transparent',
    layers: [],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    ...over,
  });

describe('B-129 — withoutEditorBackdrop', () => {
  it('forces the scene backdrop transparent', () => {
    expect(withoutEditorBackdrop(scene({ editorBackdrop: '#123456' })).editorBackdrop).toBe(
      'transparent',
    );
  });

  it('forces EVERY composition backdrop transparent, not just the root', () => {
    // A nested composition is the other place the value could travel out.
    const s = scene({
      editorBackdrop: '#111111',
      compositions: [
        {
          id: 'c1',
          name: 'c1',
          resolution: { width: 640, height: 360 },
          frameRange: { in: 0, out: 10 },
          editorBackdrop: '#222222',
          layers: [],
        },
        {
          id: 'c2',
          name: 'c2',
          resolution: { width: 640, height: 360 },
          frameRange: { in: 0, out: 10 },
          editorBackdrop: '#333333',
          layers: [],
        },
      ],
    });
    const out = withoutEditorBackdrop(s);
    expect(out.editorBackdrop).toBe('transparent');
    expect(out.compositions?.map((c) => c.editorBackdrop)).toEqual(['transparent', 'transparent']);
  });

  it('changes NOTHING else about the scene', () => {
    // The helper must not become a general-purpose scrubber: an exporter that
    // silently dropped other authored data would be a far worse defect than the one
    // being fixed.
    const s = scene({ editorBackdrop: '#123456', name: 'keep-me' });
    const out = withoutEditorBackdrop(s);
    expect({ ...out, editorBackdrop: s.editorBackdrop }).toEqual(s);
  });

  it('does not mutate its input', () => {
    const s = scene({ editorBackdrop: '#123456' });
    withoutEditorBackdrop(s);
    expect(s.editorBackdrop).toBe('#123456');
  });

  it('is a no-op on an already-transparent scene', () => {
    const s = scene();
    expect(withoutEditorBackdrop(s)).toEqual(s);
  });

  it('leaves `compositions` absent rather than inventing an empty array', () => {
    // `compositions` is optional; materialising `[]` would change the serialised
    // artifact for every scene that has no sub-compositions.
    expect(Object.hasOwn(withoutEditorBackdrop(scene()), 'compositions')).toBe(false);
  });
});
