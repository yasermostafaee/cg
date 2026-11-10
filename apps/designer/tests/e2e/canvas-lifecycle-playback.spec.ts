import { expect, test, type DesignerApp } from './fixtures/designer.js';

test('B-419 — inline text editing opens at the painted keyframed position', async ({ app }) => {
  await app.newProject('Animated text editing');
  const canvas = await app.canvas.boundingBox();
  if (canvas === null) throw new Error('Canvas is missing');
  await app.addTextElement({
    x: Math.round(canvas.width * 0.27),
    y: Math.round(canvas.height * 0.2),
  });
  const id = (await app.timelineRowIds())[0]!;
  const paintedText = app.canvasFrame.locator(`[data-cg-element-id="${id}"]`);
  const initial = await paintedText.boundingBox();
  if (initial === null) throw new Error('Text is missing from the canvas');

  await app.toggleInspectorKeyframe('position.y');
  await app.scrubToFrame(40);
  const y = app.inspector.getByLabel('Y position', { exact: true });
  await y.fill('760');
  await y.press('Enter');

  await app.selectTool('Select');
  let previousTop = initial.y;
  for (const frame of [18, 35]) {
    await app.scrubToFrame(frame);
    await expect
      .poll(async () => (await paintedText.boundingBox())?.y ?? 0)
      .toBeGreaterThan(previousTop + 20);
    const painted = await paintedText.boundingBox();
    if (painted === null) throw new Error('Animated text is missing from the canvas');

    await app.page.mouse.dblclick(painted.x + 12, painted.y + 8);
    const editor = app.page.locator('[contenteditable="true"]');
    await expect(editor).toBeFocused();
    const editing = await editor.boundingBox();
    if (editing === null) throw new Error('Inline text editor is missing');
    expect(Math.abs(editing.x - painted.x)).toBeLessThan(1);
    expect(Math.abs(editing.y - painted.y)).toBeLessThan(1);

    await editor.fill('متن ویرایش‌شده');
    await editor.press('Enter');
    await expect(editor).toHaveCount(0);
    await expect(paintedText).toHaveText('متن ویرایش‌شده');
    previousTop = painted.y;
  }
});

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

test.describe('D-199 — main Canvas separates timeline playback from Rehearse preview', () => {
  test('ordinary Play runs an empty composition linearly from the start', async ({ app }) => {
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

  test('ordinary Play does not start a ticker lifecycle', async ({ app }) => {
    await app.newProject('CanvasLifecycleTicker');
    await finiteFastTicker(app);

    const transport = app.page.getByLabel('Playback transport');
    const play = transport.getByRole('button', { name: 'Play', exact: true });
    const canvas = app.canvasFrame;

    await play.click();
    await expect(transport.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();

    // The playhead moves, but lifecycle-owned real-time content remains in its authoring state.
    await expect(canvas.locator('[data-cg-ticker-static]').first()).toBeAttached();
    await expect(canvas.locator('[data-cg-ticker-item]')).toHaveCount(0);
    const ruler = app.page.getByRole('slider', { name: 'Frame ruler' });
    await expect
      .poll(async () => Number(await ruler.getAttribute('aria-valuenow')))
      .toBeGreaterThan(0);
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

  test('Rehearse preview replaces authoring controls and Play / Stop drive the lifecycle', async ({
    app,
  }) => {
    await app.newProject('CanvasLifecyclePause');
    await app.setSceneDuration(50);
    await app.addRectangle({ x: 240, y: 130 });
    await app.setInspectorNumber('Opacity', 0);
    await app.toggleInspectorKeyframe('opacity');
    await app.scrubToFrame(8);
    await app.setInspectorNumber('Opacity', 100);
    await app.scrubToFrame(38);
    await app.toggleInspectorKeyframe('opacity');
    await app.scrubToFrame(50);
    await app.setInspectorNumber('Opacity', 0);
    await app.scrubToFrame(0);
    await app.deselect();
    await app.addOutPoint();
    await app.setPlayoutTiming('manual');

    const transport = app.page.getByLabel('Playback transport');
    await expect(transport.getByRole('button', { name: 'Preview loop' })).toHaveAttribute(
      'title',
      'Preview loop',
    );
    await expect(transport.getByRole('button', { name: 'Ping-pong' })).toHaveAttribute(
      'title',
      'Ping-pong',
    );
    await transport.getByRole('button', { name: 'Rehearse preview' }).click();
    for (const name of ['Go to start', 'Step back', 'Step forward', 'Preview loop', 'Ping-pong']) {
      await expect(transport.getByRole('button', { name })).toHaveCount(0);
    }
    await expect(transport.getByRole('button', { name: 'Next' })).toBeDisabled();

    await transport.getByRole('button', { name: 'Play', exact: true }).click();
    const graphic = app.canvasFrame.locator('[data-cg-element-id]').first();
    await expect(graphic).toBeVisible();
    await expect(transport.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
    const ruler = app.page.getByRole('slider', { name: 'Frame ruler' });
    await expect(ruler).toHaveAttribute('aria-valuenow', '38');
    const frameBeforeStop = 38;

    await transport.getByRole('button', { name: 'Stop', exact: true }).click();
    // Stop starts the real coordinated Outro. It must neither reset the host playhead nor hide
    // the stage synchronously; clear happens only after runtime emits stop.end.
    await expect(app.canvasFrame.locator('body')).not.toHaveClass(/cg-rehearse-cleared/);
    await expect(transport.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
    await expect
      .poll(async () => {
        const cleared = await app.canvasFrame
          .locator('body')
          .evaluate((body) => body.classList.contains('cg-rehearse-cleared'));
        return cleared ? frameBeforeStop : Number(await ruler.getAttribute('aria-valuenow'));
      })
      .toBeGreaterThan(frameBeforeStop);
    await expect(app.canvasFrame.locator('body')).toHaveClass(/cg-rehearse-cleared/);
    await expect(transport.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();

    // B-428 — clearing the artwork keeps the editor's checkerboard frame visible.
    const stage = app.canvasFrame.locator('.cg-stage');
    await expect(graphic).toBeHidden();
    await expect(stage).toHaveCSS('visibility', 'visible');
    await expect(stage).toHaveCSS('opacity', '1');
    await expect(stage).toHaveCSS('background-image', /linear-gradient/);

    await transport.getByRole('button', { name: 'Rehearse preview' }).click();
    await expect(app.canvasFrame.locator('body')).not.toHaveClass(/cg-rehearse-cleared/);
    await expect(graphic).toBeVisible();
  });

  test('Rehearse preview Next advances an operator-stepped Sequence', async ({ app }) => {
    await app.newProject('CanvasPlayoutNext');
    await app.addSequence({ x: 160, y: 200 });
    await app.setSequenceDwell(30);

    const transport = app.page.getByLabel('Playback transport');
    await transport.getByRole('button', { name: 'Rehearse preview' }).click();
    const next = transport.getByRole('button', { name: 'Next', exact: true });
    await expect(next).toBeEnabled();
    await transport.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(app.canvasFrame.getByText('Now: first item')).toBeVisible();

    await next.click();
    await expect(app.canvasFrame.getByText('Then: second item')).toBeVisible({ timeout: 3000 });
  });

  test('folder-backed Quran Sequence runs the same deterministic Outro on repeated Stop', async ({
    app,
  }) => {
    test.setTimeout(25_000);
    await app.goto();
    await app.page.getByTestId('starter-card').filter({ hasText: 'نمایش تلاوت قرآن' }).click();
    await app.expectStudio();

    const transport = app.page.getByLabel('Playback transport');
    const ruler = app.page.getByRole('slider', { name: 'Frame ruler' });
    const pictureSequence = app.canvasFrame.locator('[data-cg-element-id="folder-image-sequence"]');
    await transport.getByRole('button', { name: 'Rehearse preview' }).click();

    for (let run = 0; run < 2; run += 1) {
      await transport.getByRole('button', { name: 'Play', exact: true }).click();
      await expect(ruler).toHaveAttribute('aria-valuenow', '100', { timeout: 5_000 });
      await transport.getByRole('button', { name: 'Stop', exact: true }).click();

      await expect(app.canvasFrame.locator('body')).not.toHaveClass(/cg-rehearse-cleared/);
      await expect(pictureSequence).toHaveAttribute('data-cg-outro', 'sequence-frame');
      await expect(pictureSequence).not.toHaveCSS('visibility', 'hidden');
      await expect
        .poll(async () => Number(await ruler.getAttribute('aria-valuenow')))
        .toBeGreaterThan(100);
      await expect
        .poll(async () =>
          pictureSequence.evaluate((node) => Number(getComputedStyle(node).opacity)),
        )
        .toBeLessThan(0.95);
      await expect(ruler).toHaveAttribute('aria-valuenow', '160');
      await expect(app.canvasFrame.locator('body')).toHaveClass(/cg-rehearse-cleared/);
      await expect(transport.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
    }
  });
});
