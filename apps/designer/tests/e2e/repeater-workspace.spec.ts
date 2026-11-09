import { expect, test } from './fixtures/designer.js';

test.describe('Repeater authoring workspace', () => {
  test('many-column Preview rows share one scroll viewport with readable labelled inputs', async ({
    app,
  }, testInfo) => {
    await app.page.setViewportSize({ width: 1200, height: 850 });
    await app.page.getByTestId('starter-card').filter({ hasText: 'جدول لیگ برتر ایران' }).click();
    await app.expectStudio();
    await app.openPreviewModal();
    await expect(app.previewDialog.locator('[data-structured-rows]')).toHaveCount(0);
    await app.previewDialog.getByRole('button', { name: /Edit rows/ }).click();
    const dialog = app.page.getByRole('dialog', { name: 'Rows · ردیف‌های جدول', exact: true });
    const rows = dialog.locator('[data-structured-rows]');
    await expect(rows).toBeVisible();
    const geometry = await rows.evaluate((node) => {
      const inputs = [...node.querySelectorAll('input')].filter((input) => input.type !== 'hidden');
      const boxes = inputs.map((input) => input.getBoundingClientRect());
      const childScrollers = [...node.querySelectorAll('*')].filter((child) => {
        const style = getComputedStyle(child);
        return (
          (style.overflowX === 'auto' || style.overflowX === 'scroll') &&
          child.scrollWidth > child.clientWidth
        );
      });
      const firstRows = [...node.children]
        .filter((child) => child.querySelector('input'))
        .slice(0, 2);
      const before = firstRows.map((child) => child.getBoundingClientRect().x);
      node.scrollLeft = 120;
      const after = firstRows.map((child) => child.getBoundingClientRect().x);
      return {
        minimumWidth: Math.min(...boxes.map((box) => box.width)),
        minimumHeight: Math.min(...boxes.map((box) => box.height)),
        labels: inputs.every((input) => Boolean(input.closest('label')?.textContent?.trim())),
        childScrollers: childScrollers.length,
        overflow: node.scrollWidth > node.clientWidth,
        moved: before.map((x, index) => x - (after[index] ?? x)),
      };
    });
    expect(geometry.minimumWidth).toBeGreaterThan(120);
    expect(geometry.minimumHeight).toBeGreaterThanOrEqual(32);
    expect(geometry.labels).toBe(true);
    expect(geometry.childScrollers).toBe(0);
    expect(geometry.overflow).toBe(true);
    expect(geometry.moved).toEqual([120, 120]);
    await dialog.screenshot({ path: testInfo.outputPath('structured-row-editor.png') });
    await dialog.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(dialog).toHaveCount(0);
  });

  test('ordinary Canvas Play renders staggered Repeater entrances and Pause freezes the same run', async ({
    app,
  }) => {
    await app.page.getByTestId('starter-card').filter({ hasText: 'جدول لیگ برتر ایران' }).click();
    await app.expectStudio();
    const transport = app.page.getByLabel('Playback transport');
    const motion = app.canvasFrame.locator('[data-cg-repeater-motion]');
    await expect(motion.first()).toBeAttached();
    await transport.getByRole('button', { name: 'Play', exact: true }).click();
    const poses = () =>
      motion.evaluateAll((nodes) =>
        nodes.map((node) => ({
          opacity: (node as HTMLElement).style.opacity,
          visibility: (node as HTMLElement).style.visibility,
        })),
      );
    await expect
      .poll(
        async () => {
          const rows = await poses();
          return (
            rows.some((row) => row.opacity !== '' && Number(row.opacity) > 0) &&
            rows.some((row) => row.visibility === 'hidden')
          );
        },
        { intervals: [30] },
      )
      .toBe(true);
    await transport.getByRole('button', { name: 'Pause', exact: true }).click();
    const paused = await poses();
    await app.page.waitForTimeout(250);
    expect(await poses()).toEqual(paused);
    await transport.getByRole('button', { name: 'Play', exact: true }).click();
    await expect
      .poll(async () => (await poses()).every((row) => row.opacity === '' && row.visibility === ''))
      .toBe(true);
  });
});
