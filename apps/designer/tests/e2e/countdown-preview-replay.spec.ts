import { expect, test } from './fixtures/designer.js';

// D-141: the accelerated Preview clock is scoped to one take, never to the
// iframe's lifetime. Replaying must not rewrite an authored wall-clock deadline.
for (const past of [false, true]) {
  test(`accelerated countdown replay ${past ? 'keeps an actually past deadline past' : 'starts a fresh rehearsal without editing any value'}`, async ({
    app,
  }) => {
    await app.newProject('Countdown replay');
    await app.addClock({ x: 240, y: 160 });
    const inspector = app.inspector;
    await inspector.getByRole('combobox', { name: 'mode' }).selectOption('countdown');
    await inspector.getByRole('combobox', { name: 'target' }).selectOption('datetime');
    await inspector.getByTestId('datetime-calendar').selectOption('gregorian');
    if (past) {
      const date = inspector.getByRole('textbox', {
        name: 'Countdown target date and time date',
        exact: true,
      });
      await date.focus();
      await date.press('Control+a');
      await date.pressSequentially('20000101');
    } else {
      await inspector.getByRole('button', { name: '+5 min', exact: true }).click();
    }
    const deadline = await inspector
      .getByRole('textbox', { name: 'Countdown target date and time time', exact: true })
      .inputValue();
    await inspector.getByTestId('steps-edit').click();
    const steps = app.page.getByRole('dialog', { name: /^Steps of / });
    await steps.getByTestId('steps-preset').click();
    await steps.getByRole('button', { name: 'Done' }).click();
    await app.openPreviewModal();
    await app.previewDialog.getByTestId('preview-step-rate').selectOption('60');
    const remaining = async (): Promise<number> => {
      const text = await app.previewFrame.locator('[data-cg-clock-time]').innerText();
      const latin = [...text]
        .map((c) => ('۰۱۲۳۴۵۶۷۸۹'.includes(c) ? String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)) : c))
        .join('');
      return latin.split(':').reduce((total, part) => total * 60 + Number(part), 0);
    };
    await app.play();
    await expect.poll(remaining, { timeout: 10_000 }).toBe(0);
    // No update, reset, rate change or field edit in between these two takes.
    await app.play();
    if (past) await expect.poll(remaining).toBe(0);
    else await expect.poll(remaining).toBeGreaterThan(180);
    await app.previewDialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(
      inspector.getByRole('textbox', { name: 'Countdown target date and time time', exact: true }),
    ).toHaveValue(deadline);
  });
}
