import { test, expect } from './fixtures/designer.js';

test.describe('D-173 — large command-first Preview workspace', () => {
  test('D-196 — one Preset remains visible and selected below the fixed transport', async ({
    app,
  }) => {
    await app.newProject('Single Preset preview');
    await app.addMultiFrameGroup();
    await app.addLook();
    await app.openPreviewModal();

    const commands = app.previewDialog.getByRole('group', { name: 'Playout commands' });
    const presets = app.previewDialog.getByRole('group', { name: 'Preview preset' });
    const only = presets.getByRole('button', { name: 'look-1', exact: true });
    await expect(commands).toBeVisible();
    await expect(presets).toBeVisible();
    await expect(only).toHaveAttribute('aria-pressed', 'true');
    expect(
      await app.previewDialog.evaluate((root) => {
        const command = root.querySelector('[aria-label="Playout commands"]');
        const preset = root.querySelector('[aria-label="Preview preset"]');
        return (
          command !== null &&
          preset !== null &&
          command.getBoundingClientRect().top < preset.getBoundingClientRect().top
        );
      }),
    ).toBe(true);
  });

  test('uses the viewport, keeps commands above Variables, and pauses elapsed time', async ({
    app,
  }, testInfo) => {
    await app.newProject('Preview workspace');
    await app.addTextElement();
    await app.setDataKey('headline');
    await app.setInspectorNumber('Opacity', 0);
    await app.toggleInspectorKeyframe('opacity');
    await app.scrubToFrame(20);
    await app.setInspectorNumber('Opacity', 100);
    await app.scrubToFrame(0);
    await app.openPreviewModal();

    const dialog = app.previewDialog;
    const viewport = app.page.viewportSize();
    const box = await dialog.boundingBox();
    expect(viewport).not.toBeNull();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(viewport!.width * 0.9);
    expect(box!.height).toBeGreaterThan(viewport!.height * 0.8);

    const commands = dialog.getByRole('group', { name: 'Playout commands' });
    const variables = dialog.getByText('Variables', { exact: true });
    await expect(commands).toBeVisible();
    await expect(variables).toBeVisible();
    const order = await dialog.evaluate((root) => {
      const command = root.querySelector('[role="group"][aria-label="Playout commands"]');
      const variableTitle = [...root.querySelectorAll('*')].find(
        (el) => el.textContent?.trim() === 'Variables',
      );
      return command !== null && variableTitle !== undefined
        ? command.getBoundingClientRect().top < variableTitle.getBoundingClientRect().top
        : false;
    });
    expect(order).toBe(true);
    await expect(dialog.getByText('Variable', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Value', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Out', exact: true })).toHaveCount(0);

    const elapsed = dialog.getByLabel('Elapsed preview time');
    const frameStatus = dialog.getByLabel('Preview frame');
    await expect(elapsed).toContainText('00:00:00');
    await expect(frameStatus).toContainText('00 / 50');
    const frameValue = frameStatus.locator('strong');
    const elapsedValue = elapsed.locator('strong');
    const initialFrameBox = await frameValue.boundingBox();
    const statusBox = await frameStatus.boundingBox();
    const pictureBox = await dialog.locator('iframe').boundingBox();
    const compositionName = dialog.getByLabel('Active composition');
    await expect(compositionName).toHaveText('comp1');
    const compositionBox = await compositionName.boundingBox();
    expect(initialFrameBox).not.toBeNull();
    expect(statusBox).not.toBeNull();
    expect(pictureBox).not.toBeNull();
    expect(compositionBox).not.toBeNull();
    expect(compositionBox!.y + compositionBox!.height).toBeLessThan(pictureBox!.y);
    expect(statusBox!.y + statusBox!.height).toBeLessThan(pictureBox!.y);
    const statusTypography = await frameValue.evaluate((node) => ({
      fontSize: Number.parseFloat(getComputedStyle(node).fontSize),
      fontFamily: getComputedStyle(node).fontFamily,
    }));
    expect(statusTypography.fontSize).toBeGreaterThanOrEqual(20);
    expect(statusTypography.fontFamily).toMatch(/Cascadia Mono|Consolas|monospace/i);
    await expect(elapsedValue).toHaveCSS('font-variant-numeric', /tabular-nums/);
    await app.play();
    await app.page.waitForTimeout(350);
    const running = (await elapsed.textContent()) ?? '';
    expect(running).not.toContain('00:00:00');
    const runningFrame = Number.parseInt(
      ((await frameValue.textContent()) ?? '0').split('/')[0]!,
      10,
    );
    expect(runningFrame).toBeGreaterThan(0);
    expect(runningFrame).toBeLessThan(50);
    await app.pause();
    const paused = await elapsed.textContent();
    await app.page.waitForTimeout(350);
    await expect(elapsed).toHaveText(paused ?? '');

    await dialog.locator('iframe').evaluate((node) => {
      const frame = node as HTMLIFrameElement;
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { kind: 'cg-preview-frame', frame: 27 },
          source: frame.contentWindow,
        }),
      );
    });
    await expect(frameStatus).toContainText('27 / 50');
    const updatedFrameBox = await frameValue.boundingBox();
    expect(updatedFrameBox).not.toBeNull();
    expect(updatedFrameBox!.width).toBeCloseTo(initialFrameBox!.width, 1);
    await dialog.screenshot({ path: testInfo.outputPath('preview-workspace.png') });
  });

  test('stops elapsed time when the graphic completes itself', async ({ app }) => {
    await app.newProject('Preview automatic completion');
    // Keep this on the Runtime-telemetry path. B-382 defers an early collapsed stop only for a
    // genuinely empty/static root; an animated root must still settle as soon as Runtime says so.
    await app.addRectangle({ x: 100, y: 100 });
    await app.setInspectorNumber('Opacity', 0);
    await app.toggleInspectorKeyframe('opacity');
    await app.scrubToFrame(20);
    await app.setInspectorNumber('Opacity', 100);
    await app.scrubToFrame(0);
    await app.openPreviewModal();
    const elapsed = app.previewDialog.getByLabel('Elapsed preview time');

    await app.play();
    await app.page.waitForTimeout(250);
    await app.previewDialog.locator('iframe').evaluate((node) => {
      const frame = node as HTMLIFrameElement;
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { kind: 'cg-preview-state', state: 'stopped' },
          source: frame.contentWindow,
        }),
      );
    });

    const completed = await elapsed.textContent();
    expect(completed).not.toContain('00:00:00');
    await app.page.waitForTimeout(350);
    await expect(elapsed).toHaveText(completed ?? '');
  });

  test('a fresh Play counts and resets both counters on a static rectangle composition', async ({
    app,
  }) => {
    await app.newProject('Preview replay counters');
    await app.addRectangle({ x: 100, y: 100 });
    await app.openPreviewModal();

    const frame = app.previewDialog.getByLabel('Preview frame').locator('strong');
    await frame.evaluate((node) => {
      const history: string[] = [node.textContent ?? ''];
      Reflect.set(window, '__previewFrameHistory', history);
      new MutationObserver(() => history.push(node.textContent ?? '')).observe(node, {
        characterData: true,
        childList: true,
        subtree: true,
      });
    });

    await app.play();
    await app.page.waitForTimeout(1_100);
    const replayBoundary = await frame.evaluate(
      () => (Reflect.get(window, '__previewFrameHistory') as string[]).length,
    );
    await app.play();
    await app.page.waitForTimeout(150);

    const history = await frame.evaluate(
      () => Reflect.get(window, '__previewFrameHistory') as string[],
    );
    expect(history.slice(0, replayBoundary)).toContain('50 / 50');
    expect(history.slice(replayBoundary)).toContain('00 / 50');
    expect(history.slice(replayBoundary).some((value) => /^0[1-9] \/ 50$/.test(value))).toBe(true);

    await app.stop();
    await expect(frame).toHaveText('00 / 50');
    await expect(app.previewDialog.getByLabel('Elapsed preview time')).toContainText('00:00:00');
    await app.page.waitForTimeout(100);
    await expect(frame).toHaveText('00 / 50');
  });

  test('B-382 — truly empty Static uses a finite authored Preview clock', async ({ app }) => {
    await app.newProject('Empty static preview clock');
    await app.setSceneDuration(50);
    await app.openPreviewModal();
    await expect(app.previewFrame.locator('[data-cg-element-id]')).toHaveCount(0);

    const staticFrame = app.previewDialog.getByLabel('Preview frame').locator('strong');
    const staticElapsed = app.previewDialog.getByLabel('Elapsed preview time').locator('strong');
    await app.play();
    await app.page.waitForTimeout(250);
    const middle = Number.parseInt((await staticFrame.textContent()) ?? '', 10);
    expect(middle).toBeGreaterThan(0);
    expect(middle).toBeLessThan(50);
    await expect(staticFrame).toHaveText('50 / 50', { timeout: 2_000 });
    await expect(staticElapsed).toHaveText('00:01:00');

    // Explicit Stop is never deferred, even after a finite authored projection has settled.
    await app.stop();
    await expect(staticFrame).toHaveText('00 / 50');
    await expect(staticElapsed).toHaveText('00:00:00');
  });
});
