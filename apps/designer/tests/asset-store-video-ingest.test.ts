import { describe, expect, it } from 'vitest';
import { MemoryWorkspace } from '@cg/storage';
import type { VideoProvenance } from '@cg/shared-ipc';
import { AssetStore } from '../src/platform/AssetStore.js';

/**
 * D-128 Phase 2 — the raw-bytes ingest seam (`AssetStore.importBytes`) the video
 * converter stores its canonical WebM through. One write path: `importFile`
 * DELEGATES here, so File- and bytes-ingest share dedupe / path scheme / index
 * persistence (and inherit any B-104 fix together). The reload round-trip below
 * is the B-104-class regression shape: a fresh store over the SAME workspace +
 * project must resolve both the listing and the bytes.
 */

const WEBM = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 5, 6, 7, 8]); // EBML magic + junk
const OTHER = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 9, 9, 9, 9]);

const PROVENANCE: VideoProvenance = {
  sourceFilename: 'archive-clip.avi',
  sourceFps: 29.97,
  targetFps: 50,
  sourceWidth: 1920,
  sourceHeight: 1080,
  crop: { x: 100, y: 50, width: 640, height: 480 },
};

function fakeFile(name: string, bytes: Uint8Array): File {
  return { name, arrayBuffer: () => Promise.resolve(bytes.buffer) } as unknown as File;
}

describe('AssetStore.importBytes (D-128)', () => {
  it('stores converted bytes as a video asset under the project video path, with provenance', async () => {
    const store = new AssetStore(new MemoryWorkspace());
    store.setActiveProject('proj-1');
    const meta = await store.importBytes(WEBM, 'clip.webm', 'video', PROVENANCE);

    expect(meta.kind).toBe('video');
    expect(meta.filename).toBe('clip.webm');
    expect(meta.workingPath.startsWith('projects/proj-1/assets/video/')).toBe(true);
    expect(meta.workingPath.endsWith('.webm')).toBe(true);
    expect(meta.provenance).toEqual(PROVENANCE);
    expect(await store.bytes(meta.assetId)).toEqual(WEBM);
  });

  it('provenance is optional — a plain byte import carries none', async () => {
    const store = new AssetStore(new MemoryWorkspace());
    store.setActiveProject('proj-1');
    const meta = await store.importBytes(WEBM, 'clip.webm', 'video');
    expect(meta.provenance).toBeUndefined();
  });

  it('dedupes identical bytes by sha256 across BOTH ingest paths (one write path)', async () => {
    const store = new AssetStore(new MemoryWorkspace());
    store.setActiveProject('proj-1');
    const viaBytes = await store.importBytes(WEBM, 'clip.webm', 'video', PROVENANCE);
    // The same bytes arriving as a File (importFile delegates to importBytes).
    const viaFile = await store.importFile(fakeFile('same-bytes.webm', WEBM));
    const different = await store.importBytes(OTHER, 'other.webm', 'video');

    expect(viaFile.assetId).toBe(viaBytes.assetId); // deduped — no second entry
    expect(different.assetId).not.toBe(viaBytes.assetId);
    expect(await store.list()).toHaveLength(2);
  });

  it('B-104 regression shape: the asset survives a reload (fresh store, same workspace + project)', async () => {
    const ws = new MemoryWorkspace();
    const first = new AssetStore(ws);
    first.setActiveProject('proj-1');
    const meta = await first.importBytes(WEBM, 'clip.webm', 'video', PROVENANCE);

    // "Restart": a brand-new store over the same workspace re-activates the project.
    const reloaded = new AssetStore(ws);
    reloaded.setActiveProject('proj-1');
    const list = await reloaded.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.assetId).toBe(meta.assetId);
    expect(list[0]?.provenance).toEqual(PROVENANCE); // provenance round-trips index.json
    expect(await reloaded.bytes(meta.assetId)).toEqual(WEBM);
  });

  it('refuses to ingest before a project is active (never an orphaned write)', async () => {
    const store = new AssetStore(new MemoryWorkspace());
    await expect(store.importBytes(WEBM, 'clip.webm', 'video')).rejects.toThrow(
      /before a project is active/,
    );
  });

  it('importFile still resolves kind from the extension after the delegation refactor', async () => {
    const store = new AssetStore(new MemoryWorkspace());
    store.setActiveProject('proj-1');
    const png = await store.importFile(fakeFile('logo.png', new Uint8Array([1, 2, 3])));
    expect(png.kind).toBe('image');
    const webm = await store.importFile(fakeFile('clip.webm', OTHER));
    expect(webm.kind).toBe('video');
  });
});
