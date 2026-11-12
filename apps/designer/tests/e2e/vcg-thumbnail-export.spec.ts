import { mkdtemp, readFile, rm, rmdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { flattenElements } from '@cg/shared-schema';
import { unpack, verify } from '@cg/vcg-format';
import { expect, test } from './fixtures/designer.js';

async function exportThumbnail(page: Page) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export .vcg', exact: true }).click(),
  ]);
  const vcg = await readFile(await download.path());
  expect((await verify(vcg)).ok).toBe(true);
  const { scene, files } = await unpack(vcg);
  const thumbnail = files.get('thumbnails/320.png');
  if (thumbnail === undefined) throw new Error('The exported VCG has no thumbnail');
  return { scene, thumbnail };
}

type Rgb = readonly [red: number, green: number, blue: number];

async function thumbnailPixels(page: Page, thumbnail: Uint8Array, colours: readonly Rgb[]) {
  return page.evaluate(
    async ({ base64, colours }) => {
      const data = Uint8Array.from(atob(base64), (byte) => byte.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([data], { type: 'image/png' }));
      try {
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d');
        if (ctx === null) throw new Error('Cannot decode thumbnail pixels');
        ctx.drawImage(bitmap, 0, 0);
        const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const counts = colours.map(() => 0);
        let transparentPixels = 0;
        for (let i = 0; i < rgba.length; i += 4) {
          if (rgba[i + 3] === 0) transparentPixels += 1;
          if (rgba[i + 3] !== 255) continue;
          for (const [index, [red, green, blue]] of colours.entries()) {
            if (rgba[i] === red && rgba[i + 1] === green && rgba[i + 2] === blue) {
              counts[index] = (counts[index] ?? 0) + 1;
            }
          }
        }
        return { width: bitmap.width, height: bitmap.height, counts, transparentPixels };
      } finally {
        bitmap.close();
      }
    },
    { base64: Buffer.from(thumbnail).toString('base64'), colours },
  );
}

test('Export (.vcg) saves a rendered thumbnail at the authored Hold start', async ({ app }) => {
  await app.newProject('Animated thumbnail');
  await app.setSceneDuration(100);
  await app.addRectangle({ x: 240, y: 130 });

  await app.setInspectorNumber('Opacity', 0);
  await app.toggleInspectorKeyframe('opacity');
  await app.scrubToFrame(18);
  await app.setInspectorNumber('Opacity', 100);
  await expect(app.inspectorDiamond('opacity')).toHaveAttribute('data-variant', 'at-frame');
  await app.scrubToFrame(27);
  await app.toggleInspectorKeyframe('opacity');
  await app.scrubToFrame(31);
  await app.setInspectorNumber('Opacity', 0);
  await expect(app.inspectorDiamond('opacity')).toHaveAttribute('data-variant', 'at-frame');

  await app.addOutPoint();
  await app.page.getByRole('button', { name: 'Set hold start' }).click();
  await app.dragContentStartMarkerToFraction(0.22);
  await app.scrubToFrame(0);
  await expect(app.firstCanvasElement).toHaveCSS('opacity', '0');

  const { scene, thumbnail } = await exportThumbnail(app.page);
  expect(scene.lifecycle?.contentStart).toBeGreaterThanOrEqual(20);
  expect(scene.lifecycle?.contentStart).toBeLessThanOrEqual(24);
  const picture = await thumbnailPixels(app.page, thumbnail, [[190, 190, 190]]);
  expect(picture).toMatchObject({ width: 320, height: 180 });
  expect(picture.counts[0]).toBeGreaterThan(60);
  expect(picture.transparentPixels).toBeGreaterThan(320 * 180 * 0.9);
});

test('Export (.vcg) shows the first authored picture from an Add folder Sequence', async ({
  app,
}) => {
  await app.newProject('Picture sequence thumbnail');
  await app.addSequence({ x: 200, y: 200 });
  const colours: readonly Rgb[] = [
    [13, 172, 119],
    [234, 50, 126],
  ];
  const [firstPng, secondPng] = await app.page.evaluate((colours) => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 36;
    const ctx = canvas.getContext('2d');
    if (ctx === null) throw new Error('Cannot create test pictures');
    return colours.map(([red, green, blue]) => {
      ctx.fillStyle = `rgb(${red}, ${green}, ${blue})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/png').split(',')[1] ?? '';
    });
  }, colours);
  if (firstPng === undefined || secondPng === undefined) throw new Error('Missing test pictures');
  const folder = await mkdtemp(join(tmpdir(), 'cg-vcg-thumbnail-book-'));
  const first = join(folder, 'page2.png');
  const second = join(folder, 'page10.png');
  try {
    await writeFile(second, Buffer.from(secondPng, 'base64'));
    await writeFile(first, Buffer.from(firstPng, 'base64'));
    const [chooser] = await Promise.all([
      app.page.waitForEvent('filechooser'),
      app.inspector.getByRole('button', { name: 'Add folder…', exact: true }).click(),
    ]);
    await chooser.setFiles(folder);
    await expect(app.inspector.getByTestId('sequence-page-count')).toHaveText('2 pages');

    const { thumbnail } = await exportThumbnail(app.page);
    const picture = await thumbnailPixels(app.page, thumbnail, colours);
    expect(picture).toMatchObject({ width: 320, height: 180 });
    expect(picture.counts[0]).toBeGreaterThan(60);
    expect(picture.counts[1]).toBe(0);
  } finally {
    await rm(first, { force: true });
    await rm(second, { force: true });
    await rmdir(folder);
  }
});

test('Export (.vcg) depicts a Live plate whose fallback is disabled on air', async ({ app }) => {
  await app.newProject('Live plate thumbnail');
  await app.addLiveSource({ x: 200, y: 160 });
  await app.inspector.getByRole('button', { name: 'fallback', exact: true }).click();
  await app.page
    .getByRole('dialog', { name: 'Choose picture for fallback' })
    .getByRole('button', { name: 'Solid colour', exact: true })
    .click();
  await app.inspector
    .getByRole('checkbox', { name: 'Show fallback on air', exact: true })
    .uncheck();

  const { scene, thumbnail } = await exportThumbnail(app.page);
  const plates = flattenElements(scene).filter(
    ({ element }) => element.type === 'video-placeholder',
  );
  expect(plates).toMatchObject([{ element: { showFallback: false } }]);
  const picture = await thumbnailPixels(app.page, thumbnail, [[0, 0, 0]]);
  expect(picture.counts[0]).toBeGreaterThan(100);
  expect(picture.transparentPixels).toBeGreaterThan(320 * 180 * 0.6);
});
