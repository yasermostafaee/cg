import { describe, expect, it } from 'vitest';
import { SceneSchema } from '@cg/shared-schema';
import { ProjectService } from '../src/main/services/ProjectService.js';

describe('ProjectService — starters', () => {
  it('starters() returns at least the Persian reference', () => {
    const svc = new ProjectService({ recentFilePath: '/tmp/recent.json' });
    const list = svc.starters();
    expect(list.some((s) => s.id === 'persian-reference')).toBe(true);
  });

  it('loadStarter returns a clone with a fresh id + timestamps + the starter name', () => {
    const svc = new ProjectService({
      recentFilePath: '/tmp/recent.json',
      now: () => new Date('2026-05-24T12:00:00.000Z'),
      randomId: () => 'scene-new-id',
    });
    const result = svc.loadStarter('persian-reference');
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.path).toBeNull();
    expect(result.scene.id).toBe('scene-new-id');
    expect(result.scene.name).toBe('Persian Reference Render');
    expect(result.scene.metadata.createdAt).toBe('2026-05-24T12:00:00.000Z');
    expect(result.scene.metadata.updatedAt).toBe('2026-05-24T12:00:00.000Z');
    // Schema must still pass for the cloned scene.
    expect(() => SceneSchema.parse(result.scene)).not.toThrow();
  });

  it('loadStarter mutations do not bleed into subsequent loads', () => {
    const svc = new ProjectService({
      recentFilePath: '/tmp/recent.json',
      randomId: () => 'scene-x',
    });
    const a = svc.loadStarter('persian-reference');
    if (a === null) throw new Error('starter missing');
    const layerA = a.scene.layers[0];
    if (layerA !== undefined) {
      // Deliberately mutate the loaded scene.
      const elements = layerA.children as { name: string }[];
      if (elements[0] !== undefined) elements[0].name = 'mutated';
    }
    const b = svc.loadStarter('persian-reference');
    if (b === null) throw new Error('starter missing');
    expect(b.scene.layers[0]?.children[0]?.name).not.toBe('mutated');
  });

  it('loadStarter returns null for an unknown starter id', () => {
    const svc = new ProjectService({ recentFilePath: '/tmp/recent.json' });
    expect(svc.loadStarter('nope')).toBeNull();
  });

  it('loadStarter sets the scene as the active project', () => {
    const svc = new ProjectService({
      recentFilePath: '/tmp/recent.json',
      randomId: () => 'scene-active',
    });
    svc.loadStarter('persian-reference');
    expect(svc.current()?.scene.id).toBe('scene-active');
    expect(svc.current()?.path).toBeNull();
  });
});
