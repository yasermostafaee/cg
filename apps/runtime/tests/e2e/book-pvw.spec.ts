import * as dgram from 'node:dgram';
import type { Locator, Page } from '@playwright/test';
import { createBridge, type BridgeHandle } from '@cg/caspar-bridge';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type { ConnectionConfig, FixedLayerBank } from '@cg/shared-ipc';
import { buildBookVcg, expect, test } from './fixtures/runtime.js';
import { solidPng } from './fixtures/pictures.js';
import { buildTelavat2Vcg } from '../support/telavat2Vcg.js';

/**
 * 🔴 `RUN-NEXT-VERSION-03` 1.1 — **PVW DRAWS A LOADED BOOK'S PICTURES, NEVER THEIR NAMES.**
 *
 * The owner (2026-10-21): after `Load folder…`, PVW showed each picture's file name (`3.png`, small,
 * top left) instead of the picture. PVW sent the page its book's VALUES but never the page it was
 * on or where that page's picture is, so the page drew an `<img>` with no source and the browser
 * painted its `alt` — the file name.
 *
 * The real path end to end: a real `@cg/caspar-bridge` and `@cg/amcp-mock` (`pvw-from-bridge`'s
 * shape), the template imported and loaded through the console's own controls (so PVW renders the
 * page CG Control baked), REAL pictures (`solidPng`) loaded through `Load pictures…`, and PVW's
 * composite SAMPLED — the checker's screenshot holds every frame drawn over it
 * (`rehearse-canvas.spec.ts`'s method). One colour per page, so the sample says which page PVW is on.
 * A reload at the end proves the read-back: the console no longer holds the bytes it sent, and PVW
 * draws the bridge's own copy (`pages.get`).
 */

type RGB = readonly [number, number, number];
const RED: RGB = [220, 30, 30];
const GREEN: RGB = [30, 200, 60];
const BLUE: RGB = [30, 60, 220];
const BANK: FixedLayerBank = { channel: 1, start: 80, count: 20, low: { start: 50, count: 10 } };
const ROW = 99;
const TEMPLATE_ID = 'tpl-e2e-pvw-book';

let bridge: BridgeHandle | null = null;
let mock: MockHandle | null = null;

test.afterEach(async () => {
  await bridge?.close();
  bridge = null;
  await mock?.stop();
  mock = null;
});

// A real bridge and a real mock per test: serial, as a LOAD bound (`retention-honesty.spec.ts`).
test.describe.configure({ mode: 'serial' });

function freeUdpPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');
    sock.once('error', reject);
    sock.bind(0, '127.0.0.1', () => {
      const port = sock.address().port;
      sock.close(() => resolve(port));
    });
  });
}

async function boot(): Promise<BridgeHandle> {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 10 });
  const connection: ConnectionConfig = {
    servers: { A: { host: '127.0.0.1', amcpPort: mock.amcpPort, oscPort } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: false,
  };
  bridge = await createBridge({ port: 0, connection, fixedLayers: BANK });
  return bridge;
}

async function openConsole(page: Page, url: string): Promise<void> {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.addInitScript(
    ([u]) => {
      const w = window as unknown as { __CG_BRIDGE_URL__: string; __CG_SPLASH_DISABLED__: boolean };
      w.__CG_BRIDGE_URL__ = u as string;
      w.__CG_SPLASH_DISABLED__ = true;
    },
    [url],
  );
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Layers' })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Bridge link' })).not.toContainText('DISCONNECTED');
}

async function showMonitors(page: Page): Promise<void> {
  const show = page.getByRole('button', { name: 'Show monitors' });
  if (await show.count()) await show.first().click();
  await expect(page.getByRole('button', { name: 'Hide monitors' })).toBeVisible();
}

const row = (page: Page): Locator => page.locator(`[data-layer="${String(ROW)}"]`).first();
const inspector = (page: Page): Locator => page.getByRole('complementary', { name: 'Inspector' });

/** LOAD → `Import a .vcg` → the file → `Load onto` — what the operator presses (`importVcg`'s steps). */
async function importAndLoad(page: Page, bytes: Uint8Array): Promise<void> {
  await row(page).getByRole('button', { name: 'LOAD' }).click();
  const chooser = page.waitForEvent('filechooser');
  // An empty library offers the same door twice (the tools row and the empty state): either opens it.
  await page.getByRole('dialog').getByRole('button', { name: 'Import a .vcg' }).first().click();
  await (
    await chooser
  ).setFiles({
    name: 'book.vcg',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(bytes),
  });
  const commit = page.locator('[data-template-commit]');
  await expect(commit).toBeEnabled({ timeout: 30_000 });
  await commit.click();
  await expect(row(page)).toHaveAttribute('data-item-id', /.+/);
}

async function sampleRgb(page: Page, locator: Locator, fx: number, fy: number): Promise<RGB> {
  const png = await locator.screenshot();
  const uri = `data:image/png;base64,${png.toString('base64')}`;
  return page.evaluate(
    async ({ src, x, y }: { src: string; x: number; y: number }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (ctx === null) throw new Error('no 2d context');
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(
        Math.floor(img.naturalWidth * x),
        Math.floor(img.naturalHeight * y),
        1,
        1,
      ).data;
      return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0] as const;
    },
    { src: uri, x: fx, y: fy },
  );
}

function near(actual: RGB, expected: RGB, tolerance = 14): boolean {
  return actual.every((c, i) => Math.abs(c - (expected[i] ?? 0)) <= tolerance);
}

/** PVW's composite at its centre — the book fills the frame, so the centre is the page. */
async function pvwCentre(page: Page): Promise<RGB> {
  return sampleRgb(page, page.locator('[data-rehearsal-checker]'), 0.5, 0.5);
}

async function expectPvw(page: Page, colour: RGB): Promise<void> {
  await expect
    .poll(async () => near(await pvwCentre(page), colour), { timeout: 15_000 })
    .toBe(true);
}

test('🔴 1.1 — PVW draws the loaded pictures, not their names; a turn moves PVW; a reload reads them back', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const handle = await boot();
  await openConsole(page, handle.url);
  await showMonitors(page);
  await importAndLoad(page, await buildBookVcg(TEMPLATE_ID));
  await row(page).locator('[data-row-body]').click();
  await row(page).getByRole('button', { name: 'ON PVW', exact: true }).click();
  await expect(page.locator('iframe[data-rehearsal-frame]')).toHaveCount(1);
  // PVW draws once it is played — the bar's PLAY, as the operator plays a rehearsal.
  const pvwBar = page.locator('[data-pvw-controls]');
  await expect(pvwBar.getByRole('button', { name: 'PLAY', exact: true })).toBeEnabled();
  await pvwBar.getByRole('button', { name: 'PLAY', exact: true }).click();

  // Loaded, not yet sent: PVW shows the staged book at the row's page — page 1, red.
  const chooser = page.waitForEvent('filechooser');
  await inspector(page)
    .getByRole('button', { name: /^Load pictures/ })
    .click();
  await (
    await chooser
  ).setFiles([
    { name: 'page1.png', mimeType: 'image/png', buffer: solidPng(64, 36, RED) },
    { name: 'page2.png', mimeType: 'image/png', buffer: solidPng(64, 36, GREEN) },
    { name: 'page3.png', mimeType: 'image/png', buffer: solidPng(64, 36, BLUE) },
  ]);
  await expectPvw(page, RED);

  // The page's picture is the picture: real pixels, and no name for a browser to paint.
  const frame = page.frameLocator('iframe[data-rehearsal-frame]');
  const shown = frame.locator('img[data-cg-page-media]').first();
  await expect(shown).toHaveAttribute('alt', '');
  expect(await shown.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBe(64);

  // Sent, then turned from the Inspector's book bar: PVW follows the row's page.
  await inspector(page).getByRole('button', { name: 'Apply staged edits' }).click();
  await expect(inspector(page).getByTestId('book-counter')).toHaveText('1 / 3');
  await inspector(page)
    .getByRole('button', { name: /^Next page/ })
    .click();
  await expect(inspector(page).getByTestId('book-counter')).toHaveText('2 / 3');
  await expectPvw(page, GREEN);
  await inspector(page)
    .getByRole('textbox', { name: /^Page number/ })
    .fill('3');
  await inspector(page)
    .getByRole('button', { name: /^Go to page/ })
    .click();
  await expectPvw(page, BLUE);

  // A reload: this console holds none of the bytes now; PVW draws the bridge's own copy.
  await page.reload();
  await expect(page.getByRole('region', { name: 'Layers' })).toBeVisible();
  await showMonitors(page);
  await expect(page.locator('iframe[data-rehearsal-frame]')).toHaveCount(1);
  await expect(pvwBar.getByRole('button', { name: 'PLAY', exact: true })).toBeEnabled();
  await pvwBar.getByRole('button', { name: 'PLAY', exact: true }).click();
  await expectPvw(page, BLUE);
});

/*
  🔴 `RUN-NEXT-VERSION-03` 1.3 — the owner (2026-10-21 15:44): the preview bar's NEXT turned the
  template's own pictures but not the ones loaded with Load folder. It called the page's local `next()`:
  a step the bridge never heard of, onto a page whose picture the frame did not have. It now turns the
  row's book exactly as the row's Next does — and PVW follows the bridge's page.
*/
test('🔴 1.3 — the preview bar’s NEXT turns the loaded pages, exactly as the row’s Next does', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const handle = await boot();
  await openConsole(page, handle.url);
  await showMonitors(page);
  await importAndLoad(page, await buildBookVcg(TEMPLATE_ID));
  await row(page).locator('[data-row-body]').click();
  await row(page).getByRole('button', { name: 'ON PVW', exact: true }).click();
  await expect(page.locator('iframe[data-rehearsal-frame]')).toHaveCount(1);
  const pvwBar = page.locator('[data-pvw-controls]');
  await expect(pvwBar.getByRole('button', { name: 'PLAY', exact: true })).toBeEnabled();
  await pvwBar.getByRole('button', { name: 'PLAY', exact: true }).click();

  const chooser = page.waitForEvent('filechooser');
  await inspector(page)
    .getByRole('button', { name: /^Load pictures/ })
    .click();
  await (
    await chooser
  ).setFiles([
    { name: 'page1.png', mimeType: 'image/png', buffer: solidPng(64, 36, RED) },
    { name: 'page2.png', mimeType: 'image/png', buffer: solidPng(64, 36, GREEN) },
    { name: 'page3.png', mimeType: 'image/png', buffer: solidPng(64, 36, BLUE) },
  ]);
  await inspector(page).getByRole('button', { name: 'Apply staged edits' }).click();
  await expect(inspector(page).getByTestId('book-counter')).toHaveText('1 / 3');
  await expectPvw(page, RED);

  // PVW's own NEXT: the row's book turns (the counter says so) and PVW shows that page.
  await pvwBar.getByRole('button', { name: 'NEXT', exact: true }).click();
  await expect(inspector(page).getByTestId('book-counter')).toHaveText('2 / 3');
  await expectPvw(page, GREEN);
  await pvwBar.getByRole('button', { name: 'NEXT', exact: true }).click();
  await expect(inspector(page).getByTestId('book-counter')).toHaveText('3 / 3');
  await expectPvw(page, BLUE);
  await expect(row(page).locator('[data-page-counter]')).toHaveText('3 / 3');
});

/*
  `RUN-NEXT-VERSION-03` 1.4 — the Inspector's strip draws the TEMPLATE'S OWN pages from the page CG Bridge
  stores (the `assetUrls` CG Control baked into it at import): real pixels, the same bytes air draws.
*/
test('1.4 — the strip draws the template’s own pages from the page the bridge stores', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const handle = await boot();
  await openConsole(page, handle.url);
  await importAndLoad(page, await buildTelavat2Vcg({ templateId: 'tpl-e2e-strip', pages: 3 }));
  await row(page).locator('[data-row-body]').click();
  const face = inspector(page).locator('[data-book-thumb="current"] img');
  await expect(face).toHaveAttribute('src', /^data:image\/png/, { timeout: 15_000 });
  expect(await face.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBe(8);
  // On page 1 the strip holds pages 1–3 (delta A): the first page after the current one is page 2.
  await expect(inspector(page).locator('[data-book-thumb="after"] img').first()).toHaveAttribute(
    'src',
    /^data:image\/png/,
  );
});
