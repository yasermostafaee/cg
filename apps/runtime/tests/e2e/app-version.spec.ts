import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from './fixtures/runtime.js';

/**
 * 🔴 `CLIENT-TEST-RELEASE-01` B1 — **CG CONTROL NAMES ITS RELEASE IN ONE LINE**, in the built console
 * the installer ships: Station setup's rail, under the station. The version is read from this app's
 * `package.json`, the file the build stamp reads; the geometry is measured here because jsdom has
 * none (golden rule 12).
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const VERSION = (
  JSON.parse(readFileSync(path.resolve(here, '../../package.json'), 'utf8')) as { version: string }
).version;

test('B1 — Station setup reads "Version <release>" at the foot of its rail, inside the dialog', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole('button', { name: 'Open Station setup', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Station setup' });
  await expect(dialog).toBeVisible();

  const line = dialog.getByTestId('app-version');
  await expect(line).toHaveText(`Version ${VERSION}`);
  await expect(line).toBeVisible();
  await expect(line).toHaveAttribute('title', new RegExp(`^${VERSION.replaceAll('.', '\\.')} · `));

  // In the rail, below the station card, and wholly inside the dialog's frame.
  const [lineBox, cardBox, railBox, dialogBox] = await Promise.all([
    line.boundingBox(),
    dialog.locator('[data-rail-station]').boundingBox(),
    dialog.locator('[data-setup-rail]').boundingBox(),
    dialog.boundingBox(),
  ]);
  if (lineBox === null || cardBox === null || railBox === null || dialogBox === null) {
    throw new Error('the line, the station card, the rail and the dialog all render');
  }
  expect(lineBox.height).toBeGreaterThan(0);
  expect(lineBox.y).toBeGreaterThanOrEqual(cardBox.y + cardBox.height);
  expect(lineBox.x).toBeGreaterThanOrEqual(railBox.x);
  expect(lineBox.x + lineBox.width).toBeLessThanOrEqual(railBox.x + railBox.width);
  expect(lineBox.y + lineBox.height).toBeLessThanOrEqual(dialogBox.y + dialogBox.height);
});
