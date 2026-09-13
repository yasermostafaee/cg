import { expect, test } from './fixtures/runtime.js';
import type { Page } from '@playwright/test';

/**
 * 🔴 `MODAL-CHROME-10` §2(b) + §4 — **THE MODAL FRAME: ITS CORNERS AND ITS HEIGHT.**
 *
 * Two owner defects on our own product, both about the FRAME rather than its contents, and
 * both invisible to every unit test in the tree: jsdom has no layout and no hit testing, so
 * `getBoundingClientRect` is zeros there and `elementFromPoint` answers nothing (golden rule
 * 12c). Measured in Chromium.
 *
 * ── §2(b) THE CORNERS ───────────────────────────────────────────────────────
 *
 * A rounded box does not clip its children. Every band that paints a ground of its own — the
 * head, the footer, Station setup's full-bleed rail — painted a SQUARE corner over the frame's
 * arc. `styles.dialog` now carries `overflow: hidden`; this is the assertion that it stays.
 *
 * **THE INSTRUMENT** is a hit test 2 px in from each corner — inside the frame's box, outside
 * its 14/16 px radius. If the frame clips, the topmost element there is the SCRIM behind it.
 *
 * ⚠ Two positive controls run with it, because a probe that returned "scrim" for everything
 * would pass this test while measuring nothing: a point deep inside the head band must return
 * the head band, and a point outside the dialog must return the scrim.
 *
 * ── §4 THE HEIGHT ───────────────────────────────────────────────────────────
 *
 * The picker and the audit log took their height from their content, so filtering resized the
 * frame under the operator's hand — measured before the fix at 792 / 484.1 / 457.3 for the
 * picker's three list states. They now take `fixed`'s discipline (`--r-modal-h-frame`), and
 * the assertion is that the box is IDENTICAL in every state that used to change it.
 */

interface Frame {
  readonly box: readonly [number, number, number, number];
  readonly tl: string;
  readonly tr: string;
  readonly bl: string;
  readonly br: string;
  readonly ctrlHead: string;
  readonly ctrlOutside: string;
}

async function frame(page: Page): Promise<Frame> {
  return page.evaluate(() => {
    const dialogs = [...document.querySelectorAll('[role="dialog"]')] as HTMLElement[];
    const d = dialogs[dialogs.length - 1];
    if (d === undefined) throw new Error('no dialog is open');
    const r = d.getBoundingClientRect();
    const name = (x: number, y: number): string => {
      const e = document.elementFromPoint(x, y);
      if (e === null) return 'NONE';
      if (e.hasAttribute('data-modal-layer')) return 'SCRIM';
      if (e === d) return 'THE-DIALOG';
      const cls = typeof e.className === 'string' ? e.className.trim() : '';
      return cls !== '' ? cls : e.tagName;
    };
    return {
      box: [+r.x.toFixed(1), +r.y.toFixed(1), +r.width.toFixed(1), +r.height.toFixed(1)] as [
        number,
        number,
        number,
        number,
      ],
      tl: name(r.left + 2, r.top + 2),
      tr: name(r.right - 2, r.top + 2),
      bl: name(r.left + 2, r.bottom - 2),
      br: name(r.right - 2, r.bottom - 2),
      ctrlHead: name(r.left + r.width / 2, r.top + 10),
      ctrlOutside: name(Math.max(2, r.left - 20), r.top + r.height / 2),
    };
  });
}

function expectClipped(f: Frame, where: string): void {
  const corners = [
    ['top-left', f.tl],
    ['top-right', f.tr],
    ['bottom-left', f.bl],
    ['bottom-right', f.br],
  ] as const;
  for (const [corner, hit] of corners) {
    expect(hit, `${where}: a child paints over the frame's ${corner} corner`).toBe('SCRIM');
  }
  // THE POSITIVE CONTROLS — without these, a probe that always answered SCRIM would pass.
  expect(
    f.ctrlHead,
    `${where}: the probe cannot see the head band, so it is measuring nothing`,
  ).not.toBe('SCRIM');
  expect(
    f.ctrlOutside,
    `${where}: the probe cannot see the scrim, so it is measuring nothing`,
  ).toBe('SCRIM');
}

test('§2(b) — every modal in the family clips its children to its own rounded frame', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1400, height: 900 });

  // Station setup's own two: the rail bottom-left, the footer bottom-right.
  await app.openStationSetupAt('Channel');
  expectClipped(await frame(page), 'Station setup');
  await app.closeStationSetup();

  await app.openTemplatePicker();
  expectClipped(await frame(page), 'the template picker');
  await page.getByRole('button', { name: 'Import a .vcg' }).click();
  expectClipped(await frame(page), 'the import dialog');
  await page.getByRole('button', { name: 'Cancel' }).last().click();
  await app.closeTemplatePicker();

  await page.getByRole('button', { name: 'Open audit log' }).click();
  expectClipped(await frame(page), 'the audit log');
  await page.keyboard.press('Escape');
});

test('§4 — the picker and the audit log keep ONE box through every state that used to resize them', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1400, height: 900 });

  await app.openTemplatePicker();
  const search = page.getByPlaceholder('Search templates…');
  const all = (await frame(page)).box;

  await page.getByRole('button', { name: 'Graphics beds' }).click();
  expect((await frame(page)).box, 'a filter that shows fewer rows resized the picker').toEqual(all);

  await page.getByRole('button', { name: 'All templates' }).click();
  await search.fill('zzzz-matches-nothing');
  await expect(page.locator('[data-template-empty="search"]')).toBeVisible();
  expect((await frame(page)).box, 'a search that finds nothing resized the picker').toEqual(all);

  await search.fill('');
  await app.closeTemplatePicker();

  await page.getByRole('button', { name: 'Open audit log' }).click();
  const ledger = (await frame(page)).box;
  const auditSearch = page.getByPlaceholder('Search events or templates…');
  await auditSearch.fill('zzzz-matches-nothing');
  expect((await frame(page)).box, 'a search that finds nothing resized the audit log').toEqual(
    ledger,
  );
  await auditSearch.fill('');
  await page.keyboard.press('Escape');

  /*
    🔴 THE CLAMP, which is the half a fixed height can get wrong. At 1280 x 600 the declared
    810 would run off the bottom, so `min(810px, 100vh - 64px)` takes over and both frames land
    at 536 — the same number Station setup clamps to, because it is the same expression.
  */
  await page.setViewportSize({ width: 1280, height: 600 });
  await app.openTemplatePicker();
  expect((await frame(page)).box[3], 'the picker is not clamped on a short screen').toBe(536);
  await app.closeTemplatePicker();
  await page.getByRole('button', { name: 'Open audit log' }).click();
  expect((await frame(page)).box[3], 'the audit log is not clamped on a short screen').toBe(536);
  await page.keyboard.press('Escape');
});

/**
 * 🔴 `MODAL-CHROME-10` §2(a) and §3 — **THE TWO COLOUR REVERSALS, ON THE BUILT SURFACE.**
 *
 * Both are token swaps that a unit test could assert against `cssVars` without ever proving
 * the pixel moved. These read the COMPUTED value off the real control.
 *
 * ⚠ Both poll. `.cg-btn` transitions its background, so a single read after the click
 * photographs a colour on the way rather than the one that lands — this measurement was taken
 * mid-transition twice before the poll went in.
 */
test('§2(a)/§3 — a selected chip is the console selected BLUE, and the confirm commits in RED', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1400, height: 900 });
  await app.openTemplatePicker();

  const chip = page.locator('[data-template-filter="bed"]');
  await chip.click();
  await page.mouse.move(5, 5);
  await expect
    .poll(async () => chip.evaluate((b) => getComputedStyle(b).backgroundColor), { timeout: 4000 })
    // `--r-look-btn-sel-bg` (#2e4e67) — the console's selected-not-on-air fill. NOT the
    // rehearse violet `--r-rehearsing-strong` (#7C3AED = rgb(124, 58, 237)) it used to wear.
    .toBe('rgb(46, 78, 103)');
  const chipPaint = await chip.evaluate((b) => {
    const cs = getComputedStyle(b);
    return { border: cs.borderColor, ring: cs.boxShadow, ink: cs.color };
  });
  expect(chipPaint.border, 'the chip lost the selected edge').toBe('rgb(75, 116, 139)');
  expect(chipPaint.ring, 'the chip lost the selected ring').toContain('rgb(88, 173, 221)');
  expect(chipPaint.ink).toBe('rgb(255, 255, 255)');
  // …and the violet may never come back to this surface.
  expect(chipPaint.border, 'the PVW violet is back on a filter chip').not.toBe('rgb(124, 58, 237)');

  await page.getByRole('button', { name: 'Manage' }).click();
  await page
    .getByRole('button', { name: /^Delete .* from this station$/ })
    .first()
    .click();
  const commit = page.getByRole('button', { name: 'Delete from station', exact: true });
  await expect(commit).toBeVisible();
  await expect
    .poll(async () => commit.evaluate((b) => getComputedStyle(b).backgroundColor), {
      timeout: 4000,
    })
    // `--r-danger-confirm-bg` (#684044). It was the solid amber; the owner reversed that
    // recorded decision on 2026-09-13 — see the annotation in `controls.css`.
    .toBe('rgb(104, 64, 68)');
  const paint = await commit.evaluate((b) => {
    const cs = getComputedStyle(b);
    return { ink: cs.color, weight: cs.fontWeight };
  });
  // FILLED at a primary's weight, not the row buttons' quiet outline — white on #684044 is
  // 8.73:1, guarded numerically in `messageContrast.test.ts`.
  expect(paint.ink, 'the commit button is not carrying the fill ink').toBe('rgb(255, 255, 255)');
  expect(paint.weight, 'the commit button lost its primary weight').toBe('700');

  await page.getByRole('button', { name: 'Cancel' }).last().click();
  await app.closeTemplatePicker();
});

/**
 * 🔴 `MODAL-CHROME-10` §1 — **THE SHELL BAR'S TWO BUTTONS.**
 *
 * The label shortened and the accessible name did NOT, which is the part worth asserting: it
 * is what kept every existing finder working, what a screen reader still hears, and what keeps
 * WCAG 2.5.3 (label in name) satisfied — `LOG` is contained in `Open audit log`.
 */
test('§1 — the bar reads LOG in the bar’s own CAPS, and Settings wears a gear', async ({ app }) => {
  const page = app.page;
  const header = page.locator('[data-app-header]');

  const log = header.getByRole('button', { name: 'Open audit log' });
  await expect(log, 'the accessible name moved — every finder in the tree uses it').toHaveText(
    'LOG',
  );

  const settings = header.getByRole('button', { name: 'Open Station setup' });
  await expect(settings).toHaveText('SETTINGS');
  // lucide stamps its own name on the glyph, so the icon is asserted by IDENTITY rather than by
  // a path — `settings` is the gear; it was `sliders-horizontal`, which is a mixer.
  await expect(settings.locator('svg')).toHaveClass(/lucide-settings/);
  await expect(settings.locator('svg')).not.toHaveClass(/sliders/);

  // …and the same gear on the dialog's own header emblem, so the door and the room agree.
  await app.openStationSetupAt('Channel');
  await expect(page.locator('[data-modal-emblem] svg')).toHaveClass(/lucide-settings/);
  await app.closeStationSetup();
});
