import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';
import { startStudioServer, type RunningStudioServer } from '../../src/studio-server.js';
import {
  openStudioWorkspace,
  saveStudioCustomer,
  type StudioWorkspace,
} from '../../src/studio-workspace.js';
import { createFactoryFixture, type FactoryFixture } from '../fixtures.js';

test('the private RTL Studio restores a customer, inspects its master and builds a local delivery', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const fixture = await createFactoryFixture();
  let server: RunningStudioServer | null = null;
  try {
    const workspace = await seedStudio(fixture);
    server = await startStudioServer({
      port: 0,
      workspace: workspace.root,
      staticRoot: path.resolve('dist/studio'),
    });

    await page.goto(server.url);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { name: 'Brand Pack Studio' })).toBeVisible();
    await page.getByRole('button', { name: /Synthetic Station/ }).click();
    await expect(page.getByRole('heading', { name: 'Synthetic Station' })).toBeVisible();
    await expect(page.getByText('ابزار داخلی APASAI')).toBeVisible();

    await page.getByLabel('نام مشتری').fill('Synthetic Station Updated');
    await page.getByRole('button', { name: 'ذخیره', exact: true }).click();
    await expect(page.getByText('پروفایل مشتری ذخیره شد.')).toBeVisible();
    await expect(page.getByRole('button', { name: /Synthetic Station Updated/ })).toBeVisible();

    await page.getByRole('button', { name: 'بررسی فایل مادر' }).click();
    await expect(page.getByText(/نتیجهٔ بررسی: Master/)).toBeVisible();
    await expect(page.getByText('comp-main', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'بررسی پک' }).click();
    await expect(page.getByText(/پک معتبر است/)).toBeVisible();

    await page.getByRole('button', { name: 'ساخت خروجی' }).click();
    await expect(page.getByText(/خروجی کامل ساخته شد/)).toBeVisible({ timeout: 45_000 });
    await expect(page.getByRole('link', { name: 'Contact sheet' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('studio-desktop.png'), fullPage: true });

    await server.close();
    server = await startStudioServer({
      port: 0,
      workspace: workspace.root,
      staticRoot: path.resolve('dist/studio'),
    });
    await page.goto(server.url);
    await expect(page.getByRole('button', { name: /Synthetic Station Updated/ })).toBeVisible();
    await page.getByRole('button', { name: /Synthetic Station Updated/ }).click();
    await expect(page.getByRole('heading', { name: 'Synthetic Station Updated' })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    const widths = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }));
    expect(widths.document).toBeLessThanOrEqual(widths.viewport);
    await page.screenshot({ path: testInfo.outputPath('studio-narrow.png'), fullPage: true });
  } finally {
    if (server !== null) await server.close();
    await fixture.cleanup();
  }
});

async function seedStudio(fixture: FactoryFixture): Promise<StudioWorkspace> {
  const workspace = await openStudioWorkspace(path.join(fixture.root, 'studio'));
  const brandKit = JSON.parse(await fs.readFile(fixture.brandKitPath, 'utf8')) as {
    fonts: Record<string, { path: string }>;
    assets: Record<string, { sourcePath: string; renderPath?: string }>;
  } & Record<string, unknown>;
  const recipe = JSON.parse(await fs.readFile(fixture.recipePath, 'utf8')) as {
    templates: { sourceProject: string }[];
  } & Record<string, unknown>;
  const font = brandKit.fonts['display'];
  const logo = brandKit.assets['logo'];
  const template = recipe.templates[0];
  if (font === undefined || logo === undefined || template === undefined) {
    throw new Error('Factory fixture is incomplete');
  }
  font.path = path.join(fixture.root, 'customer-font.woff2');
  logo.sourcePath = path.join(fixture.root, 'customer-logo.svg');
  logo.renderPath = path.join(fixture.root, 'customer-logo.svg');
  template.sourceProject = path.join(fixture.root, 'master.cgproj');
  await saveStudioCustomer(workspace, 'example-station', { brandKit, recipe });
  return workspace;
}
