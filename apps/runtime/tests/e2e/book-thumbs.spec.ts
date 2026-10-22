import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures/runtime.js';
import { solidPng } from './fixtures/pictures.js';
import { buildTelavat2Vcg } from '../support/telavat2Vcg.js';

/**
 * 🔴 `RUN-NEXT-VERSION-03` delta A — **THE BOOK BLOCK'S PAGES, AS THE OWNER SAW THEM (2026-10-22).**
 *
 *  1. On page 1 the strip showed an EMPTY box on the left (no page before page 1). It shows only pages
 *     that exist — on the first and the last page, and in a one- or two-page book — and turning a page
 *     moves nothing on screen.
 *  2. A thumbnail CROPPED the picture (a narrow portrait showed only its middle). It is drawn in the
 *     channel's frame shape at the sequence's own picture fit, as the air shows it: a `contain` portrait
 *     whole, with bars — in the strip and in `Manage pages…`. Measured on the drawn PIXELS, never a class.
 */

type RGB = readonly [number, number, number];
const RED: RGB = [220, 30, 30];

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

const near = (a: RGB, b: RGB, tolerance = 30): boolean =>
  a.every((c, i) => Math.abs(c - (b[i] ?? 0)) <= tolerance);

/** Pick pictures through the book block's own load control, whichever spelling it has. */
async function loadPictures(page: Page, block: Locator, files: { name: string; png: Buffer }[]) {
  const chooser = page.waitForEvent('filechooser');
  const menu = block.getByRole('button', { name: 'Load pages for Sequence' });
  if ((await menu.count()) > 0) {
    await menu.click();
    await page.getByRole('menuitem', { name: 'Pictures…' }).click();
  } else {
    await block.getByRole('button', { name: 'Load pictures for Sequence' }).click();
  }
  await (
    await chooser
  ).setFiles(files.map((f) => ({ name: f.name, mimeType: 'image/png', buffer: f.png })));
}

const captions = (block: Locator): Promise<string[]> =>
  block.locator('[data-book-thumb] figcaption').allTextContents();

/**
 * The strip's and the load row's boxes, measured from the block's own top-left: a click scrolls the
 * Inspector to the button it presses, which moves everything together and is not a layout jump.
 */
async function layoutOf(block: Locator): Promise<Record<string, number[]>> {
  return block.evaluate((el) => {
    const origin = el.getBoundingClientRect();
    const box = (sel: string): number[] => {
      const r = el.querySelector(sel)?.getBoundingClientRect();
      return r === undefined
        ? []
        : [r.left - origin.left, r.top - origin.top, r.width, r.height].map((n) => Math.round(n));
    };
    return { strip: box('.cg-book__strip'), load: box('[data-book-load]') };
  });
}

test('🔴 delta A — no empty slot on the first or the last page, and turning moves nothing', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 720 });
  const templateId = 'tpl-e2e-strip';
  await app.importVcg('strip.vcg', await buildTelavat2Vcg({ templateId, pages: 4 }));
  await app.selectStackRow(templateId);
  const block = app.inspector.locator('[data-book]');
  const thumbs = block.locator('[data-book-thumb]');

  // Page 1 of 4: pages 1, 2, 3 — every slot a page, the first one the current one.
  await expect(block.getByTestId('book-counter')).toHaveText('1 / 4');
  expect(await captions(block)).toEqual(['1 / 4', '2', '3']);
  await expect(thumbs.first()).toHaveAttribute('data-current', '');
  for (const thumb of await thumbs.all()) {
    await expect(thumb.locator('img, .cg-book-thumb__text')).toHaveCount(1);
  }
  const before = await layoutOf(block);
  expect(before.strip?.[3] ?? 0).toBeGreaterThan(0);

  // To the last page: pages 2, 3, 4 — the current one last; the strip and the row below never move.
  const next = block.getByRole('button', { name: 'Next page of Sequence' });
  for (const want of [
    ['1', '2 / 4', '3'],
    ['2', '3 / 4', '4'],
    ['2', '3', '4 / 4'],
  ]) {
    await next.click();
    await expect.poll(() => captions(block)).toEqual(want);
    expect(await layoutOf(block)).toEqual(before);
  }
  await expect(thumbs.last()).toHaveAttribute('data-current', '');
  for (const thumb of await thumbs.all()) {
    await expect(thumb.locator('img, .cg-book-thumb__text')).toHaveCount(1);
  }
});

test('delta A — a one-page and a two-page book show only their pages, the same size as three', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 720 });
  await app.importVcg('one.vcg', await buildTelavat2Vcg({ templateId: 'tpl-e2e-one', pages: 1 }));
  await app.importVcg('two.vcg', await buildTelavat2Vcg({ templateId: 'tpl-e2e-two', pages: 2 }));
  const block = app.inspector.locator('[data-book]');
  await app.selectStackRow('tpl-e2e-one');
  expect(await captions(block)).toEqual(['1 / 1']);
  const oneWidth = (await block.locator('[data-book-thumb]').first().boundingBox())?.width ?? 0;
  await app.selectStackRow('tpl-e2e-two');
  expect(await captions(block)).toEqual(['1 / 2', '2']);
  const twoWidth = (await block.locator('[data-book-thumb]').first().boundingBox())?.width ?? 0;
  expect(Math.abs(oneWidth - twoWidth)).toBeLessThan(1);
  expect(oneWidth).toBeGreaterThan(0);
});

test('🔴 delta A — a contain sequence draws a portrait page whole, with bars — in the strip and in Manage pages; cover fills', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 720 });
  const portrait = [{ name: 'tall.png', png: solidPng(300, 600, RED) }];
  const frameOf = (block: Locator): Locator =>
    block.locator('[data-book-thumb][data-current] .cg-book-thumb__frame');

  for (const [templateId, fit] of [
    ['tpl-e2e-contain', 'contain'],
    ['tpl-e2e-cover', 'cover'],
  ] as const) {
    await app.importVcg(
      `${fit}.vcg`,
      await buildTelavat2Vcg({ templateId, pages: 2, imageFit: fit }),
    );
    await app.selectStackRow(templateId);
    const block = app.inspector.locator('[data-book]');
    await loadPictures(page, block, portrait);
    const frame = frameOf(block);
    // The frame is the channel's shape: 16:9 for 1920×1080.
    const box = await frame.boundingBox();
    expect(box).not.toBeNull();
    expect((box?.width ?? 0) / (box?.height ?? 1)).toBeCloseTo(16 / 9, 1);
    // The middle is the picture either way.
    await expect.poll(async () => near(await sampleRgb(page, frame, 0.5, 0.5), RED)).toBe(true);
    // Near the side: a `contain` portrait leaves a bar there; `cover` fills it.
    const side = await sampleRgb(page, frame, 0.1, 0.5);
    expect(near(side, RED), `${fit}: the side of the frame`).toBe(fit === 'cover');

    // The same in Manage pages' grid.
    await block.getByRole('button', { name: 'Manage pages of Sequence' }).click();
    const dialog = page.getByRole('dialog', { name: /Manage pages/ });
    const tile = dialog.locator('[data-page-tile="1"] .cg-book-thumb__frame');
    await expect.poll(async () => near(await sampleRgb(page, tile, 0.5, 0.5), RED)).toBe(true);
    expect(near(await sampleRgb(page, tile, 0.1, 0.5), RED), `${fit}: the tile's side`).toBe(
      fit === 'cover',
    );
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toHaveCount(0);
  }
});
