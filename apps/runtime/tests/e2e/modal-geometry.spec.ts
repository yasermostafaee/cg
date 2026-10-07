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

/**
 * Every footer button whose box is not inside the dialog's box, described — one snapshot, read
 * in the page. This frame CLIPS, so a spilled button is not drawn outside it: it is cut off. The
 * layout box still says where it is, which is what makes the clip measurable.
 */
async function footerButtonsOutside(page: Page): Promise<string[]> {
  return dialog(page).evaluate((d) => {
    const frame = d.getBoundingClientRect();
    const out: string[] = [];
    for (const b of Array.from(d.querySelectorAll('.cg-modal-footer .cg-btn'))) {
      const r = b.getBoundingClientRect();
      const name = (b.textContent ?? '').trim();
      const past = (side: string, by: number): void => {
        if (by > 0.5) out.push(`${name}: ${by.toFixed(1)} px past the ${side} edge`);
      };
      past('left', frame.left - r.left);
      past('right', r.right - frame.right);
      past('top', frame.top - r.top);
      past('bottom', r.bottom - frame.bottom);
      // A label wider than its own button is the same defect one box in.
      if (b.scrollWidth > b.clientWidth + 1) out.push(`${name}: its label overflows the button`);
    }
    return out;
  });
}

/** `row` — one line; `stack` — one button per line at the footer's full content width. */
async function footerForm(page: Page): Promise<'row' | 'stack' | 'mixed'> {
  return dialog(page)
    .locator('.cg-modal-footer')
    .evaluate((row) => {
      const cs = getComputedStyle(row);
      const box = row.getBoundingClientRect();
      const left = box.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft);
      const right = box.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight);
      const kids = Array.from(row.children).map((c) => c.getBoundingClientRect());
      const near = (a: number, b: number): boolean => Math.abs(a - b) <= 0.5;
      if (
        kids.every((k) =>
          near(k.top + k.height / 2, (kids[0]?.top ?? 0) + (kids[0]?.height ?? 0) / 2),
        )
      )
        return 'row';
      const stacked =
        kids.every((k, i) => i === 0 || k.top >= (kids[i - 1]?.bottom ?? 0) - 0.5) &&
        kids.every((k) => near(k.left, left) && near(k.right, right));
      return stacked ? 'stack' : 'mixed';
    });
}

/*
  🔴 `B-319` — THE FOOTER KEEPS ITS BUTTONS INSIDE THE DIALOG, whatever their labels say.

  The Designer's clip dialog put `Cancel` 47.9 px outside its card when its labels grew; this
  primitive had the same `nowrap` row packed to its end, and its frame CLIPS, so here the spilled
  button would not even have been visible. No Runtime dialog has three buttons today, so the
  property is driven through the confirm's own two, RELABELLED IN PLACE with the kind of label a
  footer grows into — the footer is the subject, not the confirm's wording. The smallest window
  the console runs in is 1100 × 700 (`src-tauri/tauri.conf.json`). The modal's button text is set
  in `px`, so a larger ROOT font size does not move it; page zoom does, as a narrower viewport —
  1100 × 700 at 200 % is 550 × 350.
*/
test('B-319 — long labels stack inside the frame, short ones keep the one row', async ({ app }) => {
  const page = app.page;
  await page.setViewportSize({ width: 1100, height: 700 });
  await app.layers
    .getByRole('button', { name: /^Clear all/ })
    .first()
    .click();
  await expect(dialog(page)).toBeVisible();
  const buttons = page.locator('[role="dialog"] .cg-modal-footer > .cg-btn');

  // As shipped: one row, inside.
  await expect.poll(() => footerButtonsOutside(page)).toEqual([]);
  await expect.poll(() => footerForm(page)).toBe('row');

  // Labels a footer grows into — the second longer than the dialog is wide.
  const shipped = await buttons.evaluateAll((els) => els.map((e) => e.textContent ?? ''));
  await buttons.evaluateAll((els) => {
    const long = [
      'Cancel and keep every layer exactly as it is now',
      'Clear every layer on this channel and take all of them off air at once, now',
    ];
    els.forEach((e, i) => {
      e.textContent = long[i] ?? e.textContent;
    });
  });
  await expect.poll(() => footerButtonsOutside(page)).toEqual([]);
  await expect.poll(() => footerForm(page)).toBe('stack');
  // Cancel first, the destructive last — the end corner is the bottom now.
  const tops = await buttons.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
  expect(tops[0] ?? 0).toBeLessThan(tops[1] ?? 0);

  // Zoomed (a narrower viewport), still inside.
  await page.setViewportSize({ width: 550, height: 350 });
  await expect.poll(() => footerButtonsOutside(page)).toEqual([]);

  // The shipped labels back: the row returns.
  await page.setViewportSize({ width: 1100, height: 700 });
  await buttons.evaluateAll((els, labels) => {
    els.forEach((e, i) => {
      e.textContent = labels[i] ?? e.textContent;
    });
  }, shipped);
  await expect.poll(() => footerButtonsOutside(page)).toEqual([]);
  await expect.poll(() => footerForm(page)).toBe('row');
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
