import { expect, test } from './fixtures/designer.js';

test.describe('D-166 — composition Variables tab', () => {
  test('empty state → dynamic row, and selection changes do not close the tab', async ({ app }) => {
    await app.newProject('Variables tab');

    const variables = app.page.getByRole('tab', { name: 'Variables' });
    await variables.click();
    await expect(variables).toHaveAttribute('aria-selected', 'true');
    await expect(app.page.getByRole('tabpanel', { name: 'Variables' })).toContainText(
      'No variables.',
    );

    await app.page.getByRole('tab', { name: 'Inspector' }).click();
    await app.addTextElement({ x: 240, y: 140 });
    await app.setDataKey('headline');

    await variables.click();
    await expect(app.fieldCard('headline')).toBeVisible();
    await expect(app.fieldCard('headline')).toContainText('text');

    const table = app.page.getByRole('table', { name: 'Composition variables' });
    await expect(table.getByRole('columnheader')).toHaveText([
      'Key',
      'Title',
      'Type / binding',
      'Actions',
    ]);
    const cells = app.fieldCard('headline').getByRole('cell');
    await expect(cells).toHaveCount(4);
    const cellBoxes = await cells.evaluateAll((nodes) =>
      nodes.map((node) => {
        const box = node.getBoundingClientRect();
        return { left: box.left, centerY: box.top + box.height / 2 };
      }),
    );
    expect(cellBoxes.map(({ left }) => left)).toEqual(
      [...cellBoxes.map(({ left }) => left)].sort((a, b) => a - b),
    );
    expect(
      Math.max(...cellBoxes.map(({ centerY }) => centerY)) -
        Math.min(...cellBoxes.map(({ centerY }) => centerY)),
    ).toBeLessThan(2);
    await expect(
      app.fieldCard('headline').getByRole('button', { name: 'Bind from canvas' }),
    ).toBeVisible();
    await expect(
      app.fieldCard('headline').getByRole('button', { name: 'Delete headline' }),
    ).toBeVisible();

    await app.deselect();
    await expect(variables).toHaveAttribute('aria-selected', 'true');
    await expect(app.fieldCard('headline')).toBeVisible();
  });
});
