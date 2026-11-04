import { test, expect } from './fixtures/designer.js';

test.describe('composition control polish', () => {
  test('D-183 — New Project accepts seconds and keeps frames synchronized', async ({ app }) => {
    await app.page.getByRole('button', { name: 'New project' }).click();
    const dialog = app.page.getByRole('dialog', { name: 'New project' });
    const frames = dialog.getByRole('spinbutton', { name: 'Total frames' });
    const seconds = dialog.getByRole('spinbutton', { name: 'Duration in seconds' });
    const framesField = frames.locator('xpath=..');
    const secondsField = seconds.locator('xpath=..');

    await expect(frames).toHaveValue('50');
    await expect(seconds).toHaveValue('1');
    await expect(framesField).toHaveClass(/cg-field/);
    await expect(secondsField).toHaveClass(/cg-field/);
    await expect(secondsField.locator('.cg-unit')).toHaveText('s');
    const [framesBox, secondsBox] = await Promise.all([
      framesField.boundingBox(),
      secondsField.boundingBox(),
    ]);
    expect(framesBox).not.toBeNull();
    expect(secondsBox).not.toBeNull();
    expect(Math.abs(framesBox!.width - secondsBox!.width)).toBeLessThanOrEqual(1);

    await seconds.fill('10');
    await expect(frames).toHaveValue('500');
    await expect(seconds).toHaveValue('10');

    await frames.fill('125');
    await expect(seconds).toHaveValue('2.5');

    await dialog.getByLabel('Frame rate').selectOption('25');
    await expect(frames).toHaveValue('125');
    await expect(seconds).toHaveValue('5');

    await dialog.getByRole('button', { name: 'Create' }).click();
    await app.expectStudio();
    await expect(app.page.getByLabel('Scene duration in frames')).toHaveValue('125');
  });

  test('D-192 — New Project creates and displays a 30 fps reference-safe raster', async ({
    app,
  }) => {
    await app.page.getByRole('button', { name: 'New project' }).click();
    const dialog = app.page.getByRole('dialog', { name: 'New project' });
    const resolution = dialog.getByRole('combobox', { name: 'Resolution preset' });
    const frameRate = dialog.getByRole('combobox', { name: 'Frame rate' });
    const seconds = dialog.getByRole('spinbutton', { name: 'Duration in seconds' });
    const frames = dialog.getByRole('spinbutton', { name: 'Total frames' });

    await expect(resolution.locator('option')).toHaveText([
      '1920 × 1080 — Full HD reference (16:9)',
      '1280 × 720 — Small canvas (16:9)',
      '1080 × 1080 — Square canvas',
      'Custom',
    ]);
    await expect(frameRate.locator('option')).toHaveText([
      '25 fps',
      '29.97 fps',
      '30 fps',
      '50 fps',
      '59.94 fps',
      '60 fps',
    ]);

    await resolution.selectOption('hd');
    await frameRate.selectOption('30');
    await seconds.fill('10');
    await expect(frames).toHaveValue('300');
    await dialog.getByRole('button', { name: 'Create' }).click();

    await app.expectStudio();
    await expect(app.page.getByTitle('Resolution')).toHaveText('1280×720');
    await expect(app.page.getByTitle('Frame rate')).toHaveText('30 fps');
    await expect(app.page.getByTitle('Duration')).toHaveText('300f · 10.0s');
  });

  test('B-373/B-374 — composition uses Playback and grouped internal W/H axes', async ({ app }) => {
    await app.newProject('Composition controls');

    await expect(app.page.getByRole('button', { name: 'Toggle Playback' })).toBeVisible();
    await expect(app.page.getByRole('combobox', { name: 'Playback mode' })).toBeVisible();

    const width = app.page.getByRole('spinbutton', { name: 'Composition width' });
    const height = app.page.getByRole('spinbutton', { name: 'Composition height' });
    const widthSegment = width.locator('xpath=..');
    const heightSegment = height.locator('xpath=..');
    await expect(widthSegment).toHaveClass(/cg-seg/);
    await expect(heightSegment).toHaveClass(/cg-seg/);
    await expect(widthSegment.locator('[aria-hidden="true"]')).toHaveText('W');
    await expect(heightSegment.locator('[aria-hidden="true"]')).toHaveText('H');
    const sizeGroup = widthSegment.locator('xpath=..');
    await expect(sizeGroup).toHaveClass(/cg-input-group/);
    await expect(sizeGroup.getByRole('spinbutton')).toHaveCount(2);

    await width.fill('1280');
    await height.fill('720');
    await expect(width).toHaveValue('1280');
    await expect(height).toHaveValue('720');
  });

  test('D-184 — Inspector and timeline children are inset from their group edge', async ({
    app,
  }) => {
    await app.newProject('Hierarchy');

    const playback = app.page.locator('[data-section="Playback"]');
    const playbackChild = playback.locator('[data-section-body="Playback"] > :first-child');
    const [sectionBox, childBox] = await Promise.all([
      playback.boundingBox(),
      playbackChild.boundingBox(),
    ]);
    expect(sectionBox).not.toBeNull();
    expect(childBox).not.toBeNull();
    expect(childBox!.x).toBeGreaterThan(sectionBox!.x + 6);

    await app.addRectangle();
    await app.page.getByRole('button', { name: /Toggle Rectangle.* tracks/i }).click();
    const transformToggle = app.page.getByRole('button', { name: 'Toggle transform tracks' });
    await transformToggle.click();

    const groupTitle = transformToggle.locator('xpath=following-sibling::span');
    const firstTrackName = app.page
      .locator('.cg-tl-row[data-track-property="position.x"]')
      .locator('span')
      .first();
    const [titleBox, trackBox] = await Promise.all([
      groupTitle.boundingBox(),
      firstTrackName.boundingBox(),
    ]);
    expect(titleBox).not.toBeNull();
    expect(trackBox).not.toBeNull();
    expect(trackBox!.x).toBeGreaterThan(titleBox!.x + 4);
  });
});
