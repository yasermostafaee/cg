import { buildNumberFieldVcg, buildPatternFieldVcg, expect, test } from './fixtures/runtime.js';

/**
 * 🔴 `R-101` — CG Control refuses a mistyped value against its field's pattern, before Update sends
 * it. A mistyped azan time used to reach the page, which kept the old target with nothing said.
 */
test('🔴 25:00 is refused under the field and not sent; ۲۰:۳۲ is sent', async ({ app }) => {
  const templateId = 'tpl-e2e-pattern';
  await app.importVcg('azan.vcg', await buildPatternFieldVcg(templateId));
  await app.selectStackRow(templateId);
  await app.installUpdateSpy();

  const box = app.inspector.getByRole('textbox', { name: 'azanTime', exact: true });
  await box.fill('25:00');
  const line = app.inspector.locator('[data-field-refusal="azanTime"]');
  await expect(line).toHaveText('Not a Time (HH:MM), e.g. 21:30.');
  await app.applyEdits();
  await expect(app.error).toContainText('Not sent: Azan time — Not a Time (HH:MM), e.g. 21:30.');
  expect(await app.updateCount()).toBe(0);

  await box.fill('۲۰:۳۲');
  await expect(line).toHaveCount(0);
  await app.applyEdits();
  await expect.poll(() => app.updateCount()).toBe(1);
});

test('B-446: an invalid required or length-constrained VCG draft blocks the whole update', async ({
  app,
}) => {
  const templateId = 'tpl-e2e-text-rules';
  const vcg = await buildPatternFieldVcg(templateId, {
    required: true,
    minLength: 4,
    maxLength: 5,
  });
  await app.importVcg('text-rules.vcg', vcg);
  await app.selectStackRow(templateId);
  await app.installUpdateSpy();

  const field = app.inspector.getByRole('textbox', { name: 'azanTime', exact: true });
  const sibling = app.inspector.getByRole('textbox', { name: 'anchor', exact: true });
  const error = app.inspector.locator('[data-field-refusal="azanTime"]');
  await expect(field).toHaveValue('20:32');
  await sibling.fill('خبرخوان آزمایشی');

  for (const [value, message] of [
    ['', /required/i],
    ['  ', /required/i],
    ['21', /at least 4 characters/],
    ['20:321', /at most 5 characters/],
    ['25:00', /Not a Time/],
  ] as const) {
    await field.fill(value);
    await expect(error).toHaveText(message);
    await app.applyEdits();
    await expect(app.error).toContainText('Azan time');
    expect(await app.updateCount()).toBe(0);
    await expect(sibling).toHaveValue('خبرخوان آزمایشی');
  }

  await field.fill('۲۰:۳۲');
  await expect(error).toHaveCount(0);
  await app.applyEdits();
  await expect.poll(() => app.updateCount()).toBe(1);
  await expect
    .poll(() =>
      app.page.evaluate(
        async (id) =>
          (await window.cg.stack.snapshot()).find((row) => row.templateId === id)?.fields,
        templateId,
      ),
    )
    .toMatchObject({ anchor: 'خبرخوان آزمایشی', azanTime: '۲۰:۳۲' });
});

test('B-446: an empty or out-of-range number blocks Update until corrected', async ({ app }) => {
  const templateId = 'tpl-e2e-number-rules';
  const vcg = await buildNumberFieldVcg(templateId, { required: true, min: 3, max: 10 });
  await app.importVcg('number-rules.vcg', vcg);
  await app.selectStackRow(templateId);
  await app.installUpdateSpy();

  const field = app.inspector.getByRole('textbox', { name: 'fontSize', exact: true });
  const sibling = app.inspector.getByRole('textbox', { name: 'anchor', exact: true });
  await sibling.fill('عنوان تازه');
  for (const [value, message] of [
    ['', 'A value is required.'],
    ['2', 'Must be at least 3.'],
    ['11', 'Must be at most 10.'],
  ] as const) {
    await field.fill(value);
    await expect(field).toHaveAccessibleDescription(message);
    await app.applyEdits();
    await expect(app.error).toContainText('Font size');
    expect(await app.updateCount()).toBe(0);
  }

  await field.fill('8');
  await app.applyEdits();
  await expect.poll(() => app.updateCount()).toBe(1);
  await expect
    .poll(() =>
      app.page.evaluate(
        async (id) =>
          (await window.cg.stack.snapshot()).find((row) => row.templateId === id)?.fields,
        templateId,
      ),
    )
    .toMatchObject({ anchor: 'عنوان تازه', fontSize: 8 });
});
