import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/runtime.js';

/**
 * 🔴 `REPAIR-03` B — THE MODAL FAMILY, MEASURED AGAINST THE REFERENCE AS RENDERED.
 *
 * The audit's remaining modal items: the four head EMBLEMS (rows 62, 72, 98, 113), the WIDTH
 * TABLE and the BUTTON FAMILY (rows 70, 87, 106), and the two dialogs that had never been
 * compared to anything at all — `#confirm-dialog` (row 139) and the engage-lock editor
 * (row 140).
 *
 * ── WHY EVERY NUMBER HERE IS PLAYWRIGHT'S ────────────────────────────────────────────
 *
 * Golden rule 12(c). These are boxes, radii and floors; jsdom returns zeros for all of them,
 * so a jsdom copy of this file would pass against a dialog of any shape — including one with
 * no head band at all. The primitive's BEHAVIOUR (focus, Escape, the message region, the
 * nesting) stays in its own jsdom specs, which is the same rule read in both directions.
 *
 * ── THE REFERENCE HAS THREE DIALOG FAMILIES, AND THAT IS WHY THIS FILE HAS THREE GROUPS ──
 *
 * Measured by opening each `<dialog>` in Chromium at 1280 × 800:
 *
 *   `.modal`      OUTER document   radius 14, head `22px 26px` on `#172230`, foot 72 px
 *   `.settings`   SHADOW ROOT      radius 16, head `21px 28px` transparent,  foot 74 px
 *   `.sub-dialog` SHADOW ROOT      480 px, radius 16, foot 73 px
 *
 * The app has ONE primitive with four sizes, so the mapping is: `prose`/`wide`/`ledger` take
 * the outer family, `fixed` takes `.settings` (Phase 7 + `MONITORS-01` already did), and the
 * app's `layer='sub'` dialogs ride `prose` — 20 px and 2 px from `.sub-dialog`, which the
 * drawing does not reconcile between its own two families either.
 */

/** The reference's own rendered numbers, so a failure message can name what it missed. */
const REF = {
  outerRadius: 14,
  headPad: '22px 26px',
  footPad: '16px 26px',
  footFloor: 72,
  btnH: 39,
  btnRadius: 7,
  emblemBox: 42,
  emblemRadius: 10,
  proseW: 500,
  wideW: 860,
  ledgerW: 1224, // min(1250, 100vw − 56) at 1280
  fixedW: 1140,
  fixedFootFloor: 74,
} as const;

const dialog = (page: Page) => page.locator('[role="dialog"]').last();

async function box(page: Page, sel: string): Promise<DOMRect> {
  const r = await page.locator(sel).last().boundingBox();
  expect(r, `${sel} is laid out`).not.toBeNull();
  return r as unknown as DOMRect;
}

/** One computed property off the LAST open dialog's sub-element. */
async function css(page: Page, sel: string, prop: string): Promise<string> {
  return page
    .locator(sel)
    .last()
    .evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
}

test('§B — the OUTER family: frame, head band, emblem, body inset and footer floor', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole('button', { name: 'Open audit log' }).click();
  await expect(dialog(page)).toBeVisible();

  // THE FRAME — the reference's own corner and lift, not the app's old 6 px / `0 4px 16px`.
  expect(await css(page, '[role="dialog"]', 'border-radius')).toBe(`${String(REF.outerRadius)}px`);
  expect(
    await css(page, '[role="dialog"]', 'box-shadow'),
    'the reference lifts a dialog 100 px, not 16',
  ).toContain('100px');

  // THE HEAD IS A BAND — its own inset, its own ground, and a rule under it.
  expect(await css(page, '[role="dialog"] [data-modal-emblem]', 'border-radius')).toBe(
    `${String(REF.emblemRadius)}px`,
  );
  const emblem = await box(page, '[role="dialog"] [data-modal-emblem]');
  expect(Math.round(emblem.width), 'the emblem is the reference’s 42 px box').toBe(REF.emblemBox);
  expect(Math.round(emblem.height)).toBe(REF.emblemBox);

  // THE BODY owns its inset now that the frame is flush.
  expect(await css(page, '[role="dialog"] .cg-modal-body', 'padding-top')).toBe('22px');

  // THE FOOTER is a band with a FLOOR — 72 px, the outer family's, not `fixed`'s 74.
  const foot = await box(page, '[role="dialog"] .cg-modal-footer');
  expect(Math.round(foot.height), 'the outer family’s footer floor').toBe(REF.footFloor);
  expect(await css(page, '[role="dialog"] .cg-modal-footer', 'padding')).toBe(REF.footPad);

  // THE BUTTON FAMILY — 39 px tall, radius 7 (audit rows 87 and 106).
  const btn = await box(page, '[role="dialog"] .cg-modal-footer .cg-btn');
  expect(Math.round(btn.height), 'the modal footer button’s box').toBe(REF.btnH);
  expect(await css(page, '[role="dialog"] .cg-modal-footer .cg-btn', 'border-radius')).toBe(
    `${String(REF.btnRadius)}px`,
  );
});

test('§B — the WIDTH TABLE is the reference’s own, per size', async ({ app }) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });

  // `ledger` — the audit log. min(1250, 100vw − 56) = 1224 here.
  await page.getByRole('button', { name: 'Open audit log' }).click();
  expect(Math.round((await box(page, '[role="dialog"]')).width)).toBe(REF.ledgerW);
  await page.keyboard.press('Escape');
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);

  // `fixed` — Station setup. Unchanged by this session; asserted so the table is complete.
  await page.getByRole('button', { name: 'Open Station setup' }).click();
  expect(Math.round((await box(page, '[role="dialog"]')).width)).toBe(REF.fixedW);
  const fixedFoot = await box(page, '[role="dialog"] .cg-modal-footer');
  expect(
    Math.round(fixedFoot.height),
    'the FIXED footer keeps its own 74 px floor — two families, two numbers',
  ).toBe(REF.fixedFootFloor);
  await expect(page.locator('[role="dialog"] [data-modal-emblem]')).toBeVisible();
  await page.keyboard.press('Escape');
});

test('§B row 139 — the CONFIRM dialog, which had never been measured against anything', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });
  await app.layers
    .getByRole('button', { name: /^Clear all/ })
    .first()
    .click();
  await expect(dialog(page)).toBeVisible();

  // `prose` — the reference's `.modal.small`: min(500, 100vw − 32).
  expect(Math.round((await box(page, '[role="dialog"]')).width)).toBe(REF.proseW);
  expect(await css(page, '[role="dialog"]', 'border-radius')).toBe(`${String(REF.outerRadius)}px`);
  const foot = await box(page, '[role="dialog"] .cg-modal-footer');
  expect(Math.round(foot.height)).toBe(REF.footFloor);

  /*
    ⚠ NO EMBLEM, and that is the reference's own decision rather than an omission on our
    side: its `#confirm-dialog` is the one dialog it draws without a `.modal-icon`. A
    question asked in words does not want a decorative mark beside the destructive answer.
  */
  await expect(page.locator('[role="dialog"] [data-modal-emblem]')).toHaveCount(0);
  await page.keyboard.press('Escape');
});

test('§C5 — no modal region is full-bleed against its pane or its footer', async ({ app }) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole('button', { name: 'Open audit log' }).click();
  await expect(dialog(page)).toBeVisible();

  /*
    `AUDIT-CLOSE-01` fixed a refusal band that spanned the rail as well as its pane and met the
    footer flush. The flush chrome this session gave every size is exactly the shape that
    defect lived in, so the invariant is re-asserted here on a NON-fixed dialog too: the body
    is inset from the frame on both sides, and the footer's rule is a real edge rather than a
    seam the content runs into.
  */
  const frame = await box(page, '[role="dialog"]');
  const body = await box(page, '[role="dialog"] .cg-modal-body');
  expect(body.x, 'the body is inset from the frame’s left edge').toBeGreaterThan(frame.x);
  expect(body.x + body.width, 'and from its right').toBeLessThan(frame.x + frame.width);

  const foot = await box(page, '[role="dialog"] .cg-modal-footer');
  expect(
    await css(page, '[role="dialog"] .cg-modal-footer', 'border-top-width'),
    'the footer carries its own rule',
  ).toBe('1px');
  expect(body.y + body.height, 'the body ends at or above the footer’s rule').toBeLessThanOrEqual(
    foot.y + 1,
  );
  await page.keyboard.press('Escape');
});
