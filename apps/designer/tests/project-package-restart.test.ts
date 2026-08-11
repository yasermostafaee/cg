import { describe, it, expect } from 'vitest';
import { MemoryWorkspace, type Workspace } from '@cg/storage';
import { packProject, readProjectDocument } from '@cg/vcg-format';
import type { Scene } from '@cg/shared-schema';
import { AssetStore } from '../src/platform/AssetStore.js';

/**
 * D-150 / B-104 — **the simulated-restart regression test.**
 *
 * This is deliberately NOT an in-memory round trip. The whole of B-104 is that the
 * asset bytes lived at a workspace path (`projects/<id>/assets/...`) whose ROOT could
 * change between sessions: a browser restart drops a directory handle's permission
 * grant, `initWorkspace()` silently fell back to a different store, and the same path
 * then resolved somewhere the bytes were not.
 *
 * So the restart is modelled as the thing that actually happens: **a second, EMPTY
 * workspace with none of the project's bytes in it.** Everything the reopened project
 * shows must come out of the package.
 */

const SAVED_AT = '2026-08-11T12:00:00.000Z';

function baseScene(id = 'proj-1'): Scene {
  return {
    schemaVersion: 1,
    id,
    name: 'Restart Test',
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
    compositions: [],
    metadata: { createdAt: SAVED_AT, updatedAt: SAVED_AT },
  };
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 1, 2, 3]);
const PNG2 = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 9, 9, 9]);
const TTF = new Uint8Array([0x00, 0x01, 0x00, 0x00, 5, 5, 5]);

function file(bytes: Uint8Array, name: string, type: string): File {
  return new File([bytes as BlobPart], name, { type });
}

/** Author a project with assets in `ws`, and return the package bytes. */
async function authorAndPack(ws: Workspace, scene: Scene): Promise<Uint8Array> {
  const assets = new AssetStore(ws);
  assets.setActiveProject(scene.id);
  await assets.importFile(file(PNG, 'logo.png', 'image/png'), 'image');
  await assets.importFile(file(PNG2, 'shot.png', 'image/png'), 'image');
  await assets.importFile(file(TTF, 'brand.ttf', 'font/ttf'), 'font');
  const { index, files, missing } = await assets.exportForPackage();
  expect(missing).toHaveLength(0);
  return packProject({ scene, index, files, savedAt: SAVED_AT });
}

describe('B-104 — assets survive a restart because the package carries them', () => {
  it('reopens with every asset present, against a workspace that has NONE of the bytes', async () => {
    const scene = baseScene();

    // ── session 1: author + save ────────────────────────────────────────────────
    const wsBefore = new MemoryWorkspace();
    const bytes = await authorAndPack(wsBefore, scene);

    // ── the restart ─────────────────────────────────────────────────────────────
    // A brand-new workspace: this is the storage root resolving differently, which is
    // exactly what a lost `FileSystemHandle` permission produces. Nothing carries over.
    const wsAfter = new MemoryWorkspace();
    expect(await wsAfter.list()).toHaveLength(0);

    // ── session 2: open the package ─────────────────────────────────────────────
    const doc = await readProjectDocument(bytes);
    expect(doc.form).toBe('package');

    const assets = new AssetStore(wsAfter);
    assets.setActiveProject(doc.scene.id);
    await assets.adoptFromPackage(doc.index, doc.files);

    const listed = await assets.list();
    expect(listed.map((a) => a.filename).sort()).toEqual(['brand.ttf', 'logo.png', 'shot.png']);

    // The BYTES resolve — not just the listing. A panel that lists an asset whose bytes
    // are gone is the exact failure B-104 reports.
    for (const meta of listed) {
      const readBack = await assets.bytes(meta.assetId);
      expect(readBack, `bytes for ${meta.filename}`).not.toBeNull();
      expect(readBack!.byteLength).toBe(meta.byteSize);
    }
    const logo = listed.find((a) => a.filename === 'logo.png')!;
    expect(await assets.bytes(logo.assetId)).toEqual(PNG);
  });

  it('opening the same package twice does not duplicate assets', async () => {
    const scene = baseScene('proj-idem');
    const bytes = await authorAndPack(new MemoryWorkspace(), scene);
    const doc = await readProjectDocument(bytes);

    const ws = new MemoryWorkspace();
    const assets = new AssetStore(ws);
    assets.setActiveProject(scene.id);
    await assets.adoptFromPackage(doc.index, doc.files);
    await assets.adoptFromPackage(doc.index, doc.files);

    expect(await assets.list()).toHaveLength(3);
  });

  it('the pre-package form loses them — the control that proves the test can fail', async () => {
    // Save the project the OLD way (scene JSON only) and reopen against a fresh
    // workspace. Without this leg, the test above could pass for the wrong reason.
    const scene = baseScene('proj-legacy-control');
    const wsBefore = new MemoryWorkspace();
    await authorAndPack(wsBefore, scene);
    const legacyJson = new TextEncoder().encode(JSON.stringify(scene));

    const wsAfter = new MemoryWorkspace();
    const doc = await readProjectDocument(legacyJson);
    const assets = new AssetStore(wsAfter);
    assets.setActiveProject(doc.scene.id);

    expect(doc.form).toBe('legacy-json');
    expect(doc.index).toHaveLength(0);
    expect(await assets.list()).toHaveLength(0);
  });
});

describe('B-104 — conversion adopts surviving legacy assets, and destroys nothing', () => {
  it('adopts the workspace-resident bytes and leaves every original in place', async () => {
    const scene = baseScene('proj-convert');

    // A pre-package project: scene JSON at a workspace path, assets in the subtree.
    const ws = new MemoryWorkspace();
    const authoring = new AssetStore(ws);
    authoring.setActiveProject(scene.id);
    const logo = await authoring.importFile(file(PNG, 'logo.png', 'image/png'), 'image');
    await ws.writeJson('projects/legacy.cg.json', scene);

    const legacyBytes = (await ws.readFile('projects/legacy.cg.json'))!;
    const legacyIndexBefore = await ws.readJson<unknown>(`projects/${scene.id}/assets/index.json`);

    // Open it: parse-time normalization, then adopt whatever survived.
    const doc = await readProjectDocument(legacyBytes);
    expect(doc.form).toBe('legacy-json');

    const reopened = new AssetStore(ws);
    reopened.setActiveProject(scene.id);
    const legacy = await reopened.collectLegacyAssets(scene.id);
    expect(legacy.index.map((a) => a.filename)).toEqual(['logo.png']);
    expect(legacy.files.get(legacy.index[0]!.path)).toEqual(PNG);

    // 🔴 NON-DESTRUCTIVE, asserted rather than asserted-about. The original file is
    // byte-identical, the legacy asset subtree is untouched, and the bytes are still
    // where they were: an author cannot end up with less than they started with.
    expect(await ws.readFile('projects/legacy.cg.json')).toEqual(legacyBytes);
    expect(await ws.readJson<unknown>(`projects/${scene.id}/assets/index.json`)).toEqual(
      legacyIndexBefore,
    );
    expect(await ws.readFile(logo.workingPath)).toEqual(PNG);
  });

  it('opens with the scene intact when the legacy bytes are already gone', async () => {
    // B-104 at its worst: the storage root changed and orphaned the bytes long ago.
    // The project must still open — the shortfall becomes visible in the assets panel
    // rather than taking the whole project down with it.
    const scene = baseScene('proj-orphaned');
    const ws = new MemoryWorkspace();
    const assets = new AssetStore(ws);
    assets.setActiveProject(scene.id);

    const doc = await readProjectDocument(new TextEncoder().encode(JSON.stringify(scene)));
    const legacy = await assets.collectLegacyAssets(scene.id);

    expect(doc.scene.id).toBe(scene.id);
    expect(legacy.index).toHaveLength(0);
  });

  it('exportForPackage REPORTS an asset whose bytes vanished instead of dropping it', async () => {
    const scene = baseScene('proj-missing');
    const ws = new MemoryWorkspace();
    const assets = new AssetStore(ws);
    assets.setActiveProject(scene.id);
    const meta = await assets.importFile(file(PNG, 'logo.png', 'image/png'), 'image');

    await ws.delete(meta.workingPath);

    const { index, missing } = await assets.exportForPackage();
    expect(index).toHaveLength(0);
    // Named, not silent: a package that quietly omits an asset is this bug in new clothes.
    expect(missing.map((m) => m.filename)).toEqual(['logo.png']);
  });
});
