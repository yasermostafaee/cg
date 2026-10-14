import type { Frame, Page } from '@playwright/test';
import { expect, test } from './fixtures/designer.js';

/**
 * 🔴 `AZAN-DESIGNER-01` (`D-141` tasks 7.1 / 7.2) — the Azan countdown, authored and rehearsed
 * through the Designer's own controls, measured in a real engine (golden rule 12c: jsdom resolves
 * neither `var()` nor the cascade, so the colours are only provable here).
 *
 *   - 7.1 A `timeofday` countdown with the 4-zone preset, an opted-in rectangle beside it and one
 *     inside a NESTED composition, rehearsed at ×600: the zone flips once per boundary, and both
 *     rectangles take the critical zone's colour.
 *   - 7.2 The target bound to a data key: updating the field live re-targets the running countdown
 *     without rebuilding it.
 */

/** A local `HH:mm` `minutes` from now, read in the PAGE's clock (the one the countdown uses). */
async function timeIn(page: Page, minutes: number): Promise<string> {
  return page.evaluate((m) => {
    const d = new Date(Date.now() + m * 60_000);
    const p = (n: number): string => String(n).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}`;
  }, minutes);
}

const PERSIAN = '۰۱۲۳۴۵۶۷۸۹';
const latin = (s: string): string =>
  [...s].map((c) => (PERSIAN.includes(c) ? String(PERSIAN.indexOf(c)) : c)).join('');

async function previewFrame(page: Page): Promise<Frame> {
  const handle = await page
    .getByRole('dialog', { name: 'Composition preview' })
    .locator('iframe')
    .elementHandle();
  const frame = await handle?.contentFrame();
  if (frame === null || frame === undefined) throw new Error('no preview frame');
  return frame;
}

test.describe('D-141 — the Azan countdown in the Designer', () => {
  test('🔴 7.1 rehearsed ×600: one zone write per boundary, and a top-level AND a nested element restyle', async ({
    app,
  }) => {
    test.setTimeout(120_000);
    await app.newProject('Azan');

    // A shared child composition with a plain rectangle in it.
    await app.newComposition('Badge');
    await app.openComposition('Badge');
    await app.addRectangle({ x: 200, y: 150 });

    // The host is the project's own composition. (Every canvas click stays inside the 464 × 261
    // canvas this viewport gives; selections after placing go through the timeline rows.)
    await app.openComposition('comp1');
    await app.addRectangle({ x: 320, y: 190 });
    const [hostRect] = await app.timelineRowIds();
    if (hostRect === undefined) throw new Error('no rectangle in comp1');

    // A countdown to a time of day ~62 minutes ahead, with the Azan preset.
    await app.addClock({ x: 120, y: 60 });
    const inspector = app.inspector;
    await inspector.getByRole('combobox', { name: 'mode' }).selectOption('countdown');
    await inspector.getByRole('combobox', { name: 'target' }).selectOption('timeofday');
    const time = inspector.getByRole('textbox', { name: 'Countdown target time of day' });
    await time.fill(await timeIn(app.page, 62));
    await time.press('Enter');
    await inspector.getByTestId('zones-azan-preset').click();
    await expect(inspector.locator('[data-zone-step]')).toHaveCount(3);

    // The top-level rectangle takes the critical zone's colour.
    await app.selectElementById(hostRect);
    await expect(inspector.getByTestId('zone-overrides')).toBeVisible();
    await inspector.getByTestId('zone-overrides-add').click();
    await inspector
      .getByTestId('zone-overrides')
      .getByRole('combobox', { name: 'in zone' })
      .selectOption('critical');

    // The child composition, instanced here.
    await app.nestCompositionInstance('Badge');

    // Drill INTO the child to opt its rectangle in (design §7.2: never from the parent).
    await app.openComposition('Badge');
    const [badgeRect] = await app.timelineRowIds();
    if (badgeRect === undefined) throw new Error('no rectangle in Badge');
    await app.selectElementById(badgeRect);
    await expect(inspector.getByTestId('zone-overrides')).toBeVisible();
    await inspector.getByTestId('zone-overrides-add').click();
    await inspector
      .getByTestId('zone-overrides')
      .getByRole('combobox', { name: 'in zone' })
      .selectOption('critical');

    // Rehearse the host.
    await app.openComposition('comp1');
    await app.page.keyboard.press('Escape');
    await app.openPreviewModal();
    await app.previewDialog.getByTestId('preview-zone-rate').selectOption('600');
    const frame = await previewFrame(app.page);
    await expect
      .poll(() => frame.evaluate(() => document.querySelectorAll('[data-cg-zone-root]').length))
      .toBeGreaterThan(0);
    await frame.evaluate(() => {
      const w = window as unknown as { __zoneWrites: string[] };
      w.__zoneWrites = [];
      new MutationObserver((records) => {
        for (const r of records) {
          const value = (r.target as Element).getAttribute('data-cg-zone');
          if (value !== null) w.__zoneWrites.push(value);
        }
      }).observe(document.body, {
        subtree: true,
        attributes: true,
        attributeFilter: ['data-cg-zone'],
      });
    });
    await app.play();

    // Four zones, three boundaries: the run's establishing write, then ONE write per crossing.
    await expect
      .poll(
        () => frame.evaluate(() => (window as unknown as { __zoneWrites: string[] }).__zoneWrites),
        { timeout: 30_000 },
      )
      .toEqual(['normal', 'caution', 'warning', 'critical']);

    // Both rectangles — beside the clock, and inside the nested instance — take #d50000.
    const shapeColours = (): Promise<{ nested: boolean; background: string }[]> =>
      frame.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('[data-cg-zone-el]')]
          .filter((el) => el.querySelector('[data-cg-clock-time]') === null)
          .map((el) => ({
            nested: el.closest('.cg-comp-inner') !== null,
            background: getComputedStyle(el).backgroundColor,
          })),
      );
    await expect.poll(shapeColours, { timeout: 5_000 }).toEqual(
      expect.arrayContaining([
        { nested: false, background: 'rgb(213, 0, 0)' },
        { nested: true, background: 'rgb(213, 0, 0)' },
      ]),
    );
    // The clock's own text took the critical colour too (the preset's clock overrides).
    await expect
      .poll(() =>
        frame.evaluate(() => {
          const clock = document.querySelector('[data-cg-clock-time]');
          const host = clock?.closest<HTMLElement>('[data-cg-zone-el]');
          return host === null || host === undefined ? '' : getComputedStyle(host).color;
        }),
      )
      .toBe('rgb(213, 0, 0)');
  });

  test('🔴 7.2 the target bound to a data key: a live update re-targets the running countdown without rebuilding it', async ({
    app,
  }) => {
    test.setTimeout(90_000);
    await app.newProject('AzanField');
    await app.addClock({ x: 240, y: 160 });
    const inspector = app.inspector;
    await inspector.getByRole('combobox', { name: 'mode' }).selectOption('countdown');
    await inspector.getByRole('combobox', { name: 'target' }).selectOption('timeofday');
    const time = inspector.getByRole('textbox', { name: 'Countdown target time of day' });
    await time.fill(await timeIn(app.page, 62));
    await time.press('Enter');
    const key = inspector.getByRole('textbox', { name: 'Countdown target data key' });
    await key.fill('azanTime');
    await key.press('Enter');
    await expect(inspector.getByTestId('clock-target-data-key')).toContainText('azanTime');

    await app.openPreviewModal();
    await app.play();
    const clockText = app.previewFrame.locator('[data-cg-clock-time]');
    await expect
      .poll(async () => latin((await clockText.textContent()) ?? ''))
      .toMatch(/^01:0[01]:/);

    // Mark the LIVE node: a rebuild (a replay through a new scene) would replace it.
    const frame = await previewFrame(app.page);
    await frame.evaluate(() =>
      document.querySelector('[data-cg-clock-time]')?.setAttribute('data-e2e-live', 'yes'),
    );

    await app.setPreviewField('azanTime', await timeIn(app.page, 5));
    await app.updatePreviewField('azanTime');

    // Re-targeted: under five minutes now…
    await expect
      .poll(async () => latin((await clockText.textContent()) ?? ''), { timeout: 10_000 })
      .toMatch(/^00:0[0-4]:/);
    // …on the SAME node: no rebuild, no replay.
    await expect(app.previewFrame.locator('[data-cg-clock-time][data-e2e-live="yes"]')).toHaveCount(
      1,
    );
  });
});
