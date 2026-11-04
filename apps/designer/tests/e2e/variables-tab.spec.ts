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
    await expect(app.fieldCard('headline').getByRole('button', { name: 'Unbind' })).toBeVisible();
    await expect(
      app.fieldCard('headline').getByRole('button', { name: 'Delete headline' }),
    ).toBeVisible();

    const longTitle =
      'A long operator-facing title that needs more room than the compact Variables column';
    const titleInput = app.page.getByRole('textbox', { name: 'Title for headline' });
    await titleInput.fill(longTitle);
    await titleInput.blur();
    await expect(titleInput).toHaveAttribute('title', longTitle);

    // CSS locators keep the hidden details cell addressable while Title owns its column.
    const rowCells = app.fieldCard('headline').locator('[role="cell"]');
    const titleCell = rowCells.nth(1);
    const detailsCell = rowCells.nth(2);
    const actionsCell = rowCells.nth(3);
    const compactTitle = await titleCell.boundingBox();
    const compactActions = await actionsCell.boundingBox();
    expect(compactTitle).not.toBeNull();
    expect(compactActions).not.toBeNull();

    await titleInput.focus();
    const focusedTitle = await titleCell.boundingBox();
    const focusedActions = await actionsCell.boundingBox();
    expect(focusedTitle).not.toBeNull();
    expect(focusedActions).not.toBeNull();
    expect(focusedTitle!.width).toBeGreaterThan(compactTitle!.width + 30);
    expect(Math.abs(focusedActions!.x - compactActions!.x)).toBeLessThan(1);
    await expect(detailsCell).toBeHidden();

    await app.deselect();
    await expect(variables).toHaveAttribute('aria-selected', 'true');
    await expect(app.fieldCard('headline')).toBeVisible();

    const bindingToggle = app.page.getByTestId('binding-toggle-headline');
    const boundPosition = await bindingToggle.boundingBox();
    await expect(bindingToggle.locator('svg')).toHaveCount(1);
    await expect(bindingToggle).toHaveAccessibleName('Unbind');
    await bindingToggle.hover();
    await expect(bindingToggle).toHaveCSS('color', 'rgb(248, 113, 113)');
    await bindingToggle.click();
    await expect(bindingToggle).toHaveAccessibleName('Bind from canvas');
    await bindingToggle.hover();
    await expect(bindingToggle).toHaveCSS('color', 'rgb(167, 139, 250)');
    const unboundPosition = await bindingToggle.boundingBox();
    expect(unboundPosition?.x).toBe(boundPosition?.x);
    await bindingToggle.click();
    await expect(bindingToggle).toHaveAttribute('aria-pressed', 'true');
    await expect(bindingToggle).toHaveCSS('color', 'rgb(167, 139, 250)');

    const inputOverlay = app.page.getByTestId('canvas-input-overlay');
    await expect(inputOverlay).toHaveAttribute('data-bind-mode', 'true');
    const canvasWorkArea = app.page.getByTestId('canvas-work-area');
    await expect(canvasWorkArea).toHaveAttribute('data-bind-active', 'true');
    expect(
      await canvasWorkArea.evaluate((node) => getComputedStyle(node, '::after').boxShadow),
    ).not.toBe('none');
    const bindInstruction = app.page.getByTestId('bind-instruction');
    await expect(bindInstruction).toContainText('Select an element');
    await expect(bindInstruction).toContainText('Compatible: Text · Plate · Lottie text');
    await app.canvas.hover({ position: { x: 240, y: 140 } });
    const bindOutline = app.page.getByTestId('bind-target-outline');
    await expect(bindOutline).toBeVisible();
    await expect(bindOutline).toHaveAttribute('stroke', '#A78BFA');
    const bindCursor = await inputOverlay.evaluate((node) => getComputedStyle(node).cursor);
    expect(bindCursor).toContain('url(');
    expect(bindCursor).not.toBe('crosshair');

    await app.canvas.click({ position: { x: 240, y: 140 } });
    await expect(bindingToggle).toHaveAccessibleName('Unbind');
    await expect(canvasWorkArea).toHaveAttribute('data-bind-active', 'false');
    expect(
      await canvasWorkArea.evaluate((node) => getComputedStyle(node, '::after').boxShadow),
    ).toBe('none');
    await expect(bindInstruction).toHaveCount(0);
    await expect(bindOutline).toHaveCount(0);
  });
});
