import type { Locator, Page } from '@playwright/test';
import { probeImage } from '@cg/shared-ipc';
import { buildBookVcg, expect, test } from './fixtures/runtime.js';
import { noisePng, solidPng } from './fixtures/pictures.js';

/**
 * 🔴 `RUN-NEXT-VERSION-03` 1.2 — **A PAGE IS FITTED, NOT REFUSED** (the owner's decision, 2026-10-21).
 *
 * Camera and scanner pictures are larger than the channel and over 4 MB; the owner's were refused.
 * CG Control now scales each one to fit the channel's frame (never up, aspect kept), re-encodes it
 * (PNG when it is transparent, else JPEG), says so in one line, and refuses — naming them — only the
 * pictures still over the cap after fitting. Real pictures through the real `Load pictures…` path; the
 * stored pages are read back (`pages.get`) and measured from their own bytes.
 */

const load = async (
  app: { page: Page; inspector: Locator },
  files: { name: string; buffer: Buffer }[],
): Promise<void> => {
  const chooser = app.page.waitForEvent('filechooser');
  await app.inspector.getByRole('button', { name: /^Load pictures/ }).click();
  await (
    await chooser
  ).setFiles(files.map((f) => ({ name: f.name, mimeType: 'image/png', buffer: f.buffer })));
};

/** Each applied page's stored picture, as the bridge holds it: its type and size in pixels. */
async function storedPages(page: Page): Promise<{ mime: string; width: number; height: number }[]> {
  const shas = await page.evaluate(async () => {
    const w = window as unknown as {
      cg: { stack: { snapshot: () => Promise<{ fields: Record<string, unknown> }[]> } };
    };
    const items = await w.cg.stack.snapshot();
    const pages = (items.find((i) => Array.isArray(i.fields['pages']))?.fields['pages'] ?? []) as {
      media?: string;
    }[];
    return pages.map((p) => p.media ?? '');
  });
  const out: { mime: string; width: number; height: number }[] = [];
  for (const sha of shas) {
    const base64 = await page.evaluate(async (s) => {
      const w = window as unknown as {
        cg: {
          pages: { get: (r: { sha256: string }) => Promise<{ ok: boolean; base64?: string }> };
        };
      };
      const got = await w.cg.pages.get({ sha256: s });
      return got.ok ? (got.base64 ?? '') : '';
    }, sha);
    const probe = probeImage(new Uint8Array(Buffer.from(base64, 'base64')));
    if (probe === null) throw new Error(`page ${sha} is not a picture`);
    out.push({ mime: probe.mime, width: probe.width, height: probe.height });
  }
  return out;
}

test('🔴 1.2 — oversize pictures are fitted to 1920×1080 and said in one line; a transparent one stays a PNG', async ({
  app,
}) => {
  test.setTimeout(90_000);
  const templateId = 'tpl-e2e-book-fit';
  await app.importVcg('book-fit.vcg', await buildBookVcg(templateId));
  await app.selectStackRow(templateId);

  await load(app, [
    // A camera's 6000 × 4000 — opaque: scaled to 1620 × 1080, re-encoded as JPEG.
    { name: 'a-camera.png', buffer: solidPng(6000, 4000, [40, 90, 160]) },
    // 3000 × 2000, transparent: scaled, and kept a PNG so its alpha survives.
    { name: 'b-keyed.png', buffer: solidPng(3000, 2000, [200, 40, 40, 128]) },
    // Within the frame but over 4 MB: re-encoded at its own size.
    { name: 'c-heavy.png', buffer: noisePng(1600, 900, 7) },
    // Small and within everything: sent exactly as picked.
    { name: 'd-small.png', buffer: solidPng(640, 360, [10, 200, 10]) },
  ]);
  await expect(app.inspector.getByTestId('page-count-pages')).toHaveText('4 pages', {
    timeout: 60_000,
  });
  await expect(app.inspector.getByTestId('page-fit-line')).toHaveText(
    '2 pictures were resized to fit 1920×1080 · 1 picture was made smaller than 4 MB',
  );
  await expect(app.inspector.locator('[data-refusal]')).toHaveCount(0);
  await app.applyEdits();

  expect(await storedPages(app.page)).toEqual([
    { mime: 'image/jpeg', width: 1620, height: 1080 },
    { mime: 'image/png', width: 1620, height: 1080 },
    { mime: 'image/jpeg', width: 1600, height: 900 },
    { mime: 'image/png', width: 640, height: 360 },
  ]);
});

test('🔴 1.2 — only a picture still over the cap after fitting is refused, by name; the others load', async ({
  app,
}) => {
  test.setTimeout(90_000);
  const templateId = 'tpl-e2e-book-fit-refuse';
  await app.importVcg('book-fit-refuse.vcg', await buildBookVcg(templateId));
  await app.selectStackRow(templateId);

  await load(app, [
    { name: 'page1.png', buffer: solidPng(4000, 3000, [40, 90, 160]) },
    // Transparent noise at the frame's own size: it must stay a PNG, and no PNG of it fits 4 MB.
    { name: 'scan.png', buffer: noisePng(1920, 1080, 3, true) },
  ]);
  await expect(app.inspector.getByTestId('page-count-pages')).toHaveText('1 page', {
    timeout: 60_000,
  });
  await expect(
    app.inspector.getByText(/scan\.png could not be made smaller than 4 MB/),
  ).toBeVisible();
  await expect(app.inspector.getByTestId('page-fit-line')).toHaveText(
    '1 picture was resized to fit 1920×1080',
  );
});
