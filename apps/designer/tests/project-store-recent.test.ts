import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Scene } from '@cg/shared-schema';

/**
 * D-093 — Remove from Recent. forgetRecent drops the list entry AND forgets a handle-backed
 * entry's persisted handle (`forgetFileHandle`), but NEVER deletes the underlying file
 * (real disk or OPFS `projects/*.cg.json`). clearRecent empties + forgets all. Removal is
 * persisted to the backing KV (survives a fresh store ≈ reload).
 */

vi.mock('@cg/storage', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, forgetFileHandle: vi.fn().mockResolvedValue(undefined) };
});

import { MemoryKv, MemoryWorkspace, forgetFileHandle } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';

const mockForget = vi.mocked(forgetFileHandle);

function scene(id: string, name: string): Scene {
  return {
    schemaVersion: 1,
    id,
    name,
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

afterEach(() => mockForget.mockClear());

describe('ProjectStore recent removal (D-093)', () => {
  it('forgetRecent drops the entry + forgets the handle, leaving the OPFS file intact', async () => {
    const ws = new MemoryWorkspace();
    const store = new ProjectStore(ws, new MemoryKv());
    await store.save(scene('a', 'Alpha'), 'Alpha'); // OPFS entry + file projects/Alpha.cg.json
    store.recordRecentHandle(scene('b', 'Beta')); // handle entry (handleKey='b')
    expect(store.recent()).toHaveLength(2);

    // Remove the handle entry → its persisted handle is forgotten.
    await store.forgetRecent({ projectId: 'b', handleKey: 'b' });
    expect(store.recent().map((e) => e.name)).toEqual(['Alpha']);
    expect(mockForget).toHaveBeenCalledWith('b');

    // Remove the OPFS entry → the file on disk is NOT deleted (re-openable).
    await store.forgetRecent({ projectId: 'a', path: 'projects/Alpha.cg.json' });
    expect(store.recent()).toHaveLength(0);
    expect(await ws.readJson('projects/Alpha.cg.json')).not.toBeNull();
  });

  it('removal is persisted to the KV (a fresh store ≈ reload sees the change)', async () => {
    const ws = new MemoryWorkspace();
    const kv = new MemoryKv();
    const store = new ProjectStore(ws, kv);
    store.recordRecentHandle(scene('a', 'Alpha'));
    store.recordRecentHandle(scene('b', 'Beta'));
    await store.forgetRecent({ projectId: 'a', handleKey: 'a' });
    expect(new ProjectStore(ws, kv).recent().map((e) => e.name)).toEqual(['Beta']);
  });

  it('clearRecent empties recent and forgets every cached handle', async () => {
    const store = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
    store.recordRecentHandle(scene('a', 'Alpha'));
    store.recordRecentHandle(scene('b', 'Beta'));
    await store.clearRecent();
    expect(store.recent()).toHaveLength(0);
    expect(mockForget.mock.calls.map((c) => c[0]).sort()).toEqual(['a', 'b']);
  });
});
