import { test, expect } from './fixtures/designer.js';

interface DelayedPreviewReady {
  held: boolean;
  release: () => void;
}

/** D-173 — delay the real iframe's ready notification, not its scene or the app store. */
test('Preview waits for its current document before accepting Play', async ({ app, page }) => {
  await app.newProject('Delayed Preview readiness');
  await app.addTextElement({ x: 240, y: 140 });
  await app.setDataKey('headline');

  await page.evaluate(() => {
    const state: DelayedPreviewReady = { held: false, release: () => undefined };
    const capture = (event: MessageEvent<unknown>): void => {
      // InputTooltip temporarily clears native titles on hover. Scope by the stable dialog,
      // exactly like the public previewFrame fixture, rather than that mutable attribute.
      const frame = document.querySelector<HTMLIFrameElement>(
        '[role="dialog"][aria-label="Composition preview"] iframe',
      );
      if (event.source !== frame?.contentWindow) return;
      if ((event.data as { kind?: string } | null)?.kind !== 'cg-preview-ready') return;
      event.stopImmediatePropagation();
      state.held = true;
      state.release = () => {
        window.removeEventListener('message', capture, true);
        window.dispatchEvent(
          new MessageEvent('message', { source: event.source, data: event.data }),
        );
      };
    };
    (window as unknown as { delayedPreviewReady: DelayedPreviewReady }).delayedPreviewReady = state;
    window.addEventListener('message', capture, true);
  });

  await app.openPreviewModal();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { delayedPreviewReady: DelayedPreviewReady }).delayedPreviewReady
            .held,
      ),
    )
    .toBe(true);
  const commands = app.previewDialog.getByRole('group', { name: 'Playout commands' });
  for (const name of ['Play', 'Pause', 'Stop', 'Previous', 'Next']) {
    await expect(commands.getByRole('button', { name, exact: true })).toBeDisabled();
  }
  const elapsed = app.previewDialog.getByRole('status', { name: 'Elapsed preview time' });
  // A native click cannot start counters or queue a take while loading.
  await commands
    .getByRole('button', { name: 'Play', exact: true })
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(elapsed).toContainText('00:00:00');
  await expect(app.previewFrame.locator('body')).toHaveClass(/cg-pending/);
  await expect(app.previewDialog.getByRole('button', { name: 'Reset', exact: true })).toBeEnabled();
  await expect(app.previewDialog.getByRole('button', { name: 'Close', exact: true })).toBeEnabled();
  await app.previewDialog.getByText('Advanced', { exact: true }).click();
  await expect(app.previewDialog.locator('details[open]')).toHaveCount(1);

  await page.evaluate(() =>
    (
      window as unknown as { delayedPreviewReady: DelayedPreviewReady }
    ).delayedPreviewReady.release(),
  );
  await expect(commands.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await expect(elapsed).toContainText('00:00:00');
  await expect(app.previewFrame.locator('body')).toHaveClass(/cg-pending/);
  await app.play();
  await expect(app.previewFrame.getByText('New text')).toBeVisible();
  await expect(app.previewFrame.locator('body')).not.toHaveClass(/cg-pending/);
  await app.stop();
  await expect(app.previewFrame.locator('body')).toHaveClass(/cg-pending/);
  await expect(elapsed).toContainText('00:00:00');
});
