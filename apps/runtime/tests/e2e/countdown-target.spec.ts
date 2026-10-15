import { buildCountdownVcg, expect, test } from './fixtures/runtime.js';
import type { Locator, Page } from '@playwright/test';

/**
 * 🔴 `DELTA-RUN-NEXT-VERSION-01-C` (with `-B` §2) — **THE OPERATOR SETS A COUNTDOWN'S TARGET IN CG
 * CONTROL**, in a real browser.
 *
 * A template whose countdown target is a field (`clock-target` binding, `datetime` target) is
 * imported; CG Control's import marks the field and the Inspector shows the shared date and time
 * control instead of a text box. Driven as the owner described it:
 *
 *  1. the author's target is in the past, so the row says so — `Target passed … · counts past zero`;
 *  2. a date and time typed with the KEYBOARD ONLY in Solar Hijri (the default) — focus, digits, Tab,
 *     Up / Down — stores one instant, and the passed fact goes;
 *  3. Gregorian and Lunar Hijri show the SAME day — 1405/12/29 = 20 March 2027 = 12 Shawwal 1448 —
 *     in the segments and in the facts beside them;
 *  4. `+5 min` sets now plus five minutes, and Update sends exactly that instant as the row's value;
 *  5. a past value is stated as passed again — and Update is still offered (the Take is never refused).
 */

const TEMPLATE_ID = 'tpl-e2e-countdown';

function control(inspector: Locator): Locator {
  return inspector.getByRole('group', { name: 'targetTime' });
}

const segment = (c: Locator, name: string): Locator =>
  c.locator(`[data-datetime-segment="${name}"]`);

async function segments(c: Locator): Promise<string[]> {
  const out: string[] = [];
  for (const s of ['year', 'month', 'day', 'hour', 'minute', 'second']) {
    out.push(await segment(c, s).inputValue());
  }
  return out;
}

/** Record every `stack.update` request the console sends from now on. */
async function spyOnUpdates(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {
      __updates: unknown[];
      cg: { stack: { update: (req: unknown) => Promise<unknown> } };
    };
    w.__updates = [];
    const orig = w.cg.stack.update.bind(w.cg.stack);
    w.cg.stack.update = (req: unknown) => {
      w.__updates.push(req);
      return orig(req);
    };
  });
}

const updates = (page: Page): Promise<{ fields?: Record<string, unknown> }[]> =>
  page.evaluate(
    () => (window as unknown as { __updates: { fields?: Record<string, unknown> }[] }).__updates,
  );

test('a countdown target: typed in Solar Hijri, read in three calendars, +5 min, and a passed target stated', async ({
  app,
}) => {
  const page = app.page;
  await app.importVcg('countdown.vcg', await buildCountdownVcg(TEMPLATE_ID));
  await app.selectStackRow(TEMPLATE_ID);

  const c = control(app.inspector);
  await expect(c, 'the target field is the date and time control').toBeVisible();
  await expect(c).toHaveAttribute('data-datetime-input', 'datetime');
  await expect(c.locator('[data-calendar-choice="solar-hijri"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // ── 1. The author's target is in the past: the row says so, in the author's After zero. ──
  const past = app.inspector.locator('[data-countdown-past]');
  await expect(past).toHaveText(/^Target passed .+ ago · counts past zero$/);

  // ── 2. KEYBOARD ONLY, in Solar Hijri: focus the first segment, then digits and Tab. ──
  await segment(c, 'year').focus();
  await page.keyboard.type('1405');
  await page.keyboard.press('Tab');
  await page.keyboard.type('12');
  await page.keyboard.press('Tab');
  await page.keyboard.type('29');
  await page.keyboard.press('Tab');
  await page.keyboard.type('20');
  await page.keyboard.press('Tab');
  await page.keyboard.type('45');
  await page.keyboard.press('Tab');
  await page.keyboard.type('00');
  // Up / Down step the focused segment: back on the hours, 20 → 21.
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('ArrowUp');
  await expect(segment(c, 'hour')).toHaveValue('۲۱');
  // Persian digits in Solar Hijri, written whole.
  expect(await segments(c)).toEqual(['۱۴۰۵', '۱۲', '۲۹', '۲۱', '۴۵', '۰۰']);
  await expect(past, 'a target ahead is not passed').toHaveCount(0);

  // ── 3. The same day in the other two calendars, as facts — and then shown in each. ──
  const facts = c.locator('[data-datetime-facts]');
  await expect(facts.getByTestId('datetime-fact-gregorian')).toContainText('20 March 2027');
  await expect(facts.getByTestId('datetime-fact-lunar-hijri')).toContainText('۱۲ شوال ۱۴۴۸');

  await c.locator('[data-calendar-choice="gregorian"]').click();
  await expect(c.locator('[data-calendar-choice="gregorian"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect.poll(() => segments(c)).toEqual(['2027', '03', '20', '21', '45', '00']);
  await expect(facts.getByTestId('datetime-fact-solar-hijri')).toContainText('۲۹ اسفند ۱۴۰۵');
  await expect(facts.getByTestId('datetime-fact-lunar-hijri')).toContainText('۱۲ شوال ۱۴۴۸');

  await c.locator('[data-calendar-choice="lunar-hijri"]').click();
  await expect.poll(() => segments(c)).toEqual(['۱۴۴۸', '۱۰', '۱۲', '۲۱', '۴۵', '۰۰']);
  await expect(facts.getByTestId('datetime-fact-gregorian')).toContainText('20 March 2027');
  await expect(facts.getByTestId('datetime-fact-solar-hijri')).toContainText('۲۹ اسفند ۱۴۰۵');

  // The choice is remembered in this browser.
  expect(
    await page.evaluate(() => {
      try {
        return window.localStorage.getItem('cg.runtime.calendar.v1');
      } catch {
        return null;
      }
    }),
  ).toBe('lunar-hijri');
  await c.locator('[data-calendar-choice="solar-hijri"]').click();

  // ── 4. `+5 min`, then Update: the row's value is now + 5 min, to the second. ──
  await spyOnUpdates(page);
  const t0 = await page.evaluate(() => Date.now());
  await c.getByRole('button', { name: '+5 min' }).click();
  const t1 = await page.evaluate(() => Date.now());
  await app.applyEdits();
  await expect.poll(async () => (await updates(page)).length).toBe(1);
  const [sent] = await updates(page);
  const value = sent?.fields?.['targetTime'];
  expect(typeof value, 'the value sent is the stored ISO string').toBe('string');
  expect(String(value)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  const ms = Date.parse(String(value));
  expect(ms).toBeGreaterThanOrEqual(Math.floor((t0 + 300_000) / 1000) * 1000);
  expect(ms).toBeLessThanOrEqual(t1 + 300_000);
  await expect(past).toHaveCount(0);

  // ── 5. A past value is stated as passed — and nothing is refused. ──
  await segment(c, 'year').focus();
  await page.keyboard.type('1400');
  await page.keyboard.press('Tab');
  await expect(past).toHaveText(/^Target passed .+ ago · counts past zero$/);
  await expect(app.inspector.getByRole('button', { name: 'Apply staged edits' })).toBeEnabled();
});

/**
 * 🔴 `DELTA-RUN-NEXT-VERSION-01-B` §2 — the control at 200 % and in a right-to-left page, measured in
 * the engine (golden rule 12c). CG Control's type is px tokens, so a root font size would scale
 * nothing: 200 % is the operator's browser zoom (Ctrl +), applied as `zoom: 2` on the root.
 */
test('the date and time control fits at 200 % zoom and keeps year first in a right-to-left page', async ({
  app,
}) => {
  const page = app.page;
  await app.importVcg('countdown.vcg', await buildCountdownVcg(TEMPLATE_ID));
  await app.selectStackRow(TEMPLATE_ID);
  const c = control(app.inspector);
  await expect(c).toBeVisible();

  const units = ['year', 'month', 'day', 'hour', 'minute', 'second'];
  const yearHeight = async (): Promise<number> =>
    (await segment(c, 'year').boundingBox())?.height ?? 0;
  const atRest = await yearHeight();
  for (const [label, apply] of [
    ['100 %', (): void => undefined],
    [
      '200 % zoom',
      (): void => {
        (document.documentElement.style as unknown as { zoom: string }).zoom = '2';
      },
    ],
    [
      'RTL at 200 %',
      (): void => {
        document.documentElement.dir = 'rtl';
      },
    ],
  ] as const) {
    await page.evaluate(apply);
    await c.scrollIntoViewIfNeeded();
    const panel = await app.inspector.boundingBox();
    if (panel === null) throw new Error('the Inspector is not laid out');
    const xs: number[] = [];
    for (const unit of units) {
      const seg = segment(c, unit);
      const clipped = await seg.evaluate(
        (el) => (el as HTMLInputElement).scrollWidth > (el as HTMLInputElement).clientWidth + 1,
      );
      expect(clipped, `${label}: ${unit} clips its digits`).toBe(false);
      const box = await seg.boundingBox();
      if (box === null) throw new Error(`${label}: ${unit} is not laid out`);
      expect(box.x, `${label}: ${unit} leaves the Inspector`).toBeGreaterThanOrEqual(panel.x - 1);
      expect(box.x + box.width, `${label}: ${unit} leaves the Inspector`).toBeLessThanOrEqual(
        panel.x + panel.width + 1,
      );
      xs.push(box.x);
    }
    // The positive control: the zoom really applied — the year segment is twice as tall.
    if (label !== '100 %') {
      expect(await yearHeight(), `${label}: the zoom did not apply`).toBeGreaterThan(atRest * 1.8);
    }
    // The date reads year / month / day, left to right, whatever the page's direction.
    expect(xs[0], `${label}: year before month`).toBeLessThan(xs[1] ?? 0);
    expect(xs[1], `${label}: month before day`).toBeLessThan(xs[2] ?? 0);
  }
});
