import { test, expect } from './fixtures/runtime.js';

/**
 * 🔴 `RUNTIME-REDESIGN-01` Phase 7 (`PROMPT.md` §7) — **Station setup measures to the reference
 * as RENDERED, read back from the token home — in a real engine.**
 *
 * `09-channel-settings.html` was measured in Chromium at 1280 × 800 with the dialog opened by
 * the page's own `data-start="channels"` (`design.md` §14.3): a `min(1140px, 100vw − 64px)` ×
 * `min(810px, 100vh − 64px)` frame, a 90 px head carrying a channel subtitle, a 226 px rail of
 * 44 px icon tabs, a pane inset 29/32, a 74 px footer, and a Channel pane built from a video-format
 * card and an Outputs block. Every number below is READ from the token home (`--r-setup-*`,
 * `--r-modal-*`) and compared against what the page paints, so a token that stops being read
 * fails here rather than passing on a coincidence.
 *
 * ⚠ Geometry belongs in Playwright (golden rule 12c / `B-245`): jsdom has no layout, so a dom
 * spec asserting any of these boxes compares zeros. `station-setup-frame.spec.ts` keeps the
 * TWO-EDGE property (one box on every tab, the footer's top edge still); this file asserts what
 * the box IS.
 */

const px = (v: string): number => Number.parseFloat(v);

test('§7 — the frame, the rail, the pane and the footer measure to the token home at 1280 × 800', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });
  const dialog = page.getByRole('dialog', { name: 'Station setup' });
  await page.getByRole('button', { name: 'Open Station setup', exact: true }).click();
  await expect(dialog).toBeVisible();

  const tokens = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const read = (n: string): string => cs.getPropertyValue(n).trim();
    return {
      railW: read('--r-setup-rail-w'),
      tabMinH: read('--r-setup-tab-min-h'),
      panePad: read('--r-setup-pane-pad'),
      footH: read('--r-modal-foot-h'),
      footPad: read('--r-modal-foot-pad-fixed'),
      headMinH: read('--r-modal-head-min-h-fixed'),
      subtitleText: read('--r-modal-subtitle-text'),
      titleText: read('--r-setup-title-text'),
      cardRadius: read('--r-setup-card-radius'),
    };
  });

  // THE FRAME — the reference's 1140 × min(810, 800 − 64) = 736 at this viewport.
  const frame = await dialog.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
  expect(frame).toEqual({ w: 1140, h: 736 });
  // POSITIVE CONTROL: the abandoned mockup's frame was 1000 × 680; a page still painting it
  // could not pass the line above, and neither could a dialog that failed to render.
  expect(frame.w).toBeGreaterThan(1000);

  // THE HEAD — its floor, and the subtitle naming the channel this dialog reports.
  const head = await dialog.evaluate((el) => {
    const first = el.firstElementChild;
    if (first === null) throw new Error('the dialog has no head');
    const sub = el.querySelector('[data-modal-subtitle]');
    return {
      h: first.getBoundingClientRect().height,
      subtitle: sub?.textContent ?? '',
      subtitleText: sub === null ? '' : getComputedStyle(sub).fontSize,
    };
  });
  expect(head.h).toBeGreaterThanOrEqual(px(tokens.headMinH));
  expect(head.subtitle).toContain('Channel 1');
  expect(head.subtitle).toContain('Primary A');
  expect(px(head.subtitleText)).toBe(px(tokens.subtitleText));

  // THE RAIL — its width, and a tab's height, from the tokens; each tab wears its glyph.
  const rail = dialog.getByRole('tablist', { name: 'Station setup sections' });
  expect(Math.round(await rail.evaluate((el) => el.getBoundingClientRect().width))).toBe(
    px(tokens.railW),
  );
  const tab = rail.getByRole('tab', { name: /^Channel/ });
  expect(Math.round(await tab.evaluate((el) => el.getBoundingClientRect().height))).toBe(
    px(tokens.tabMinH),
  );
  await expect(rail.locator('.cg-rail-tab > svg')).toHaveCount(5);

  // THE PANE — inset `29px 32px 32px`.
  const pane = dialog.locator('[data-station-pane]');
  const [padTop, padX, padBottom] = tokens.panePad.split(' ').map(px);
  const paneStyle = await pane.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { top: cs.paddingTop, left: cs.paddingLeft, bottom: cs.paddingBottom };
  });
  expect(px(paneStyle.top)).toBe(padTop);
  expect(px(paneStyle.left)).toBe(padX);
  expect(px(paneStyle.bottom)).toBe(padBottom);

  // THE SECTION HEAD — a 24 px title, and the contract tag beside it.
  const title = dialog.locator('.cg-setup-title');
  await expect(title).toHaveText('Channel');
  expect(px(await title.evaluate((el) => getComputedStyle(el).fontSize))).toBe(
    px(tokens.titleText),
  );
  await expect(dialog.locator('[data-section-commit="read-only"]')).toHaveText('Read only');

  // THE FOOTER — a 74 px FLOOR, `15px 32px`, on the Channel tab (which puts no button in it).
  const foot = await dialog.locator('.cg-modal-footer').evaluate((el) => {
    const cs = getComputedStyle(el);
    return { h: el.getBoundingClientRect().height, minH: cs.minHeight, padLeft: cs.paddingLeft };
  });
  expect(Math.round(foot.h)).toBe(px(tokens.footH));
  expect(px(foot.minH)).toBe(px(tokens.footH));
  expect(px(foot.padLeft)).toBe(px(tokens.footPad.split(' ')[1] ?? ''));

  // A CARD — radius 12, from the token.
  const card = dialog.getByRole('region', { name: 'Video format', exact: true });
  expect(px(await card.evaluate((el) => getComputedStyle(el).borderRadius))).toBe(
    px(tokens.cardRadius),
  );
});

test('§7 — the Channel pane is the video-format card and the Outputs block, keyed to CH 01', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });
  const dialog = page.getByRole('dialog', { name: 'Station setup' });
  await page.getByRole('button', { name: 'Open Station setup', exact: true }).click();
  await expect(dialog).toBeVisible();

  const card = dialog.getByRole('region', { name: 'Video format', exact: true });
  await expect(card).toHaveAttribute('data-raster-channel', '1');
  await expect(card.locator('.cg-video-token')).toHaveText('CH 01');
  // The mock's mode is `1080i5000`: the word, the scan, and the rate as both halves.
  await expect(card.locator('[data-video-mode-word]')).toHaveText('1080i');
  await expect(card.locator('.cg-video-mode__scan')).toHaveText('Interlaced');
  const metrics = card.locator('.cg-video-metric');
  await expect(metrics.nth(0)).toContainText('Resolution');
  await expect(metrics.nth(0)).toContainText('1920 × 1080');
  await expect(metrics.nth(1)).toContainText('Frame rate');
  await expect(metrics.nth(1)).toContainText('25 fps · 50 fields/s');
  await expect(metrics.nth(2)).toContainText('Server mode');
  await expect(metrics.nth(2)).toContainText('1080i5000');
  // …and the app's own two facts the reference does not draw (the deletion guard keeps them).
  await expect(metrics.nth(3)).toContainText('Declared by');
  await expect(metrics.nth(4)).toContainText('Check');
  await expect(metrics.nth(4)).toContainText('agrees with the server');

  // The mode word is the reference's 46 px rank, from the token.
  const modeText = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--r-video-mode-text').trim(),
  );
  expect(
    px(
      await card.locator('[data-video-mode-word]').evaluate((el) => getComputedStyle(el).fontSize),
    ),
  ).toBe(px(modeText));

  // The Outputs block heads the same pane. The offline mock publishes no output check, so the
  // block says so for THIS channel rather than drawing an empty table.
  const outputs = dialog.getByRole('region', { name: 'Program outputs', exact: true });
  await expect(outputs.locator('h3')).toHaveText('Outputs');
  await expect(outputs).toContainText('no output check has completed yet for channel 1');
  await expect(outputs.locator('[data-output-table]')).toHaveCount(0);

  // The channel strip outside the dialog is the same one channel, selected.
  await page.keyboard.press('Escape');
  const strip = page.getByRole('tablist', { name: 'Channels' });
  await expect(strip.getByRole('tab')).toHaveCount(1);
  await expect(strip.getByRole('tab', { name: 'CHANNEL 1' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

/**
 * 🔴 `SETTINGS-DIALOG-01` §3 — **THE SERVERS BODY, measured — audit row 135.**
 *
 * Phase 7 measured this dialog's frame, rail, footer and Channel pane and said so plainly
 * (`design.md` 14.8: _"It did not re-measure the bodies of the Servers, Live sources, Delimiters
 * and Layers tabs"_). Those four are audit rows 134–137, bucket D — never measured, screenshots
 * their only evidence. This is the first real measurement of one of them.
 *
 * The reference column is Chromium at 1280 × 800 on `09-channel-settings.html`, through the
 * shadow root, with `#tab-servers` CLICKED first — ⚠ a `hidden` pane reports a 0 × 0 box and
 * every computed length reads as though the surface were empty, so an unclicked reading is not a
 * weak reading, it is no reading at all. Measured there: `.field{gap:7px}` with its label
 * 13 px / 500 and its control `min-height:36px;padding:7px 10px;border-radius:8px` at 15 px, its
 * `.hint` 12 px; `.fields{gap:19px 18px}` and `.fields.three` resolving `1.8fr 1fr 1fr`;
 * `.server-label` 25 × 25 radius 6; `.empty-backup{padding:19px 20px;gap:14px}` with a 42 × 42
 * radius-10 glyph box; `.switch-row{padding:17px 0 0;gap:20px}`.
 *
 * ⚠ Every expectation reads the TOKEN and compares it to what the page PAINTS, like the frame
 * test above — so a token that stops being read fails here instead of passing on a coincidence.
 */
test('§3 — the Servers pane measures to the reference: a field grid, the A/B chip, the empty state and the switch row', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });
  const dialog = page.getByRole('dialog', { name: 'Station setup' });
  await page.getByRole('button', { name: 'Open Station setup', exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole('tablist', { name: 'Station setup sections' })
    .getByRole('tab', { name: /^Servers/ })
    .click();

  const tokens = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const read = (n: string): string => cs.getPropertyValue(n).trim();
    return {
      fieldGap: read('--r-setup-field-gap'),
      labelText: read('--r-setup-field-label-text'),
      inputMinH: read('--r-setup-field-input-min-h'),
      inputPad: read('--r-setup-field-input-pad'),
      inputRadius: read('--r-setup-field-input-radius'),
      inputText: read('--r-setup-field-input-text'),
      hintText: read('--r-setup-field-hint-text'),
      fieldsGap: read('--r-setup-fields-gap'),
      chipBox: read('--r-setup-server-chip-box'),
      emptyPad: read('--r-setup-empty-pad'),
      emptyGap: read('--r-setup-empty-gap'),
      emptyIconBox: read('--r-setup-empty-icon-box'),
      switchPadTop: read('--r-setup-switch-row-pad-top'),
      switchGap: read('--r-setup-switch-row-gap'),
      emptyTitleText: read('--r-setup-empty-title-text'),
      emptyBodyText: read('--r-setup-empty-body-text'),
      emptyBodyGap: read('--r-setup-empty-body-gap'),
      weightSemibold: read('--r-weight-semibold'),
      tagText: read('--r-setup-tag-text'),
      tagRadius: read('--r-setup-tag-radius'),
      ledeText: read('--r-setup-card-lede-text'),
      ledeGap: read('--r-setup-card-lede-gap'),
    };
  });
  // The token home is READ, not assumed: an undeclared token resolves to '' and would make
  // every comparison below vacuously compare '' to '' (golden rule 12c's shape).
  expect(tokens.inputMinH).toBe('36px');
  expect(tokens.fieldsGap).toBe('19px 18px');

  // ── THE FIELD — a label ABOVE its control, which is the whole point of the row ──────
  /*
    ⚠ Scoped to the PRIMARY card. The fixture configures a backup, so BOTH server cards draw
    a `Host` field — which is correct, and is why an unscoped read is a strict-mode violation
    rather than a passing test that happened to pick one of the two.
  */
  const primaryCard = dialog.getByRole('region', { name: 'Primary server' });
  const hostField = primaryCard.getByText('Host', { exact: true }).locator('..');
  const field = await hostField.evaluate((el) => {
    const s = getComputedStyle(el);
    return { gap: s.rowGap, dir: s.flexDirection, disp: s.display };
  });
  expect(field.disp).toBe('flex');
  // 🔴 THE STRUCTURAL CLAIM: column, so the label sits over the input. `row` is what this
  // pane painted before, and a Persian label beside its own input is what it cost.
  expect(field.dir).toBe('column');
  expect(field.gap).toBe(tokens.fieldGap);

  const label = await primaryCard
    .getByText('Host', { exact: true })
    .evaluate((el) => getComputedStyle(el).fontSize);
  expect(label).toBe(tokens.labelText);

  // The control itself — the reference's taller, rounder box, scoped to this pane.
  const input = await dialog.getByLabel('Primary host').evaluate((el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      minH: s.minHeight,
      pad: s.padding,
      radius: s.borderTopLeftRadius,
      text: s.fontSize,
      h: Math.round(r.height),
    };
  });
  expect(input.minH).toBe(tokens.inputMinH);
  expect(input.pad).toBe(tokens.inputPad);
  expect(input.radius).toBe(tokens.inputRadius);
  expect(input.text).toBe(tokens.inputText);
  // PAINTED, not merely declared — the floor is a floor and the box clears it.
  expect(input.h).toBeGreaterThanOrEqual(36);

  // ── THE THREE-COLUMN ENDPOINT ROW — a wide host beside two narrow ports ────────────
  const grid = await primaryCard.locator('.cg-setup-fields--three').evaluate((el) => {
    const s = getComputedStyle(el);
    const cols = s.gridTemplateColumns.split(' ').map((v) => Number.parseFloat(v));
    return { disp: s.display, cols, rowGap: s.rowGap, colGap: s.columnGap };
  });
  expect(grid.disp).toBe('grid');
  expect(grid.cols).toHaveLength(3);
  expect(grid.rowGap).toBe('19px');
  expect(grid.colGap).toBe('18px');
  // The reference's own ratio: the host is 1.8× a port, and the two ports are equal.
  expect(grid.cols[1]).toBeCloseTo(grid.cols[2] as number, 0);
  expect((grid.cols[0] as number) / (grid.cols[1] as number)).toBeCloseTo(1.8, 1);

  // ── THE A / B CHIP — the letter beside the name, not inside it ─────────────────────
  const chip = await primaryCard.locator('.cg-setup-server-chip').evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
  expect(chip).toEqual({ w: px(tokens.chipBox), h: px(tokens.chipBox) });
  // And the head's title is the NAME now — `Primary (A)` spent one title on two facts.
  await expect(primaryCard.getByText('Primary server')).toBeVisible();

  // ── THE BACKUP EMPTY STATE — the reference's `.empty-backup` ───────────────────────
  /*
    ⚠ DRIVEN, not hoped for. The fixture configures a backup, so this block does not exist
    until the operator removes it — the only state it is for. Reading it without the press
    would have measured whatever the fixture happened to hold, and passed either way.
  */
  await expect(dialog.locator('.cg-setup-empty')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Remove backup' }).click();
  await expect(dialog.locator('.cg-setup-empty')).toHaveCount(1);

  const empty = await dialog.locator('.cg-setup-empty').evaluate((el) => {
    const s = getComputedStyle(el);
    const box = (sel: string): { w: number; h: number } | null => {
      const n = el.querySelector(sel);
      if (n === null) return null;
      const r = n.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    };
    const font = (sel: string): { size: string; weight: string; mt: string } | null => {
      const n = el.querySelector(sel);
      if (n === null) return null;
      const c = getComputedStyle(n);
      return { size: c.fontSize, weight: c.fontWeight, mt: c.marginTop };
    };
    return {
      pad: s.padding,
      gap: s.columnGap,
      icon: box('.cg-setup-empty__icon'),
      text: box('.cg-setup-empty__text'),
      title: font('.cg-setup-empty__title'),
      body: font('.cg-setup-empty__body'),
    };
  });
  expect(empty.pad).toBe(tokens.emptyPad);
  expect(empty.gap).toBe(tokens.emptyGap);
  expect(empty.icon).toEqual({ w: px(tokens.emptyIconBox), h: px(tokens.emptyIconBox) });

  /*
    🔴 THE INNER BLOCK, asserted because A PLANT PROVED IT WAS NOT.

    This test first read only the row's padding, its gap and the icon box — and a planted
    defect that RENAMED `.cg-setup-empty__text` to a class no rule matches came back GREEN.
    The row still had the right padding, the icon still measured 42, and the block that
    carries the two sentences had silently lost its `flex: 1`. That is the vacuous-assertion
    shape golden rule 12c warns about, found the only way it can be — by planting it.

    So the text block and both of its ranks are read now: the reference's `h3` at 14 px / 600
    over a 13 px line 3 px under it, in a block that takes the row's remaining width.
  */
  expect(empty.text).not.toBeNull();
  expect(empty.title).toEqual({
    size: tokens.emptyTitleText,
    weight: tokens.weightSemibold,
    mt: '0px',
  });
  expect(empty.body).toEqual({
    size: tokens.emptyBodyText,
    weight: '400',
    mt: tokens.emptyBodyGap,
  });
  // It fills the row rather than shrinking to its text — which is what the plant removed.
  expect(empty.text?.w ?? 0).toBeGreaterThan(px(tokens.emptyIconBox) * 4);
  // `B-046` survives the restructure: a single server is a CONFIGURATION, so the block still
  // says so in the app's own words and still offers the one act that changes it.
  await expect(dialog.getByText('No backup declared')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Add backup' })).toBeVisible();

  // ── THE SWITCH ROW — failover folded into the connection card ─────────────────────
  const sw = await dialog.locator('.cg-setup-switch-row').evaluate((el) => {
    const s = getComputedStyle(el);
    return { padTop: s.paddingTop, gap: s.columnGap, align: s.alignItems };
  });
  expect(sw.padTop).toBe(tokens.switchPadTop);
  expect(sw.gap).toBe(tokens.switchGap);
  expect(sw.align).toBe('center');

  /*
    ⭐ THE CARD-HEAD TAG and THE CARD LEDE — both found by rendering the app and the reference
    at the same size and looking, which is the only thing that surfaces an element that is
    ABSENT. No measurement of the app alone can report a tag the app does not draw.

    The tag reuses the section contract tag's chip tokens: one tag treatment at two levels.
  */
  const tag = await dialog
    .getByRole('region', { name: 'Backup server' })
    .locator('.cg-setup-card-tag')
    .evaluate((el) => {
      const c = getComputedStyle(el);
      return { text: el.textContent, size: c.fontSize, radius: c.borderTopLeftRadius };
    });
  expect(tag).toEqual({ text: 'Optional', size: tokens.tagText, radius: tokens.tagRadius });

  const lede = await dialog
    .getByRole('region', { name: 'Template serve address' })
    .locator('.cg-setup-lede')
    .evaluate((el) => {
      const c = getComputedStyle(el);
      return { size: c.fontSize, mb: c.marginBottom };
    });
  expect(lede).toEqual({ size: tokens.ledeText, mb: tokens.ledeGap });

  /*
    🔴 REDUNDANCY IS FOLDED IN, and this is the assertion that says so: the strategy and
    the failover switch are INSIDE the region that holds the template address, because the
    reference draws one card for all three and they are facts about the same pair of servers.
    The `Redundancy options` region is gone — pinned as an absence, since a second card is
    exactly what a later reader would restore.
  */
  const serve = dialog.getByRole('region', { name: 'Template serve address' });
  await expect(serve.getByLabel('Redundancy strategy')).toBeVisible();
  await expect(serve.getByLabel('Auto-failover enabled')).toBeVisible();
  await expect(dialog.getByRole('region', { name: 'Redundancy options' })).toHaveCount(0);
  // ⚠ And the card keeps the app's OWN name, which `server-settings.spec.ts` queries by:
  // the reference's `Station connection` is not adopted and nothing is reworded.
  await expect(serve.getByText(/how those servers reach this machine/i)).toBeVisible();

  /*
    ⚠ THE REFUSAL DID NOT MOVE INTO THE PANE. The reference draws its on-air block as a
    `.notice` band at the top of the Servers body; the app's refusal stays in the modal's
    pinned message region, where `AUDIT-CLOSE-01` delta A put it and
    `modal-message-containment.spec.ts` holds it. Asserted as an absence so the adopted
    `.cg-setup-notice` geometry can never quietly become a second home for an event.
  */
  await expect(dialog.locator('.cg-setup-notice')).toHaveCount(0);
});
