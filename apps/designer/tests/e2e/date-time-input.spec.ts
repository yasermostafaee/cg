import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures/designer.js';

/**
 * 🔴 `DELTA-RUN-NEXT-VERSION-01-B` §2 / `-C` §1, `RUN-NEXT-VERSION-03` 2.1 — the shared date and time
 * control in the Designer, measured in a real engine (golden rule 12c: jsdom has no layout, so "fits at
 * 200 % text" and "keeps its order in RTL" are only provable here). Driven from the countdown's
 * Inspector, the Designer's door to it:
 *
 *   - ONE masked date input and ONE masked time input; keyboard only: typed digits commit, the owner's
 *     `1405/13/40` and `25:61` are refused with their reasons, ↑ steps the part under the caret, the
 *     calendar switch re-reads, `+5 min` aims five minutes ahead;
 *   - the calendar icon picks a day (right to left in Jalali), the clock icon picks a time, and `Now`;
 *   - at 1280×720 and at 200 % text nothing clips and the control stays inside the Inspector; in a
 *     right-to-left page the date still reads year first, left to right.
 */

const LABEL = 'Countdown target date and time';

const mask = (inspector: Locator, kind: 'date' | 'time'): Locator =>
  inspector.getByRole('textbox', { name: `${LABEL} ${kind}`, exact: true });

const PERSIAN = '۰۱۲۳۴۵۶۷۸۹';
const latin = (s: string): string =>
  [...s].map((c) => (PERSIAN.includes(c) ? String(PERSIAN.indexOf(c)) : c)).join('');

async function retype(page: Page, input: Locator, keys: string): Promise<void> {
  await input.focus();
  await page.keyboard.press('Control+a');
  await page.keyboard.type(keys);
}

async function countdown(app: {
  newProject: (n: string) => Promise<void>;
  addClock: (p: { x: number; y: number }) => Promise<void>;
  inspector: Locator;
}): Promise<Locator> {
  await app.newProject('DateTime');
  await app.addClock({ x: 240, y: 160 });
  const inspector = app.inspector;
  await inspector.getByRole('combobox', { name: 'mode' }).selectOption('countdown');
  await inspector.getByRole('combobox', { name: 'target' }).selectOption('datetime');
  await expect(mask(inspector, 'date')).toBeVisible();
  return inspector;
}

test.describe('-B / -C, RUN-NEXT-VERSION-03 2.1 — the date and time control', () => {
  test('🔴 keyboard only: two masked inputs, the owner’s refusals, ↑ steps, the calendar re-reads, +5 min aims ahead', async ({
    app,
  }) => {
    test.setTimeout(90_000);
    const inspector = await countdown(app);
    // One date input and one time input — not six boxes.
    await expect(inspector.getByTestId('datetime-input').locator('input')).toHaveCount(2);
    await expect(mask(inspector, 'date')).toHaveAttribute('placeholder', 'YYYY/MM/DD');

    // The calendar shown is Jalali by default (`RUN-NEXT-VERSION-03` 2.3 — the owner's word; the
    // stored choice stays `solar-hijri`); switch to Gregorian by keyboard.
    const calendar = inspector.getByTestId('datetime-calendar');
    await expect(calendar).toHaveValue('solar-hijri');
    await expect(calendar.locator('option:checked')).toHaveText('Jalali');

    // The owner's check, in Jalali: `1405/13/40` and `25:61` are refused, each with its reason.
    const refusal = inspector.locator('[data-datetime-refusal]');
    await retype(app.page, mask(inspector, 'date'), '1405/13/40');
    await expect(refusal).toHaveText('There is no month 13.');
    await retype(app.page, mask(inspector, 'time'), '25:61');
    await expect(refusal).toHaveText('Hours run from 00 to 23.');

    await calendar.focus();
    await calendar.selectOption('gregorian');
    await expect(calendar).toHaveValue('gregorian');

    // A whole Gregorian date and time, typed.
    await retype(app.page, mask(inspector, 'date'), '20300102');
    await retype(app.page, mask(inspector, 'time'), '030405');
    await expect
      .poll(async () => latin(await mask(inspector, 'date').inputValue()))
      .toBe('2030/01/02');
    await expect
      .poll(async () => latin(await mask(inspector, 'time').inputValue()))
      .toBe('03:04:05');
    await expect(refusal).toHaveCount(0);
    await expect(inspector.getByTestId('datetime-fact-solar-hijri')).toBeVisible();

    // ↑ on the minutes steps them by one.
    await mask(inspector, 'time').focus();
    await app.page.keyboard.press('Home');
    await app.page.keyboard.press('ArrowRight');
    await app.page.keyboard.press('ArrowRight');
    await app.page.keyboard.press('ArrowRight');
    await app.page.keyboard.press('ArrowUp');
    await expect
      .poll(async () => latin(await mask(inspector, 'time').inputValue()))
      .toBe('03:05:05');

    // +5 min aims five minutes from the page's own now.
    await inspector.getByRole('button', { name: '+5 min', exact: true }).click();
    const expected = await app.page.evaluate(() => {
      const d = new Date(Date.now() + 5 * 60_000);
      return [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()];
    });
    await expect
      .poll(async () => {
        const [y, mo, d] = latin(await mask(inspector, 'date').inputValue())
          .split('/')
          .map(Number);
        const [h, mi] = latin(await mask(inspector, 'time').inputValue())
          .split(':')
          .map(Number);
        const at = new Date(y ?? 0, (mo ?? 1) - 1, d, h, mi).getTime();
        const want = new Date(
          expected[0] ?? 0,
          (expected[1] ?? 1) - 1,
          expected[2],
          expected[3],
          expected[4],
        ).getTime();
        return Math.abs(at - want) <= 60_000;
      })
      .toBe(true);
  });

  test('🔴 the pickers: a day from the month (right to left in Jalali), a time from the clock, and Now', async ({
    app,
  }) => {
    test.setTimeout(90_000);
    const inspector = await countdown(app);
    await retype(app.page, mask(inspector, 'date'), '14051229');
    await retype(app.page, mask(inspector, 'time'), '214500');

    await inspector.getByRole('button', { name: 'Pick a date' }).click();
    const month = app.page.getByRole('dialog', { name: 'Pick a date' });
    await expect(month).toHaveAttribute('dir', 'rtl');
    await expect(month.locator('[data-datetime-day="29"]')).toHaveAttribute('aria-pressed', 'true');
    await month.locator('[data-datetime-day="28"]').click();
    await expect(month).toHaveCount(0);
    await expect
      .poll(async () => latin(await mask(inspector, 'date').inputValue()))
      .toBe('1405/12/28');

    await inspector.getByRole('button', { name: 'Pick a time' }).click();
    const clock = app.page.getByRole('dialog', { name: 'Pick a time' });
    await expect(clock.getByRole('button', { name: 'Hours 21' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await clock.getByRole('button', { name: 'Minutes 50' }).click();
    await expect
      .poll(async () => latin(await mask(inspector, 'time').inputValue()))
      .toBe('21:50:00');
    await clock.getByRole('button', { name: 'Now', exact: true }).click();
    await expect(clock).toHaveCount(0);
  });

  test('🔴 at 1280×720 and 200 % text nothing clips and the control stays inside the Inspector; RTL keeps year first, left to right', async ({
    app,
  }) => {
    test.setTimeout(90_000);
    await app.page.setViewportSize({ width: 1280, height: 720 });
    const inspector = await countdown(app);
    const control = inspector.getByTestId('datetime-input');
    const at = async (label: string): Promise<void> => {
      const box = await inspector.boundingBox();
      if (box === null) throw new Error('not laid out');
      for (const kind of ['date', 'time'] as const) {
        const input = mask(inspector, kind);
        const clipped = await input.evaluate(
          (el) => (el as HTMLInputElement).scrollWidth > (el as HTMLInputElement).clientWidth + 1,
        );
        expect(clipped, `${label}: the ${kind} clips its digits`).toBe(false);
        const b = await input.boundingBox();
        if (b === null) throw new Error(`${kind} not laid out`);
        expect(b.x + b.width, `${label}: the ${kind} leaves the Inspector`).toBeLessThanOrEqual(
          box.x + box.width + 1,
        );
        expect(b.x, `${label}: the ${kind} leaves the Inspector`).toBeGreaterThanOrEqual(box.x - 1);
      }
      const c = await control.boundingBox();
      if (c === null) throw new Error('control not laid out');
      expect(c.x + c.width, `${label}: the control leaves the Inspector`).toBeLessThanOrEqual(
        box.x + box.width + 1,
      );
    };
    await at('1280×720');
    const restHeight = (await mask(inspector, 'date').boundingBox())?.height ?? 0;
    await app.page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    // The positive control: the text really grew.
    await expect
      .poll(async () => (await mask(inspector, 'date').boundingBox())?.height ?? 0)
      .toBeGreaterThan(restHeight * 1.5);
    await at('200 % text');

    await app.page.evaluate(() => {
      document.documentElement.style.fontSize = '';
      document.documentElement.dir = 'rtl';
    });
    await at('RTL');
    expect(
      await mask(inspector, 'date').evaluate((el) => getComputedStyle(el).direction),
      'the date reads left to right in a right-to-left page',
    ).toBe('ltr');
    // Both pickers open inside the window.
    for (const name of ['Pick a date', 'Pick a time']) {
      await inspector.getByRole('button', { name }).click();
      const panel = app.page.getByRole('dialog', { name });
      await expect(panel).toBeVisible();
      const p = await panel.boundingBox();
      if (p === null) throw new Error(`${name} not laid out`);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x + p.width).toBeLessThanOrEqual(1280);
      expect(p.y + p.height).toBeLessThanOrEqual(720);
      await app.page.keyboard.press('Escape');
      await expect(panel).toHaveCount(0);
    }
  });
});
