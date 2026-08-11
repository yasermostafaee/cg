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
    expect(doc.manifest.format).toBe('cgproj');

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

  it('the pre-package form is REFUSED — the control that proves the test can fail', async () => {
    // The old control opened a bare scene JSON and showed it carried no assets. P-031
    // retired that read path, so the control is now the refusal itself: the pre-package
    // form cannot be opened at all, which is a stronger statement than "it opens badly".
    const scene = baseScene('proj-legacy-control');
    const legacyJson = new TextEncoder().encode(JSON.stringify(scene));
    await expect(readProjectDocument(legacyJson)).rejects.toThrow(/re-create the project/i);
  });
});

describe('B-104 — the package is the only door, and it carries everything', () => {
  /*
   * P-031 — TWO TESTS WERE REMOVED FROM THIS BLOCK, and they went with the code they
   * covered rather than being weakened:
   *
   *   - "adopts the workspace-resident bytes and leaves every original in place"
   *   - "opens with the scene intact when the legacy bytes are already gone"
   *
   * Both exercised D-150's CONVERSION path — `readProjectDocument` accepting a bare
   * `.cg.json` and `AssetStore.collectLegacyAssets` scraping whatever bytes survived in
   * the workspace under the project id. Neither the path nor the method exists now (see
   * the compatibility-floor decision in `P-031`), so keeping the tests would have meant
   * keeping the code purely to be tested. The refusal that replaced the path is asserted
   * above and in `@cg/vcg-format`'s `project-package.test.ts`.
   */

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
