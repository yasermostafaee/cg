import { expect, test } from './fixtures/designer.js';

for (const nested of [false, true]) {
  test(`expired ${nested ? 'nested' : 'direct'} countdown remains editable on stopped Canvas but expires during Play`, async ({
    app,
  }, testInfo) => {
    test.setTimeout(90_000);
    await app.newProject('Expired countdown editing');
    if (nested) {
      await app.newComposition('Timer content');
      await app.openComposition('Timer content');
    }
    await app.addRectangle({ x: 320, y: 190 });
    const labelId = (await app.timelineRowIds())[0]!;
    await app.addRectangle({ x: 450, y: 250 });
    const hiddenId = (await app.timelineRowIds()).find((id) => id !== labelId)!;
    await app.toggleElementVisibility(hiddenId);
    await app.addClock({ x: 120, y: 60 });
    const clockId = (await app.timelineRowIds()).find((id) => id !== labelId && id !== hiddenId)!;
    const inspector = app.inspector;
    await inspector.getByRole('combobox', { name: 'mode', exact: true }).selectOption('countdown');
    await inspector.getByRole('combobox', { name: 'target', exact: true }).selectOption('datetime');
    await inspector.getByTestId('datetime-calendar').selectOption('gregorian');
    const date = inspector.getByRole('textbox', {
      name: 'Countdown target date and time date',
      exact: true,
    });
    await date.focus();
    await date.press('Control+a');
    await date.pressSequentially('20000101');
    await date.press('Tab');
    const authoredDate = await date.inputValue();
    await inspector
      .getByRole('combobox', { name: 'after zero', exact: true })
      .selectOption('hide-digits');

    await inspector.getByTestId('steps-edit').click();
    const dialog = app.page.getByRole('dialog', { name: /^Steps of / });
    await dialog.getByTestId('steps-add-zero').click();
    await dialog.getByTestId('steps-add-change').click();
    const change = dialog.locator('[data-testid="step-changes"] [data-change]').last();
    await change.getByRole('combobox', { name: 'element', exact: true }).selectOption(labelId);
    await change.getByRole('combobox', { name: 'property', exact: true }).selectOption('visible');
    await change.getByRole('combobox', { name: 'value', exact: true }).selectOption('hide');
    await dialog.getByRole('button', { name: 'Done', exact: true }).click();

    const digits = app.canvasFrame.locator(
      `[data-cg-element-id="${clockId}"] [data-cg-clock-time]`,
    );
    const label = app.canvasFrame.locator(`[data-cg-element-id="${labelId}"]`);
    const hidden = app.canvasFrame.locator(`[data-cg-element-id="${hiddenId}"]`);
    const labelOpacity = () =>
      label.evaluate(
        (node) => getComputedStyle(node.closest('[data-cg-step-wrap]') ?? node).opacity,
      );
    await expect(digits).not.toHaveText('');
    await expect.poll(labelOpacity).toBe('1');
    await expect(hidden).toHaveCSS('display', 'none');

    // An explicit rehearsal is still a truthful preview of this zero step. Closing it returns
    // to editable authored defaults, not the wall-clock-selected zero state.
    await inspector.getByTestId('steps-edit').click();
    await dialog.getByTestId('steps-rehearse').locator('[data-rehearse="0"]').click();
    await expect.poll(labelOpacity).toBe('0');
    await expect(digits).toHaveText('');
    await dialog.getByRole('button', { name: 'Done', exact: true }).click();
    await expect.poll(labelOpacity).toBe('1');
    await expect(digits).not.toHaveText('');

    await app.setPlayoutTiming('manual');
    if (nested) {
      await app.openComposition('comp1');
      // Configure the empty parent first: the full-canvas instance also covers the
      // fixture's background-click deselection point once it has been inserted.
      await app.setPlayoutTiming('manual');
      await app.nestCompositionInstance('Timer content');
    }
    await expect(digits).not.toHaveText('');
    await expect.poll(labelOpacity).toBe('1');
    await expect(hidden).toHaveCSS('display', 'none');
    const transport = app.page.getByLabel('Playback transport');
    await transport.getByRole('button', { name: 'Rehearse preview' }).click();
    await transport.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(digits).toHaveText('');
    await expect.poll(labelOpacity).toBe('0');
    // Leaving Rehearse releases runtime ownership and restores edit visibility.
    await transport.getByRole('button', { name: 'Rehearse preview' }).click();
    await expect(digits).not.toHaveText('');
    await expect.poll(labelOpacity).toBe('1');
    await expect(hidden).toHaveCSS('display', 'none');

    await app.openPreviewModal();
    await app.play();
    await expect(
      app.previewFrame.locator(`[data-cg-element-id="${clockId}"] [data-cg-clock-time]`),
    ).toHaveText('');
    await expect
      .poll(() =>
        app
          .previewElement(labelId)
          .evaluate(
            (node) => getComputedStyle(node.closest('[data-cg-step-wrap]') ?? node).opacity,
          ),
      )
      .toBe('0');
    await app.stop();
    await app.previewDialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(digits).not.toHaveText('');
    await expect.poll(labelOpacity).toBe('1');

    if (nested) await app.openComposition('Timer content');
    await app.selectElementById(clockId);
    await expect(date).toHaveValue(authoredDate);
    await app.page
      .getByTestId('canvas-viewport')
      .screenshot({ path: testInfo.outputPath('expired-countdown-editable.png') });
  });
}
