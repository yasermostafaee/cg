import type { Locator } from '@playwright/test';
import { buildValidVcg, cssColour, expect, test } from './fixtures/runtime.js';

/**
 * 🔴 `MODAL-CHROME-10` ADDENDUM C — **THE PICKER'S LIST, AND A REFUSAL THAT RENDERED TWICE.**
 *
 * This was `picker-manage-chrome.spec.ts`. 🔴 `UI-POLISH-01` C (the owner, 2026-09-26) retired
 * `Manage`: its one act, the delete, is an icon on each row. The cases that measured the Manage
 * view (its rows, its Import slot, its way back) went with it; the refusal and the confirm are
 * reached from the row now and are asserted exactly as before.
 *
 * Everything here is layout, hover state or a rendered sentence: jsdom has neither hover nor
 * layout, so none of it can be asserted anywhere but a browser (golden rule 12c). The WORDS are
 * pinned in `templateRemoval.dom.test.ts`; this is what the operator actually sees.
 */

test('§C1 — the selection list divides and responds', async ({ app }) => {
  const page = app.page;
  await page.setViewportSize({ width: 1400, height: 900 });
  await app.openTemplatePicker();

  /*
    THE SELECTION LIST — a hairline between rows, and a hover, because pressing a row chooses
    that template. The divider is the modal family's own `--r-border`; it is painted on the
    1 px border the row already reserves, so it costs no layout.
  */
  const rows = page.locator('.cg-tpl-row');
  expect(await rows.count(), 'the fixture has fewer than two rows to divide').toBeGreaterThan(1);
  const second = rows.nth(1);
  await expect(second).toHaveCSS('border-top-style', 'solid');
  const dividerColour = await second.evaluate((el) => getComputedStyle(el).borderTopColor);
  expect(dividerColour, 'the second row has no hairline above it').not.toBe('rgba(0, 0, 0, 0)');

  const rest = await second.evaluate((el) => getComputedStyle(el).backgroundColor);
  await second.hover();
  await expect
    .poll(async () => second.evaluate((el) => getComputedStyle(el).backgroundColor), {
      timeout: 4000,
    })
    .not.toBe(rest);

  await app.closeTemplatePicker();
});

test('§C4 — an in-use deletion is refused ONCE, in one place, with its way out inside it', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1400, height: 900 });
  /*
    Row 73's alias is PERSIAN (`میانبرنامه روی انتن`, the longest real plant name in the seed).
    Loading a template onto it and then deleting that template is the exact case the owner
    photographed: a Persian row name inside an English sentence, with quotes and parentheses
    around it — the neutrals whose placement the bidi algorithm decides if nobody isolates.
  */
  await app.importVcg('held.vcg', await buildValidVcg('tpl-held'), 83);
  await app.openTemplatePicker();

  // `UI-POLISH-01` C — the delete is the row's own icon; its accessible name is unchanged.
  const held = page.getByRole('button', { name: /^Delete held from this station$/ });
  await expect(held).toHaveCount(1);
  await held.click();
  await page.getByRole('button', { name: 'Delete from station', exact: true }).click();

  // ── (a) ONE refusal. The pinned region is the one that survived; the loose block is gone.
  const region = page.locator('[data-modal-message]');
  await expect(region).toHaveCount(1);
  await expect(page.locator('[data-in-use-reference]')).toHaveCount(0);

  // ── (c) the operator's noun, and a real plural. No `item(s)`, no `stack item`.
  await expect(region).toContainText('1 row still holds this template');
  await expect(region).not.toContainText('item(s)');
  await expect(region).not.toContainText('stack item');

  // ── (b) nothing escapes: the refusal is inside the dialog's own box, whole.
  const dialogBox = await page.locator('[role="dialog"]').last().boundingBox();
  const regionBox = await region.boundingBox();
  expect(regionBox, 'the refusal has no box').not.toBeNull();
  expect(dialogBox, 'the dialog has no box').not.toBeNull();
  if (regionBox !== null && dialogBox !== null) {
    expect(regionBox.x, 'the refusal starts left of the dialog').toBeGreaterThanOrEqual(
      dialogBox.x,
    );
    expect(
      regionBox.x + regionBox.width,
      'the refusal runs past the dialog’s right edge',
    ).toBeLessThanOrEqual(dialogBox.x + dialogBox.width + 0.5);
  }

  // ── (e) the way out is INSIDE the message, and its label says what it does.
  const remedies = region.locator('[data-notice-remedies]');
  await expect(remedies, 'the remedy is floating beside the refusal again').toHaveCount(1);
  const go = remedies.getByRole('button');
  await expect(go).toHaveCount(1);
  await expect(go).toContainText('Go to');
  await expect(go, 'the label went back to bare “Show”').not.toHaveText(/^Show /);

  /*
    ── (d) THE PERSIAN NAME INSIDE AN ENGLISH LABEL, ISOLATED.

    A box measurement cannot see character order, so this reads the RUNS: the label is
    `Go to <name> (layer N)`, its own direction is LTR chrome, and the isolate holds the name.
    `Go to` must sit left of the name and `(layer` right of it — which is what an LTR line with
    one isolated RTL run does, and what a line that had adopted the name's direction would not.
  */
  const order = await go.evaluate((btn) => {
    const bdi = btn.querySelector('bdi');
    if (bdi === null) throw new Error('the name is not isolated');
    const xOf = (needle: string): number => {
      const walk = document.createTreeWalker(btn, NodeFilter.SHOW_TEXT);
      while (walk.nextNode()) {
        const at = (walk.currentNode.textContent ?? '').indexOf(needle);
        if (at === -1) continue;
        const r = document.createRange();
        r.setStart(walk.currentNode, at);
        r.setEnd(walk.currentNode, at + needle.length);
        return r.getBoundingClientRect().left;
      }
      throw new Error(`no run reading ${needle}`);
    };
    const name = bdi.getBoundingClientRect();
    return {
      dir: getComputedStyle(btn).direction,
      nameDir: getComputedStyle(bdi).direction,
      lead: xOf('Go to'),
      nameLeft: +name.left.toFixed(1),
      nameRight: +name.right.toFixed(1),
      tail: xOf('(layer'),
    };
  });
  expect(order.dir, 'the LABEL adopted the name’s direction').toBe('ltr');
  expect(order.nameDir, 'the name lost its own direction — the isolation is gone').toBe('rtl');
  expect(order.lead, '“Go to” is no longer first on the line').toBeLessThan(order.nameLeft);
  expect(order.tail, 'the layer number is no longer last on the line').toBeGreaterThanOrEqual(
    order.nameRight,
  );

  await app.closeTemplatePicker();
});

/**
 * 🔴 `MODAL-CHROME-10` ADDENDUM D — **THE ROW HOVER, AND THE DELETE CONFIRM.**
 *
 * Both are things only a browser can answer: a painted background, and a dialog's structure.
 * jsdom has no layout and no hover (golden rule 12c). (§D1 measured Import's slot across the
 * two views; `UI-POLISH-01` C left one view, so it went with `Manage`.)
 */
test('§D2 — hover paints the whole ROW', async ({ app }) => {
  const page = app.page;
  await page.setViewportSize({ width: 1400, height: 900 });
  await app.openTemplatePicker();

  const row = page.locator('.cg-tpl-row').nth(1);
  const geometry = await row.evaluate((el) => {
    const load = el.querySelector('.cg-tpl-row__load');
    const r = el.getBoundingClientRect();
    const lr = load?.getBoundingClientRect();
    return {
      rowW: +r.width.toFixed(1),
      rowH: +r.height.toFixed(1),
      loadW: lr === undefined ? 0 : +lr.width.toFixed(1),
      loadH: lr === undefined ? 0 : +lr.height.toFixed(1),
      ground: getComputedStyle(el.closest('[role="dialog"]') as HTMLElement).backgroundColor,
    };
  });
  /*
    THE TARGET IS THE ROW, not the press control inside it: measured, the row is
    752 × 81 and the control 724 × 49, so lighting the control would leave a frame of un-lit
    row around the pointer. This assertion is what makes the next one mean "the row".
  */
  expect(geometry.loadW, 'the control fills the row, so this test proves nothing').toBeLessThan(
    geometry.rowW,
  );
  expect(geometry.loadH).toBeLessThan(geometry.rowH);

  await row.hover();
  await expect
    .poll(async () => row.evaluate((el) => getComputedStyle(el).backgroundColor), { timeout: 4000 })
    .not.toBe('rgba(0, 0, 0, 0)');
  const lit = await row.evaluate((el) => getComputedStyle(el).backgroundColor);
  /*
    🔴 AND IT MUST DIFFER FROM THE GROUND BEHIND IT. The rule was here all along and painted
    `--r-table-row-hover`, which IS `colors.panel` — the picker's own dialog ground. A row
    painted the colour of the thing behind it is not a hover, and this is the assertion that
    would have caught it.
  */
  expect(lit, 'the hover paints the row the same colour as the dialog behind it').not.toBe(
    geometry.ground,
  );

  await app.closeTemplatePicker();
});

test('§D3 — the delete confirm has the family’s mark, shape and red', async ({ app }) => {
  const page = app.page;
  await page.setViewportSize({ width: 1400, height: 900 });
  await app.openTemplatePicker();
  await page
    .getByRole('button', { name: /^Delete .* from this station$/ })
    .first()
    .click();

  const confirm = page.getByRole('dialog', { name: /^Delete .* from this station\?$/ });
  await expect(confirm).toBeVisible();

  // (a) THE MARK. It is the default for every confirm now, not a per-call flag.
  await expect(confirm.locator('[data-confirm-emblem]')).toHaveCount(1);

  /*
    (b) THE TWO-PART SHAPE: a short question naming the thing, THEN the consequence. It went
    straight to the paragraph before — one block of prose with no line the eye lands on.
  */
  const paras = confirm.locator('p.cg-confirm-copy');
  await expect(paras).toHaveCount(2);
  await expect(paras.first().locator('strong')).toHaveCount(1);

  /*
    RESTRUCTURED, NOT REWRITTEN — every clause of the consequence survived. If a later edit
    "tidies" the paragraph, this is what fails.
  */
  const consequence = paras.nth(1);
  await expect(consequence).toContainText('the .vcg must be re-imported');
  await expect(consequence).toContainText("cleared with the row's own REMOVE first");

  /*
    (c) the family's red at a PRIMARY's weight — 🔴 and as of 2026-09-14 it is the DELETION
    family exactly as Station setup draws it, ground + edge + ink together. The owner put the
    two dialogs side by side: one act, two buttons, and the difference was where the dialog
    had been raised from rather than what the button does. `controls.css` carries the argument
    and the four ratios.

    ⚠ Still FILLED and still 700 — a darker fill, never an outline. Asserted from the tokens
    so this stays a claim about identity with that family rather than three hexes typed twice.
  */
  const commit = confirm.getByRole('button', { name: 'Delete from station', exact: true });
  await expect(commit).toHaveCSS(
    'background-color',
    await cssColour(page, 'var(--r-setup-danger-bg)'),
  );
  await expect(commit).toHaveCSS(
    'border-color',
    await cssColour(page, 'var(--r-setup-danger-line)'),
  );
  await expect(commit).toHaveCSS('color', await cssColour(page, 'var(--r-setup-danger-ink)'));
  await expect(commit).toHaveCSS('font-weight', '700');
  await expect(commit, 'a deletion turned into an outline').not.toHaveCSS(
    'background-color',
    'rgba(0, 0, 0, 0)',
  );

  await page.getByRole('button', { name: 'Cancel' }).last().click();
  await app.closeTemplatePicker();
});

/**
 * 🔴 ADDENDUM D §D3, THE SWEEP'S OTHER HALF — **THE MARK IS THE DEFAULT, SO IT CANNOT BE MISSED
 * ONE DIALOG AT A TIME.**
 *
 * It was opt-in and exactly three call sites opted in, all inside Station setup; nine console
 * confirms went without. This case reads two of the nine, and the ONE confirm that is
 * deliberately unmarked — a marked exception is what proves the default is doing the work
 * rather than the flag having been sprayed everywhere.
 */
test('§D3 — every destructive confirm carries the mark, and the constructive one does not', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1400, height: 900 });

  await page.getByRole('button', { name: 'Clear all rows holding a layer' }).click();
  const clearAll = page.getByRole('dialog', { name: /^Clear all/ });
  await expect(clearAll.locator('[data-confirm-emblem]'), 'Clear all lost its mark').toHaveCount(1);
  await clearAll.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('button', { name: 'Stop all on-air items' }).click();
  const stopAll = page.getByRole('dialog', { name: /^Stop all/ });
  await expect(stopAll.locator('[data-confirm-emblem]'), 'Stop all lost its mark').toHaveCount(1);
  await stopAll.getByRole('button', { name: 'Cancel' }).click();
});

/**
 * 🔴 **AND THE MARK PICTURES THE ACT** — the owner, 2026-09-14, photographing `Clear all 4
 * row(s) holding a layer?` and `Clear Layer 3?` under a red bin.
 *
 * §D3 above proves the mark is THERE. This proves it is not LYING: CLEAR and STOP delete
 * nothing — the dialogs say so in words two lines under the glyph — so the bin and the
 * deletion red are REMOVE's alone. `useDialog`'s `CONFIRM_EMBLEM` carries the argument.
 *
 * ⚠ Read as a CONTRAST, all three in one case, for exactly the reason the docblock above
 * gives for reading the marked and unmarked dialogs together: a case that checked CLEAR's
 * new glyph alone would pass against a build that had given the bin to nothing at all, and
 * one that checked REMOVE alone would pass against a build that had given it to everything.
 * The distinction IS the deliverable, so the distinction is what is measured.
 *
 * ⚠ And it is an e2e, not a dom spec, for the colour half: jsdom is not running this sheet,
 * and `color-mix` is resolved by the engine (golden rule 12c).
 */
test('the confirm mark pictures the act — CLEAR and STOP are not deletions', async ({ app }) => {
  const page = app.page;
  await page.setViewportSize({ width: 1400, height: 900 });

  const emblemInk = async (dialog: Locator): Promise<string> =>
    dialog.locator('[data-confirm-emblem]').evaluate((el) => getComputedStyle(el).color);

  // ── CLEAR — the row's own XSquare, inked in the verb the operator pressed.
  await page.getByRole('button', { name: 'Clear all rows holding a layer' }).click();
  const clearAll = page.getByRole('dialog', { name: /^Clear all/ });
  // `XSquare` is an alias — lucide paints it `lucide-square-x`. Read from the built bundle,
  // not assumed from the import name.
  await expect(clearAll.locator('[data-confirm-emblem] svg')).toHaveClass(/lucide-square-x/);
  await expect(clearAll.locator('[data-confirm-emblem] svg')).not.toHaveClass(/lucide-trash/);
  expect(await emblemInk(clearAll), 'the CLEAR mark is not wearing its verb').toBe(
    await cssColour(page, 'var(--r-verb-clear)'),
  );
  await clearAll.getByRole('button', { name: 'Cancel' }).click();

  // ── STOP — the graceful-exit glyph, and the same rule.
  await page.getByRole('button', { name: 'Stop all on-air items' }).click();
  const stopAll = page.getByRole('dialog', { name: /^Stop all/ });
  await expect(stopAll.locator('[data-confirm-emblem] svg')).toHaveClass(
    /lucide-circle-arrow-out-down-right/,
  );
  await expect(stopAll.locator('[data-confirm-emblem] svg')).not.toHaveClass(/lucide-trash/);
  expect(await emblemInk(stopAll), 'the STOP mark is not wearing its verb').toBe(
    await cssColour(page, 'var(--r-verb-stop)'),
  );
  await stopAll.getByRole('button', { name: 'Cancel' }).click();

  /*
    ── REMOVE — THE CONTROL. The bin still exists and still means what it says, on the one
    console verb that cannot be undone. If this half ever goes, the change above stopped being
    "the mark pictures the act" and became "there is no mark".

    `Remove all` is WITHHELD while anything is on air (`R-017`), and the seed has rows on air —
    so the row's own REMOVE is the reachable spelling of the same verb.
  */
  await page.getByRole('button', { name: 'Clear all rows holding a layer' }).click();
  const confirmClear = page.getByRole('dialog', { name: /^Clear all/ });
  await confirmClear.getByRole('button', { name: /^Clear all$/ }).click();
  await expect(confirmClear).toBeHidden();

  await page.getByRole('button', { name: 'Remove all items' }).click();
  const removeAll = page.getByRole('dialog', { name: /^Remove all/ });
  await expect(removeAll.locator('[data-confirm-emblem] svg')).toHaveClass(/lucide-trash/);
  // …in the deletion family Station setup already draws — see §D3's (c) and `controls.css`.
  await expect(removeAll.getByRole('button', { name: /^Remove all$/ })).toHaveCSS(
    'background-color',
    await cssColour(page, 'var(--r-setup-danger-bg)'),
  );
  await expect(removeAll.getByRole('button', { name: /^Remove all$/ })).toHaveCSS(
    'color',
    await cssColour(page, 'var(--r-setup-danger-ink)'),
  );
  await removeAll.getByRole('button', { name: 'Cancel' }).click();
});
