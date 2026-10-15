import type { Locator } from '@playwright/test';
import { expect, test } from './fixtures/designer.js';

/**
 * 🔴 `DELTA-RUN-NEXT-VERSION-01-B` §2 / `-C` §1 — the shared date and time control, measured in a real
 * engine (golden rule 12c: jsdom has no layout, so "fits at 200 % text" and "keeps its order in RTL"
 * are only provable here). Driven from the countdown's Inspector, the Designer's door to it.
 *
 *   - keyboard only: Tab walks the segments in order; typed digits commit on leaving a segment;
 *     ↑ steps one; the calendar switch re-reads the segments; `+5 min` aims five minutes ahead;
 *   - at 200 % text no segment clips its digits and the control stays inside the Inspector;
 *   - in a right-to-left page the segments keep their order, year first, left to right.
 */

const LABEL = 'Countdown target date and time';
const UNITS = ['year', 'month', 'day', 'hour', 'minute', 'second'] as const;

function segment(inspector: Locator, unit: (typeof UNITS)[number]): Locator {
  return inspector.getByRole('textbox', { name: `${LABEL} ${unit}`, exact: true });
}

async function values(inspector: Locator): Promise<string[]> {
  const out: string[] = [];
  for (const unit of UNITS) out.push(await segment(inspector, unit).inputValue());
  return out;
}

const PERSIAN = '۰۱۲۳۴۵۶۷۸۹';
const latin = (s: string): string =>
  [...s].map((c) => (PERSIAN.includes(c) ? String(PERSIAN.indexOf(c)) : c)).join('');

test.describe('-B / -C — the date and time control', () => {
  test('🔴 keyboard only: Tab walks the segments, typed digits commit, ↑ steps, the calendar re-reads, +5 min aims ahead', async ({
    app,
  }) => {
    test.setTimeout(90_000);
    await app.newProject('DateTime');
    await app.addClock({ x: 240, y: 160 });
    const inspector = app.inspector;
    await inspector.getByRole('combobox', { name: 'mode' }).selectOption('countdown');
    await inspector.getByRole('combobox', { name: 'target' }).selectOption('datetime');
    await expect(segment(inspector, 'year')).toBeVisible();

    // Tab walks year → month → day → hour → minute → second.
    await segment(inspector, 'year').focus();
    for (const unit of UNITS.slice(1)) {
      await app.page.keyboard.press('Tab');
      await expect(segment(inspector, unit)).toBeFocused();
    }

    // The calendar shown is Solar Hijri by default; switch to Gregorian by keyboard.
    const calendar = inspector.getByTestId('datetime-calendar');
    await expect(calendar).toHaveValue('solar-hijri');
    await calendar.focus();
    await calendar.selectOption('gregorian');
    await expect(calendar).toHaveValue('gregorian');
    await expect(inspector.getByTestId('datetime-fact-solar-hijri')).toBeVisible();

    // Type a whole Gregorian date and time, segment by segment, leaving each with Tab.
    const typed = ['2030', '01', '02', '03', '04', '05'];
    await segment(inspector, 'year').focus();
    for (const [i, value] of typed.entries()) {
      await app.page.keyboard.press('Control+A');
      await app.page.keyboard.type(value);
      if (i < typed.length - 1) await app.page.keyboard.press('Tab');
      else await app.page.keyboard.press('Enter');
    }
    await expect.poll(async () => (await values(inspector)).map(latin)).toEqual(typed);

    // ↑ steps the minute by one.
    await segment(inspector, 'minute').focus();
    await app.page.keyboard.press('ArrowUp');
    await expect
      .poll(async () => latin(await segment(inspector, 'minute').inputValue()))
      .toBe('05');

    // +5 min aims five minutes from the page's own now.
    await inspector.getByRole('button', { name: '+5 min', exact: true }).click();
    const expected = await app.page.evaluate(() => {
      const d = new Date(Date.now() + 5 * 60_000);
      return [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()];
    });
    await expect
      .poll(async () => {
        const v = (await values(inspector)).map((x) => Number(latin(x)));
        const at = new Date(v[0] ?? 0, (v[1] ?? 1) - 1, v[2], v[3], v[4]).getTime();
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

  test('🔴 at 200 % text no segment clips its digits and the control stays inside the Inspector; RTL keeps year first, left to right', async ({
    app,
  }) => {
    test.setTimeout(90_000);
    await app.newProject('DateTimeFit');
    await app.addClock({ x: 240, y: 160 });
    const inspector = app.inspector;
    await inspector.getByRole('combobox', { name: 'mode' }).selectOption('countdown');
    await inspector.getByRole('combobox', { name: 'target' }).selectOption('datetime');
    await expect(segment(inspector, 'year')).toBeVisible();

    await app.page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    const control = inspector.getByTestId('datetime-input');
    for (const unit of UNITS) {
      const clipped = await segment(inspector, unit).evaluate(
        (el) => (el as HTMLInputElement).scrollWidth > (el as HTMLInputElement).clientWidth + 1,
      );
      expect(clipped, `${unit} clips its digits at 200 %`).toBe(false);
    }
    const inspectorBox = await inspector.boundingBox();
    const controlBox = await control.boundingBox();
    if (inspectorBox === null || controlBox === null) throw new Error('not laid out');
    expect(controlBox.x).toBeGreaterThanOrEqual(inspectorBox.x - 1);
    expect(controlBox.x + controlBox.width).toBeLessThanOrEqual(
      inspectorBox.x + inspectorBox.width + 1,
    );
    for (const unit of UNITS) {
      const box = await segment(inspector, unit).boundingBox();
      if (box === null) throw new Error(`${unit} not laid out`);
      expect(box.x + box.width, `${unit} leaves the Inspector`).toBeLessThanOrEqual(
        inspectorBox.x + inspectorBox.width + 1,
      );
    }

    await app.page.evaluate(() => {
      document.documentElement.style.fontSize = '';
      document.documentElement.dir = 'rtl';
    });
    const xs: number[] = [];
    for (const unit of ['year', 'month', 'day'] as const) {
      const box = await segment(inspector, unit).boundingBox();
      if (box === null) throw new Error(`${unit} not laid out`);
      xs.push(box.x);
    }
    expect(xs[0]).toBeLessThan(xs[1] ?? 0);
    expect(xs[1]).toBeLessThan(xs[2] ?? 0);
  });
});
