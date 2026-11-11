import { expect, test } from './fixtures/designer.js';
import { guardDialog } from './fixtures/longClip.js';
import { toneWav } from './fixtures/sound.js';

test('placing a Sound displays its length and offers Extend when it exceeds the active range', async ({
  app,
  page,
}) => {
  test.setTimeout(90_000);
  await page.getByRole('button', { name: 'New project' }).click();
  const project = page.getByRole('dialog', { name: 'New project' });
  await project.getByLabel('Project name').fill('Sound duration');
  await project.getByRole('combobox', { name: 'Frame rate' }).selectOption('25');
  await project.getByRole('button', { name: 'Create' }).click();
  await app.expectStudio();
  await app.setSceneDuration(75);
  await page.getByRole('button', { name: 'Project assets' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add asset' }).dispatchEvent('pointerdown');
  await page.getByRole('menuitem', { name: 'Audio…', exact: true }).click();
  await (
    await chooser
  ).setFiles([
    { name: 'fitting.wav', mimeType: 'audio/wav', buffer: toneWav(2.9) },
    { name: 'longer.wav', mimeType: 'audio/wav', buffer: toneWav(3.14) },
  ]);

  const assets = page.getByRole('complementary', { name: 'Project assets' });
  const fitting = assets.getByTitle('fitting.wav', { exact: true });
  const longer = assets.getByTitle('longer.wav', { exact: true });
  const dialog = guardDialog(app);
  const drop = { targetPosition: { x: 220, y: 130 } };
  const duration = page.getByLabel('Scene duration in frames', { exact: true });
  const soundLengths = page.getByTestId('timeline-audio-duration');
  await expect(longer).toBeVisible({ timeout: 60_000 });
  await expect(dialog).toHaveCount(0);
  await expect(soundLengths).toHaveCount(0);

  await fitting.dragTo(app.canvas, drop);
  await expect(soundLengths).toHaveText('2.9 s');
  await expect(dialog).toHaveCount(0);

  await longer.dragTo(app.canvas, drop);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('This sound is longer than the composition')).toBeVisible();
  await expect(dialog).toContainText('3.1 s');
  await expect(dialog).toContainText('3.0 s');
  await expect(dialog.getByRole('button', { name: 'Add as backdrop' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(soundLengths).toHaveCount(1);
  await expect(app.inspector.getByRole('textbox', { name: 'Element name' })).toHaveValue('fitting');
  await app.deselect();
  await expect(duration).toHaveValue('75');

  await longer.dragTo(app.canvas, drop);
  await dialog.getByRole('button', { name: 'Extend the composition' }).click();
  await expect(soundLengths).toHaveCount(2);
  await expect(soundLengths.filter({ hasText: '3.1 s' })).toBeVisible();
  await app.deselect();
  await expect(duration).toHaveValue('79'); // ceil(3.14 s × 25 fps)

  await app.undo();
  await expect(duration).toHaveValue('75');
  await expect(soundLengths).toHaveText('2.9 s');
});
