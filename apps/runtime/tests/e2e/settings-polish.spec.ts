import type { Locator, Page } from '@playwright/test';
import { test, expect } from './fixtures/runtime.js';

/**
 * 🔴 `SETTINGS-POLISH-04` — **SEVEN VISUAL DEFECTS THE OWNER FOUND ON THE BUILT DIALOG**, each
 * one measured in a real engine.
 *
 * Every claim below is either a PAINTED COLOUR or a BOX, so every one of them belongs here and
 * not in jsdom (golden rule 12c, `B-245`): jsdom computes no layout, so a gap assertion reads
 * `0 === 0` there and passes against a footer whose two buttons are touching — which is exactly
 * the defect §1 is about. Its cascade is not Chrome's either, so the colours are read from
 * `getComputedStyle` on the real elements after the real stylesheet has resolved.
 *
 * §4's placement lives in `station-setup-match.spec.ts` §9 (it is that test's subject, and
 * splitting it would leave two specs measuring one band); §4's containment lives in
 * `modal-message-containment.spec.ts`. The other six are here.
 *
 * ── THE PALETTE THESE NUMBERS COME FROM ─────────────────────────────────────────────────
 *
 * `09-channel-settings.html`'s SHADOW stylesheet, which is a different palette from the outer
 * reference the console takes (`--red-bg:#352224` here against `#3a242a` there,
 * `--amber:#f5c879` against `#f3cd88`). Station setup has been taking the shadow sheet's values
 * since `SETTINGS-MATCH-02`; these are the same decision for three more roles.
 */

/*
  🔴 UNIFIED 2026-09-13 — was rgb(245 200 121) (the settings drawing's own --amber #f5c879,
  adopted by SETTINGS-MATCH-02). The owner retired the second amber: two values nobody can tell
  apart cost a second token. The survivor is the CONSOLE drawing's ink, and the more legible of
  the pair on both grounds (8.99:1 and 10.19:1, against 8.68 and 9.84).
  Geometry did not move — this dialog keeps its own pad, radius and ground.
*/
const AMBER = 'rgb(243, 205, 136)'; // --r-caution-text
const RED_INK = 'rgb(255, 170, 167)'; // --red     #ffaaa7
const RED_BG = 'rgb(53, 34, 36)'; // --red-bg  #352224
const RED_LINE = 'rgb(104, 64, 68)'; //           #684044
const RED_HOVER = 'rgb(72, 42, 46)'; //           #482a2e
const NOTICE_BG = 'rgb(41, 36, 28)'; // .notice   #29241c
const NOTICE_LINE = 'rgb(84, 69, 45)'; //         #54452d
const NOTICE_BODY = 'rgb(205, 189, 158)'; //      #cdbd9e

function setup(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Station setup' });
}

/** The gaps between adjacent rendered buttons inside a container, left to right. */
async function buttonGaps(scope: Locator): Promise<number[]> {
  return scope.evaluate((el) => {
    const boxes = [...el.querySelectorAll('button')]
      .map((b) => b.getBoundingClientRect())
      .filter((r) => r.width > 0)
      .sort((a, b) => a.left - b.left);
    return boxes.slice(1).map((r, i) => Math.round(r.left - (boxes[i]!.left + boxes[i]!.width)));
  });
}

/**
 * 🔴 §1 — **THE FOOTER'S TWO BUTTONS WERE TOUCHING.**
 *
 * The frame's footer has carried `gap: 9px` since `SETTINGS-MATCH-02`, and on the one tab that
 * puts TWO controls in it the gap did nothing: a section's commit controls portal into a slot
 * element, so the 9 px applied between the slot and its neighbours rather than between the
 * buttons inside it. Measured at 1280 × 800 before the fix, `Revert` ended at x = 1067 and
 * `Apply layers` began at x = 1067 — **zero**.
 *
 * ⚠ This is why the assertion is on the MEASURED GAP and not on `getComputedStyle(...).gap`:
 * the declared value was already right and the render was wrong, so reading the declaration
 * would have confirmed the bug.
 */
test('§1 — Revert and Apply layers sit 9 px apart, and so do the sub-dialog’s actions', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });
  const dialog = setup(page);
  await app.openStationSetupAt('Layers');

  const footer = dialog.locator('.cg-modal-footer');
  // The Layers pane is the one that puts TWO controls in the slot, which is the case the
  // footer's own gap could never reach.
  await expect(footer.getByRole('button', { name: 'Revert candidate layer edits' })).toBeVisible();
  await expect(footer.getByRole('button', { name: 'Apply layers' })).toBeVisible();
  expect(await buttonGaps(footer), 'the pane footer’s action row is 9 px').toEqual([9]);

  // The SUB-dialog's footer takes the same nine — `.sub-foot{gap:9px}`, one family, one number.
  await dialog
    .getByRole('tablist', { name: 'Station setup sections' })
    .getByRole('tab', { name: 'Live sources' })
    .click();
  await dialog.getByRole('button', { name: 'Add live source' }).click();
  const sub = page.getByRole('dialog', { name: /source/i }).last();
  await expect(sub).toBeVisible();
  expect(await buttonGaps(sub.locator('.cg-modal-footer')), 'the sub-dialog’s too').toEqual([9]);
});

/**
 * 🔴 §2 — **TWO DESTRUCTIVE TREATMENTS, AND NEITHER IS A MISTAKE.**
 *
 * The console's `useConfirm` keeps its SOLID AMBER, by a recorded reason: picking the red
 * outline would have made `Clear all` quieter — turning a filled button into an outline on the
 * one control that takes every graphic off air. Station setup's sub-dialog family takes the
 * reference's red outline, because its destructive act is a catalogue deletion and amber inside
 * that dialog already means BLOCKED.
 *
 * ⚠ **BOTH ARE ASSERTED IN ONE TEST, on purpose.** Each half is only meaningful beside the
 * other: a test that checked the red alone would pass against a build that had harmonised the
 * console's amber INTO it, which is the outcome this session was explicitly told not to reach.
 */
test('§2 — the sub-dialog’s destructive is the reference red; the console’s stays solid amber', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });

  // ── (a) THE CONSOLE'S — unchanged, and measured FIRST so a regression here is not masked.
  await page.getByRole('button', { name: 'Clear all rows holding a layer' }).click();
  const consoleConfirm = page.getByRole('dialog', { name: /^Clear all/ });
  await expect(consoleConfirm).toBeVisible();
  const clearAll = consoleConfirm.getByRole('button', { name: /^Clear all$/ });
  await expect(clearAll).toHaveCSS('background-color', 'rgb(245, 158, 11)');
  await expect(clearAll, 'a FILLED button, not an outline').toHaveCSS(
    'border-color',
    'rgb(245, 158, 11)',
  );
  await consoleConfirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(consoleConfirm).toBeHidden();

  // ── (b) STATION SETUP'S — the reference's `.btn.danger`, filling on intent only.
  await app.openStationSetupAt('Live sources');
  const dialog = setup(page);
  await app.addLiveSource('Studio A');

  await dialog.getByRole('button', { name: 'Remove Studio A' }).click();
  const confirm = page.getByRole('dialog', { name: /^Remove/ }).last();
  await expect(confirm).toBeVisible();

  const commit = confirm.getByRole('button', { name: /^Remove source$/ });
  await expect(commit).toHaveCSS('background-color', RED_BG);
  await expect(commit).toHaveCSS('border-color', RED_LINE);
  await expect(commit).toHaveCSS('color', RED_INK);

  // The trash emblem is the same family one element along — `.confirm-icon`.
  const emblem = confirm.locator('[data-confirm-emblem]');
  await expect(emblem).toHaveCSS('background-color', RED_BG);
  await expect(emblem).toHaveCSS('border-color', RED_LINE);
  await expect(emblem).toHaveCSS('color', RED_INK);

  // …and it FILLS on hover rather than at rest, which is what makes it an outline at all.
  await commit.hover();
  await expect(commit).toHaveCSS('background-color', RED_HOVER);
});

/**
 * 🔴 §4 — **THE NOTICE'S OWN COLOURS**, which were a third palette.
 *
 * Measured before: ground `rgb(53, 45, 30)` and edge `rgb(101, 83, 52)` — the console's
 * `--r-caution-*` pair — against the drawing's `#29241c` / `#54452d`. Its placement is
 * `station-setup-match.spec.ts` §9's subject and is not repeated here.
 *
 * ⚠ The BODY's ink is asserted too, and it is the one a "make it amber" fix would miss: the
 * explanation is a desaturated amber (`#cdbd9e`), not the neutral secondary it had. A band
 * whose title is amber over a grey paragraph reads as a caption under a warning rather than as
 * part of one.
 */
test('§4 — the standing notice paints the reference’s own ground, edge and two inks', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });
  await app.openStationSetupAt('Servers');
  const notice = setup(page).locator('[data-setup-notice]');

  await expect(notice).toBeVisible();
  await expect(notice).toHaveCSS('background-color', NOTICE_BG);
  await expect(notice).toHaveCSS('border-color', NOTICE_LINE);
  await expect(notice).toHaveCSS('border-radius', '10px');
  await expect(notice).toHaveCSS('padding', '15px 17px');
  await expect(notice.locator('strong')).toHaveCSS('color', AMBER);
  await expect(notice.locator('p'), 'the explanation is a quieter amber, never grey').toHaveCSS(
    'color',
    NOTICE_BODY,
  );
  // `.notice>svg{width:19px;height:19px;margin-top:2px}` — the mark is on the title's baseline.
  const mark = notice.locator('svg').first();
  await expect(mark).toHaveCSS('width', '19px');
  await expect(mark).toHaveCSS('margin-top', '2px');
});

/**
 * 🔴 §5 — **THE `Input type` LABELS OVERFLOWED THEIR BOXES.**
 *
 * The reference draws three kinds in a 480 px dialog; ours draws five, and
 * `repeat(auto-fit, minmax(0, 1fr))` answered that by laying all five on one row. Measured
 * before: five 74 px cells, `DeckLink` reporting `scrollWidth 75` against `clientWidth 72`.
 *
 * ⚠ **`scrollWidth > clientWidth` IS THE ASSERTION, not the item's width.** A width test would
 * have to encode what the right width IS, which depends on the label, the font and the
 * viewport; overflow is the property the operator actually sees and it is true or false whatever
 * those are. The wrap is asserted by the Y coordinates, for the same reason.
 */
test('§5 — the five kind options wrap instead of clipping, at 480 px and narrower', async ({
  app,
}) => {
  const page = app.page;

  for (const width of [1280, 420]) {
    await page.setViewportSize({ width, height: 800 });
    await app.openStationSetupAt('Live sources');
    const dialog = setup(page);
    await dialog.getByRole('button', { name: 'Add live source' }).click();
    const group = page.getByRole('radiogroup', { name: 'Source kind' });
    await expect(group).toBeVisible();

    const items = await group.evaluate((el) =>
      [...el.querySelectorAll('label')].map((l) => ({
        text: (l.textContent ?? '').trim(),
        overflow: l.scrollWidth - l.clientWidth,
        top: Math.round(l.getBoundingClientRect().top),
        width: Math.round(l.getBoundingClientRect().width),
      })),
    );

    expect(items, 'all five kinds are offered').toHaveLength(5);
    for (const item of items) {
      expect(
        item.overflow,
        `${String(width)}: "${item.text}" must not be clipped`,
      ).toBeLessThanOrEqual(0);
    }

    // It WRAPS — more than one row — and every box on the surface is the same width, which a
    // flex row would not give (its last line distributes its own free space).
    const rows = new Set(items.map((i) => i.top));
    expect(rows.size, `${String(width)}: the group wraps`).toBeGreaterThan(1);
    const widths = new Set(items.map((i) => i.width));
    expect(widths.size, `${String(width)}: one track width across every row`).toBe(1);

    await page.getByRole('dialog').last().getByRole('button', { name: 'Cancel' }).click();
    await app.closeStationSetup();
  }
});

/**
 * 🔴 §6 — **A CONTROL SHAPE THAT CANNOT BE PRESSED IS A LIE** (`R-055`).
 *
 * The sweep: every tag on every tab of the dialog. None may be a `<button>`, carry
 * `role="button"`, be focusable, or show a pointer cursor — and each must be visibly quieter
 * than a real button on the same surface.
 *
 * ⚠ **THE BUTTON IS MEASURED IN THE SAME PASS**, which is what stops this being a checklist. A
 * tag is "shorter and smaller than a button" only relative to whatever the buttons currently
 * are; comparing to a literal 40 would keep passing if the buttons shrank to 28.
 */
test('§6 — every tag in the dialog is inert, and reads quieter than a button beside it', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });
  await app.openStationSetupAt('Channel');
  const dialog = setup(page);
  const rail = dialog.getByRole('tablist', { name: 'Station setup sections' });

  const seen: string[] = [];
  for (const tab of ['Channel', 'Servers', 'Live sources', 'Text file delimiters', 'Layers']) {
    await rail.getByRole('tab', { name: new RegExp(`^${tab}`) }).click();
    await expect(dialog.locator('[data-station-section]')).toBeVisible();

    const found = await dialog.evaluate((el) => {
      const btn = [...el.querySelectorAll('button')]
        .map((b) => b.getBoundingClientRect().height)
        .filter((h) => h > 0);
      return {
        shortestButton: Math.min(...btn),
        tags: [...el.querySelectorAll('.cg-setup-tag, .cg-setup-card-tag')].map((t) => {
          const s = getComputedStyle(t);
          return {
            text: (t.textContent ?? '').trim(),
            tag: t.tagName,
            role: t.getAttribute('role'),
            tabindex: t.getAttribute('tabindex'),
            cursor: s.cursor,
            transition: s.transitionProperty,
            height: Math.round(t.getBoundingClientRect().height),
            fontSize: s.fontSize,
            focusable: t.matches('a,button,input,select,textarea,[tabindex]'),
          };
        }),
      };
    });

    expect(found.tags.length, `${tab}: the sweep must find something to judge`).toBeGreaterThan(0);
    for (const t of found.tags) {
      seen.push(`${tab}: ${t.text}`);
      expect(t.tag, `${tab} "${t.text}" is not built on a control`).toBe('SPAN');
      expect(t.role, `${tab} "${t.text}" claims no role`).toBeNull();
      expect(t.tabindex, `${tab} "${t.text}" is not reachable by Tab`).toBeNull();
      expect(t.focusable, `${tab} "${t.text}" is not focusable`).toBe(false);
      expect(t.cursor, `${tab} "${t.text}" shows no pointer`).toBe('default');
      expect(t.transition, `${tab} "${t.text}" animates nothing`).toBe('none');
      expect(t.fontSize, `${tab} "${t.text}" is 12 px`).toBe('12px');
      expect(
        t.height,
        `${tab} "${t.text}" must be SHORTER than the shortest button on the same surface`,
      ).toBeLessThan(found.shortestButton);
    }
  }

  // The sweep covered every tab, so a tag added to one of them cannot slip past this test.
  expect(seen.length, 'the dialog carries tags on every tab').toBeGreaterThanOrEqual(5);
});

/**
 * 🔴 **THE OWNER'S EIGHTH, RAISED ON THE PLANT MID-SESSION:** _«فاصله بین متن Visibility and
 * layer safety و سرچ باکس کمه»_ — the gap between that line and the search box is too small.
 *
 * It was **zero**. Measured on the Layers pane at 1280 × 800: the `<details>` ended at y = 299
 * and the search field began at y = 299, while the same line had 17 px of air above it.
 *
 * ⚠ **THE ASSERTION IS THE GAP, AND A SECOND ONE MAKES IT MEAN SOMETHING.** A lone
 * `gap > 0` would be satisfied by one pixel. The gap ABOVE the helper is read in the same pass
 * and the one below must be at least as large — which is the property the eye actually judges:
 * a line with air above it and none below reads as stuck to the box under it, whatever the
 * absolute numbers are.
 */
test('the Layers helper is not stuck to the search box under it', async ({ app }) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });
  await app.openStationSetupAt('Layers');
  const dialog = setup(page);

  const details = dialog.locator('.cg-setup-details');
  await expect(details).toBeVisible();

  const gaps = await dialog.evaluate((el) => {
    const head = el.querySelector('.cg-setup-head')?.getBoundingClientRect();
    const d = el.querySelector('.cg-setup-details')?.getBoundingClientRect();
    const search = el.querySelector('.cg-setup-search')?.getBoundingClientRect();
    if (head === undefined || d === undefined || search === undefined) {
      throw new Error('the Layers pane is missing its head, helper or search field');
    }
    return { above: Math.round(d.top - head.bottom), below: Math.round(search.top - d.bottom) };
  });

  expect(gaps.above, 'the helper keeps its 17 px above').toBe(17);
  expect(gaps.below, 'and is 21 px clear of the search box — the reference’s own value').toBe(21);
  expect(
    gaps.below,
    'a line with air above it and none below reads as stuck to the box under it',
  ).toBeGreaterThanOrEqual(gaps.above);
});

/**
 * 🔴 §7 — **THE SCRIM IS A GROUND *AND* A BLUR.**
 *
 * ⚠ The blur is asserted because without it the darker ground reads as flat black — the console
 * stops being dimmed and becomes an absence. A test that took the colour alone would pass
 * against exactly that, which is the "half the effect applied" failure the two values travel
 * together to prevent.
 */
test('§7 — the scrim darkens and blurs, the sub-scrim stays lighter, and both dialogs are lifted', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });
  await app.openStationSetupAt('Live sources');
  const dialog = setup(page);

  const base = page.locator('[data-modal-layer="base"]').first();
  await expect(base).toHaveCSS('background-color', 'rgba(4, 7, 11, 0.76)');
  await expect(base).toHaveCSS('backdrop-filter', 'blur(5px)');

  // One lift for every dialog — `dialog{box-shadow:0 32px 100px #0009,0 0 0 1px #0003}`.
  const LIFT = 'rgba(0, 0, 0, 0.6) 0px 32px 100px 0px, rgba(0, 0, 0, 0.2) 0px 0px 0px 1px';
  await expect(dialog).toHaveCSS('box-shadow', LIFT);

  await dialog.getByRole('button', { name: 'Add live source' }).click();
  const sub = page.locator('[data-modal-layer="sub"]').first();
  await expect(sub).toHaveCSS('background-color', 'rgba(3, 6, 9, 0.62)');
  await expect(sub).toHaveCSS('backdrop-filter', 'blur(3px)');
  await expect(page.getByRole('dialog').last()).toHaveCSS('box-shadow', LIFT);

  /*
    ⚠ THE ROLE'S OWN INVARIANT, asserted rather than assumed: the second scrim must stay LIGHTER
    than the first, or the dialog the operator came from goes black behind the one on top of it
    and a small Add form reads as having REPLACED his settings. Two literals can both be updated
    and still break that; this reads the alphas back and compares them.
  */
  const alphas = await page.evaluate(() =>
    ['base', 'sub'].map((l) => {
      const el = document.querySelector(`[data-modal-layer="${l}"]`);
      const m = /rgba?\([^)]*?([\d.]+)\)$/.exec(getComputedStyle(el!).backgroundColor);
      return m === null ? 1 : Number(m[1]);
    }),
  );
  expect(alphas[1], 'the sub scrim is lighter than the base one').toBeLessThan(alphas[0]!);
});
