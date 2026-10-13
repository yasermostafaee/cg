import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from './fixtures/designer.js';

/**
 * 🔴 `CLIENT-TEST-RELEASE-01` B1 — **CG DESIGNER NAMES ITS RELEASE IN ONE LINE**, in the built app the
 * installer ships: its start screen, under the line that says what the page is for. The version is
 * read from this app's `package.json`, the file the build stamp reads; the geometry is measured here
 * because jsdom has none (golden rule 12).
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const VERSION = (
  JSON.parse(readFileSync(path.resolve(here, '../../package.json'), 'utf8')) as { version: string }
).version;

test('B1 — the start screen reads "Version <release>" under its tagline, above New project', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });
  const landing = page.getByLabel('Designer landing');
  const line = landing.getByTestId('app-version');
  await expect(line).toHaveText(`Version ${VERSION}`);
  await expect(line).toBeVisible();
  await expect(line).toHaveAttribute('title', new RegExp(`^${VERSION.replaceAll('.', '\\.')} · `));

  const [lineBox, taglineBox, newBox] = await Promise.all([
    line.boundingBox(),
    landing.getByText(/^Broadcast template builder/).boundingBox(),
    page.getByRole('button', { name: 'New project' }).boundingBox(),
  ]);
  if (lineBox === null || taglineBox === null || newBox === null) {
    throw new Error('the line, the tagline and New project all render');
  }
  // Its own line: below the tagline, above the first control, left-aligned with the tagline.
  expect(lineBox.height).toBeGreaterThan(0);
  expect(lineBox.y).toBeGreaterThanOrEqual(taglineBox.y + taglineBox.height);
  expect(lineBox.y + lineBox.height).toBeLessThanOrEqual(newBox.y);
  expect(Math.round(lineBox.x)).toBe(Math.round(taglineBox.x));
});

/**
 * 🔴 `D-161` (`RELEASE-091-01` §4) — Help → About, in the built app: the name, the release and the
 * build, each visible, and Escape closes it. The dom spec reads the release through `tools/release`
 * (`about-version.dom.test.ts`); this is the rendering half golden rule 12 owes.
 */
test('D-161 — Help → About names CG Designer, Version <release> and the build, and Escape closes it', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });
  await app.newProject('About');
  await page.getByRole('button', { name: 'Help', exact: true }).click();
  await page.getByRole('menuitem', { name: 'About', exact: true }).click();

  const about = page.getByRole('dialog', { name: 'About' });
  await expect(about).toBeVisible();
  await expect(about.getByTestId('about-name')).toHaveText('CG Designer');
  await expect(about.getByTestId('about-version')).toHaveText(`Version ${VERSION}`);
  await expect(about.getByTestId('about-build')).toHaveText(
    /^Build [0-9a-z]+ · \d{4}-\d{2}-\d{2}$/,
  );
  for (const id of ['about-name', 'about-version', 'about-build']) {
    await expect(about.getByTestId(id)).toBeVisible();
  }

  await page.keyboard.press('Escape');
  await expect(about).toHaveCount(0);
});
