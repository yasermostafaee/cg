import { expect, test } from './fixtures/designer.js';

/** D-139 — authoring order and Preview use the same first-match rule records. */
test('a field rule can hide an element, reports the default match, and restores it on no match', async ({
  app,
}) => {
  await app.newProject('ValueRules');
  await app.addTextElement({ x: 160, y: 120 });
  await app.setDataKey('weather');
  const textId = (await app.timelineRowIds())[0];

  await app.addRectangle({ x: 420, y: 260 });
  const rectangleId = (await app.timelineRowIds()).find((id) => id !== textId);
  if (rectangleId === undefined) throw new Error('rectangle was not added');

  await app.inspector.getByTestId('value-rules-open').click();
  const rules = app.page.getByTestId('value-rules');
  await expect(rules).toBeVisible();
  await rules.getByRole('button', { name: 'Add rule' }).click();
  await expect(rules.getByTestId('value-rules-status')).toContainText('rule 1');
  await rules.getByRole('combobox', { name: 'value', exact: true }).selectOption('hide');
  await app.page.getByRole('button', { name: 'Done', exact: true }).click();

  await app.openPreviewModal();
  const visibleOpacity = (): Promise<string> =>
    app
      .previewElement(rectangleId)
      .evaluate((node) => getComputedStyle(node.parentElement ?? node).opacity);
  await expect.poll(visibleOpacity).toBe('0');

  await app.setPreviewField('weather', 'no-match');
  await app.updateAllPreviewFields();
  await expect.poll(visibleOpacity).toBe('1');
});

test('a numeric choice field supplies its values and aliases to rule conditions', async ({
  app,
}) => {
  await app.newProject('ValueRuleChoices');
  await app.addTextElement({ x: 160, y: 120 });
  await app.setDataKey('weather');
  await app.inspector.getByRole('combobox', { name: 'Field type' }).selectOption('number');
  await app.inspector.getByRole('combobox', { name: 'Allowed values' }).selectOption('choices');
  await app.inspector.getByRole('button', { name: 'Edit…', exact: true }).click();

  await app.page.getByLabel('Choice 1 value').fill('10');
  await app.page.getByLabel('Choice 1 alias').fill('Cold');
  await app.page.getByLabel('Choice 1 alias').press('Enter');
  await app.page.getByLabel('Choice 2 value').fill('20');
  await app.page.getByLabel('Choice 2 alias').fill('Mild');
  await app.page.getByLabel('Choice 2 alias').press('Enter');
  await app.page.getByRole('button', { name: 'Add choice' }).click();
  await expect(app.page.getByLabel('Choice 3 value')).toHaveValue('30');
  await app.page.getByLabel('Choice 3 alias').fill('Hot');
  await app.page.getByLabel('Choice 3 alias').press('Enter');
  await app.page.getByRole('button', { name: 'Save choices' }).click();

  await app.addRectangle({ x: 420, y: 260 });
  await app.inspector.getByTestId('value-rules-open').click();
  const rules = app.page.getByTestId('value-rules');
  await rules.getByRole('button', { name: 'Add rule' }).click();

  const conditionValue = rules.getByRole('combobox', { name: 'value', exact: true }).first();
  await expect(conditionValue.locator('option')).toHaveText(['Cold', 'Mild', 'Hot']);
  await conditionValue.selectOption('20');
  await expect(conditionValue).toHaveValue('20');
});
