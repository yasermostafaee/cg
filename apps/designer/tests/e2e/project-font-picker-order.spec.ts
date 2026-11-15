import { fileURLToPath } from 'node:url';
import { expect, test } from './fixtures/designer.js';

const FONT_NAME = 'exo-2-latin-800-normal';
const FONT_PATH = fileURLToPath(
  new URL(`../../public/fonts/exo2/${FONT_NAME}.woff2`, import.meta.url),
);

test('lists the project font first in each text element font picker', async ({ app }) => {
  await app.newProject('Project font order');
  await app.addTextElement();
  const picker = app.inspector.getByRole('combobox', { name: 'Font family' });
  const previousFamily = await picker.inputValue();
  const expectProjectFontFirst = async (): Promise<void> => {
    await expect(picker.getByRole('option').first()).toHaveText(FONT_NAME);
    await expect(picker.getByRole('option', { name: 'Arial', exact: true })).toHaveCount(1);
  };

  await app.page.getByRole('button', { name: 'Project assets', exact: true }).click();
  await app.page.getByRole('button', { name: 'Add asset', exact: true }).click();
  const chooser = app.page.waitForEvent('filechooser');
  await app.page.getByRole('menuitem', { name: 'Font…', exact: true }).click();
  await (await chooser).setFiles(FONT_PATH);

  await expectProjectFontFirst();
  await expect(picker).toHaveValue(previousFamily);
  await picker.selectOption({ label: FONT_NAME });
  await expect(picker).toHaveValue(/^asset-/);

  await app.addTicker();
  await expectProjectFontFirst();
  await app.addClock();
  await expectProjectFontFirst();
  await app.addSequence();
  await expectProjectFontFirst();
});
