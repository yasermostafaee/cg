import type { Frame, Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures/designer.js';

/**
 * 🔴 `DELTA-RUN-NEXT-VERSION-01-A` / `-B` / `-F` (and `D-141` tasks 7.1 / 7.2) — a countdown's STEPS,
 * authored and rehearsed through the Designer's own controls, measured in a real engine (golden rule
 * 12c: jsdom resolves no `var()`, so the colours are only provable here).
 *
 *   - The preset; a rectangle beside the countdown and one inside a NESTED composition each set to
 *     turn red at the 10-minute step through the ELEMENT's own door; a composition instance that
 *     STARTS HIDDEN and is shown by that step — rehearsed at ×600: the step attribute is written once
 *     per crossing, both rectangles and the digits turn red, and the instance plays its own entrance.
 *   - The target exposed as `targetTime` by default, its default following the typed target:
 *     updating the field live re-targets the running countdown without rebuilding it.
 *   - A step SHOWN in the preview with nothing running: its changes appear at once.
 */

/** A local `HH:mm` `minutes` from now, read in the PAGE's clock (the one the countdown uses). */
async function timeIn(page: Page, minutes: number): Promise<string> {
  return page.evaluate((m) => {
    const d = new Date(Date.now() + m * 60_000);
    const p = (n: number): string => String(n).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}`;
  }, minutes);
}

/**
 * Type a time of day into the countdown's target — `DELTA-RUN-NEXT-VERSION-01-B` §2's typed
 * segments, one per unit, each committed with Enter as an operator would.
 */
async function setTargetTime(inspector: Locator, hhmm: string): Promise<void> {
  const [hour = '', minute = ''] = hhmm.split(':');
  for (const [unit, value] of [
    ['hour', hour],
    ['minute', minute],
  ] as const) {
    const box = inspector.getByRole('textbox', {
      name: `Countdown target time of day ${unit}`,
      exact: true,
    });
    await box.fill(value);
    await box.press('Enter');
  }
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

/** `-H` — the Steps dialog (the shared Modal), whichever door opened it. */
function stepsDialog(page: Page): Locator {
  return page.getByRole('dialog', { name: /^Steps of / });
}

/**
 * Through the ELEMENT's door (`Edit in steps…`, the dialog filtered to it): in step `token`, add a
 * change for this element; answers its table row. The dialog stays open.
 */
async function addChangeAt(page: Page, token: string): Promise<Locator> {
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await expect(inspector.getByTestId('element-steps')).toBeVisible();
  await inspector.getByTestId('element-steps-edit').click();
  const dialog = stepsDialog(page);
  await dialog.getByTestId(`steps-row-${token}`).click();
  await dialog.getByTestId('steps-add-change').click();
  return dialog.locator('[data-testid="step-changes"] [data-change]').last();
}

/** Through the ELEMENT's door: in step `token`, turn this element's fill to the default red. */
async function redFillAt(page: Page, token: string): Promise<void> {
  const change = await addChangeAt(page, token);
  await change.getByRole('combobox', { name: 'property' }).selectOption('fill');
  await stepsDialog(page).getByRole('button', { name: 'Done' }).click();
}

/** The countdown's preset, from its own door. */
async function applyPreset(page: Page): Promise<void> {
  await page.getByRole('complementary', { name: 'Inspector' }).getByTestId('steps-edit').click();
  const dialog = stepsDialog(page);
  await dialog.getByTestId('steps-preset').click();
  // Three steps, below the Default row that is always offered first.
  await expect(dialog.locator('[data-step]:not([data-step="b"])')).toHaveCount(3);
  await dialog.getByRole('button', { name: 'Done' }).click();
}

test.describe('-A / -B / -F — a countdown’s steps in the Designer', () => {
  test('🔴 rehearsed ×600: one step write per crossing; a top-level AND a nested rectangle turn red; a hidden instance enters', async ({
    app,
  }) => {
    test.setTimeout(150_000);
    await app.newProject('Steps');

    // A shared child composition with a plain rectangle in it, and a "warning" composition.
    await app.newComposition('Badge');
    await app.openComposition('Badge');
    await app.addRectangle({ x: 200, y: 150 });
    await app.newComposition('Warn');
    await app.openComposition('Warn');
    await app.addRectangle({ x: 220, y: 160 });

    // The host is the project's own composition. (Every canvas click stays inside the canvas;
    // selections after placing go through the timeline rows.)
    await app.openComposition('comp1');
    await app.addRectangle({ x: 320, y: 190 });
    const [hostRect] = await app.timelineRowIds();
    if (hostRect === undefined) throw new Error('no rectangle in comp1');

    // A countdown to a time of day ~62 minutes ahead, with the preset.
    await app.addClock({ x: 120, y: 60 });
    const inspector = app.inspector;
    await inspector.getByRole('combobox', { name: 'mode' }).selectOption('countdown');
    await inspector.getByRole('combobox', { name: 'target' }).selectOption('timeofday');
    await setTargetTime(inspector, await timeIn(app.page, 62));
    await applyPreset(app.page);
    await expect(inspector.locator('[data-step-line]')).toHaveCount(3);

    // The top-level rectangle turns red at the 10-minute step — from ITS own Inspector.
    await app.selectElementById(hostRect);
    await redFillAt(app.page, '2');

    // The "Warn" composition, instanced here, waiting hidden for the 10-minute step.
    await app.nestCompositionInstance('Warn');
    const startsHidden = inspector.getByTestId('instance-starts-hidden');
    await startsHidden.getByRole('button', { name: 'Yes' }).click();
    await expect(startsHidden.getByRole('button', { name: 'Yes' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(app.page.getByTestId('layer-starts-hidden')).toHaveCount(1);
    const warnId = (await app.timelineRowIds()).find((id) => id !== hostRect);
    if (warnId === undefined) throw new Error('no Warn instance');
    // …shown by the 10-minute step, from ITS own Inspector: a new change starts as show / hide.
    const warnChange = await addChangeAt(app.page, '2');
    await expect(warnChange.getByRole('combobox', { name: 'property' })).toHaveValue('visible');
    await warnChange.getByRole('combobox', { name: 'value' }).selectOption('show');
    await stepsDialog(app.page).getByRole('button', { name: 'Done' }).click();

    // The child composition, instanced here; its rectangle turns red too — from ITS own Inspector.
    await app.nestCompositionInstance('Badge');
    await app.openComposition('Badge');
    const [badgeRect] = await app.timelineRowIds();
    if (badgeRect === undefined) throw new Error('no rectangle in Badge');
    await app.selectElementById(badgeRect);
    await redFillAt(app.page, '2');

    // Rehearse the host.
    await app.openComposition('comp1');
    await app.page.keyboard.press('Escape');
    await app.openPreviewModal();
    await app.previewDialog.getByTestId('preview-step-rate').selectOption('600');
    const frame = await previewFrame(app.page);
    await expect
      .poll(() => frame.evaluate(() => document.querySelectorAll('[data-cg-step-root]').length))
      .toBeGreaterThan(0);
    // The hidden instance is hidden before anything runs.
    await expect
      .poll(() =>
        frame.evaluate(
          (id) =>
            document.querySelector<HTMLElement>(`[data-cg-element-id="${id}"]`)?.style.visibility,
          warnId,
        ),
      )
      .toBe('hidden');
    await frame.evaluate(() => {
      const w = window as unknown as { __stepWrites: string[] };
      w.__stepWrites = [];
      new MutationObserver((records) => {
        for (const r of records) {
          const value = (r.target as Element).getAttribute('data-cg-cd0');
          w.__stepWrites.push(value ?? '(cleared)');
        }
      }).observe(document.body, {
        subtree: true,
        attributes: true,
        attributeFilter: ['data-cg-cd0'],
      });
    });
    await app.play();

    // Three thresholds below 62 minutes: ONE write per crossing, in order.
    await expect
      .poll(
        () => frame.evaluate(() => (window as unknown as { __stepWrites: string[] }).__stepWrites),
        { timeout: 30_000 },
      )
      .toEqual(['0', '1', '2']);

    // Both rectangles — beside the clock, and inside the nested instance — take #d50000.
    const backgrounds = (): Promise<{ nested: boolean; background: string }[]> =>
      frame.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('[data-cg-step-el]')]
          .filter(
            (el) =>
              el.querySelector('[data-cg-clock-time]') === null &&
              el.dataset['cgCompositionId'] === undefined,
          )
          .map((el) => ({
            nested: el.closest('.cg-comp-inner') !== null,
            background: getComputedStyle(el).backgroundColor,
          })),
      );
    await expect.poll(backgrounds, { timeout: 5_000 }).toEqual(
      expect.arrayContaining([
        { nested: false, background: 'rgb(213, 0, 0)' },
        { nested: true, background: 'rgb(213, 0, 0)' },
      ]),
    );
    // The countdown's own digits took the preset's red.
    await expect
      .poll(() =>
        frame.evaluate(() => {
          const host = document.querySelector('[data-cg-clock-time]')?.parentElement;
          return host === null || host === undefined ? '' : getComputedStyle(host).color;
        }),
      )
      .toBe('rgb(213, 0, 0)');
    // 🔴 -F — the hidden instance was cued IN by the step: visible, its own entrance running.
    await expect
      .poll(() =>
        frame.evaluate(
          (id) =>
            document.querySelector<HTMLElement>(`[data-cg-element-id="${id}"]`)?.style.visibility,
          warnId,
        ),
      )
      .toBe('');
  });

  test('🔴 the target bound to a data key: a live update re-targets the running countdown without rebuilding it', async ({
    app,
  }) => {
    test.setTimeout(90_000);
    await app.newProject('StepsField');
    await app.addClock({ x: 240, y: 160 });
    const inspector = app.inspector;
    await inspector.getByRole('combobox', { name: 'mode' }).selectOption('countdown');
    await inspector.getByRole('combobox', { name: 'target' }).selectOption('timeofday');
    await setTargetTime(inspector, await timeIn(app.page, 62));
    // 🔴 -C §2 — a time-of-day target is the operator's by default: `targetTime`, and the field's
    // default follows the author's target (the preview below starts from that default).
    await expect(inspector.getByTestId('clock-target-field')).toContainText('targetTime');
    await expect(inspector.getByRole('textbox', { name: 'Countdown target data key' })).toHaveValue(
      'targetTime',
    );

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

    // The field's label is "Target time" (-C §2); its key stays `targetTime`.
    await app.setPreviewField('Target time', await timeIn(app.page, 5));
    await app.updatePreviewField('Target time');

    // Re-targeted: under five minutes now…
    await expect
      .poll(async () => latin((await clockText.textContent()) ?? ''), { timeout: 10_000 })
      .toMatch(/^00:0[0-4]:/);
    // …on the SAME node: no rebuild, no replay.
    await expect(app.previewFrame.locator('[data-cg-clock-time][data-e2e-live="yes"]')).toHaveCount(
      1,
    );
  });

  test('a step SHOWN in the preview with nothing running applies its changes at once', async ({
    app,
  }) => {
    test.setTimeout(90_000);
    await app.newProject('StepsShow');
    await app.addClock({ x: 240, y: 160 });
    const inspector = app.inspector;
    await inspector.getByRole('combobox', { name: 'mode' }).selectOption('countdown');
    await inspector.getByRole('combobox', { name: 'target' }).selectOption('timeofday');
    await setTargetTime(inspector, await timeIn(app.page, 62));
    await applyPreset(app.page);

    await app.openPreviewModal();
    const frame = await previewFrame(app.page);
    const colour = (): Promise<string> =>
      frame.evaluate(() => {
        const host = document.querySelector('[data-cg-clock-time]')?.parentElement;
        return host === null || host === undefined ? '' : getComputedStyle(host).color;
      });
    await app.previewDialog
      .getByTestId('preview-step-force')
      .selectOption({ label: '10 min · ≤ 10 min' });
    await expect.poll(colour).toBe('rgb(213, 0, 0)');
    await app.previewDialog
      .getByTestId('preview-step-force')
      .selectOption({ label: '30 min · ≤ 30 min' });
    await expect.poll(colour).toBe('rgb(255, 145, 0)');
  });
});
