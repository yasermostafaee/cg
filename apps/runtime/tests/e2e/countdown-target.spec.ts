import { buildCountdownVcg, expect, test } from './fixtures/runtime.js';
import type { Locator, Page } from '@playwright/test';

/**
 * 🔴 `DELTA-RUN-NEXT-VERSION-01-C` (with `-B` §2), `RUN-NEXT-VERSION-03` 2.1 — **THE OPERATOR SETS A
 * COUNTDOWN'S TARGET IN CG CONTROL**, in a real browser.
 *
 * A template whose countdown target is a field (`clock-target` binding, `datetime` target) is
 * imported; CG Control's import marks the field and the Inspector opens the shared date and time
 * control in a dialog: ONE masked date input and ONE masked time input, each with its picker
 * (the owner: six boxes were not good). Driven as the owner described it:
 *
 *  1. the author's target is in the past, so the row says so — `Target passed … · counts past zero`;
 *  2. the owner's check: `1405/13/40` is refused, `25:61` is refused, each with its reason; then a
 *     date and time typed with the KEYBOARD ONLY in Jalali (the default) — digits, Tab, Up — stores one
 *     instant, held in the dialog until Done;
 *  3. Gregorian and Lunar Hijri show the SAME day — 1405/12/29 = 20 March 2027 = 12 Shawwal 1448 —
 *     in the inputs and in the facts beside them;
 *  4. a date picked from the calendar, a time picked from the clock;
 *  5. `+5 min` and a custom duration use the same clock, and Update sends the staged instant;
 *  6. a past value is stated as passed again — and Update is still offered (the Take is never refused).
 */

const TEMPLATE_ID = 'tpl-e2e-countdown';

function targetDialog(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Edit countdown target', exact: true });
}

async function openControl(page: Page, inspector: Locator): Promise<Locator> {
  await inspector.getByRole('button', { name: 'Edit countdown target' }).click();
  const dialog = targetDialog(page);
  await expect(dialog).toBeVisible();
  return dialog.getByRole('group', { name: 'targetTime' });
}

const mask = (c: Locator, kind: 'date' | 'time'): Locator =>
  c.locator(`[data-datetime-mask="${kind}"]`);

async function both(c: Locator): Promise<[string, string]> {
  return [await mask(c, 'date').inputValue(), await mask(c, 'time').inputValue()];
}

/** Replace the input's whole text by typing `keys` — select all first, as an operator does. */
async function retype(page: Page, input: Locator, keys: string): Promise<void> {
  await input.focus();
  await page.keyboard.press('Control+a');
  await page.keyboard.type(keys);
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

test('🔴 a countdown target: two masked inputs, the owner’s refusals, three calendars, both pickers, +5 min, a passed target', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 720 });
  await app.importVcg('countdown.vcg', await buildCountdownVcg(TEMPLATE_ID));
  await app.selectStackRow(TEMPLATE_ID);

  await expect(app.inspector.locator('[data-countdown-target]')).toBeVisible();
  await expect(app.inspector.locator('[data-datetime-mask]')).toHaveCount(0);
  await expect(app.inspector.getByRole('button', { name: '+5 min' })).toHaveCount(0);
  const dialog = targetDialog(page);
  const c = await openControl(page, app.inspector);
  await expect(c, 'the target field is the date and time control').toBeVisible();
  await expect(c).toHaveAttribute('data-datetime-input', 'datetime');
  // One date input and one time input — not six boxes.
  await expect(c.locator('input')).toHaveCount(2);
  await expect(mask(c, 'date')).toHaveAttribute('placeholder', 'YYYY/MM/DD');
  await expect(mask(c, 'time')).toHaveAttribute('placeholder', 'HH:MM:SS');
  await expect(c.locator('[data-calendar-choice="solar-hijri"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // `RUN-NEXT-VERSION-03` 2.3 — the owner's word: Jalali (the stored choice stays `solar-hijri`).
  await expect(c.locator('[data-calendar-choice]')).toHaveText([
    'Jalali',
    'Gregorian',
    'Lunar Hijri',
  ]);

  // ── 1. The author's target is in the past: the row says so, in the author's After zero. ──
  const past = app.inspector.locator('[data-countdown-past]');
  await expect(past).toHaveText(/^Target passed .+ ago · counts past zero$/);

  // ── 2. The owner's check: `1405/13/40` and `25:61` are refused, each with its reason. ──
  const refusal = c.locator('[data-datetime-refusal]');
  await retype(page, mask(c, 'date'), '1405/13/40');
  await expect(refusal).toHaveText('There is no month 13.');
  await retype(page, mask(c, 'time'), '25:61');
  await expect(refusal).toHaveText('Hours run from 00 to 23.');
  await expect(past, 'nothing refused is stored').toHaveText(/^Target passed/);

  // KEYBOARD ONLY, in Jalali: the date, Tab past its picker, the time; Up on the hours.
  await retype(page, mask(c, 'date'), '14051229');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(mask(c, 'time')).toBeFocused();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('204500');
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowUp');
  // Persian digits in Jalali, the separators the mask's own.
  await expect.poll(() => both(c)).toEqual(['۱۴۰۵/۱۲/۲۹', '۲۱:۴۵:۰۰']);
  await expect(refusal, 'a whole value: the reason goes').toHaveCount(0);
  const done = dialog.getByRole('button', { name: 'Done' });
  await expect(done).toBeEnabled();
  await retype(page, mask(c, 'time'), '25');
  await expect(refusal).toHaveText('Hours run from 00 to 23.');
  await expect(done).toBeDisabled();
  await retype(page, mask(c, 'time'), '21');
  await expect(done).toBeDisabled();
  await retype(page, mask(c, 'time'), '214500');
  await expect(done).toBeEnabled();

  // ── 3. The same day in the other two calendars, as facts — and then shown in each. ──
  const facts = c.locator('[data-datetime-facts]');
  await expect(facts.getByTestId('datetime-fact-gregorian')).toContainText('20 March 2027');
  await expect(facts.getByTestId('datetime-fact-lunar-hijri')).toContainText('۱۲ شوال ۱۴۴۸');

  await c.locator('[data-calendar-choice="gregorian"]').click();
  await expect(c.locator('[data-calendar-choice="gregorian"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect.poll(() => both(c)).toEqual(['2027/03/20', '21:45:00']);
  await expect(facts.getByTestId('datetime-fact-solar-hijri')).toContainText('۲۹ اسفند ۱۴۰۵');
  await expect(facts.getByTestId('datetime-fact-solar-hijri')).toContainText('Jalali');

  await c.locator('[data-calendar-choice="lunar-hijri"]').click();
  await expect.poll(() => both(c)).toEqual(['۱۴۴۸/۱۰/۱۲', '۲۱:۴۵:۰۰']);
  await expect(facts.getByTestId('datetime-fact-gregorian')).toContainText('20 March 2027');

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
  await expect.poll(() => both(c)).toEqual(['۱۴۰۵/۱۲/۲۹', '۲۱:۴۵:۰۰']);

  // ── 4. A date from the calendar (Esfand, right to left), a time from the clock. ──
  await c.getByRole('button', { name: 'Pick a date' }).click();
  const datePanel = page.getByRole('dialog', { name: 'Pick a date' });
  await expect(datePanel.locator('[data-datetime-grid]')).toHaveAttribute('dir', 'rtl');
  await expect(datePanel.locator('[data-datetime-day="29"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await datePanel.locator('[data-datetime-day="28"]').click();
  await expect(datePanel).toHaveCount(0);
  await expect(mask(c, 'date')).toHaveValue('۱۴۰۵/۱۲/۲۸');

  await c.getByRole('button', { name: 'Pick a time' }).click();
  const clock = page.getByRole('dialog', { name: 'Pick a time' });
  await expect(clock.getByRole('button', { name: 'Hours 21' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await clock.getByRole('button', { name: 'Minutes 50' }).click();
  await expect(mask(c, 'time')).toHaveValue('۲۱:۵۰:۰۰');
  await clock.getByRole('button', { name: 'Now', exact: true }).click();
  await expect(clock).toHaveCount(0);

  // ── 5. `+5 min`, then Update: the row's value is now + 5 min, to the second. ──
  await spyOnUpdates(page);
  const t0 = await page.evaluate(() => Date.now());
  await c.getByRole('button', { name: '+5 min' }).click();
  const t1 = await page.evaluate(() => Date.now());
  expect(await updates(page)).toEqual([]);
  await dialog.getByRole('button', { name: 'Done' }).click();
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

  // Cancel discards a local custom target. Done stages it, and only Update sends it.
  const beforeCustom = await app.inspector.locator('[data-countdown-target]').textContent();
  await openControl(page, app.inspector);
  const custom = dialog.getByRole('textbox', { name: 'Custom duration', exact: true });
  const add = dialog.getByRole('button', { name: 'Add time', exact: true });
  await custom.fill('0:00:00');
  await expect(add).toBeDisabled();
  await custom.fill('۱:۳۰:۰۰');
  await add.click();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(app.inspector.locator('[data-countdown-target]')).toHaveText(beforeCustom ?? '');
  expect(await updates(page)).toHaveLength(1);
  await openControl(page, app.inspector);
  await custom.fill('۱:۳۰:۰۰');
  const customStart = await page.evaluate(() => Date.now());
  await add.click();
  const customEnd = await page.evaluate(() => Date.now());
  await dialog.getByRole('button', { name: 'Done' }).click();
  expect(await updates(page)).toHaveLength(1);
  await app.applyEdits();
  await expect.poll(async () => (await updates(page)).length).toBe(2);
  const [, customUpdate] = await updates(page);
  const customTarget = Date.parse(String(customUpdate?.fields?.['targetTime']));
  const ninetyMinutes = 90 * 60_000;
  expect(customTarget).toBeGreaterThanOrEqual(
    Math.floor((customStart + ninetyMinutes) / 1000) * 1000,
  );
  expect(customTarget).toBeLessThanOrEqual(customEnd + ninetyMinutes);

  // ── 6. A past value is stated as passed — and nothing is refused. ──
  await openControl(page, app.inspector);
  await retype(page, mask(c, 'date'), '14000101');
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(past).toHaveText(/^Target passed .+ ago · counts past zero$/);
  await expect(app.inspector.getByRole('button', { name: 'Apply staged edits' })).toBeEnabled();
});

/**
 * 🔴 `RUN-NEXT-VERSION-03` 2.2 — the owner: "switching to Solar Hijri takes a long time". With REAL
 * clicks, the switch back to the first calendar shown (Jalali) did not show until something else
 * re-rendered the control (the countdown field's 15-second refresh): the control set state during
 * render beside `useSyncExternalStore`, and React 18 kept a stale record of the calendar. Every switch
 * is timed here from the press to the pressed chip: under 50 ms measured on this host; the bound in the
 * test is looser so a loaded runner cannot fail it, and it still cannot pass the defect (which never
 * renders without another event).
 */
test('🔴 2.2 — Jalali, Gregorian and Lunar Hijri switch at once with real clicks, back to Jalali included', async ({
  app,
}) => {
  const page = app.page;
  await app.importVcg('countdown.vcg', await buildCountdownVcg(TEMPLATE_ID));
  await app.selectStackRow(TEMPLATE_ID);
  const c = await openControl(page, app.inspector);
  await expect(c).toBeVisible();
  await c.scrollIntoViewIfNeeded();
  const timings: number[] = [];
  for (const system of ['gregorian', 'lunar-hijri', 'solar-hijri', 'gregorian', 'solar-hijri']) {
    await page.evaluate((s) => {
      const w = window as unknown as { __pressAt: number; __shownAt: number };
      w.__pressAt = 0;
      w.__shownAt = 0;
      document.addEventListener('pointerdown', () => (w.__pressAt = performance.now()), {
        capture: true,
        once: true,
      });
      const target = document.querySelector(`[data-calendar-choice="${s}"]`);
      const obs = new MutationObserver(() => {
        if (target?.getAttribute('aria-pressed') === 'true') {
          w.__shownAt = performance.now();
          obs.disconnect();
        }
      });
      if (target !== null) obs.observe(target, { attributes: true });
    }, system);
    await c.locator(`[data-calendar-choice="${system}"]`).click();
    // No other event: the switch must show on its own.
    await expect(c.locator(`[data-calendar-choice="${system}"]`)).toHaveAttribute(
      'aria-pressed',
      'true',
      { timeout: 2_000 },
    );
    await expect(c).toHaveAttribute('data-datetime-calendar', system);
    timings.push(
      await page.evaluate(() => {
        const w = window as unknown as { __pressAt: number; __shownAt: number };
        return Math.round(w.__shownAt - w.__pressAt);
      }),
    );
  }
  test
    .info()
    .annotations.push({ type: 'switch ms (press → shown)', description: timings.join(', ') });
  for (const ms of timings) expect(ms).toBeLessThan(250);
  await expect(mask(c, 'date')).toHaveValue('۱۳۹۸/۱۰/۱۱');
});

async function inside(
  inner: Locator,
  outer: { x: number; y: number; width: number; height: number },
) {
  const b = await inner.boundingBox();
  if (b === null) return false;
  return (
    b.x >= outer.x - 1 &&
    b.y >= outer.y - 1 &&
    b.x + b.width <= outer.x + outer.width + 1 &&
    b.y + b.height <= outer.y + outer.height + 1
  );
}

/**
 * 🔴 `DELTA-RUN-NEXT-VERSION-01-B` §2, `RUN-NEXT-VERSION-03` 2.1 — the control at 1280×720, at 200 % and
 * in a right-to-left page, measured in the engine (golden rule 12c). CG Control's type is px tokens, so a
 * root font size would scale nothing: 200 % is the operator's browser zoom (Ctrl +), applied as
 * `zoom: 2` on the root. Each picker opens inside the window at 1280×720, in both directions.
 */
test('🔴 the date and time control fits at 1280×720, at 200 % zoom and in RTL; both pickers open inside the window', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 720 });
  await app.importVcg('countdown.vcg', await buildCountdownVcg(TEMPLATE_ID));
  await app.selectStackRow(TEMPLATE_ID);
  const c = await openControl(page, app.inspector);
  await expect(c).toBeVisible();
  const window = { x: 0, y: 0, width: 1280, height: 720 };
  // In view first, as an operator sees the field before pressing its icon: a scroll the click itself
  // started reaches the page a frame later, and the anchored panel closes on a scroll beneath it.
  await c.scrollIntoViewIfNeeded();
  await page.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
  );

  // The pickers, at 1280×720, left to right and right to left.
  for (const dir of ['ltr', 'rtl'] as const) {
    await page.evaluate((d) => {
      document.documentElement.dir = d;
    }, dir);
    for (const name of ['Pick a date', 'Pick a time']) {
      await c.getByRole('button', { name }).click();
      const panel = page.getByRole('dialog', { name });
      await expect(panel).toBeVisible();
      expect(await inside(panel, window), `${dir}: ${name} inside the window`).toBe(true);
      await page.keyboard.press('Escape');
      await expect(panel).toHaveCount(0);
    }
  }
  await page.evaluate(() => {
    document.documentElement.dir = 'ltr';
  });

  const timeHeight = async (): Promise<number> =>
    (await mask(c, 'time').boundingBox())?.height ?? 0;
  const atRest = await timeHeight();
  for (const [label, apply] of [
    ['1280×720', (): void => undefined],
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
    const panel = await targetDialog(page).boundingBox();
    if (panel === null) throw new Error('the countdown dialog is not laid out');
    const xs: number[] = [];
    for (const kind of ['date', 'time'] as const) {
      const input = mask(c, kind);
      const clipped = await input.evaluate(
        (el) => (el as HTMLInputElement).scrollWidth > (el as HTMLInputElement).clientWidth + 1,
      );
      expect(clipped, `${label}: the ${kind} clips its digits`).toBe(false);
      expect(await inside(input, panel), `${label}: the ${kind} leaves the dialog`).toBe(true);
      xs.push((await input.boundingBox())?.x ?? 0);
    }
    for (const name of ['Pick a date', 'Pick a time']) {
      expect(
        await inside(c.getByRole('button', { name }), panel),
        `${label}: ${name} leaves the dialog`,
      ).toBe(true);
    }
    // The positive control: the zoom really applied — the time input is twice as tall.
    if (label !== '1280×720') {
      expect(await timeHeight(), `${label}: the zoom did not apply`).toBeGreaterThan(atRest * 1.8);
    }
    // The date reads year / month / day left to right, whatever the page's direction.
    const year = await mask(c, 'date').evaluate((el) => {
      const input = el as HTMLInputElement;
      return getComputedStyle(input).direction;
    });
    expect(year, `${label}: the date input reads left to right`).toBe('ltr');
    if (label === '1280×720') expect(xs[0], 'the date before the time').toBeLessThan(xs[1] ?? 0);
  }
});
