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

test('P-077 — version history opens inside Station setup and returns to the station', async ({
  app,
}) => {
  const page = app.page;
  await page.getByRole('button', { name: 'Open Station setup', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Station setup' });
  await settings.getByRole('button', { name: 'Version history', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Version history' });
  const history = dialog.frameLocator('iframe[title="Version history"]');
  const heading = history.getByRole('heading', { name: 'نسخه‌ها و تغییرات', exact: true });
  await expect(heading).toBeVisible();
  const persianPages = history.getByRole('navigation', { name: 'صفحه‌بندی نسخه‌ها' });
  await expect(persianPages).toBeVisible();
  await expect(persianPages.getByRole('button')).toHaveCount(2);
  await expect(persianPages.getByRole('button').nth(0)).toBeDisabled();
  await expect(persianPages.getByRole('button').nth(1)).toBeDisabled();
  await expect(history.locator('[id="version-next"], [id="en-version-next"]')).toHaveCount(0);
  await expect(history.locator('.download-grid, .download')).toHaveCount(0);
  await expect(
    history.getByRole('heading', { name: 'دانلودهای این نسخه', exact: true }),
  ).toHaveCount(0);
  await expect(history.locator('[id="version-1.1.0"] [data-status]')).toHaveAttribute(
    'data-status',
    'published',
  );
  await expect(history.locator('[id="version-1.1.0"] [data-status]')).toHaveText('منتشرشده');
  const viewport = page.viewportSize();
  const frame = await dialog.boundingBox();
  if (viewport === null || frame === null) throw new Error('Version history frame is missing');
  expect(frame.width).toBeGreaterThanOrEqual(viewport.width - 40);
  expect(frame.height).toBeGreaterThanOrEqual(viewport.height - 40);
  expect(
    await heading.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
  ).toBeLessThan(32);
  await history.getByRole('button', { name: 'English' }).click();
  await expect(history.locator('html')).toHaveAttribute('lang', 'en');
  const englishPages = history.getByRole('navigation', { name: 'Release history pages' });
  await expect(englishPages).toBeVisible();
  await expect(englishPages.getByRole('button')).toHaveCount(2);
  await expect(englishPages.getByRole('button').nth(0)).toBeDisabled();
  await expect(englishPages.getByRole('button').nth(1)).toBeDisabled();
  await expect(history.locator('[id="en-version-1.1.0"] [data-status]')).toHaveAttribute(
    'data-status',
    'published',
  );
  await expect(history.locator('[id="en-version-1.1.0"] [data-status]')).toHaveText('Published');
  await expect(history.getByRole('heading', { name: 'Bug fixes' })).toBeVisible();
  await expect(
    history.getByRole('heading', { name: 'Downloads for this version', exact: true }),
  ).toHaveCount(0);
  const close = dialog.getByRole('button', { name: 'Close', exact: true });
  await expect(close).toHaveCount(2);
  await close.last().click();
  await expect(settings.getByTestId('app-version')).toHaveText(`Version ${VERSION}`);
});

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

test('release history pages fifteen versions at a time in the generated page', async ({ app }) => {
  const history = readFileSync(path.resolve(here, '../../../../docs/release/index.html'), 'utf8');
  const fixture = `<script>
    (() => {
    const panel = document.getElementById('history-fa');
    const releases = panel.querySelectorAll('.release');
    const first = releases[0];
    for (let index = releases.length; index < 32; index++) {
      const copy = first.cloneNode(true);
      copy.id = 'fixture-version-' + index;
      copy.removeAttribute('open');
      first.parentElement.insertBefore(copy, first.nextSibling);
    }
    })();
  </script>`;
  const markup = history.replace('<script>', fixture + '<script>');
  expect(markup).not.toBe(history);
  await app.page.setContent(markup);
  const panel = app.page.locator('#history-fa');
  const pagination = panel.getByRole('navigation', { name: 'صفحه‌بندی نسخه‌ها' });
  const previous = pagination.locator('[data-page-previous]');
  const next = pagination.locator('[data-page-next]');
  const visible = panel.locator('.release:visible');
  await expect(visible).toHaveCount(15);
  await expect(previous).toBeDisabled();
  await expect(next).toBeEnabled();
  await next.click();
  await expect(visible).toHaveCount(15);
  await expect(previous).toBeEnabled();
  await expect(next).toBeEnabled();
  await next.click();
  await expect(visible).toHaveCount(2);
  await expect(next).toBeDisabled();
  await previous.click();
  await expect(visible).toHaveCount(15);
});
