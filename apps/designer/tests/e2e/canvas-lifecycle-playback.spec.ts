import { expect, test, type DesignerApp } from './fixtures/designer.js';

async function finiteFastTicker(app: DesignerApp): Promise<void> {
  await app.addTicker({ x: 120, y: 260 });
  await app.inspector.getByRole('combobox', { name: 'repeat' }).selectOption('count');
  await app.page.getByLabel('passes', { exact: true }).fill('1');
  await app.page.getByLabel('passes', { exact: true }).press('Enter');
  await app.inspector.getByRole('combobox', { name: 'cycle seam' }).selectOption('drain');
  await app.page.getByLabel('speed', { exact: true }).fill('1000');
  await app.page.getByLabel('speed', { exact: true }).press('Enter');
  await app.setPlayoutTiming('auto-out');
  await app.setHoldSource('content-driven');
}

test.describe('D-175 — main canvas playback uses the Preview lifecycle', () => {
  test('B-380 — an empty composition replays its real frame clock from the start', async ({
    app,
  }) => {
    await app.newProject('EmptyCanvasLifecycle');
    await app.setSceneDuration(50);

    // The regression needs a genuinely empty composition: no element, nested composition or
    // content driver may accidentally provide the frame clock that this path is meant to prove.
    await expect(app.canvasFrame.locator('[data-cg-element-id]')).toHaveCount(0);
    await expect(app.inspector.getByText('50 fps', { exact: true })).toBeVisible();

    const transport = app.page.getByLabel('Playback transport');
    const ruler = app.page.getByRole('slider', { name: 'Frame ruler' });
    await expect(ruler).toHaveAttribute('aria-valuemax', '50');

    // Start away from zero so Play has to perform an observable lifecycle reset first.
    await transport.getByRole('button', { name: 'Step forward' }).click();
    await expect(ruler).toHaveAttribute('aria-valuenow', '1');

    await ruler.evaluate((node) => {
      const samples = [Number(node.getAttribute('aria-valuenow') ?? '-1')];
      Object.assign(window, { __cgEmptyLifecycleFrames: samples });
      new MutationObserver(() => {
        samples.push(Number(node.getAttribute('aria-valuenow') ?? '-1'));
      }).observe(node, { attributes: true, attributeFilter: ['aria-valuenow'] });
    });
    const frameSamples = (): Promise<number[]> =>
      ruler.evaluate(
        () =>
          (
            window as typeof window & {
              __cgEmptyLifecycleFrames?: number[];
            }
          ).__cgEmptyLifecycleFrames ?? [],
      );

    const firstRunAt = (await frameSamples()).length;
    await transport.getByRole('button', { name: 'Play', exact: true }).click();
    await expect
      .poll(async () =>
        (await frameSamples()).slice(firstRunAt).some((frame) => frame > 0 && frame < 50),
      )
      .toBe(true);

    const firstRun = (await frameSamples()).slice(firstRunAt);
    expect(firstRun[0]).toBe(0);
    const firstMiddle = firstRun.findIndex((frame) => frame > 0 && frame < 50);
    const firstEnd = firstRun.indexOf(50);
    expect(firstMiddle).toBeGreaterThan(0);
    if (firstEnd >= 0) expect(firstMiddle).toBeLessThan(firstEnd);

    // Pause is proved against browser animation frames, rather than an exact wall-clock sleep.
    await transport.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(transport.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    const pausedFrame = Number((await ruler.getAttribute('aria-valuenow')) ?? '-1');
    expect(pausedFrame).toBeGreaterThan(0);
    expect(pausedFrame).toBeLessThan(50);
    const heldFrames = await ruler.evaluate(async (node) => {
      const samples: number[] = [];
      for (let index = 0; index < 8; index += 1) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        samples.push(Number(node.getAttribute('aria-valuenow') ?? '-1'));
      }
      return samples;
    });
    expect(heldFrames.every((frame) => frame === pausedFrame)).toBe(true);

    await transport.getByRole('button', { name: 'Play', exact: true }).click();
    await expect
      .poll(async () => Number((await ruler.getAttribute('aria-valuenow')) ?? '-1'))
      .toBeGreaterThan(pausedFrame);
    await expect(ruler).toHaveAttribute('aria-valuenow', '50');

    // A deliberate rewind followed by a fresh Play must create another 0 → middle → end run;
    // stale completion state from the first pass must not leave the empty scene parked at 50.
    const secondRunAt = (await frameSamples()).length;
    await transport.getByRole('button', { name: 'Go to start' }).click();
    await expect(ruler).toHaveAttribute('aria-valuenow', '0');
    await transport.getByRole('button', { name: 'Play', exact: true }).click();
    await expect
      .poll(async () =>
        (await frameSamples()).slice(secondRunAt).some((frame) => frame > 0 && frame < 50),
      )
      .toBe(true);

    const secondRun = (await frameSamples()).slice(secondRunAt);
    expect(secondRun[0]).toBe(0);
    const secondMiddle = secondRun.findIndex((frame) => frame > 0 && frame < 50);
    const secondEnd = secondRun.indexOf(50);
    expect(secondMiddle).toBeGreaterThan(0);
    if (secondEnd >= 0) expect(secondMiddle).toBeLessThan(secondEnd);
  });

  test('ordinary Play runs and re-arms a finite ticker-driven lifecycle', async ({ app }) => {
    await app.newProject('CanvasLifecycleTicker');
    await finiteFastTicker(app);

    const transport = app.page.getByLabel('Playback transport');
    const play = transport.getByRole('button', { name: 'Play', exact: true });
    const canvas = app.canvasFrame;

    await play.click();
    await expect(transport.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();

    // The authoring ticker row is replaced by the driver's live treadmill: this proves the
    // canvas sent runtime.play(), not another stream of scrub ticks.
    await expect(canvas.locator('[data-cg-ticker-static]')).toHaveCount(0);
    await expect(canvas.locator('[data-cg-ticker-item]').first()).toBeAttached();

    // Finite content completes the hold, the runtime runs its outro and settles the transport
    // without an operator Stop. The authoring frame is restored after that visible close.
    await expect(play).toBeVisible({ timeout: 20_000 });
    await expect(canvas.locator('[data-cg-ticker-static]').first()).toBeAttached();

    // A fresh Play must re-arm the content source rather than resume the completed run.
    await play.click();
    await expect(canvas.locator('[data-cg-ticker-static]')).toHaveCount(0);
    await expect(canvas.locator('[data-cg-ticker-item]').first()).toBeAttached();
  });

  test('Preview loop remains an explicit playhead-only authoring mode', async ({ app }) => {
    await app.newProject('CanvasPlayheadLoop');
    await app.addTicker({ x: 120, y: 260 });

    const transport = app.page.getByLabel('Playback transport');
    await transport.getByRole('button', { name: 'Preview loop' }).click();
    await transport.getByRole('button', { name: 'Play', exact: true }).click();

    // The playhead moves, but a ticker has no frame mapping and its real-time driver must not
    // start or reset in the explicit authoring loop.
    await expect(transport.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
    await app.page.waitForTimeout(500);
    await expect(app.canvasFrame.locator('[data-cg-ticker-static]').first()).toBeAttached();
    await expect(app.canvasFrame.locator('[data-cg-ticker-item]')).toHaveCount(0);
  });

  test('Pause freezes the canvas lifecycle and Play resumes it', async ({ app }) => {
    await app.newProject('CanvasLifecyclePause');
    await app.addTicker({ x: 120, y: 260 });
    await app.setPlayoutTiming('auto-out');
    await app.setHoldSource('content-driven'); // default ticker is infinite: it holds until stopped

    const transport = app.page.getByLabel('Playback transport');
    await transport.getByRole('button', { name: 'Play', exact: true }).click();
    const item = app.canvasFrame.locator('[data-cg-ticker-item]').first();
    await expect(item).toBeAttached();
    await app.page.waitForTimeout(200);

    const trackTransform = (): Promise<string> =>
      item.evaluate((node) => (node.parentElement as HTMLElement | null)?.style.transform ?? '');

    await transport.getByRole('button', { name: 'Pause', exact: true }).click();
    const frozen = await trackTransform();
    await app.page.waitForTimeout(350);
    await expect.poll(trackTransform).toBe(frozen);

    await transport.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(trackTransform).not.toBe(frozen);
  });
});
