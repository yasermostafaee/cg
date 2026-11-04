import { describe, expect, it } from 'vitest';
import { MemoryWorkspace } from '@cg/storage';
import { SharedFontStore } from '../src/platform/SharedFontStore.js';

const FONT_A = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 1, 2, 3, 4]);
const FONT_B = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 9, 8, 7, 6]);

function fakeFile(name: string, bytes: Uint8Array): File {
  return { name, arrayBuffer: () => Promise.resolve(bytes.buffer) } as unknown as File;
}

describe('SharedFontStore (D-126)', () => {
  it('imports into the project-independent shared/fonts namespace', async () => {
    const store = new SharedFontStore(new MemoryWorkspace());
    const meta = await store.importFile(fakeFile('Brand.woff2', FONT_A));

    expect(meta.kind).toBe('font');
    expect(meta.workingPath.startsWith('shared/fonts/')).toBe(true);
    expect(meta.workingPath).not.toContain('projects/');
    expect(await store.bytes(meta.assetId)).toEqual(FONT_A);
  });

  it('dedupes bytes and persists for a fresh store', async () => {
    const ws = new MemoryWorkspace();
    const store = new SharedFontStore(ws);
    const first = await store.importFile(fakeFile('Brand.woff2', FONT_A));
    const same = await store.importFile(fakeFile('Brand-copy.woff2', FONT_A));
    await store.importFile(fakeFile('Second.woff2', FONT_B));

    expect(same.assetId).toBe(first.assetId);
    expect(await new SharedFontStore(ws).list()).toHaveLength(2);
  });

  it('removes only the index entry', async () => {
    const store = new SharedFontStore(new MemoryWorkspace());
    const meta = await store.importFile(fakeFile('Brand.woff2', FONT_A));

    expect(await store.remove(meta.assetId)).toBe(true);
    expect(await store.get(meta.assetId)).toBeNull();
    expect(await store.bytes(meta.assetId)).toBeNull();
  });
});
