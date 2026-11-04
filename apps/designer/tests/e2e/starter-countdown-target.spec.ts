import { expect, test } from './fixtures/designer.js';

test('Azan uses five readable minute colors and a replaceable mosque icon', async ({ app }) => {
  await app.page.getByTestId('starter-card').filter({ hasText: 'شمارش معکوس اذان' }).click();
  await app.expectStudio();
  await app.openPreviewModal();
  const forceStep = app.previewDialog.getByTestId('preview-step-force');
  await expect(forceStep.locator('option')).toHaveText([
    'Step: live',
    'بیش از یک ساعت',
    'شصت دقیقه تا اذان · ≤ 60 min',
    'سی دقیقه تا اذان · ≤ 30 min',
    'ده دقیقه تا اذان · ≤ 10 min',
    'پنج دقیقه تا اذان · ≤ 5 min',
    'یک دقیقه تا اذان · ≤ 1 min',
    'اذان مغرب · At zero',
  ]);
  await app.play();
  const icon = app.previewElement('countdown-azan-icon');
  await expect(icon).toBeVisible();
  await expect(icon).toHaveJSProperty('tagName', 'IMG');
  await expect
    .poll(() => icon.evaluate((node) => (node as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  await expect(app.previewElement('countdown-badge-time')).toHaveCount(0);
  const colors = [
    'rgb(15, 118, 110)',
    'rgb(36, 93, 155)',
    'rgb(102, 82, 155)',
    'rgb(154, 90, 24)',
    'rgb(163, 62, 72)',
  ];
  for (const [index, color] of colors.entries()) {
    await forceStep.selectOption(`countdown-clock|${index}`);
    await expect(app.previewElement('countdown-clock-bg')).toHaveCSS('background-color', color);
    await expect(app.previewElement('countdown-clock')).toHaveCSS('color', 'rgb(255, 255, 255)');
  }
});

test('Azan lower-third uses the shared date picker, replaces zero with its message and stays until Stop', async ({
  app,
}, testInfo) => {
  await app.goto();
  await app.page.getByTestId('starter-card').filter({ hasText: 'شمارش معکوس اذان' }).click();
  await app.expectStudio();
  await app.openPreviewModal();

  const form = app.previewDialog.getByRole('group', { name: 'زمان اذان', exact: true });
  await expect(form.getByRole('textbox', { name: 'زمان اذان date', exact: true })).toBeVisible();
  await expect(form.getByRole('textbox', { name: 'زمان اذان time', exact: true })).toBeVisible();
  await expect(app.previewDialog.getByRole('alert')).toHaveCount(0);
  const before = await form
    .getByRole('textbox', { name: 'زمان اذان time', exact: true })
    .inputValue();
  await form.getByRole('combobox', { name: 'Calendar', exact: true }).selectOption('gregorian');
  await expect(form.getByRole('textbox', { name: 'زمان اذان time', exact: true })).toHaveValue(
    before,
  );
  await form.getByRole('button', { name: 'Pick a date', exact: true }).click();
  await expect(app.page.getByRole('dialog', { name: 'Pick a date', exact: true })).toBeVisible();
  await app.page.keyboard.press('Escape');

  // The parent exposes the nested countdown through its ordinary bound date/time
  // field, not a root-only duration override. Use that operator path verbatim.
  const target = new Date(Date.now() + 8_000);
  const time = form.getByRole('textbox', { name: 'زمان اذان time', exact: true });
  await time.focus();
  await time.press('Control+a');
  await time.pressSequentially(
    [target.getHours(), target.getMinutes(), target.getSeconds()]
      .map((value) => String(value).padStart(2, '0'))
      .join(''),
  );
  await time.press('Tab');
  await expect(time).toHaveValue(
    [target.getHours(), target.getMinutes(), target.getSeconds()]
      .map((value) => String(value).padStart(2, '0'))
      .join(':'),
  );
  await app.previewDialog.getByRole('button', { name: 'Update all', exact: true }).click();
  await app.play();
  await expect(app.previewElement('countdown-clock')).toBeVisible();
  const message = app.previewElement('countdown-zero');
  const messageOpacity = () =>
    message.evaluate((node) => getComputedStyle(node.closest('[data-cg-step-wrap]')!).opacity);
  await expect.poll(messageOpacity).toBe('0');
  await expect(app.previewElement('countdown-clock')).not.toHaveText('۰۰:۰۰:۰۰');
  const instance = app.previewElement('countdown-steps-onair-instance');
  await expect(instance).toHaveCSS('opacity', '1');
  const stage = await app.previewFrame.locator('.cg-stage').first().boundingBox();
  const lowerThird = await instance.boundingBox();
  expect(stage).not.toBeNull();
  expect(lowerThird).not.toBeNull();
  expect(lowerThird!.y).toBeGreaterThan(stage!.y + stage!.height * 0.65);
  expect(lowerThird!.height).toBeLessThan(stage!.height * 0.25);
  expect(lowerThird!.x).toBeGreaterThanOrEqual(stage!.x);
  expect(lowerThird!.x + lowerThird!.width).toBeLessThanOrEqual(stage!.x + stage!.width);
  await expect(app.previewElement('countdown-precision-bg')).toHaveCount(0);

  await expect(message).toHaveText('اذان مغرب به افق تهران');
  await expect.poll(messageOpacity, { timeout: 10_000 }).toBe('1');
  await expect
    .poll(() =>
      app
        .previewElement('countdown-clock')
        .evaluate((node) => getComputedStyle(node.closest('[data-cg-step-wrap]')!).opacity),
    )
    .toBe('0');
  await app.previewDialog
    .locator('iframe')
    .screenshot({ path: testInfo.outputPath('azan-zero-hold.png') });
  const handle = await app.previewDialog.locator('iframe').elementHandle();
  const frame = await handle?.contentFrame();
  if (frame === null || frame === undefined) throw new Error('No preview frame');
  const stays = await frame.evaluate(async () => {
    const message = document.querySelector<HTMLElement>('[data-cg-element-id="countdown-zero"]');
    if (message === null) throw new Error('No Azan message');
    const until = performance.now() + 1_300;
    while (performance.now() < until) {
      if (
        document.body.classList.contains('cg-pending') ||
        message.getBoundingClientRect().height === 0 ||
        getComputedStyle(message).visibility === 'hidden' ||
        getComputedStyle(message.closest('[data-cg-step-wrap]')!).opacity !== '1'
      )
        return false;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    return true;
  });
  expect(stays).toBe(true);

  await app.stop();
  const exit = await frame.evaluate(async () => {
    const plate = document.querySelector<HTMLElement>(
      '[data-cg-element-id="countdown-steps-onair-instance"]',
    );
    if (plate === null) throw new Error('No Azan instance');
    let faded = false;
    const until = performance.now() + 5_000;
    while (performance.now() < until) {
      const alpha = Number(getComputedStyle(plate).opacity);
      if (alpha > 0 && alpha < 0.99) faded = true;
      if (document.body.classList.contains('cg-pending')) return { faded, settled: true };
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    return { faded, settled: false };
  });
  expect(exit).toEqual({ faded: true, settled: true });

  // Replaying a genuinely expired absolute deadline must not invent more time.
  await app.play();
  await expect.poll(messageOpacity).toBe('1');
});
