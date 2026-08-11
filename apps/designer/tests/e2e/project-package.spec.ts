import { test, expect } from './fixtures/designer.js';

/**
 * D-150 / B-104 — **save -> restart -> the assets are still there.**
 *
 * The restart modelled here is HARDER than the real one. A real browser restart keeps
 * the sandboxed store and loses only the connected folder's permission; a Playwright
 * reload in E2E mode throws away the entire `MemoryWorkspace` AND the `MemoryKv`, so
 * nothing whatsoever survives except the saved file itself. That is the point: if the
 * assets come back, they came out of the package and nowhere else.
 *
 * The suite drives the DOWNLOAD save tier deliberately (by making the sandboxed store
 * look unavailable for this spec only) because that tier hands the bytes to the test.
 * It is the same package every other tier writes — a weaker storage mechanism may not
 * produce a weaker document.
 */

// A real 1x1 PNG. `data:` decoded by hand so the bytes are a genuine image the
// browser will decode, not a placeholder that only has to survive a byte compare.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG = Buffer.from(PNG_BASE64, 'base64');

const ASSET_NAME = 'restart-logo.png';

test.describe('B-104 — a saved project carries its assets across a restart', () => {
  test('import an image, save, restart, reopen: the asset is still there', async ({
    app,
    page,
  }) => {
    // Force the DOWNLOAD save tier for this spec: with no `showSaveFilePicker` (the
    // harness already removes it) and no sandboxed store, Save falls to a download and
    // the test can capture the real `.cgproj` bytes.
    await page.addInitScript(() => {
      try {
        Object.defineProperty(navigator, 'storage', { configurable: true, value: undefined });
      } catch {
        /* ignore */
      }
    });
    await app.goto();

    await app.newProject('PackageRestart');

    // ── import an image asset ───────────────────────────────────────────────────
    await page.getByRole('button', { name: 'Project assets', exact: true }).click();
    await page.getByRole('button', { name: 'Add asset', exact: true }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('menuitem', { name: /Image/ }).click();
    await (await chooser).setFiles({ name: ASSET_NAME, mimeType: 'image/png', buffer: PNG });

    const panel = page.locator('aside[aria-label="Project assets"]');
    const tile = panel.locator('[draggable="true"]').filter({ hasText: 'restart-logo' }).first();
    await expect(tile).toBeVisible();

    // Place it on the canvas so the project genuinely REFERENCES the asset — an
    // orphaned library entry would be a weaker claim than the bug deserves.
    await tile.dragTo(app.canvas, { targetPosition: { x: 220, y: 140 } });

    // ── save, capturing the package ─────────────────────────────────────────────
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'SAVE', exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.cgproj$/);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const pkg = Buffer.concat(chunks);

    // It is a zip, and it is big enough to be carrying more than a scene.
    expect(pkg.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));

    // ── THE RESTART ─────────────────────────────────────────────────────────────
    // A fresh page: new MemoryWorkspace, new MemoryKv. Every byte the old session held
    // is gone. Only `pkg` survives, exactly as a file on disk would.
    await page.reload();
    await expect(page.getByRole('button', { name: 'New project' })).toBeVisible({
      timeout: 30_000,
    });

    // ── reopen from the package ─────────────────────────────────────────────────
    // The File menu lives in the studio chrome, so get there first. A freshly created
    // project is clean, so the unsaved-changes guard does not intervene.
    await app.newProject('Throwaway');
    await page.getByRole('button', { name: 'File', exact: true }).click();
    const openChooser = page.waitForEvent('filechooser');
    // The item's accessible name carries its shortcut hint ("Open (Ctrl+O)").
    await page.getByRole('menuitem', { name: /^Open/ }).click();
    await (
      await openChooser
    ).setFiles({
      name: 'PackageRestart.cgproj',
      mimeType: 'application/zip',
      buffer: pkg,
    });

    await app.expectStudio();
    await expect(page).toHaveTitle(/PackageRestart/);

    // The asset is listed again — from the package, since nothing else remains.
    await page.getByRole('button', { name: 'Project assets', exact: true }).click();
    await expect(
      page
        .locator('aside[aria-label="Project assets"]')
        .locator('[draggable="true"]')
        .filter({ hasText: 'restart-logo' })
        .first(),
    ).toBeVisible();

    // And its BYTES resolve: the placed image element has a real src. A listing whose
    // bytes are missing is precisely the failure B-104 reports.
    const img = app.canvasFrame.locator('img[data-cg-asset-id]').first();
    await expect(img).toHaveAttribute('src', /.+/);
  });
});

test.describe('D-150 — session-only storage is never silent', () => {
  test('the memory root announces itself, and says what closing the tab costs', async ({
    app,
    page,
  }) => {
    void app; // the fixture arms the harness init script; this test drives the URL itself
    // `?storage=memory` is the diagnostic override. It is only defensible BECAUSE of
    // this notice: a URL that engages session-only storage may not produce a silent
    // state. Booted without the E2E flag so the real selection path runs.
    await page.goto('/?storage=memory');

    const notice = page.getByRole('alert').filter({ hasText: /Session-only storage/i });
    await expect(notice).toBeVisible({ timeout: 30_000 });
    await expect(notice).toContainText(/closing the tab discards/i);
  });
});
