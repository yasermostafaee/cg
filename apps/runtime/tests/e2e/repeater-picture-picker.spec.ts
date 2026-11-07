import { readFile } from 'node:fs/promises';
import { buildImageFieldVcg, buildRepeaterVcg, expect, test } from './fixtures/runtime.js';

test('an authored top-level image field exposes Windows Browse in CG Control', async ({ app }) => {
  const templateId = 'tpl-e2e-image-browse';
  await app.importVcg('image-browse.vcg', await buildImageFieldVcg(templateId));
  await app.selectStackRow(templateId);

  await expect(app.inspector.getByRole('button', { name: 'img', exact: true })).toBeVisible();
  await expect(app.inspector.getByRole('button', { name: 'Browse…' })).toBeVisible();
  await expect(app.inspector.locator('input[aria-label="img browse image"]')).toHaveAttribute(
    'accept',
    '.png,.svg',
  );
});

test('a newly uploaded portrait stays inside its picture-picker thumbnail', async ({ app }) => {
  const templateId = 'tpl-e2e-image-upload-containment';
  await app.importVcg('image-upload-containment.vcg', await buildImageFieldVcg(templateId));
  await app.selectStackRow(templateId);

  const portrait = `
    <svg xmlns="http://www.w3.org/2000/svg" width="40" height="400" viewBox="0 0 40 400">
      <rect width="40" height="400" fill="#14806f" />
    </svg>`;
  await app.inspector.locator('input[aria-label="img browse image"]').setInputFiles({
    name: 'portrait.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(portrait),
  });
  await app.inspector.getByRole('button', { name: 'img', exact: true }).click();

  const picker = app.page.getByRole('dialog', { name: 'Choose picture for img' });
  const uploaded = picker.getByRole('button', { name: 'Current uploaded picture' });
  const thumbnail = uploaded.locator('.cg-image-picker-choice__thumb');
  const image = thumbnail.locator('img');
  await expect(image).toBeVisible();

  const [cardBox, thumbnailBox, imageBox] = await Promise.all([
    uploaded.boundingBox(),
    thumbnail.boundingBox(),
    image.boundingBox(),
  ]);
  expect(cardBox).not.toBeNull();
  expect(thumbnailBox).not.toBeNull();
  expect(imageBox).not.toBeNull();
  if (cardBox === null || thumbnailBox === null || imageBox === null) return;

  expect(thumbnailBox.height).toBeLessThanOrEqual(96);
  expect(imageBox.x).toBeGreaterThanOrEqual(thumbnailBox.x);
  expect(imageBox.y).toBeGreaterThanOrEqual(thumbnailBox.y);
  expect(imageBox.x + imageBox.width).toBeLessThanOrEqual(thumbnailBox.x + thumbnailBox.width);
  expect(imageBox.y + imageBox.height).toBeLessThanOrEqual(thumbnailBox.y + thumbnailBox.height);
  expect(imageBox.y + imageBox.height).toBeLessThanOrEqual(cardBox.y + cardBox.height);
});

test('a heavy authored raster is shown from a small Blob thumbnail, not its original data URL', async ({
  app,
}) => {
  const templateId = 'tpl-e2e-image-thumbnail-derivative';
  const picture = await readFile(
    new URL('../../../designer/public/starters/assets/weather-atmosphere.png', import.meta.url),
  );
  const sourceUrl = `data:image/png;base64,${picture.toString('base64')}`;
  await app.importVcg('image-thumbnail-derivative.vcg', await buildImageFieldVcg(templateId));
  await app.page.evaluate((source) => {
    const target = window as unknown as {
      cg: {
        templates: {
          page: () => Promise<{ kind: 'page'; html: string; source: 'bridge' }>;
        };
      };
    };
    target.cg.templates.page = () =>
      Promise.resolve({
        kind: 'page',
        html: `<script>CG.createRuntime(scene, { assetUrls: ${JSON.stringify({
          'img-default': source,
        })} });</script>`,
        source: 'bridge',
      });
  }, sourceUrl);
  await app.selectStackRow(templateId);
  await app.inspector.getByRole('button', { name: 'img', exact: true }).click();

  const picker = app.page.getByRole('dialog', { name: 'Choose picture for img' });
  const image = picker.getByRole('button', { name: 'default.png' }).locator('img');
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute('src', /^blob:/);
  const thumbnail = await image.evaluate((node) => {
    const picture = node as HTMLImageElement;
    return { width: picture.naturalWidth, height: picture.naturalHeight };
  });
  expect(thumbnail.width).toBeLessThanOrEqual(320);
  expect(thumbnail.height).toBeLessThanOrEqual(180);
});

test('all authored heavy rasters finish loading as small Blob thumbnails', async ({ app }) => {
  const templateId = 'tpl-e2e-image-thumbnail-queue';
  const filenames = [
    'weather-atmosphere.png',
    'weather-sky-broadcast.png',
    'quran-wide-001.png',
    'quran-wide-002.png',
    'quran-wide-003.png',
  ];
  const sources = await Promise.all(
    filenames.map(async (filename) => {
      const picture = await readFile(
        new URL(`../../../designer/public/starters/assets/${filename}`, import.meta.url),
      );
      return `data:image/png;base64,${picture.toString('base64')}`;
    }),
  );
  const options = ['default.png', 'choice-2.png', 'choice-3.png', 'choice-4.png', 'choice-5.png'];
  await app.importVcg(
    'image-thumbnail-queue.vcg',
    await buildImageFieldVcg(templateId, options.length),
  );
  await app.page.evaluate((pictureSources) => {
    const target = window as unknown as {
      cg: {
        templates: {
          page: () => Promise<{ kind: 'page'; html: string; source: 'bridge' }>;
        };
      };
    };
    target.cg.templates.page = () =>
      Promise.resolve({
        kind: 'page',
        html: `<script>CG.createRuntime(scene, { assetUrls: ${JSON.stringify({
          'img-default': pictureSources[0],
          'img-choice-2': pictureSources[1],
          'img-choice-3': pictureSources[2],
          'img-choice-4': pictureSources[3],
          'img-choice-5': pictureSources[4],
        })} });</script>`,
        source: 'bridge',
      });
  }, sources);
  await app.selectStackRow(templateId);
  await app.inspector.getByRole('button', { name: 'img', exact: true }).click();

  const picker = app.page.getByRole('dialog', { name: 'Choose picture for img' });
  for (const option of options) {
    const image = picker.getByRole('button', { name: option }).locator('img');
    await expect(image).toBeVisible({ timeout: 15_000 });
    await expect(image).toHaveAttribute('src', /^blob:/);
    const thumbnail = await image.evaluate((node) => {
      const picture = node as HTMLImageElement;
      return { width: picture.naturalWidth, height: picture.naturalHeight };
    });
    expect(thumbnail.width).toBeLessThanOrEqual(320);
    expect(thumbnail.height).toBeLessThanOrEqual(180);
  }
});

/** D-180 — structured row pictures are chosen by human filenames, never raw asset ids. */
test('a Repeater picture cell shows package filenames and stages another named picture', async ({
  app,
}) => {
  const templateId = 'tpl-e2e-repeater-pictures';
  await app.importVcg('weather.vcg', await buildRepeaterVcg(templateId, 2, true));
  await app.selectStackRow(templateId);

  await app.inspector.getByRole('button', { name: 'Edit rows…' }).click();
  const rows = app.page.getByRole('dialog', { name: 'Edit rows rows' });
  const picture = rows.getByRole('button', { name: 'rows item 1 Icon' });
  await expect(picture).toContainText('sunny.png');
  await expect(app.inspector).not.toContainText('img-sun');

  await picture.click();
  const picker = app.page.getByRole('dialog', { name: 'Choose picture for rows item 1 Icon' });
  await picker.getByRole('button', { name: /rain\.png/ }).click();
  await expect(picture).toContainText('rain.png');
  await expect(app.inspector).not.toContainText('img-rain');
  await rows.getByRole('button', { name: 'Apply', exact: true }).click();
});

test('author-locked Repeater columns stay visible but cannot be changed in CG Control', async ({
  app,
}) => {
  const templateId = 'tpl-e2e-repeater-locked-columns';
  await app.importVcg(
    'locked-league.vcg',
    await buildRepeaterVcg(templateId, 2, true, { lockedName: true, lockedIcon: true }),
  );
  await app.selectStackRow(templateId);

  await app.inspector.getByRole('button', { name: 'Edit rows…' }).click();
  const rows = app.page.getByRole('dialog', { name: 'Edit rows rows' });
  await expect(rows.getByRole('textbox', { name: 'rows item 1 Name' })).toBeDisabled();
  await expect(rows.getByRole('button', { name: 'rows item 1 Icon' })).toBeDisabled();
  await expect(rows.getByRole('button', { name: 'Add rows item' })).toBeDisabled();
  await expect(rows.getByRole('button', { name: 'Remove rows item 1' })).toBeDisabled();
  await expect(rows.getByRole('button', { name: 'Reorder rows item 1' })).toBeDisabled();
  await expect(rows).toContainText('locked');
  await rows.locator('button[data-modal-role="cancel"]', { hasText: 'Close' }).click();
});

test('current file-only data shows Repeater pictures instead of workbook filenames', async ({
  app,
}) => {
  const templateId = 'tpl-e2e-repeater-picture-table';
  await app.page.evaluate(() => {
    const target = window as unknown as {
      cg: {
        textSources: {
          read: (request: { path: string }) => Promise<{ name: string; content: string }>;
        };
        templates: {
          page: () => Promise<{ kind: 'page'; html: string }>;
        };
      };
    };
    target.cg.textSources.read = (request) =>
      Promise.resolve({ name: request.path, content: 'Name,Icon\nیک,sunny.png\nدو,rain.png' });
    const pixel =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    target.cg.templates.page = () =>
      Promise.resolve({
        kind: 'page',
        html: `<script>CG.createRuntime(scene, { assetUrls: ${JSON.stringify({
          'img-sun': pixel,
          'img-rain': pixel,
        })} });</script>`,
      });
  });
  await app.importVcg(
    'picture-table.vcg',
    await buildRepeaterVcg(templateId, 2, true, { authoredFile: 'league/rows.csv' }),
  );
  await app.selectStackRow(templateId);

  await expect(app.inspector).toContainText('File connected');
  await app.inspector.getByRole('button', { name: 'View rows file content and fields' }).click();
  const table = app.page.getByRole('dialog', { name: 'Current file-only data · rows' });
  await expect(table.locator('img[title="sunny.png"]')).toBeVisible();
  await expect(table.locator('img[title="rain.png"]')).toBeVisible();
  await expect(table).not.toContainText('sunny.png');
  await expect(table).not.toContainText('rain.png');
});
