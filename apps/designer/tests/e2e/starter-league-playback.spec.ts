import { expect, test } from './fixtures/designer.js';

test('league builds top to bottom, contains all 18 rows, then closes bottom to top before its background fades', async ({
  app,
}, testInfo) => {
  const clock = app.page.clock;
  await clock.install();
  await app.page.setViewportSize({ width: 1600, height: 1000 });
  await app.page.getByTestId('starter-card').filter({ hasText: 'جدول لیگ برتر ایران' }).click();
  await app.expectStudio();
  await app.selectElementById('az-table-repeater');
  const exitOrder = app.inspector.getByRole('combobox', { name: 'exit order', exact: true });
  const exitEffect = app.inspector.getByRole('combobox', { name: 'item exit', exact: true });
  await expect(exitOrder).toHaveValue('reverse');
  await expect(exitOrder.locator('option')).toHaveText(['Last to first', 'First to last']);
  const effect = await exitEffect.inputValue();
  await exitOrder.selectOption('forward');
  await expect(exitOrder).toHaveValue('forward');
  await expect(exitEffect).toHaveValue(effect);
  await exitOrder.selectOption('reverse');
  await expect(exitEffect).toHaveValue(effect);
  const entranceTime = app.inspector.getByLabel('entrance time', { exact: true });
  const exitTime = app.inspector.getByLabel('exit time', { exact: true });
  const delay = app.inspector.getByLabel('item delay', { exact: true });
  await expect(entranceTime).toHaveValue('0.2');
  await expect(exitTime).toHaveValue('0.05');
  await expect(delay).toHaveValue('0.03');
  await exitTime.fill('0.75');
  await exitTime.press('Enter');
  await expect(entranceTime).toHaveValue('0.2');
  await entranceTime.fill('0.25');
  await entranceTime.press('Enter');
  await expect(exitTime).toHaveValue('0.75');
  await expect(delay).toHaveValue('0.03');
  await expect(exitOrder).toHaveValue('reverse');
  // Restore the sample's normal timing before observing its actual playback.
  await entranceTime.fill('0.2');
  await entranceTime.press('Enter');
  await exitTime.fill('0.05');
  await exitTime.press('Enter');
  await app.openPreviewModal();
  const handle = await app.previewDialog.locator('iframe').elementHandle();
  const frame = await handle?.contentFrame();
  if (frame === undefined || frame === null) throw new Error('No league Preview frame');
  await expect(app.previewDialog.getByRole('button', { name: /Play|Resume/ })).toBeEnabled();
  // Pause while idle so neither Playwright round trips nor a busy runner can
  // skip the authored 30 ms stagger. runFor executes every animation callback.
  await clock.pauseAt(Date.now() + 60_000);
  await app.play();
  // Play re-stamps the Repeater. Observe the new nodes before advancing time.
  await expect(frame.locator('body')).not.toHaveClass(/cg-pending/);

  const entrance = await frame.evaluateHandle(() => {
    const rows = [...document.querySelectorAll<HTMLElement>('[data-cg-repeater-motion]')];
    const result = {
      count: rows.length,
      sawOrderedBuild: false,
      outOfOrder: false,
      started: [] as number[],
      settled: false,
    };
    const sample = (): void => {
      const alpha = rows.map((row) =>
        row.style.visibility === 'hidden' ? 0 : Number(row.style.opacity || '1'),
      );
      for (let index = 0; index < alpha.length; index += 1) {
        if (alpha[index]! > 0.01 && !result.started.includes(index)) result.started.push(index);
        if (index > 0 && alpha[index]! > alpha[index - 1]! + 0.001) result.outOfOrder = true;
      }
      if (alpha[0]! > 0.01 && alpha.at(-1) === 0) result.sawOrderedBuild = true;
      if (alpha.length === 18 && alpha.every((value) => value >= 0.999)) {
        result.settled = true;
        return;
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
    return result;
  });
  await clock.runFor(5_000);
  expect(await entrance.jsonValue()).toEqual({
    count: 18,
    sawOrderedBuild: true,
    outOfOrder: false,
    started: Array.from({ length: 18 }, (_, index) => index),
    settled: true,
  });
  // The owner's other authored entrance tracks also reach their hold before Stop.
  await expect(app.previewDialog.getByLabel('Preview frame')).toContainText('110 / 200');

  const geometry = await frame.evaluate(() => {
    const panel = document.querySelector('[data-cg-element-id="az-bg"]');
    const stage = document.querySelector('.cg-stage');
    const rows = [...document.querySelectorAll('[data-cg-element-id="az-row-bg"]')];
    if (panel === null || stage === null) throw new Error('Missing league panel or stage');
    const panelBox = panel.getBoundingClientRect();
    const stageBox = stage.getBoundingClientRect();
    const inside = (outer: DOMRect, inner: DOMRect) =>
      inner.left >= outer.left - 1 &&
      inner.top >= outer.top - 1 &&
      inner.right <= outer.right + 1 &&
      inner.bottom <= outer.bottom + 1;
    return {
      count: rows.length,
      insidePanel: rows.every((row) => inside(panelBox, row.getBoundingClientRect())),
      insideStage: rows.every((row) => inside(stageBox, row.getBoundingClientRect())),
    };
  });
  expect(geometry).toEqual({ count: 18, insidePanel: true, insideStage: true });
  await app.previewDialog
    .locator('iframe')
    .screenshot({ path: testInfo.outputPath('league-held.png') });

  // The latest saved project intentionally clears its scrim before Hold; it must
  // remain clear during Stop, while the stadium and main panel fade after the rows.
  await expect(frame.locator('[data-cg-element-id="az-bg-scrim"]')).toHaveCSS('opacity', '0');
  const backgrounds = ['az-stadium-bg', 'az-bg'];
  const baseline = await frame.evaluate(
    (ids) =>
      ids.map((id) => {
        const node = document.querySelector(`[data-cg-element-id="${id}"]`);
        if (node === null) throw new Error(`Missing background ${id}`);
        return Number(getComputedStyle(node).opacity);
      }),
    backgrounds,
  );
  const exit = await frame.evaluateHandle(
    ({ ids, baseline }) => {
      const rows = [...document.querySelectorAll<HTMLElement>('[data-cg-repeater-motion]')];
      const backgrounds = ids.map((id) => {
        const node = document.querySelector(`[data-cg-element-id="${id}"]`);
        if (node === null) throw new Error(`Missing background ${id}`);
        return node;
      });
      const result = {
        started: [] as number[],
        fading: backgrounds.map(() => false),
        sawReverseBuildDown: false,
        outOfOrder: false,
        allRowsGone: false,
        backgroundFadedBeforeRows: false,
        scrimStayedHidden: true,
        settled: false,
      };
      const scrim = document.querySelector('[data-cg-element-id="az-bg-scrim"]');
      if (scrim === null) throw new Error('Missing league scrim');
      const sample = (): void => {
        if (Number(getComputedStyle(scrim).opacity) !== 0) result.scrimStayedHidden = false;
        if (document.body.classList.contains('cg-pending')) {
          result.settled = true;
          return;
        }
        const alpha = rows.map((row) =>
          row.style.visibility === 'hidden' ? 0 : Number(row.style.opacity || '1'),
        );
        // Visit last-to-first so a single rendered frame that contains two adjacent
        // starts still reports the authored sequence, rather than DOM iteration order.
        for (let index = alpha.length - 1; index >= 0; index -= 1) {
          if (alpha[index]! < 0.999 && !result.started.includes(index)) result.started.push(index);
          if (index > 0 && alpha[index]! > alpha[index - 1]! + 0.001) result.outOfOrder = true;
        }
        if (alpha[0]! >= 0.999 && alpha.at(-1)! < 0.99) result.sawReverseBuildDown = true;
        if (alpha.every((value) => value <= 0.001)) result.allRowsGone = true;
        backgrounds.forEach((node, index) => {
          const value = Number(getComputedStyle(node).opacity);
          if (value > 0 && value < baseline[index]! * 0.99) {
            result.fading[index] = true;
            if (!result.allRowsGone) result.backgroundFadedBeforeRows = true;
          }
        });
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
      return result;
    },
    { ids: backgrounds, baseline },
  );
  await app.stop();
  await clock.runFor(8_000);
  expect(await exit.jsonValue()).toEqual({
    started: Array.from({ length: 18 }, (_, index) => 17 - index),
    fading: [true, true],
    sawReverseBuildDown: true,
    outOfOrder: false,
    allRowsGone: true,
    backgroundFadedBeforeRows: false,
    scrimStayedHidden: true,
    settled: true,
  });
});
