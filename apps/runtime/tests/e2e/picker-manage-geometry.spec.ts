import { expect, test } from './fixtures/runtime.js';

/**
 * 🔴 `RUNTIME-REPAIR-04` §3.2 — THE `Manage` VIEW, MEASURED AGAINST THE REFERENCE AS RENDERED.
 *
 * `01-template-picker.html` at 1280 × 800, its own `data-action="manage-library"` pressed:
 * `#library-management` replaces `.template-layout` inside the SAME 1120 × 744 frame, each
 * `.manage-row` is 84 px at `padding:17px` `gap:12px` with a rule under it, and the footer's
 * PRIMARY becomes `Back to selection` while `Import .vcg` stays quiet beside it.
 *
 * ── WHY THIS IS PLAYWRIGHT ──────────────────────────────────────────────────────────
 *
 * Golden rule 12(c). Row heights, paddings and "the frame did not move" are boxes; jsdom
 * returns zeros for every one of them, so a jsdom copy would pass against a management view
 * of any shape — including one that resized the dialog under the operator, which is the
 * specific thing the reference's own arrangement avoids and the assertion below states.
 *
 * The view's BEHAVIOUR — that the row carries no deletion, that the confirm and the cascade
 * are unchanged, that the count does not gate the control — is `templatePicker.manage.dom` and
 * `templateRemoval.dom`, which is the same rule read in the other direction.
 */

const REF = {
  frameW: 1120,
  manageRowH: 84,
  manageRowPad: '17px',
  manageRowGap: '12px',
} as const;

test('§3.2 — Manage replaces the layout inside a frame that does not move', async ({ app }) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });
  await app.openTemplatePicker();
  const picker = app.templatePicker;

  const before = await picker.evaluate((el) => el.getBoundingClientRect().width);
  await expect(picker.locator('[data-template-layout]')).toHaveCount(1);
  await expect(picker.locator('[data-template-manage]')).toHaveCount(0);

  await picker.getByRole('button', { name: 'Manage' }).click();

  // The selection half is GONE — list, aside and filter with it. One surface at a time.
  await expect(picker.locator('[data-template-manage]')).toHaveCount(1);
  await expect(picker.locator('[data-template-layout]')).toHaveCount(0);
  await expect(picker.locator('[data-template-aside]')).toHaveCount(0);

  /*
    …and the FRAME did not move. The reference swaps the body inside the same box, which is
    what keeps the footer's controls under the operator's hand across the switch.
  */
  const after = await picker.evaluate((el) => el.getBoundingClientRect().width);
  expect(Math.round(after)).toBe(REF.frameW);
  expect(after, 'the frame is the same box the list was in').toBe(before);

  // THE ROW — 84 px at the reference's own inset and gap.
  const row = picker.locator('[data-manage-template]').first();
  await expect(row).toBeVisible();
  const box = await row.evaluate((el) => {
    const cs = getComputedStyle(el);
    return {
      h: el.getBoundingClientRect().height,
      pad: cs.padding,
      gap: cs.gap,
      rule: cs.borderBottomWidth,
    };
  });
  expect(Math.round(box.h), 'the reference’s 84 px management row').toBe(REF.manageRowH);
  expect(box.pad).toBe(REF.manageRowPad);
  expect(box.gap).toBe(REF.manageRowGap);
  expect(box.rule, 'each row is ruled off from the next').toBe('1px');

  /*
    THE FOOTER SWAPS ITS PRIMARY. The way OUT of a destructive surface is the most obvious
    control on it — the reference's own arrangement, and the reason `Cancel` steps aside here.
  */
  await expect(picker.getByRole('button', { name: 'Back to selection' })).toBeVisible();
  await expect(picker.getByRole('button', { name: 'Cancel' })).toHaveCount(0);

  await picker.getByRole('button', { name: 'Back to selection' }).click();
  await expect(picker.locator('[data-template-layout]')).toHaveCount(1);
  await expect(picker.getByRole('button', { name: 'Cancel' })).toBeVisible();
  await app.closeTemplatePicker();
});

test('§3.3 — the picker’s rows carry no destructive control at all', async ({ app }) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });
  await app.openTemplatePicker();
  const picker = app.templatePicker;

  // There ARE rows — so "no delete on a row" is a statement about rows that exist.
  await expect(picker.locator('[data-template-id]').first()).toBeVisible();
  /*
    `design.md` §18.4, built here: a red station-wide deletion repeated down every row of a
    picker is what gets pressed by accident under pressure on an on-air console. The reference
    has no destructive control on a row either.
  */
  await expect(picker.locator('[data-template-id] .cg-tpl-delete')).toHaveCount(0);
  await expect(picker.getByRole('button', { name: /Delete .* from this station/ })).toHaveCount(0);

  // …and it is exactly one press away, not hidden.
  await picker.getByRole('button', { name: 'Manage' }).click();
  await expect(
    picker.getByRole('button', { name: /Delete .* from this station/ }).first(),
  ).toBeVisible();
  await app.page.keyboard.press('Escape');
});
