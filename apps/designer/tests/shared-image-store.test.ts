import { describe, expect, it } from 'vitest';
import { MemoryWorkspace } from '@cg/storage';
import { SharedImageStore } from '../src/platform/SharedImageStore.js';

/**
 * D-040 — the device-level shared image library store. Mirrors the per-project
 * AssetStore byte/dedupe surface but is project-independent: paths live under
 * `shared/images/`, there is no `setActiveProject`, and the library survives a
 * project switch (modelled here as a fresh store over the same workspace).
 */

const PNG_A = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
const PNG_B = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9, 8, 7, 6]);

function fakeFile(name: string, bytes: Uint8Array): File {
  return { name, arrayBuffer: () => Promise.resolve(bytes.buffer) } as unknown as File;
}

describe('SharedImageStore (D-040)', () => {
  it('imports into the project-independent shared/images namespace', async () => {
    const ws = new MemoryWorkspace();
    const store = new SharedImageStore(ws);
    const meta = await store.importFile(fakeFile('logo.png', PNG_A));

    expect(meta.kind).toBe('image');
    expect(meta.filename).toBe('logo.png');
    expect(meta.workingPath.startsWith('shared/images/')).toBe(true);
    expect(meta.workingPath).not.toContain('projects/');
    expect(await store.list()).toHaveLength(1);
    expect(await store.bytes(meta.assetId)).toEqual(PNG_A);
    expect(await store.get(meta.assetId)).toEqual(meta);
  });

  it('dedupes identical bytes by sha256 (one entry, same id)', async () => {
    const store = new SharedImageStore(new MemoryWorkspace());
    const first = await store.importFile(fakeFile('logo.png', PNG_A));
    const again = await store.importFile(fakeFile('logo-copy.png', PNG_A));
    const other = await store.importFile(fakeFile('bug.png', PNG_B));

    expect(again.assetId).toBe(first.assetId); // deduped
    expect(other.assetId).not.toBe(first.assetId);
    expect(await store.list()).toHaveLength(2);
  });

  it('persists across a fresh store over the same workspace (survives a project switch)', async () => {
    const ws = new MemoryWorkspace();
    const meta = await new SharedImageStore(ws).importFile(fakeFile('logo.png', PNG_A));

    // A new store instance (e.g. after a project switch — the shared store is
    // never re-scoped) reads the same persisted index.
    const reopened = new SharedImageStore(ws);
    const list = await reopened.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.assetId).toBe(meta.assetId);
    expect(await reopened.bytes(meta.assetId)).toEqual(PNG_A);
  });

  it('removes the index entry (get/bytes resolve null afterwards)', async () => {
    const store = new SharedImageStore(new MemoryWorkspace());
    const meta = await store.importFile(fakeFile('logo.png', PNG_A));

    expect(await store.remove(meta.assetId)).toBe(true);
    expect(await store.remove(meta.assetId)).toBe(false); // already gone
    expect(await store.list()).toHaveLength(0);
    expect(await store.get(meta.assetId)).toBeNull();
    expect(await store.bytes(meta.assetId)).toBeNull();
  });
});
