import { expect, test } from './fixtures/designer.js';

test.describe('D-172 — Text Padding mode', () => {
  test('one value expands to four sides, renders, and collapses through the top value', async ({
    app,
  }) => {
    await app.newProject('D172Padding');
    await app.addTextElement({ x: 220, y: 160 });
    await app.inspector.getByRole('button', { name: 'Toggle Text Padding' }).click();

    const uniform = app.inspector.getByRole('spinbutton', { name: 'padding', exact: true });
    await expect(uniform).toBeVisible();
    await uniform.fill('14');
    await uniform.blur();

    const computedPadding = async (): Promise<string[]> =>
      app.canvasFrame
        .locator('[data-cg-element-id]')
        .first()
        .evaluate((element) => {
          const style = getComputedStyle(element as HTMLElement);
          return [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft];
        });
    await app.inspector.getByRole('button', { name: 'Use per-side padding' }).click();
    for (const side of ['top', 'right', 'bottom', 'left']) {
      await expect(app.inspector.getByRole('spinbutton', { name: `${side} padding` })).toHaveValue(
        '14',
      );
    }
    await expect(uniform).toHaveCount(0);
    await expect.poll(computedPadding).toEqual(['14px', '14px', '14px', '14px']);

    const right = app.inspector.getByRole('spinbutton', { name: 'right padding' });
    await right.fill('22');
    await right.press('Enter');
    await expect.poll(computedPadding).toEqual(['14px', '22px', '14px', '14px']);

    await app.inspector.getByRole('button', { name: 'Use a single padding value' }).click();
    await expect(
      app.inspector.getByRole('spinbutton', { name: 'padding', exact: true }),
    ).toHaveValue('14');
    await expect.poll(computedPadding).toEqual(['14px', '14px', '14px', '14px']);
  });
});
