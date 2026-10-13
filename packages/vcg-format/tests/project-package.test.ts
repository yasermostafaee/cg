import { describe, it, expect, vi } from 'vitest';
import type { ProjectAssetEntry, Scene } from '@cg/shared-schema';
import { pack } from '../src/pack.js';
import {
  looksLikeZip,
  packProject,
  readProjectDocument,
  unpackProject,
} from '../src/project-package.js';
import {
  fixtureScene,
  fixtureIndexHtml,
  fixtureCgJs,
  fixtureCgCss,
  fixtureManifestExtras,
} from './fixtures.js';
import { readZip, writeZip } from '../src/zip.js';

/**
 * D-150 / B-104 — the project package.
 *
 * The bug: a project was a bare `.cg.json` holding a scene and a set of `assetId`
 * strings, while the bytes lived under a workspace path whose root could change out
 * from under it. These tests pin the property that ends it — the package is
 * SUFFICIENT ON ITS OWN.
 */

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5, 6, 7, 8]);
const TTF = new Uint8Array([0x00, 0x01, 0x00, 0x00, 9, 9, 9, 9]);

const IMAGE_PATH = `assets/image/${'a'.repeat(64)}.png`;
const FONT_PATH = `assets/font/${'b'.repeat(64)}.ttf`;

const imageEntry: ProjectAssetEntry = {
  assetId: 'a-1',
  kind: 'image',
  filename: 'logo.png',
  sha256: 'a'.repeat(64),
  byteSize: PNG.byteLength,
  path: IMAGE_PATH,
};

const fontEntry: ProjectAssetEntry = {
  assetId: 'a-2',
  kind: 'font',
  filename: 'brand.ttf',
  sha256: 'b'.repeat(64),
  byteSize: TTF.byteLength,
  path: FONT_PATH,
};

const index: ProjectAssetEntry[] = [imageEntry, fontEntry];

const files = new Map<string, Uint8Array>([
  [IMAGE_PATH, PNG],
  [FONT_PATH, TTF],
]);

const SAVED_AT = '2026-08-11T12:00:00.000Z';

function packFixture(scene: Scene = fixtureScene): Promise<Uint8Array> {
  return packProject({ scene, index, files, savedAt: SAVED_AT });
}

describe('project package — pack/unpack round trip', () => {
  it('carries the scene AND every asset byte, so the file is sufficient on its own', async () => {
    const doc = await unpackProject(await packFixture());

    expect(doc.manifest.format).toBe('cgproj');
    expect(doc.scene).toEqual(fixtureScene);
    expect(doc.index).toHaveLength(2);
    // The bytes themselves — not a path, not a hash, the actual content.
    expect(doc.files.get(IMAGE_PATH)).toEqual(PNG);
    expect(doc.files.get(FONT_PATH)).toEqual(TTF);
  });

  it('preserves every import-time fact, including lineage that cannot be recomputed', async () => {
    const provenance = {
      sourceFilename: 'original.mov',
      sourceFps: 25,
      targetFps: 50,
      sourceWidth: 1920,
      sourceHeight: 1080,
      crop: { x: 10, y: 20, width: 100, height: 200 },
    };
    const videoPath = `assets/video/${'a'.repeat(64)}.webm`;
    const videoEntry: ProjectAssetEntry = {
      ...imageEntry,
      kind: 'video',
      filename: 'clip.webm',
      path: videoPath,
      provenance,
    };
    const bytes = await packProject({
      scene: fixtureScene,
      index: [videoEntry],
      files: new Map([[videoPath, PNG]]),
      savedAt: SAVED_AT,
    });
    const doc = await unpackProject(bytes);
    // Provenance is a RECORD of what happened at conversion; nothing about the stored
    // bytes could reconstruct the crop rect or the source's fps.
    expect(doc.index[0]?.provenance).toEqual(provenance);
  });

  it('re-packing the same input is byte-identical', async () => {
    expect(await packFixture()).toEqual(await packFixture());
  });

  it('B-190 — the CLOCK moving between two packs does not change one byte', async () => {
    /*
      The test above is the property; this one is why it used to fail about once in a few
      hundred gate runs. `zip.file('assets/image/x.png', …)` pins the FILE's date and lets
      JSZip materialise `assets/` and `assets/image/` behind it, stamped with the live clock —
      first in sort order, so byte 10 of the archive (the DOS time field) tracked wall time at
      2-second resolution. Adjacent packs agreed unless they straddled a tick. Faking only
      `Date` (never the timers JSZip's own pipeline runs on) turns that coin-flip into a
      statement: move the clock four seconds and the bytes must not notice.
    */
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-08-31T12:00:00.000Z'));
      const first = await packFixture();
      vi.setSystemTime(new Date('2026-08-31T12:00:04.000Z'));
      expect(await packFixture()).toEqual(first);
    } finally {
      vi.useRealTimers();
    }
  });

  it('refuses to write an index entry whose bytes are absent', async () => {
    await expect(
      packProject({ scene: fixtureScene, index, files: new Map(), savedAt: SAVED_AT }),
    ).rejects.toThrow(/missing bytes/i);
  });

  it('validates the scene at the door', async () => {
    await expect(
      packProject({
        // @ts-expect-error — deliberate invalid Scene
        scene: { ...fixtureScene, schemaVersion: 99 },
        index: [],
        files: new Map(),
        savedAt: SAVED_AT,
      }),
    ).rejects.toThrow();
  });
});

describe('project package — the authoring scene survives WHOLE', () => {
  /**
   * 🔴 The regression this exists for: `pack()` (the `.vcg` exporter) calls
   * `withoutEditorBackdrop` — B-129's fix, and correct for a broadcast artifact.
   * Routing a SAVE through that same helper would delete the author's canvas backdrop
   * every single time they pressed Ctrl+S. This test fails the moment someone
   * "aligns" the two paths.
   */
  it('keeps editorBackdrop, which the .vcg exporter deliberately strips', async () => {
    const coloured: Scene = { ...fixtureScene, editorBackdrop: '#1a2b3c' };

    const project = await unpackProject(await packFixture(coloured));
    expect(project.scene.editorBackdrop).toBe('#1a2b3c');

    // The export path, on the very same scene, still strips it — both behaviours are
    // asserted together so neither can be "unified" into the other by accident.
    const exported = await pack({
      scene: coloured,
      manifestExtras: fixtureManifestExtras,
      indexHtml: fixtureIndexHtml,
      cgJs: fixtureCgJs,
      cgCss: fixtureCgCss,
    });
    const templateJson = (await readZip(exported)).get('template.json');
    expect(templateJson).toBeDefined();
    const exportedScene = JSON.parse(new TextDecoder().decode(templateJson)) as Scene;
    expect(exportedScene.editorBackdrop).toBe('transparent');
  });
});

describe('readProjectDocument — one entry point, both forms', () => {
  it('reads a package', async () => {
    const doc = await readProjectDocument(await packFixture());
    expect(doc.scene.id).toBe(fixtureScene.id);
    expect(doc.manifest.format).toBe('cgproj');
  });

  /**
   * P-031 — THE PRE-PACKAGE `.cg.json` PATH IS GONE, and this test is what used to
   * prove it worked. It is re-pointed rather than deleted, because the removal is the
   * behaviour now: nothing has shipped to a client, so no `.cg.json` in the world has
   * to keep opening, and a conversion nobody needs is debt that reads as safety.
   *
   * What must survive the removal is that the failure is READABLE — an author handed a
   * bare scene JSON is told what it is and what to do, not given a half-populated
   * project with no assets.
   */
  it('REFUSES a pre-package .cg.json by name, instead of half-opening it', async () => {
    const json = new TextEncoder().encode(JSON.stringify(fixtureScene));
    await expect(readProjectDocument(json)).rejects.toThrow(/re-create the project/i);
    await expect(readProjectDocument(json)).rejects.toThrow(/\.cgproj/);
  });

  it('REFUSES a legacy `background` spelling — the B-129 parse shim is gone too', async () => {
    // The other half of the same decision. B-129 renamed `background` → `editorBackdrop`
    // and left a `z.preprocess` accepting the old key; that shim is retired, so a scene
    // carrying only `background` now fails to parse with zod naming the missing required
    // key. Packaged so this asserts the CURRENT door (a .cgproj), not the deleted one.
    const legacy: Record<string, unknown> = { ...fixtureScene, background: '#123456' };
    delete legacy['editorBackdrop'];
    const bytes = await writeZip(
      new Map([
        [
          'manifest.json',
          new TextEncoder().encode(
            JSON.stringify({
              format: 'cgproj',
              formatVersion: '1.0',
              projectId: fixtureScene.id,
              name: fixtureScene.name,
              savedAt: '2026-08-11T00:00:00.000Z',
              assets: [],
            }),
          ),
        ],
        ['project.json', new TextEncoder().encode(JSON.stringify(legacy))],
      ]),
    );
    await expect(readProjectDocument(bytes)).rejects.toThrow(/editorBackdrop/);
  });

  it('refuses an exported .vcg BY NAME rather than failing obscurely', async () => {
    const vcg = await pack({
      scene: fixtureScene,
      manifestExtras: fixtureManifestExtras,
      indexHtml: fixtureIndexHtml,
      cgJs: fixtureCgJs,
      cgCss: fixtureCgCss,
    });
    // It IS a zip, so byte-sniffing alone would send it down the package path; the
    // manifest's `format` is what names the mistake to the operator.
    expect(looksLikeZip(vcg)).toBe(true);
    await expect(readProjectDocument(vcg)).rejects.toThrow(/\.vcg template, not a project/i);
  });

  it('rejects bytes that are neither', async () => {
    await expect(
      readProjectDocument(new TextEncoder().encode('not json at all')),
    ).rejects.toThrow();
  });
});
