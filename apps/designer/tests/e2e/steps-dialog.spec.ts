import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures/designer.js';
import type { DesignerApp } from './fixtures/designer.js';

/**
 * 🔴 `DELTA-RUN-NEXT-VERSION-01-H` — step editing lives in the Steps dialog; the Inspector keeps a
 * summary. Measured in a real engine (golden rule 12c): the drag, the canvas rehearsal, and the
 * dialog's fit at 1280 × 720, at 200 % text and in RTL with its footer inside it (`B-319`).
 */

function stepsDialog(page: Page): Locator {
  return page.getByRole('dialog', { name: /^Steps of / });
}

/** A rectangle, then a countdown of two hours (so "live" sits above every step) with the preset. */
async function seed(app: DesignerApp, name: string): Promise<{ rectId: string; clockId: string }> {
  await app.newProject(name);
  await app.addRectangle({ x: 320, y: 190 });
  const [rectId] = await app.timelineRowIds();
  if (rectId === undefined) throw new Error('no rectangle');
  await app.addClock({ x: 120, y: 60 });
  const clockId = (await app.timelineRowIds()).find((id) => id !== rectId);
  if (clockId === undefined) throw new Error('no clock');
  const inspector = app.inspector;
  await inspector.getByRole('combobox', { name: 'mode' }).selectOption('countdown');
  const duration = inspector.getByRole('spinbutton', { name: 'duration' });
  await duration.fill('7200');
  await duration.press('Enter');
  await inspector.getByTestId('steps-edit').click();
  await stepsDialog(app.page).getByTestId('steps-preset').click();
  await expect(stepsDialog(app.page).locator('[data-step]:not([data-step="b"])')).toHaveCount(3);
  return { rectId, clockId };
}

const stepNames = (dialog: Locator): Promise<string[]> =>
  dialog
    .locator('[data-step]:not([data-step="b"]) [data-testid^="steps-row-"] bdi')
    .evaluateAll((els) => els.map((e) => e.textContent ?? ''));

test.describe('-H — the Steps dialog', () => {
  test('🔴 add a step at 5 min that turns a rectangle red; delete its change by ⋯ and undo; drag, duplicate, delete a step and undo; the Inspector keeps only the summary', async ({
    app,
  }) => {
    test.setTimeout(120_000);
    const { rectId, clockId } = await seed(app, 'StepsDialog');
    const page = app.page;
    const dialog = stepsDialog(page);

    // + Add step → "Step 4" at ≤ 5 min, selected.
    await dialog.getByTestId('steps-add').click();
    await expect(dialog.getByTestId('steps-row-3')).toContainText('≤ 5 min');
    await expect(dialog.locator('[data-step="3"]')).toHaveAttribute('data-selected', 'true');
    // + Add change; point it at the rectangle's fill (the default red).
    await dialog.getByTestId('steps-add-change').click();
    const row = dialog.locator('[data-testid="step-changes"] [data-change]').last();
    await row.getByRole('combobox', { name: 'element' }).selectOption(rectId);
    await row.getByRole('combobox', { name: 'property' }).selectOption('fill');
    await expect(dialog.getByTestId('steps-row-3')).toContainText('1 change');

    // Delete the change by its ⋯ menu — words, naming its object — then Ctrl+Z.
    const trigger = row.locator('[aria-haspopup="menu"]');
    await expect(trigger).toHaveAttribute('aria-label', /^Actions for change: .* · fill$/);
    await trigger.click();
    await page.getByRole('menuitem', { name: /^Delete change: / }).click();
    await expect(dialog.locator('[data-testid="step-changes"] [data-change]')).toHaveCount(0);
    await expect(dialog.getByTestId('steps-notice')).toContainText('Deleted change:');
    await page.keyboard.press('Control+Z');
    await expect(dialog.locator('[data-testid="step-changes"] [data-change]')).toHaveCount(1);

    // Drag "60 min" onto "30 min": the steps swap, the thresholds stay in order; Ctrl+Z.
    await dialog
      .locator('[data-step="0"] [data-step-handle]')
      .dragTo(dialog.locator('[data-step="1"]'));
    await expect.poll(() => stepNames(dialog)).toEqual(['30 min', '60 min', '10 min', 'Step 4']);
    await expect(dialog.getByTestId('steps-row-0')).toContainText('≤ 60 min');
    await dialog.locator('[data-step="0"] [data-step-handle]').focus();
    await page.keyboard.press('Control+Z');
    await expect.poll(() => stepNames(dialog)).toEqual(['60 min', '30 min', '10 min', 'Step 4']);

    // Duplicate and Delete, by the ⋯ menu.
    await dialog.getByTestId('steps-row-menu-0').click();
    await page.getByRole('menuitem', { name: 'Duplicate step “60 min”' }).click();
    await expect
      .poll(() => stepNames(dialog))
      .toEqual(['60 min', '60 min copy', '30 min', '10 min', 'Step 4']);
    await dialog.getByTestId('steps-row-menu-1').click();
    await page.getByRole('menuitem', { name: 'Delete step “60 min copy”' }).click();
    await expect.poll(() => stepNames(dialog)).toEqual(['60 min', '30 min', '10 min', 'Step 4']);
    await dialog.getByTestId('steps-notice').getByRole('button', { name: 'Undo' }).click();
    await expect
      .poll(() => stepNames(dialog))
      .toEqual(['60 min', '60 min copy', '30 min', '10 min', 'Step 4']);

    // Done: the Inspector shows only the summary lines. (An undo clears the selection — the dialog
    // outlived that; the countdown is selected again to read its Inspector.)
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(dialog).toHaveCount(0);
    await app.selectElementById(clockId);
    const summary = app.inspector.getByTestId('countdown-steps');
    await expect(summary.locator('[data-step-line]')).toHaveCount(5);
    await expect(summary.locator('[data-step-line="4"]')).toContainText('≤ 5 min · 1 change');
    await expect(summary.locator('[data-change]')).toHaveCount(0);
    await expect(summary.getByRole('spinbutton')).toHaveCount(0);

    // The rectangle's own door opens the same dialog, filtered to it.
    await app.selectElementById(rectId);
    await app.inspector.getByTestId('element-steps-edit').click();
    await expect(dialog.getByRole('combobox', { name: 'element filter' })).toHaveValue(rectId);
    await expect(dialog.locator('[data-step="4"]')).toHaveAttribute('data-selected', 'true');
    await expect(dialog.locator('[data-testid="step-changes"] [data-change]')).toHaveCount(1);
  });

  test('🔴 the rehearse strip shows a step on the CANVAS while the dialog is open; Done hands it back to live', async ({
    app,
  }) => {
    test.setTimeout(90_000);
    await seed(app, 'StepsRehearse');
    const dialog = stepsDialog(app.page);
    const stepAttr = (): Promise<string | null> =>
      app.canvasFrame
        .locator('[data-cg-step-root]')
        .first()
        .evaluate((el) => {
          const attr = [...el.attributes].find((a) => a.name.startsWith('data-cg-cd'));
          return attr === undefined ? null : attr.value;
        });
    const digitsColour = (): Promise<string> =>
      app.canvasFrame
        .locator('[data-cg-clock-time]')
        .first()
        .evaluate((el) => getComputedStyle(el.parentElement ?? el).color);

    await dialog.getByTestId('steps-rehearse').locator('[data-rehearse="2"]').click();
    await expect.poll(stepAttr).toBe('2');
    await expect.poll(digitsColour).toBe('rgb(213, 0, 0)');
    await dialog.getByTestId('steps-rehearse').locator('[data-rehearse="0"]').click();
    await expect.poll(digitsColour).toBe('rgb(255, 214, 0)');
    await dialog.getByRole('button', { name: 'Done' }).click();
    // Two hours remain: above every step — live publishes none.
    await expect.poll(stepAttr).toBeNull();
  });

  test('🔴 the dialog fits at 1280 × 720, at 200 % text and in RTL — the footer inside it, nothing past its edge', async ({
    app,
  }) => {
    test.setTimeout(90_000);
    await app.page.setViewportSize({ width: 1280, height: 720 });
    await seed(app, 'StepsFit');
    const dialog = stepsDialog(app.page);
    // A change in the table, so every part of the dialog is on screen.
    await dialog.getByTestId('steps-add-change').click();

    const measure = (): Promise<{
      inViewport: boolean;
      footerInside: boolean;
      bodyOverflowX: number;
      doneVisible: boolean;
    }> =>
      dialog.evaluate((box) => {
        const r = box.getBoundingClientRect();
        const done = [...box.querySelectorAll('button')].find((b) => b.textContent === 'Done');
        const d = done?.getBoundingClientRect();
        const body = done?.parentElement?.previousElementSibling as HTMLElement | null;
        return {
          inViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
          footerInside:
            d !== undefined &&
            d.left >= r.left &&
            d.right <= r.right &&
            d.top >= r.top &&
            d.bottom <= r.bottom,
          bodyOverflowX: body === null ? -1 : body.scrollWidth - body.clientWidth,
          doneVisible: d !== undefined && d.width > 0 && d.height > 0,
        };
      });

    for (const setup of [
      { label: '1280 × 720', apply: (): void => undefined },
      {
        label: '200 % text',
        apply: (): void => {
          document.documentElement.style.fontSize = '200%';
        },
      },
      {
        label: 'RTL at 200 %',
        apply: (): void => {
          document.documentElement.dir = 'rtl';
        },
      },
    ]) {
      await app.page.evaluate(setup.apply);
      const m = await measure();
      expect(m.inViewport, `${setup.label}: the dialog leaves the viewport`).toBe(true);
      expect(m.doneVisible, `${setup.label}: Done is not laid out`).toBe(true);
      expect(m.footerInside, `${setup.label}: the footer spills out of the dialog`).toBe(true);
      expect(m.bodyOverflowX, `${setup.label}: the body scrolls sideways`).toBeLessThanOrEqual(0);
    }
  });

  test('🔴 the owner’s two: a colour picker opened in the dialog draws ABOVE it, and Escape closes only the picker; the Default row sets the countdown’s default colour', async ({
    app,
  }) => {
    test.setTimeout(90_000);
    await seed(app, 'StepsPicker');
    const page = app.page;
    const dialog = stepsDialog(page);

    // The Default row: choose it, Add change — the countdown's own text colour.
    await dialog.getByTestId('steps-row-b').click();
    await dialog.getByTestId('steps-add-change').click();
    const row = dialog.locator('[data-testid="step-changes"] [data-change]').last();
    await expect(row.getByRole('combobox', { name: 'property' })).toHaveValue('textColor');
    await expect(dialog.getByTestId('steps-row-b')).toContainText('1 change');

    // Its colour cell opens the picker — on TOP of the dialog, measured where it is drawn.
    await row.getByRole('button', { name: 'value colour' }).click();
    const picker = page.getByRole('dialog', { name: 'Colour picker' });
    await expect(picker).toBeVisible();
    const onTop = await picker.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hit !== null && el.contains(hit);
    });
    expect(onTop, 'the picker is drawn under the dialog').toBe(true);

    // Escape closes the picker, and the Steps dialog stays.
    await page.keyboard.press('Escape');
    await expect(picker).toHaveCount(0);
    await expect(dialog).toBeVisible();
  });
});
