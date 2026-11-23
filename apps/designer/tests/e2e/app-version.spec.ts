import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from './fixtures/designer.js';

/**
 * 🔴 `CLIENT-TEST-RELEASE-01` B1 — **CG DESIGNER NAMES ITS RELEASE IN ONE LINE**, in the built app the
 * installer ships: its start screen, under the brand. The version is
 * read from this app's `package.json`, the file the build stamp reads; the geometry is measured here
 * because jsdom has none (golden rule 12).
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const VERSION = (
  JSON.parse(readFileSync(path.resolve(here, '../../package.json'), 'utf8')) as { version: string }
).version;
const { releases } = JSON.parse(
  readFileSync(path.resolve(here, '../../../../docs/release/release-history.json'), 'utf8'),
) as { releases: { version: string }[] };
const numbered = releases.filter(({ version }) => version !== 'next').length;
const pageCount = Math.ceil(numbered / 15);

test('P-077 — open the three-language release history from Home and the editor Help menu', async ({
  app,
}) => {
  const page = app.page;
  await page.getByRole('button', { name: 'Version history' }).click();
  const dialog = page.getByRole('dialog', { name: 'Version history' });
  const history = dialog.frameLocator('iframe[aria-label="Version history"]');
  const persian = history.getByRole('heading', { name: 'نسخه‌ها و تغییرات', exact: true });
  await expect(persian).toBeVisible();
  const persianPages = history.getByRole('navigation', { name: 'صفحه‌بندی نسخه‌ها' });
  await expect(persianPages).toBeVisible();
  await expect(persianPages.getByRole('button')).toHaveCount(2);
  await expect(persianPages.getByRole('button').nth(0)).toBeDisabled();
  await expect(persianPages.getByRole('button').nth(1)).toBeEnabled();
  await expect(
    history.locator('[id="version-next"], [id="en-version-next"], [id="ar-version-next"]'),
  ).toHaveCount(0);
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
  expect(frame.x).toBe(0);
  expect(frame.y).toBe(0);
  expect(frame.width).toBe(viewport.width);
  expect(frame.height).toBe(viewport.height);
  const close = dialog.getByRole('button', { name: 'Close', exact: true });
  await expect(close).toHaveCount(2);
  await expect(history.getByRole('heading', { name: 'رفع باگ‌ها' })).toBeVisible();
  expect(
    await persian.evaluate(async (heading) => {
      const loaded = await heading.ownerDocument.fonts.load('700 16px Vazirmatn', 'فارسی');
      return loaded.length;
    }),
  ).toBeGreaterThan(0);
  await history.getByRole('button', { name: 'English' }).click();
  await expect(history.locator('html')).toHaveAttribute('dir', 'ltr');
  const englishPages = history.getByRole('navigation', { name: 'Release history pages' });
  await expect(englishPages).toBeVisible();
  await expect(englishPages.getByRole('button')).toHaveCount(2);
  await expect(englishPages.getByRole('button').nth(0)).toBeDisabled();
  await expect(englishPages.getByRole('button').nth(1)).toBeEnabled();
  await expect(history.locator('[id="en-version-1.1.0"] [data-status]')).toHaveAttribute(
    'data-status',
    'published',
  );
  await expect(history.locator('[id="en-version-1.1.0"] [data-status]')).toHaveText('Published');
  await expect(history.getByRole('heading', { name: 'Features and improvements' })).toBeVisible();
  await expect(history.getByRole('heading', { name: 'Bug fixes' })).toBeVisible();
  await expect(
    history.getByRole('heading', { name: 'Downloads for this version', exact: true }),
  ).toHaveCount(0);
  const arabic = history.getByRole('button', { name: 'العربية', exact: true });
  await arabic.click();
  await expect(arabic).toHaveAttribute('aria-pressed', 'true');
  await expect(history.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(history.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(history.getByRole('heading', { name: 'سجل الإصدارات والتغييرات' })).toBeVisible();
  await expect(history.locator('#history-fa')).toBeHidden();
  await expect(history.locator('#history-en')).toBeHidden();
  const arabicPanel = history.locator('#history-ar');
  const arabicPages = arabicPanel.getByRole('navigation', { name: 'صفحات سجل الإصدارات' });
  const arabicPrevious = arabicPages.getByRole('button', { name: 'الصفحة السابقة' });
  const arabicNext = arabicPages.getByRole('button', { name: 'الصفحة التالية' });
  const visibleArabicVersions = arabicPanel.locator('.release:visible');
  await expect(visibleArabicVersions).toHaveCount(15);
  await expect(arabicPrevious).toBeDisabled();
  await expect(
    arabicPanel.locator('[id="ar-version-1.2.12"] [data-status="published"]'),
  ).toHaveText('منشور');
  await expect(arabicPanel.locator('[id="ar-version-1.2.12"]')).toContainText('c770cab9');
  await arabicNext.click();
  await expect(visibleArabicVersions).toHaveCount(Math.min(15, numbered - 15));
  await expect(arabicPrevious).toBeEnabled();
  if (pageCount === 2) await expect(arabicNext).toBeDisabled();
  const arabicPageLabel = await arabicPanel.evaluate((_, pages) => {
    const number = new Intl.NumberFormat('ar');
    return 'الصفحة ' + number.format(2) + ' من ' + number.format(pages);
  }, pageCount);
  await expect(arabicPages.locator('[data-page-status]')).toHaveText(arabicPageLabel);
  const historicalRelease = visibleArabicVersions.first();
  await historicalRelease.locator('summary').click();
  await expect(historicalRelease).toHaveAttribute('open', '');
  await close.last().click();

  await app.newProject('History');
  await page.getByRole('button', { name: 'Help', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Version history', exact: true }).click();
  await expect(persian).toBeVisible();
});

test('B1 — the start screen reads "Version <release>" under its brand, above New project', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });
  const landing = page.getByLabel('Designer landing');
  const line = landing.getByTestId('app-version');
  await expect(line).toHaveText(`Version ${VERSION}`);
  await expect(line).toBeVisible();
  await expect(line).toHaveAttribute('title', new RegExp(`^${VERSION.replaceAll('.', '\\.')} · `));

  const [lineBox, brandBox, newBox] = await Promise.all([
    line.boundingBox(),
    landing.getByTestId('apasai-brand').boundingBox(),
    page.getByRole('button', { name: 'New project' }).boundingBox(),
  ]);
  if (lineBox === null || brandBox === null || newBox === null) {
    throw new Error('the line, the brand and New project all render');
  }
  // Its own line below the brand, above the first control, aligned with the brand block.
  expect(lineBox.height).toBeGreaterThan(0);
  expect(lineBox.y).toBeGreaterThanOrEqual(brandBox.y + brandBox.height);
  expect(lineBox.y + lineBox.height).toBeLessThanOrEqual(newBox.y);
  expect(Math.round(lineBox.x)).toBe(Math.round(brandBox.x));
  await expect(landing.getByText(/Broadcast templates|Broadcast template builder/)).toHaveCount(0);
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
