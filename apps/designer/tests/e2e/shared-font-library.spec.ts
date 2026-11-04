import { fileURLToPath } from 'node:url';
import { expect, test } from './fixtures/designer.js';

const FONT_PATH = fileURLToPath(
  new URL('../../public/fonts/exo2/exo-2-latin-800-normal.woff2', import.meta.url),
);

test.describe('D-126 — shared font library', () => {
  test('imports once, survives a project switch and is selectable from the font picker', async ({
    app,
  }) => {
    await app.newProject('Shared font A');
    await app.addSharedFont(FONT_PATH);

    await app.page.getByRole('button', { name: 'File', exact: true }).click();
    await app.page.getByRole('menuitem', { name: 'New', exact: true }).click();
    const dialog = app.page.getByRole('dialog', { name: 'New project' });
    await dialog.getByLabel('Project name').fill('Shared font B');
    await dialog.getByRole('button', { name: 'Create' }).click();
    await app.addTextElement();
    const picker = app.inspector.getByRole('combobox', { name: 'Font family' });
    const sharedOption = picker.getByRole('option', { name: 'exo-2-latin-800-normal' });
    await expect(sharedOption).toHaveCount(1);
    const sharedValue = (await sharedOption.getAttribute('value')) ?? '';
    await picker.selectOption({ label: 'exo-2-latin-800-normal' });
    await expect(picker).toHaveValue(sharedValue);

    await app.openPreviewModal();
    await app.play();
    await expect
      .poll(() =>
        app.previewFrame
          .locator('body')
          .evaluate(
            (body, family) => body.ownerDocument.fonts.check(`16px "${family}"`),
            sharedValue,
          ),
      )
      .toBe(true);
  });
});
