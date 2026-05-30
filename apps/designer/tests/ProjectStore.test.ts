import { afterEach, describe, expect, it } from 'vitest';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { SceneSchema } from '@cg/shared-schema';
import { ProjectStore } from '../src/platform/ProjectStore.js';

function makeStore(): ProjectStore {
  return new ProjectStore(new MemoryWorkspace(), new MemoryKv());
}

describe('ProjectStore', () => {
  afterEach(() => {
    /* each test builds a fresh store over a fresh in-memory workspace */
  });

  it('creates a valid blank scene', () => {
    const { scene, path } = makeStore().newScene('My Bug', 'logo-bug');
    expect(path).toBeNull();
    expect(scene.name).toBe('My Bug');
    expect(scene.templateType).toBe('logo-bug');
    expect(() => SceneSchema.parse(scene)).not.toThrow();
  });

  it('loads a starter as a fresh, validated clone', () => {
    const result = makeStore().loadStarter('persian-reference');
    expect(result).not.toBeNull();
    expect(() => SceneSchema.parse(result?.scene)).not.toThrow();
  });

  it('returns null for an unknown starter', () => {
    expect(makeStore().loadStarter('does-not-exist')).toBeNull();
  });

  it('lists the starter catalog with template types', () => {
    const starters = makeStore().starters();
    expect(starters.length).toBeGreaterThan(0);
    expect(starters.every((s) => s.id && s.label && s.templateType)).toBe(true);
  });

  it('saves and re-opens a scene round-trip', async () => {
    const store = makeStore();
    const { scene } = store.newScene('Round Trip', 'lower-third');
    const { path } = await store.save(scene, 'round-trip');
    expect(path).toBe('projects/round-trip.cg.json');

    const reopened = await store.open(path);
    expect(reopened.scene?.id).toBe(scene.id);
    expect(reopened.path).toBe(path);
  });

  it('records recents on save, most-recent first, deduped', async () => {
    const store = makeStore();
    const a = store.newScene('A', 'ticker').scene;
    await store.save(a, 'a');
    const b = store.newScene('B', 'ticker').scene;
    await store.save(b, 'b');
    await store.save(a, 'a'); // re-save A → moves to front, no dup

    const recent = store.recent();
    expect(recent.map((r) => r.name)).toEqual(['A', 'B']);
    expect(recent[0]?.path).toBe('projects/a.cg.json');
  });

  it('emits active-changed when the active scene changes', () => {
    const store = makeStore();
    const seen: (string | null)[] = [];
    store.activeChanged.subscribe((p) => seen.push(p.scene?.name ?? null));
    store.newScene('One', 'fullscreen');
    store.loadStarter('persian-reference');
    expect(seen.length).toBe(2);
    expect(seen[0]).toBe('One');
  });
});
