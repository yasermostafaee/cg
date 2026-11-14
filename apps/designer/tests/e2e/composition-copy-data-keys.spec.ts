import { readFile } from 'node:fs/promises';
import type { Composition, Scene } from '@cg/shared-schema';
import { packProject, unpack } from '@cg/vcg-format';
import { defaultText } from '../../src/renderer/state/element-defaults.js';
import { test, expect } from './fixtures/designer.js';

function legacyProject(): Scene {
  const timestamp = '2026-11-13T00:00:00.000Z';
  const resolution = { width: 1920, height: 1080 };
  const frameRange = { in: 0, out: 75 };
  const title = (id: string): Composition => ({
    id,
    name: id,
    resolution,
    frameRange,
    editorBackdrop: 'transparent',
    layers: [
      {
        id: `layer-${id}`,
        name: 'Layer 1',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [defaultText(`${id}-title`, 120, 60)],
      },
    ],
    fields: [{ id, label: id, required: false, type: 'text', default: id }],
    bindings: [{ fieldId: id, target: { kind: 'text', elementId: `${id}-title` } }],
  });
  const original = title('original');
  const copy = title('duplicate');
  // Older Designer builds left the first composition's target ID after copying. Editing
  // the copy then made its own new binding alongside this one.
  copy.fields?.push({ id: 'stale', label: 'stale', required: false, type: 'text', default: 'Old' });
  copy.bindings?.push({
    fieldId: 'stale',
    target: { kind: 'text', elementId: 'original-title' },
  });
  return {
    schemaVersion: 1,
    id: 'legacy-copied-title',
    name: 'Legacy copied title',
    templateType: 'custom',
    resolution,
    frameRate: 25,
    safeAreas: { title: 10, action: 5 },
    frameRange,
    editorBackdrop: 'transparent',
    layers: [],
    fields: [],
    bindings: [],
    fonts: [],
    compositions: [original, copy],
    entryCompositionId: copy.id,
    metadata: { createdAt: timestamp, updatedAt: timestamp },
  };
}

test('changing a duplicated composition title key updates its own binding only', async ({
  app,
  page,
}) => {
  await app.newProject('Copy title');
  await app.addTextElement();
  await app.setDataKey('originalTitle');

  await app.showCompositions();
  const original = page.locator('.cg-comp-row').filter({
    has: page.getByText('comp1', { exact: true }),
  });
  await original.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Duplicate', exact: true }).click();
  await app.openComposition('comp1 copy');
  const [copyTitle] = await app.timelineRowIds();
  if (copyTitle === undefined) throw new Error('Missing copied title');
  await app.selectElementById(copyTitle);
  await app.expandDynamicData();
  await expect(app.dataKeyInput).toHaveValue('originalTitle');
  await app.setDataKey('copiedTitle');

  await page.getByRole('tab', { name: 'Variables' }).click();
  await expect(app.fieldCard('copiedTitle')).toBeVisible();
  await expect(app.fieldCard('originalTitle')).toHaveCount(0);
  await original.dblclick();
  await expect(app.fieldCard('originalTitle')).toBeVisible();
  await expect(app.fieldCard('copiedTitle')).toHaveCount(0);
});

test('an old copy opens and re-exports only its real title key', async ({ app, page }) => {
  const scene = legacyProject();
  const project = await packProject({
    scene,
    index: [],
    files: new Map(),
    savedAt: scene.metadata.updatedAt,
  });
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import project', exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: 'legacy-copied-title.cgproj',
    mimeType: 'application/zip',
    buffer: Buffer.from(project),
  });
  await app.expectStudio();

  await page.getByRole('tab', { name: 'Variables' }).click();
  await expect(app.fieldCard('duplicate')).toBeVisible();
  await expect(app.fieldCard('stale')).toHaveCount(0);

  const download = page.waitForEvent('download');
  await app.compositionActionBar.getByRole('button', { name: 'Export .vcg', exact: true }).click();
  const { scene: exported, manifest } = await unpack(await readFile(await (await download).path()));
  expect(manifest.fields.map(({ id }) => id)).toEqual(['duplicate']);
  expect(exported.bindings).toEqual([
    { fieldId: 'duplicate', target: { kind: 'text', elementId: 'duplicate-title' } },
  ]);
});
