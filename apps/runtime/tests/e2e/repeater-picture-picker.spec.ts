import { buildRepeaterVcg, expect, test } from './fixtures/runtime.js';

/** D-180 — structured row pictures are chosen by human filenames, never raw asset ids. */
test('a Repeater picture cell shows package filenames and stages another named picture', async ({
  app,
}) => {
  const templateId = 'tpl-e2e-repeater-pictures';
  await app.importVcg('weather.vcg', await buildRepeaterVcg(templateId, 2, true));
  await app.selectStackRow(templateId);

  const picture = app.inspector.getByRole('combobox', { name: 'rows item 1 Icon' });
  await expect(picture).toHaveValue('img-sun');
  await expect(picture.locator('option:checked')).toHaveText('sunny.png');
  await expect(app.inspector).not.toContainText('img-sun');

  await picture.selectOption('img-rain');
  await expect(picture.locator('option:checked')).toHaveText('rain.png');
  await expect(app.inspector).not.toContainText('img-rain');
});
