import type { Scene } from '@cg/shared-schema';
import { packProject } from '@cg/vcg-format';
import { test, expect } from './fixtures/designer.js';

function savedProject(): Scene {
  return {
    schemaVersion: 1,
    id: 'landing-import-project',
    name: 'Landing Import E2E',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    editorBackdrop: 'transparent',
    layers: [],
    fields: [],
    bindings: [],
    fonts: [],
    compositions: [
      {
        id: 'comp1',
        name: 'Main',
        resolution: { width: 1920, height: 1080 },
        frameRange: { in: 0, out: 50 },
        editorBackdrop: 'transparent',
        layers: [],
      },
    ],
    metadata: {
      createdAt: '2026-11-03T00:00:00.000Z',
      updatedAt: '2026-11-03T00:00:00.000Z',
    },
  } as Scene;
}

test.describe('D-191 — direct project import from Landing', () => {
  test('opens a saved .cgproj without creating a temporary project first', async ({
    app,
    page,
  }) => {
    const create = page.getByRole('button', { name: 'New project', exact: true });
    const importProject = page.getByRole('button', { name: 'Import project', exact: true });
    await expect(create).toBeVisible();
    await expect(importProject).toBeVisible();

    const bytes = await packProject({
      scene: savedProject(),
      index: [],
      files: new Map(),
      savedAt: '2026-11-03T00:00:00.000Z',
    });
    const chooser = page.waitForEvent('filechooser');
    await importProject.click();
    await expect(page.getByRole('dialog', { name: 'New project' })).toHaveCount(0);
    await (
      await chooser
    ).setFiles({
      name: 'Landing Import E2E.cgproj',
      mimeType: 'application/zip',
      buffer: Buffer.from(bytes),
    });

    await app.expectStudio();
    await expect(page.getByTestId('project-name')).toHaveText('Landing Import E2E');
    await expect(create).toHaveCount(0);
  });
});
