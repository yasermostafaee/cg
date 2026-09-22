import { buildValidVcg, expect, test } from './fixtures/runtime.js';

/**
 * 🔴 `RUNTIME-REDESIGN-01` Phase 8 (`PROMPT.md` §8) — **the template picker and the audit log
 * measure to the reference as RENDERED, read back from the token home — in a real engine.**
 *
 * `01-template-picker.html` and `03-audit-log.html` were measured in Chromium at 1280 × 800
 * with each dialog opened by the page's own `data-start` (`design.md` §15.3): a search box 39
 * tall, 32 px kind chips, 56 × 49 thumbnails under a 15 px name; and a ledger-wide frame whose
 * table head is `12px 16px` at 12 px and whose cells are `15px 16px` at 13 px, with an actor
 * column the reference does NOT draw (guard item 27). The console strip that used to sit beside
 * it is retired (`OPERATOR-NAME-SWEEP-01`), and its ABSENCE is what is asserted here now.
 * Every number is READ from the token home (`--r-tpl-*`, `--r-audit-*`, `--r-modal-w-*`)
 * and compared against what the page paints, so a token that stops being read fails here
 * rather than passing on a coincidence.
 *
 * ⚠ Geometry belongs in Playwright (golden rule 12c / `B-245`): jsdom has no layout, so the
 * dom specs beside this one assert structure and words, never a box.
 */

const px = (v: string): number => Number.parseFloat(v);

test('§8 — the picker measures to `LIBRARY_PX` at 1280 × 800', async ({ app }) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });
  await app.importVcg('measured.vcg', await buildValidVcg('tpl-e2e-measured'));
  await app.openTemplatePicker();
  const dialog = app.templatePicker;

  const tokens = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const read = (n: string): string => cs.getPropertyValue(n).trim();
    return {
      searchH: read('--r-tpl-search-h'),
      searchText: read('--r-tpl-search-text'),
      chipH: read('--r-tpl-chip-h'),
      chipText: read('--r-tpl-chip-text'),
      thumbW: read('--r-tpl-thumb-w'),
      thumbH: read('--r-tpl-thumb-h'),
      nameText: read('--r-tpl-name-text'),
      metaText: read('--r-tpl-meta-text'),
      rowPad: read('--r-tpl-row-pad'),
      footText: read('--r-tpl-foot-text'),
    };
  });

  /*
    THE FRAME — `library`, the reference's own BASE `.modal` width: min(1120, 1280 − 56) = 1120.

    ⚠ The width has moved three times and each move is a different fact, so the history is kept
    rather than overwritten: `prose` 460 before Phase 8, `wide` 720 after it, `wide`'s 860 after
    `REPAIR-03` took the `.audio-modal`'s number for that family — and now the picker's OWN
    width (audit row 97), which is a fifth size because `wide` IS the audio dialog's 860 and two
    other dialogs wear it. Measured by opening `#template-dialog`, never read off the sheet:
    `.modal` is restated inside a narrow `@media` that does not paint at this viewport.
  */
  const frame = await dialog.evaluate((el) => Math.round(el.getBoundingClientRect().width));
  expect(frame).toBe(1120);
  // POSITIVE CONTROL: every width this dialog has ever worn is below the one asserted above,
  // so this number moving is a real change and not a re-read of the same box.
  expect(frame).toBeGreaterThan(860);

  /*
    🔴 `RUNTIME-REPAIR-04` §3.1 — THE TWO COLUMNS. The reference's `.template-layout` is
    `776px 342px`; the ASIDE is the fixed half and the list takes the rest, so the assertion is
    on the aside's width and on the main column being the larger of the two at this viewport.

    ⚠ PLAYWRIGHT, NOT JSDOM (golden rule 12c): these are boxes. A jsdom copy would read 0 for
    both and pass against a dialog with no second column at all — which is exactly the state
    this file exists to tell apart from the built one.
  */
  const aside = dialog.locator('[data-template-aside]');
  await expect(aside).toBeVisible();
  const asideBox = await aside.evaluate((el) => el.getBoundingClientRect().width);
  expect(Math.round(asideBox), 'the reference’s 342 px detail column').toBe(342);
  const layout = await dialog
    .locator('[data-template-layout]')
    .evaluate((el) => el.getBoundingClientRect().width);
  expect(layout - asideBox, 'the list column takes the rest').toBeGreaterThan(asideBox);

  /*
    THE DESTINATION CARD — the one block of the reference's aside this product can fill without
    a selection, and the reason the column is not furniture: it names the ROW the picker was
    opened from, with the real coordinate in the sentence (`R-028`).
  */
  const dest = dialog.locator('[data-template-destination]');
  await expect(dest).toBeVisible();
  await expect(dest).toContainText(/Destination ·/);
  await expect(dest).toContainText(/on \d+-\d+/);

  /*
    🔴 `RUNTIME-REPAIR-05` — THE ASIDE READS THE SELECTION OUT, and the drop zone has left
    it for the Import dialog. Before anything is chosen the column still says something, which
    is the property worth holding: a 342 px column that is blank until you click is furniture.
  */
  await expect(aside.locator('[data-template-drop]'), 'the drop zone left with import').toHaveCount(
    0,
  );
  await expect(aside.locator('[data-template-aside-hint]')).toBeVisible();

  // Select one, and the column becomes its read-out with a verdict at the foot.
  await dialog.locator('[data-template-id] .cg-tpl-row__load').first().click();
  await expect(aside.locator('[data-template-selected]')).toHaveCount(1);
  await expect(aside.locator('[data-template-verdict]')).toBeVisible();

  // THE SEARCH — 39 tall at 14 px, the glyph inside its start padding.
  const search = dialog.getByRole('searchbox', { name: 'Search templates' });
  const searchBox = await search.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { h: el.getBoundingClientRect().height, text: cs.fontSize, padStart: cs.paddingLeft };
  });
  expect(Math.round(searchBox.h)).toBe(px(tokens.searchH));
  expect(px(searchBox.text)).toBe(px(tokens.searchText));
  expect(px(searchBox.padStart)).toBeGreaterThanOrEqual(px(tokens.searchText) * 2);

  // THE KIND CHIPS — three, 32 tall, 12 px, the first pressed.
  const chips = dialog.locator('[data-template-filter]');
  await expect(chips).toHaveCount(3);
  const chip = await chips.first().evaluate((el) => ({
    h: el.getBoundingClientRect().height,
    text: getComputedStyle(el).fontSize,
    pressed: el.getAttribute('aria-pressed'),
  }));
  expect(Math.round(chip.h)).toBe(px(tokens.chipH));
  expect(px(chip.text)).toBe(px(tokens.chipText));
  expect(chip.pressed).toBe('true');

  // A ROW — its thumbnail box, its name rank, its meta rank, its padding.
  const row = app.templateRow('tpl-e2e-measured');
  await expect(row).toBeVisible();
  const measured = await row.evaluate((el) => {
    const thumb = el.querySelector('.cg-tpl-thumb');
    const name = el.querySelector('.cg-tpl-name');
    const meta = el.querySelector('.cg-tpl-meta');
    if (thumb === null || name === null || meta === null) throw new Error('row parts missing');
    const t = thumb.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      thumbW: t.width,
      thumbH: t.height,
      nameText: getComputedStyle(name).fontSize,
      metaText: getComputedStyle(meta).fontSize,
      padTop: cs.paddingTop,
      padLeft: cs.paddingLeft,
    };
  });
  const [rowPadY, rowPadX] = tokens.rowPad.split(' ').map(px);
  expect(Math.round(measured.thumbW)).toBe(px(tokens.thumbW));
  expect(Math.round(measured.thumbH)).toBe(px(tokens.thumbH));
  expect(px(measured.nameText)).toBe(px(tokens.nameText));
  expect(px(measured.metaText)).toBe(px(tokens.metaText));
  expect(px(measured.padTop)).toBe(rowPadY);
  expect(px(measured.padLeft)).toBe(rowPadX);
  // `RUNTIME-REPAIR-05` — the row's control SELECTS; the footer loads. The id is still on
  // its title, which is the claim this line has always made (golden rule 11).
  await expect(row.getByRole('button', { name: /^Select / })).toHaveAttribute(
    'title',
    'tpl-e2e-measured',
  );

  // THE FOOTER SENTENCE — 13 px, the reference's words, beside the two actions.
  const foot = dialog.locator('[data-template-foot-info]');
  await expect(foot).toHaveText(
    'Loading prepares the row. Use Play when you’re ready to go on air.',
  );
  expect(px(await foot.evaluate((el) => getComputedStyle(el).fontSize))).toBe(px(tokens.footText));
  /*
    `02`'s drop zone — in the IMPORT dialog since `RUNTIME-REPAIR-05`, which is its own
    surface now. Its shape is the reference's either way: dashed, and its `Choose file…`
    primary INSIDE it (audit row 111).
  */
  await dialog.getByRole('button', { name: 'Import a .vcg' }).click();
  const drop = page.locator('[data-import-drop]');
  await expect(drop).toBeVisible();
  expect(await drop.evaluate((el) => getComputedStyle(el).borderTopStyle)).toBe('dashed');
  await expect(drop.getByRole('button', { name: 'Choose file…' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).last().click();
  await app.closeTemplatePicker();
});

test('§8 — the audit log measures to `AUDIT_LOG_PX`, with the actor column and NO console strip', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });
  const layer = await app.importVcg('logged.vcg', await buildValidVcg('tpl-e2e-logged'));
  await app.layerRow(layer).getByRole('button', { name: 'PLAY' }).click();
  await page.getByRole('button', { name: 'Open audit log' }).click();
  const log = page.getByRole('dialog', { name: 'Audit log' });
  await expect(log).toBeVisible();

  const tokens = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const read = (n: string): string => cs.getPropertyValue(n).trim();
    return {
      thPad: read('--r-audit-th-pad'),
      thText: read('--r-audit-th-text'),
      tdPad: read('--r-audit-td-pad'),
      tdText: read('--r-audit-td-text'),
      colTime: read('--r-audit-col-time'),
      colActor: read('--r-audit-col-actor'),
      badgeText: read('--r-audit-badge-text'),
      selectH: read('--r-audit-select-h'),
      fieldW: read('--r-audit-field-w'),
      subtitleText: read('--r-modal-subtitle-text'),
    };
  });

  // THE FRAME — the LEDGER width: min(1250, 1280 − 56) = 1224 at this viewport.
  const frame = await log.evaluate((el) => Math.round(el.getBoundingClientRect().width));
  expect(frame).toBe(1224);
  // POSITIVE CONTROL: it was `wide` (720) before this phase.
  expect(frame).toBeGreaterThan(720);
  // The reference's line under the title.
  const subtitle = log.locator('[data-modal-subtitle]');
  await expect(subtitle).toHaveText('Station actions and their recorded outcomes.');
  expect(px(await subtitle.evaluate((el) => getComputedStyle(el).fontSize))).toBe(
    px(tokens.subtitleText),
  );

  // THE TOOLS — a labelled 39 px select, 132 wide; the Action select first.
  const action = log.locator('#audit-action');
  const actionBox = await action.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { h: r.height, w: r.width };
  });
  expect(Math.round(actionBox.h)).toBe(px(tokens.selectH));
  expect(Math.round(actionBox.w)).toBe(px(tokens.fieldW));
  await expect(log.locator('#audit-result')).toBeVisible();

  // THE HEAD — five words, `12px 16px` at 12 px; ACTOR second (guard item 27).
  const head = log.locator('[data-audit-head]');
  await expect(head.locator('span')).toHaveText([
    'Time',
    'Actor',
    'Action',
    'Item / detail',
    'Outcome',
  ]);
  const th = await head
    .locator('span')
    .nth(1)
    .evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        padTop: cs.paddingTop,
        padLeft: cs.paddingLeft,
        text: cs.fontSize,
        w: el.getBoundingClientRect().width,
      };
    });
  const [thPadY, thPadX] = tokens.thPad.split(' ').map(px);
  expect(px(th.padTop)).toBe(thPadY);
  expect(px(th.padLeft)).toBe(thPadX);
  expect(px(th.text)).toBe(px(tokens.thText));
  expect(Math.round(th.w)).toBe(px(tokens.colActor));
  expect(
    Math.round(
      await head
        .locator('span')
        .first()
        .evaluate((el) => el.getBoundingClientRect().width),
    ),
  ).toBe(px(tokens.colTime));

  // A ROW — `15px 16px` at 13 px; its actor cell carries the mock's actor; the outcome is a tag.
  const take = log.locator('[data-audit-row]').first();
  await expect(take).toContainText('take');
  const cell = await take.locator('[data-audit-actor]').evaluate((el) => {
    const cs = getComputedStyle(el);
    return {
      padTop: cs.paddingTop,
      padLeft: cs.paddingLeft,
      text: cs.fontSize,
      actor: el.textContent,
    };
  });
  const [tdPadY, tdPadX] = tokens.tdPad.split(' ').map(px);
  expect(px(cell.padTop)).toBe(tdPadY);
  expect(px(cell.padLeft)).toBe(tdPadX);
  expect(px(cell.text)).toBe(px(tokens.tdText));
  expect(cell.actor).toBe('unattributed');
  const tag = take.locator('[data-audit-outcome]');
  await expect(tag).toHaveText('ok');
  expect(px(await tag.evaluate((el) => getComputedStyle(el).fontSize))).toBe(px(tokens.badgeText));
  // Golden rule 11 — the coordinate stays in the entry.
  await expect(take.locator('[data-audit-slot]')).toHaveText(new RegExp(`^on 1-${String(layer)}$`));

  /*
    🔴 `OPERATOR-NAME-SWEEP-01` — **THE CONSOLE STRIP IS GONE, and its geometry block with it.**

    What stood here measured the field at 132 px, the caveat at 12 px, and the strip's box
    against the table's top edge and the actor column's left and right — a careful piece of
    real-browser measurement (golden rule 12c) for a control that no longer exists.

    ⭐ **Its absence is asserted, with a control.** The panel is proved LIVE by everything above
    — the frame's 1224 px, the column widths, a row's padding and its actor cell — so a
    `toHaveCount(0)` here cannot pass against a dialog that failed to render.

    ⚠ The two tokens it read (`--r-audit-console-input-w`, `--r-audit-caveat-text`) left
    `theme.ts` in the same commit. `tokenHome` catches a token read-but-undeclared and never
    one declared with no reader, so nothing else would have noticed them going stale.
  */
  await expect(log.locator('[data-audit-console]')).toHaveCount(0);
  await expect(log.locator('#audit-operator')).toHaveCount(0);
  await expect(log.locator('[data-audit-caveat]')).toHaveCount(0);

  // THE FOOTER — the count, then Close.
  await expect(log.locator('[data-audit-count]')).toHaveText(/^\d+ of \d+ events$/);
  await log.getByRole('button', { name: 'Close' }).last().click();
  await expect(log).toHaveCount(0);
});

/**
 * 🔴 `MODAL-TRUTH-01` §3.1 — **THE AUDIT LOG'S FOOTER SITS ON THE FRAME'S BOTTOM EDGE,
 * WHATEVER THE BODY'S HEIGHT.**
 *
 * Owner-reported and photographed: the shell held its full declared height while the inner
 * column sized to content, so `0 of 0 events` + `Close` sat directly under a two-line body
 * with a large dead region beneath them INSIDE the shell.
 *
 * The rule is `PLATES-AUDIO-11` DELTA §2's, written in `Modal.tsx`'s `styles.bodyFlush`:
 * _"A declared height alone does not put the footer at the bottom … with fewer rows than
 * the frame holds it is CONTENT-sized: the footer floats up under the last row and the
 * frame's lower third is dead space."_ The audit log never got it because that note scoped
 * the fix to the `frame="fixed"` opt-in; this asserts the opt-in was taken.
 *
 * ⚠ **This test is here and not in jsdom for the reason the file header gives**, and the
 * EMPTY record is the point: with a full table the footer is at the bottom either way, so a
 * spec that logged some events first would have passed over the defect. The mock's audit
 * starts empty, so this opens the log having done nothing.
 */
test('`MODAL-TRUTH-01` §3.1 — an EMPTY audit log keeps its footer on the frame’s bottom edge', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole('button', { name: 'Open audit log' }).click();
  const log = page.getByRole('dialog', { name: 'Audit log' });
  await expect(log).toBeVisible();
  // The record really is empty — the condition this test is about.
  await expect(log.locator('[data-audit-count]')).toHaveText('0 of 0 events');

  const geometry = await log.evaluate((el) => {
    const body = el.querySelector('[data-modal-body]');
    const foot = el.querySelector('.cg-modal-footer');
    const empty = el.querySelector('.cg-audit-empty');
    if (body === null || foot === null || empty === null)
      throw new Error('body, footer or empty state missing');
    const d = el.getBoundingClientRect();
    const b = body.getBoundingClientRect();
    const f = foot.getBoundingClientRect();
    const e = empty.getBoundingClientRect();
    return {
      dialogBottom: d.bottom,
      dialogHeight: d.height,
      footBottom: f.bottom,
      footTop: f.top,
      bodyBottom: b.bottom,
      contentBottom: e.bottom,
    };
  });

  /*
    POSITIVE CONTROLS, first, because the assertion below is trivially satisfied by a body
    that happens to fill the frame and would then have measured nothing.

    (1) The frame is DECLARED, not intrinsic — `--r-modal-h-frame` is `min(810px,
        100vh - 64px)` = 736 at this viewport.
    (2) The body genuinely has SLACK: its last content — the one-line empty state — ends
        well above the body's own bottom edge, which is what "the body took the slack"
        means and is exactly the space that used to sit UNDER the footer instead.

    ⚠ `scrollHeight` cannot serve as (2): it is `max(content, clientHeight)`, so it equals
    the box height for any content shorter than the box and reads the same either way. It
    was the first thing written here and it fired on the fixed build.
  */
  expect(geometry.dialogHeight).toBeGreaterThan(600);
  expect(geometry.bodyBottom - geometry.contentBottom).toBeGreaterThan(100);

  // THE ASSERTION: no dead region under the footer — it ends where the frame does.
  expect(Math.abs(geometry.dialogBottom - geometry.footBottom)).toBeLessThanOrEqual(2);
  // And the band is still a band: the body took the slack, the footer did not grow into it.
  expect(geometry.footBottom - geometry.footTop).toBeLessThan(120);

  await log.getByRole('button', { name: 'Close' }).last().click();
  await expect(log).toHaveCount(0);
});
