import { buildPatternFieldVcg, expect, test } from './fixtures/runtime.js';

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
