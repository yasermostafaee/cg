import { describe, it, expect } from 'vitest';
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
import { readZip } from '../src/zip.js';

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

    expect(doc.form).toBe('package');
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
    expect(doc.form).toBe('package');
    expect(doc.scene.id).toBe(fixtureScene.id);
  });

  /**
   * The CONVERSION path. A pre-package project is a bare `.cg.json`, so the two forms
   * are not both JSON and the discrimination is on BYTES (zip magic).
   *
   * 🔴 This is parse-time normalization, NOT a registered schema migration
   * (`migrations.migrate()` has zero production call sites — P-031). It runs on every
   * load path because every load path goes through this function.
   */
  it('reads a pre-package .cg.json and reports it as legacy', async () => {
    const json = new TextEncoder().encode(JSON.stringify(fixtureScene));
    const doc = await readProjectDocument(json);

    expect(doc.form).toBe('legacy-json');
    expect(doc.scene).toEqual(fixtureScene);
    // A legacy document carried no assets — it never could. That is the bug.
    expect(doc.files.size).toBe(0);
    expect(doc.index).toHaveLength(0);
    expect(doc.manifest).toBeNull();
  });

  it('normalizes a legacy scene through the schema, so old spellings still load', async () => {
    // B-129's legacy `background` key: the scene-level preprocess moves it onto
    // `editorBackdrop`. Proves the conversion path gets the schema's normalization for
    // free, which is the entire argument for doing it at parse time.
    const legacy = { ...fixtureScene, editorBackdrop: undefined, background: '#123456' };
    delete (legacy as Record<string, unknown>)['editorBackdrop'];
    const doc = await readProjectDocument(new TextEncoder().encode(JSON.stringify(legacy)));

    expect(doc.form).toBe('legacy-json');
    expect(doc.scene.editorBackdrop).toBe('#123456');
    expect('background' in doc.scene).toBe(false);
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
