import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';
import { preparePack } from '../../src/build.js';
import { writeDelivery } from '../../src/delivery.js';
import { createFactoryFixture } from '../fixtures.js';

test('a synthetic delivery verifies, plays, stops, captures all phases and renders its contact sheet', async ({
  page,
}, testInfo) => {
  const fixture = await createFactoryFixture();
  try {
    const pack = await preparePack({
      brandKitPath: fixture.brandKitPath,
      recipePath: fixture.recipePath,
      exportedAt: '2026-10-26T00:00:00.000Z',
    });
    const delivery = await writeDelivery(pack, { outputDirectory: fixture.outputPath });

    expect(delivery.report.status).toBe('complete');
    expect(delivery.report.visualQc).toBe('passed');
    expect(delivery.report.templates[0]?.qc?.captures.map((capture) => capture.phase)).toEqual([
      'intro',
      'hold',
      'out',
    ]);
    for (const phase of ['intro', 'hold', 'out']) {
      const stat = await fs.stat(
        path.join(fixture.outputPath, 'previews', `lower-third-${phase}.png`),
      );
      expect(stat.size).toBeGreaterThan(100);
    }

    await page.goto(pathToFileURL(path.join(fixture.outputPath, 'contact-sheet.html')).href);
    await expect(page.locator('.status')).toHaveText('QC PASSED');
    await expect(page.locator('.card')).toHaveCount(1);
    await expect(page.locator('figure')).toHaveCount(3);
    await page.screenshot({
      path: testInfo.outputPath('contact-sheet-desktop.png'),
      fullPage: true,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.phases')).toHaveCSS('grid-template-columns', /\d+px/);
    const widths = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }));
    expect(widths.document).toBeLessThanOrEqual(widths.viewport);
    await page.screenshot({
      path: testInfo.outputPath('contact-sheet-narrow.png'),
      fullPage: true,
    });
  } finally {
    await fixture.cleanup();
  }
});
