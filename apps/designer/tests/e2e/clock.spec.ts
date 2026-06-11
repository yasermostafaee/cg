import { test, expect } from './fixtures/designer.js';

/**
 * D-027 — the clock element scenarios driven through the real UI. Per-second
 * formatting / mode math lives in @cg/template-runtime unit tests; this guards
 * the integrated path: tool → canvas static render (Persian digits) → wall
 * ticking in the preview → countdown as a content source ending a
 * content-driven hold on its own.
 */

const PERSIAN_TIME = /[۰-۹]{2}:[۰-۹]{2}:[۰-۹]{2}/;

test.describe('Clock element (D-027)', () => {
  test('author a wall clock → canvas shows Persian-digit time → it ticks in the preview', async ({
    app,
  }) => {
    await app.newProject('Clock');
    await app.addClock();

    // The inspector shows the clock config + the time-driven note.
    await expect(app.inspector.getByRole('combobox', { name: 'mode' })).toHaveValue('wall');
    await expect(app.inspector.getByText('Time-driven', { exact: false })).toBeVisible();

    // The authoring canvas renders the current time with Persian digits
    // (default wall / HH:mm:ss / persian / Vazirmatn).
    const canvasFrame = app.page.frameLocator('iframe[title="cgpreview"]');
    await expect(canvasFrame.locator('[data-cg-clock-time]')).toHaveText(PERSIAN_TIME);

    // In the preview, the wall clock ticks once per second from play.
    await app.openPreviewModal();
    const time = app.previewFrame.locator('[data-cg-clock-time]');
    await expect(time).toHaveText(PERSIAN_TIME);
    await app.play();
    const before = (await time.textContent()) ?? '';
    await expect(time).not.toHaveText(before, { timeout: 3000 }); // ticked within ~1.5s
    await expect(time).toHaveText(PERSIAN_TIME); // still a well-formed Persian time
    await app.stop();
  });

  test('a 2s countdown COMPLETES a content-driven hold — the stage exits on its own at 00:00', async ({
    app,
  }) => {
    await app.newProject('ClockCount');
    await app.addClock();
    await app.setClockCountdown(2);

    // The playout inspector offers the content-driven hold source BECAUSE the
    // composition contains a countdown clock (copy generalized beyond ticker).
    await app.setPlayoutTiming('auto-out');
    await app.setHoldSource('content-driven');

    await app.openPreviewModal();
    await app.play();
    // Intro → content-driven hold (the count runs) → zero → outro → settled
    // hidden, with NO stop() sent.
    await expect(app.previewFrame.locator('body')).toHaveClass(/cg-pending/, {
      timeout: 20_000,
    });
  });

  test('the exported single-file HTML carries the clock with an unchanged GDD', async ({ app }) => {
    await app.newProject('ClockExport');
    await app.addClock();
    const { html } = await app.exportHtml();
    expect(html).toContain('"type":"clock"');
    // The clock adds no dynamic fields — the GDD declares no properties for it.
    const gdd = /<script name="graphics-data-definition"[^>]*>([\s\S]*?)<\/script>/.exec(html);
    expect(gdd).not.toBeNull();
    expect(gdd?.[1] ?? '').not.toContain('clock');
  });
});
