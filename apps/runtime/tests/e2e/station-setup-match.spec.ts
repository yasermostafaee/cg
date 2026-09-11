import { chooseSourceKind, test, expect } from './fixtures/runtime.js';

/**
 * 🔴 `SETTINGS-MATCH-02` — **THE OWNER'S FOUR DEFECTS, MEASURED IN A REAL ENGINE.**
 *
 * He looked at the built dialog twice and named four things. Every one of them is a property
 * of what the browser PAINTS, so every one of them is measured here and not in jsdom: jsdom has
 * no layout, so `getBoundingClientRect()` is all zeros there and a dom spec asserting any box
 * below would pass against a surface of any shape, including a broken one (golden rule 12c,
 * `B-245`). Its cascade is not Chrome's either, which is why the colour assertions read
 * PAINTED values and compare them to each other rather than to a literal.
 *
 * The four, in his order:
 *
 *   1. **the box/card colours inside the modal are wrong** — §2 below;
 *   2. **the Servers rail item's background is short** — §3;
 *   3. **the Layers pane is untouched** — §4;
 *   4. **the frame's height must be FIXED and must not grow or shrink between tabs** — §1.
 *
 * ⚠ `station-setup-geometry.spec.ts` asserts what the frame's numbers ARE, against the token
 * home. `station-setup-frame.spec.ts` asserts the two-edge property (one box on every tab, the
 * footer's top edge still). This file asserts the four things the owner could see, and the one
 * it adds to those two is the RAIL's height — which is what defect 4 turned out to be.
 */

const TABS = ['Channel', 'Servers', 'Live sources', 'Text file delimiters', 'Layers'] as const;

/** `rgb(r, g, b)` → its relative luminance, for "is this lighter than that". */
function luminance(rgb: string): number {
  const [r = 0, g = 0, b = 0] = (rgb.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);
  const lin = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * 🔴 DEFECT 4 — **THE FRAME, AND WHAT WAS ACTUALLY MOVING INSIDE IT.**
 *
 * Measured BEFORE anything changed: the outer box was already identical on all five tabs
 * (1140 × 736 at 1280 × 800, five times) and already clamped to the viewport. So the height
 * token was never defeated, and the fix is not there.
 *
 * What DID move is the RAIL. The message region was a sibling of the body, so a Servers
 * refusal took its 109 px out of the body: the rail and the pane went from 565 px to 456 px
 * the moment the operator pressed Servers, and grew back when he left. The frame stood still
 * while the two columns inside it jumped, which is the same complaint one layer in.
 *
 * The frame is a rail beside a panel now, with the message and the footer in the PANEL's
 * column — the reference's own shape, whose footer starts at x = 297 against a frame at x = 70
 * with a 226 px rail. So the rail is the body's full height on every tab, whatever a section
 * has to say.
 */
test('§1 — the frame AND the rail are one size on every tab, and clamp to the viewport', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });
  const dialog = page.getByRole('dialog', { name: 'Station setup' });
  await page.getByRole('button', { name: 'Open Station setup', exact: true }).click();
  await expect(dialog).toBeVisible();
  const rail = dialog.getByRole('tablist', { name: 'Station setup sections' });

  const read = async (): Promise<{ box: string; railH: number; footTop: number }> =>
    dialog.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const shell = el.querySelector('[data-setup-rail]');
      const foot = el.querySelector('.cg-modal-footer');
      if (shell === null || foot === null) throw new Error('the frame has no rail or no footer');
      return {
        box: [r.x, r.y, r.width, r.height].map(Math.round).join(','),
        railH: Math.round(shell.getBoundingClientRect().height),
        footTop: Math.round(foot.getBoundingClientRect().top),
      };
    });

  const seen: { tab: string; box: string; railH: number; footTop: number }[] = [];
  for (const name of TABS) {
    await rail.getByRole('tab', { name: new RegExp(`^${name}`) }).click();
    await expect(dialog.locator('[data-station-section]')).toHaveCount(1);
    seen.push({ tab: name, ...(await read()) });
  }
  const first = seen[0];
  if (first === undefined) throw new Error('no tabs measured');

  // ONE box, five tabs — reported as a table, so a failure names which tab moved.
  expect(
    seen.map((s) => `${s.tab}: ${s.box}`),
    'the dialog box must be identical on every tab',
  ).toEqual(seen.map((s) => `${s.tab}: ${first.box}`));

  /*
    🔴 THE ASSERTION THIS FILE EXISTS FOR, and the one nothing had: the RAIL is the same
    height on every tab. Before the fix this read 565 on four tabs and 456 on Servers, because
    the Servers refusal region was stealing from the body the rail lives in.
  */
  expect(
    seen.map((s) => `${s.tab}: ${String(s.railH)}`),
    'the rail must not shrink when a section has something to say',
  ).toEqual(seen.map((s) => `${s.tab}: ${String(first.railH)}`));

  expect(
    seen.map((s) => `${s.tab}: ${String(s.footTop)}`),
    "the footer's top edge must not move",
  ).toEqual(seen.map((s) => `${s.tab}: ${String(first.footTop)}`));

  /*
    POSITIVE CONTROLS. Without them "all five are the same" would also pass against a dialog
    that never rendered, or against five readings of one tab.

    ⚠ The second one is the important one: it proves the rail assertion above is not passing
    because nothing ever puts a band on screen. Servers IS blocked here — the e2e seed has rows
    on air — so the band genuinely exists on that tab and genuinely does not exist on the
    others, which is exactly the condition that used to move the rail.

    ⚠ `SETTINGS-POLISH-04` §4 — the CONTROL is `[data-setup-notice]` now, not
    `[data-modal-message]`: the standing block renders in the pane's flow (see `SetupNotice.tsx`)
    and the pinned region is empty on Servers at rest. The control still has to be something
    that appears on ONE tab and not the others, and this is that thing — reading the region here
    would now be a control that never fires, which passes while proving nothing.
  */
  const [, , w = 0, h = 0] = first.box.split(',').map(Number);
  expect(w, 'the frame has a real width').toBe(1140);
  expect(h, 'the frame has a real height').toBe(736);
  expect(first.railH, 'the rail is a real column').toBeGreaterThan(400);
  await rail.getByRole('tab', { name: /^Servers/ }).click();
  await expect(dialog.locator('[data-setup-notice]')).toHaveCount(1);
  await rail.getByRole('tab', { name: /^Channel/ }).click();
  await expect(dialog.locator('[data-setup-notice]')).toHaveCount(0);

  // …and at a SHORT viewport it clamps rather than overflowing.
  await page.setViewportSize({ width: 1280, height: 600 });
  for (const name of ['Channel', 'Layers'] as const) {
    await rail.getByRole('tab', { name: new RegExp(`^${name}`) }).click();
    const clamped = await dialog.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom) };
    });
    expect(clamped.h, `${name}: 600 − 64`).toBe(536);
    expect(clamped.top).toBeGreaterThanOrEqual(0);
    expect(clamped.bottom).toBeLessThanOrEqual(600);
  }
});

/**
 * 🔴 DEFECT 1 — **THE CARD IS RAISED OFF THE GROUND, NOT SUNK INTO IT.**
 *
 * The reference paints a `#191e25` card on a `#15191f` frame — one step LIGHTER. The app
 * painted `#0b1017` (`--r-surface-sunken`, the darkest value in the whole palette) on
 * `#141b25`, so the depth was inverted and every box in the dialog read as a hole.
 *
 * ⚠ Asserted as a RELATION first and as values second. The relation is the defect — a card
 * that is darker than its own dialog — and it is what survives a later retune of either value;
 * the exact numbers are then pinned so the relation cannot be satisfied by two near-identical
 * greys.
 */
test('§2 — a card is lighter than the dialog it sits on, and the table bands are the drawing’s', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });
  const dialog = page.getByRole('dialog', { name: 'Station setup' });
  await app.openStationSetupAt('Servers');

  const paint = await dialog.evaluate((el) => {
    const of = (node: Element | null): string =>
      node === null ? '' : getComputedStyle(node).backgroundColor;
    const card = el.querySelector('.cg-card');
    return {
      frame: of(el),
      rail: of(el.querySelector('[data-setup-rail]')),
      card: of(card),
      head: of(card?.querySelector('.cg-card__head') ?? null),
      cardLine: card === null ? '' : getComputedStyle(card).borderTopColor,
      radius: card === null ? '' : getComputedStyle(card).borderTopLeftRadius,
    };
  });

  // 🔴 THE RELATION — the defect, stated the way the owner saw it.
  expect(
    luminance(paint.card),
    'a card must sit ABOVE the dialog ground, not below it',
  ).toBeGreaterThan(luminance(paint.frame));
  // …and the rail is the one surface that IS below it, which is what makes it read as a side.
  expect(luminance(paint.rail), 'the rail is the sunken column').toBeLessThan(
    luminance(paint.frame),
  );

  // …then the measured values, so the relation cannot be met by two greys a hair apart.
  expect(paint.frame).toBe('rgb(21, 25, 31)');
  expect(paint.card).toBe('rgb(25, 30, 37)');
  expect(paint.rail).toBe('rgb(17, 21, 27)');
  expect(paint.cardLine).toBe('rgb(43, 50, 60)');
  expect(paint.radius).toBe('12px');
  /*
    A card HEAD has no ground of its own — it is the card's, separated by a rule. Asserted
    because the obvious wrong fix for "the card is too dark" is to paint the head instead,
    which gives a card two surfaces and a seam.
  */
  expect(paint.head).toBe('rgba(0, 0, 0, 0)');

  // The record table's own two bands, on the tab that has one.
  await dialog
    .getByRole('tablist', { name: 'Station setup sections' })
    .getByRole('tab', { name: /^Text file delimiters/ })
    .click();
  const table = await dialog.evaluate((el) => {
    const th = el.querySelector('.cg-table th');
    const td = el.querySelector('.cg-table td');
    return {
      head: th === null ? '' : getComputedStyle(th).backgroundColor,
      headCase: th === null ? '' : getComputedStyle(th).textTransform,
      rule: td === null ? '' : getComputedStyle(td).borderBottomColor,
    };
  });
  expect(table.head).toBe('rgb(20, 25, 31)');
  expect(table.rule).toBe('rgb(35, 42, 51)');
  /*
    ⭐ And the column heads are SENTENCE case inside a card. The app's shared table head is a
    tracked-out uppercase run, which is right in a panel and wrong two rows under a card head
    that is already one: two uppercase runs, and the operator cannot tell which names the block.
  */
  expect(table.headCase).toBe('none');
});

/**
 * 🔴 DEFECT 2 — **THE SERVERS RAIL ITEM.**
 *
 * ⚠ **The prompt's hypothesis was that the item clips because it carries two marks. Measured,
 * it does not — and never did.** Every item paints a full 197 × 44 box in every state, and
 * `scrollHeight` equals `clientHeight` on all of them. What was HALF-PAINTED is the MARK: the
 * rail drew a 0.55 rem dot where the reference draws an 18 × 18 filled count chip and an amber
 * lock, so the right-hand end of the one item carrying both looked unfinished.
 *
 * So this asserts BOTH halves: the box is whole (which is what was reported), and the marks are
 * the reference's (which is what was actually wrong).
 */
test('§3 — every rail item paints its whole box, in every mark state, and the marks are real', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });
  const dialog = page.getByRole('dialog', { name: 'Station setup' });
  await page.getByRole('button', { name: 'Open Station setup', exact: true }).click();
  const rail = dialog.getByRole('tablist', { name: 'Station setup sections' });

  /** Each item's painted box against the union of its children, plus its own overflow. */
  const measure = async (): Promise<
    { label: string; w: number; h: number; covers: boolean; scrolls: boolean; bg: string }[]
  > =>
    rail.evaluate((list) =>
      [...list.querySelectorAll('[role="tab"]')].map((el) => {
        const r = el.getBoundingClientRect();
        const kids = [...el.children].map((k) => k.getBoundingClientRect());
        const top = Math.min(...kids.map((k) => k.top));
        const bottom = Math.max(...kids.map((k) => k.bottom));
        return {
          label: (el.querySelector('.cg-rail-tab__label')?.textContent ?? '').trim(),
          w: Math.round(r.width),
          h: Math.round(r.height),
          // ⚠ 1 px of slack: a visually-hidden span sits at `margin:-1px` by design.
          covers: top >= r.top - 1 && bottom <= r.bottom + 1,
          scrolls: el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth,
          bg: getComputedStyle(el).backgroundColor,
        };
      }),
    );

  // The e2e seed has rows ON AIR, so Servers is BLOCKED from the moment the dialog opens —
  // which is the state the item was reported in.
  for (const tab of TABS) {
    await rail.getByRole('tab', { name: new RegExp(`^${tab}`) }).click();
    // The pane it switched to must be mounted before anything is read, or the first reading
    // could still be of the previous tab's rail state.
    await expect(rail.getByRole('tab', { name: new RegExp(`^${tab}`) })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const items = await measure();
    expect(items, `${tab}: the rail lists five sections`).toHaveLength(5);
    for (const item of items) {
      expect(item.h, `${tab} · ${item.label}: the item is the rail's one height`).toBe(44);
      expect(item.w, `${tab} · ${item.label}: the item is the rail's one width`).toBe(197);
      expect(item.covers, `${tab} · ${item.label}: content escaped the painted box`).toBe(true);
      expect(item.scrolls, `${tab} · ${item.label}: the item overflows itself`).toBe(false);
    }
    /*
      …and the SELECTED one is the only one with a fill, on every tab.

      ⚠ **POLLED, because a rail item's background TRANSITIONS.** Measured once, straight after
      `aria-selected` flipped, this read `["Servers", "Live sources"]`: the attribute changes on
      the commit and the fade out of the previous item's mint takes `--r-dur-fast` after it, so
      `getComputedStyle` returns an interpolated colour that is neither the fill nor
      transparent. That is a property of the measurement, not of the rail — and it is worth the
      words, because the same reading against a genuinely broken rail would look identical.
    */
    await expect
      .poll(
        async () =>
          (await measure()).filter((i) => i.bg !== 'rgba(0, 0, 0, 0)').map((i) => i.label),
        { message: `${tab}: exactly one item is filled, once the fade has settled` },
      )
      .toHaveLength(1);
  }

  /*
    🔴 THE MARKS. Servers is blocked (an amber lock) and nothing is edited yet, so no count
    chip — asserted as an ABSENCE first, which is what stops the next assertion passing against
    a rail that always draws one.
  */
  await expect(rail.locator('.cg-rail-lock')).toHaveCount(1);
  await expect(rail.locator('.cg-rail-count')).toHaveCount(0);
  const lock = await rail.locator('.cg-rail-lock > svg').evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), colour: getComputedStyle(el).color };
  });
  expect(lock.w, 'the blocked mark is the reference’s 13 px glyph, not a 9 px dot').toBe(13);
  expect(lock.colour, 'blocked is amber').toBe('rgb(243, 205, 136)');

  // Now EDIT a section, and the chip appears with a number in it.
  await rail.getByRole('tab', { name: /^Layers/ }).click();
  await dialog
    .getByLabel(/^Name for layer 8[0-9] /)
    .first()
    .fill('EDITED IN A TEST');
  const chip = rail.locator('.cg-rail-count');
  await expect(chip).toHaveCount(1);
  await expect(chip, 'the chip SAYS how many rows are waiting').toHaveText('1');
  const chipBox = await chip.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return {
      w: Math.round(r.width),
      h: Math.round(r.height),
      bg: getComputedStyle(el).backgroundColor,
    };
  });
  expect(chipBox, 'the edited mark is the reference’s filled 18 px chip').toEqual({
    w: 18,
    h: 18,
    bg: 'rgb(140, 230, 209)',
  });
});

/**
 * 🔴 DEFECT 3 — **THE LAYERS PANE, WHICH HAD NEVER MET THE REFERENCE.**
 *
 * Of the drawing's structure the app had two pieces: the words `Graphics beds` and a remove
 * action. `design.md` 23.6 recorded it as row 137, NOT built. This asserts the pane the owner
 * asked for, piece by piece, and drives the one part of it that is behaviour.
 */
test('§4 — the Layers pane is the reference’s: a summary, a filter, five columns and a bed table', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });
  const dialog = page.getByRole('dialog', { name: 'Station setup' });
  await app.openStationSetupAt('Layers');

  // ── THE HEAD: three read-only facts as tags, and the rules folded away ────────────
  const summary = dialog.locator('[data-layer-summary] .cg-setup-tag');
  await expect(summary).toHaveCount(3);
  await expect(summary.nth(0)).toHaveText('Channel 1');
  await expect(summary.nth(1)).toHaveText(/^Layers \d+–\d+$/);
  await expect(summary.nth(2)).toHaveText('Fixed bank');
  await expect(dialog.locator('[data-layers-helper] summary')).toHaveText(
    'Visibility and layer safety',
  );

  // ── THE FILTER BAR, and it actually filters ──────────────────────────────────────
  const results = dialog.locator('[data-layers-results]');
  await expect(results).toHaveText('29 of 29 rows');
  await expect(dialog.getByRole('checkbox', { name: 'Shown only' })).toBeVisible();
  const search = dialog.getByLabel('Filter by name, template or layer');
  await search.fill('CLOCK');
  await expect(results, 'the read-out says how many are hidden by the filter').toHaveText(
    /^[1-9] of 29 rows$/,
  );
  await expect(dialog.locator('[data-candidate-layer]')).toHaveCount(1);

  // …and a filter that matches nothing says so, rather than drawing an empty card.
  await search.fill('zzzz-no-such-row');
  await expect(dialog.locator('[data-layers-empty]')).toBeVisible();
  await expect(dialog.locator('[data-layers-empty]')).toContainText('No matching rows');
  await expect(dialog.locator('[data-candidate-layer]')).toHaveCount(0);
  await search.fill('');
  await expect(results).toHaveText('29 of 29 rows');

  // ── THE TABLE: five columns, in the reference's order ────────────────────────────
  const heads = dialog.locator('.cg-layer-table').first().locator('thead th');
  await expect(heads).toHaveCount(5);
  expect(await heads.allInnerTexts()).toEqual(['Layer', 'Show', 'Row name', 'Template', 'Actions']);

  /*
    ⭐ THE COORDINATE IS THE CELL, not a hover — `R-028`'s reason is the moment the console is
    NOT helping, and a hover does not discharge it there (golden rule 11). The operator's own
    row number sits under it, quieter.
  */
  const row70 = dialog.locator('[data-candidate-layer="70"]');
  await expect(row70.locator('.cg-layer-id')).toHaveText('70');
  await expect(row70.locator('.cg-layer-row-number')).toHaveText(/^Row \d+$/);

  // ── `Unassigned`, and the `visibility locked` label on a row that has a template ──
  await expect(dialog.locator('.cg-layer-none').first()).toHaveText('Unassigned');
  const locked = dialog.locator('[data-layer-locked]').first();
  await expect(locked).toHaveText(/(On air|Occupied) · visibility locked/);

  /*
    🔴 AND THE SWITCH IS DEAD ON EXACTLY THAT ROW, in exactly that direction. Hiding an
    occupied row is what the bridge refuses (`untick-occupied`); showing one never was, and an
    UNVERIFIED row keeps a live switch because with no OSC every row reads unknown — see the
    section's own note for why that distinction is load-bearing rather than fussy.
  */
  const occupiedRow = dialog
    .locator('[data-candidate-layer]')
    .filter({ has: dialog.page().locator('[data-layer-locked]') })
    .first();
  const occupiedSwitch = occupiedRow.getByRole('switch');
  await expect(occupiedSwitch).toBeDisabled();
  await expect(occupiedSwitch).toHaveAttribute(
    'title',
    'Remove the template before hiding this row',
  );
  // POSITIVE CONTROL: an UNBOUND row's switch is live, so the rule above is not "all dead".
  const freeRow = dialog.locator('[data-candidate-layer="75"]').getByRole('switch');
  await expect(freeRow).toBeEnabled();

  // ── THE FOOTNOTE, AND THE BED TABLE UNDER ITS OWN HEAD ───────────────────────────
  await expect(dialog.locator('.cg-layer-footnote')).toContainText(
    'Highest layer first · rows from the active channel.',
  );
  await expect(dialog.locator('.cg-setup-beds-head h3')).toHaveText('Graphics beds');
  await expect(dialog.locator('.cg-setup-beds-head p')).toHaveText(
    'Composited below the live source layers.',
  );
  await expect(dialog.locator('.cg-layer-table')).toHaveCount(2);

  // ── A DIRTY ROW MARKS ITSELF, and the footer's commit is still the section's ─────
  await dialog.getByLabel(/^Name for layer 75 /).fill('RENAMED');
  await expect(dialog.locator('[data-candidate-layer="75"][data-row-dirty]')).toHaveCount(1);
  await expect(dialog.getByRole('button', { name: 'Apply layers' })).toBeVisible();
});

/**
 * 🔴 §8 — **ONE SUB-DIALOG FRAME FOR EVERY ADD, EDIT AND REMOVE.**
 *
 * The rule was already there (`STATION-CHROME-01` §6 built `RecordDialog` to end three shapes);
 * what this asserts is the reference's own measurements for it, and the two things a screenshot
 * caught that no earlier test would have.
 */
test('§8 — every add/edit/remove is the same 480 frame, with a verb that names the act', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });
  const setup = page.getByRole('dialog', { name: 'Station setup' });
  await app.openStationSetupAt('Live sources');

  /** The topmost dialog — the sub-dialog, when one is open. */
  const sub = (): ReturnType<typeof page.locator> => page.locator('[role="dialog"]').last();
  const frame = async (): Promise<{
    w: number;
    size: string | null;
    bg: string;
    footBg: string;
    scrim: string;
    focus: string;
  }> =>
    sub().evaluate((el) => {
      const foot = el.querySelector('.cg-modal-footer');
      return {
        w: Math.round(el.getBoundingClientRect().width),
        size: el.getAttribute('data-modal-size'),
        bg: getComputedStyle(el).backgroundColor,
        footBg: foot === null ? '' : getComputedStyle(foot).backgroundColor,
        scrim: el.parentElement === null ? '' : getComputedStyle(el.parentElement).backgroundColor,
        focus: document.activeElement?.getAttribute('aria-label') ?? '',
      };
    });

  await setup.getByRole('button', { name: 'Add live source' }).click();
  await expect(page.getByRole('dialog', { name: 'Add live source' })).toBeVisible();
  const addSource = await frame();
  /*
    🔴 THE GROUND AND THE FOOTER BAND, MEASURED — and this is the assertion that would have
    caught them. Both were set INLINE by the primitive, so the `[data-modal-size='record']`
    rules lost silently: the frame came back `rgb(20, 27, 37)` (the console's surface) against
    the drawing's `#15191f`, and the footer `rgb(20, 32, 45)` against its `#12171e`. The same
    trap the `fixed` frame's ground had already met once.
  */
  expect(addSource.size).toBe('record');
  expect(addSource.w, 'the reference’s `.sub-dialog` — min(480, 100vw − 32)').toBe(480);
  expect(addSource.bg, 'the family’s own ground').toBe('rgb(21, 25, 31)');
  expect(addSource.footBg, 'its footer band, a step under the body').toBe('rgb(18, 23, 30)');
  /* A SUB layer lays the lighter scrim, so the dialog it was opened from stays visible.
     `SETTINGS-POLISH-04` §7 — the reference's `.sub-dialog::backdrop{background:#0306099e}`,
     whose `9e` is 0.62: still lighter than the base scrim's 0.76, which is the role's whole
     point. `settings-polish.spec.ts` §7 asserts that RELATION rather than the two literals. */
  expect(addSource.scrim).toBe('rgba(3, 6, 9, 0.62)');
  /*
    🔴 §8e — FOCUS LANDS ON THE FIRST FIELD. It landed on the ✕ on all five, so an operator who
    pressed `Add source` had to Tab or click before he could type. `B-230` is why this is a
    `data-modal-autofocus` mark rather than an `autoFocus`: one thing moves focus.
  */
  expect(addSource.focus, 'the operator can type immediately').toBe('Source name');

  // …and the kind picker is a segmented control whose choice changes the FORM under it.
  await expect(sub().getByLabel('DeckLink device index')).toBeVisible();
  await chooseSourceKind(sub(), 'ndi');
  await expect(sub().getByLabel('NDI source name')).toBeVisible();
  await expect(sub().getByLabel('DeckLink device index')).toHaveCount(0);
  await expect(sub().getByRole('button', { name: 'Add source' })).toBeVisible();
  await page.keyboard.press('Escape');

  /*
    The three form dialogs, each with a verb that names its act — never `OK`, never bare `Save`.

    ⚠ Driven by the RAIL, not by `openStationSetupAt`: Station setup is still open (only the
    SUB-dialog was dismissed), so a second press of the console's door lands on the scrim and
    times out after thirty seconds — which reads as a hang rather than as "already open".
  */
  await setup
    .getByRole('tablist', { name: 'Station setup sections' })
    .getByRole('tab', { name: /^Text file delimiters/ })
    .click();
  await setup.getByRole('button', { name: 'Add delimiter' }).click();
  expect((await frame()).focus).toBe('New delimiter name');
  await expect(sub().getByRole('button', { name: 'Add delimiter' })).toBeVisible();
  await page.keyboard.press('Escape');

  /*
    🔴 §8d — THE DESTRUCTIVE SHAPE, and the delimiter's remove had NO QUESTION AT ALL before
    this: one press of a bin dropped the record. Every other destructive act in this dialog was
    already gated, which is what made it the odd one out rather than a deliberate exception.
  */
  await page
    .locator('[data-delimiter-id]')
    .first()
    .getByRole('button', { name: /^Remove delimiter/ })
    .click();
  await expect(sub()).toContainText('from the available delimiters?');
  await expect(sub().locator('[data-confirm-emblem]'), 'the mark before the sentence').toHaveCount(
    1,
  );
  /*
    ⚠ …and its confirm keeps A DESTRUCTIVE TREATMENT. A scoped `[data-modal-size] .cg-btn` rule
    out-specifies the variant's own, and the first spelling of this family's button rule did
    exactly that — the destructive fill came out the same grey as `Cancel` beside it. A dialog
    asking "Remove this?" with two identical buttons is worse than one with no colour at all.

    🔴 `SETTINGS-POLISH-04` §2 — **THE COLOUR CHANGED AND THE CLAIM DID NOT.** This confirm is
    raised from inside Station setup (`layer: 'sub'`), so it takes that family's red outline —
    `.btn.danger{background:var(--red-bg);border-color:#684044;color:var(--red)}` — while the
    CONSOLE's confirms keep their solid amber. Two families, two answers, both deliberate; see
    the rule beside `[data-modal-layer='sub']` in `controls.css`.

    ⚠ The "not the same as Cancel" half is asserted SEPARATELY and against the button actually
    beside it, because that is the property the original literal was standing in for. A literal
    alone would go on passing if Cancel were ever repainted to match it.
  */
  const go = sub().getByRole('button', { name: 'Remove delimiter' });
  await expect(go).toHaveAttribute('data-modal-role', 'destructive');
  const pair = await sub().evaluate((el) => {
    const btns = [...el.querySelectorAll('.cg-modal-footer button')];
    const read = (b: Element): string => getComputedStyle(b).backgroundColor;
    return {
      commit: read(btns[btns.length - 1]!),
      cancel: read(btns[0]!),
    };
  });
  expect(pair.commit, 'this family’s destructive is the reference red').toBe('rgb(53, 34, 36)');
  expect(pair.commit, 'and never the same fill as the Cancel beside it').not.toBe(pair.cancel);
  // Declining changes nothing — the list is as long as it was.
  const before = await page.locator('[data-delimiter-id]').count();
  await sub().getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('[data-delimiter-id]')).toHaveCount(before);
});

/**
 * 🔴 §9 — **THREE MESSAGE CLASSES, THREE PLACES, THREE JOBS.**
 *
 * They are not interchangeable, and the same sentence must never appear in two of them:
 *
 *   · **the PANE BANNER** — a blocking state. Amber, two weights, and it names the REMEDY.
 *     Its placement is the point: the pane's content column exactly, clear of the footer.
 *   · **the CARD HELP STRIP** — a standing explanation, inside the ONE card it is about.
 *   · **the FOOTER CLAUSE** — whether the commit is available. One short clause, never a
 *     paragraph, and it never repeats the banner's explanation.
 *
 * ⚠ **MEASURED IN A BROWSER.** `AUDIT-CLOSE-01`'s defect was a band whose bottom edge met the
 * footer's top edge exactly — `693.0` against `693.0`, flush contact with zero separation,
 * which reads as one surface. jsdom cannot see that: it has no layout, so a dom spec asserting
 * this would compare zeros (golden rule 12c / `B-245`).
 */
test('§9 — the banner sits in the pane’s column, clear of the footer, and names the remedy', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });
  const dialog = page.getByRole('dialog', { name: 'Station setup' });
  await app.openStationSetupAt('Servers');

  // ── 9a — TWO WEIGHTS, AND THE SECOND ONE SAYS WHAT TO DO ──────────────────────────
  /*
    🔴 `SETTINGS-POLISH-04` §4 — **IT IS `[data-setup-notice]` NOW, AND THE REGION IS ABSENT.**

    The sentence and both its weights are unchanged. What moved is the element: a BLOCK is in
    force before anything is pressed and no act produces it, so it is a standing `.notice` in
    the pane's flow, which is where the reference emits its one `.notice` too. The pinned
    region keeps `AUDIT-CLOSE-01` delta A's job — why the last ACTION did not happen — and is
    re-asserted at the end of this test, against a real event.
  */
  const banner = dialog.locator('[data-setup-notice]');
  await expect(banner).toHaveCount(1);
  await expect(banner, 'the title states the condition').toContainText(
    'Server changes are paused while on air',
  );
  await expect(banner, 'the explanation names the remedy').toContainText(
    'take all items off air in the console before applying',
  );
  await expect(banner, '…and its scope, so the other tabs do not read as gated').toContainText(
    'Every other section stays editable',
  );
  await expect(
    dialog.locator('[data-modal-message]'),
    'a standing block must not ALSO occupy the region events land in',
  ).toHaveCount(0);

  /*
    🔴 THE PLACEMENT. The band spans the PANE'S CONTENT COLUMN — not under the rail, not
    edge-to-edge of the frame — and it sits between the section head and the first card, 21 px
    above it, which is where the drawing puts its `.notice`.
  */
  const geom = await dialog.evaluate((el) => {
    const notice = el.querySelector('[data-setup-notice]');
    const b = notice?.getBoundingClientRect();
    const pane = el.querySelector('[data-station-pane]');
    const paneBox = pane?.getBoundingClientRect();
    const paneCS = pane === null || pane === undefined ? null : getComputedStyle(pane);
    const head = el.querySelector('.cg-setup-head')?.getBoundingClientRect();
    const card = el.querySelector('.cg-card')?.getBoundingClientRect();
    const rail = el.querySelector('[data-setup-rail]')?.getBoundingClientRect();
    if (
      b === undefined ||
      notice === null ||
      paneBox === undefined ||
      paneCS === null ||
      head === undefined ||
      card === undefined ||
      rail === undefined
    ) {
      throw new Error('the frame is missing a region');
    }
    return {
      bannerLeft: Math.round(b.left),
      bannerRight: Math.round(b.right),
      // The pane's CONTENT column: its box minus its own inset.
      contentLeft: Math.round(paneBox.left + Number.parseFloat(paneCS.paddingLeft)),
      contentRight: Math.round(paneBox.right - Number.parseFloat(paneCS.paddingRight)),
      railRight: Math.round(rail.right),
      cardLeft: Math.round(card.left),
      cardRight: Math.round(card.right),
      belowHead: Math.round(b.top - head.bottom),
      aboveCard: Math.round(card.top - b.bottom),
    };
  });
  expect(geom.bannerLeft, 'the banner starts where the section’s cards start').toBe(
    geom.contentLeft,
  );
  expect(geom.bannerRight, '…and ends where they end').toBe(geom.contentRight);
  /*
    ⚠ AND THE SAME EDGES AS THE FIRST CARD, measured against the CARD rather than derived from
    the pane's padding a second time. "Not inset differently from the cards" is the owner's
    words for this, and computing both sides from the same padding would be asserting the
    arithmetic rather than the render.
  */
  expect(geom.bannerLeft, 'the same left edge as the first card').toBe(geom.cardLeft);
  expect(geom.bannerRight, '…and the same right edge').toBe(geom.cardRight);
  expect(
    geom.bannerLeft,
    'it must not be drawn across the names of the sections it says are editable',
  ).toBeGreaterThanOrEqual(geom.railRight);
  // It is AFTER the head and BEFORE the first card, 21 px above it — `.notice{margin-bottom:21px}`.
  expect(geom.belowHead, 'the banner follows the section head').toBeGreaterThanOrEqual(0);
  expect(geom.aboveCard, 'and is 21 px above the first card').toBe(21);

  // ── 9c — THE FOOTER SAYS FOUR WORDS, and does not repeat the explanation ──────────
  const foot = dialog.locator('[data-section-footer="servers"]');
  await expect(foot).toHaveText('Unavailable while on air');
  await expect(foot).toHaveAttribute('data-footer-tone', 'blocked');
  await expect(foot, 'the footer must not restate the banner').not.toContainText('Clear All');
  /*
    🔴 `SETTINGS-POLISH-04` §3 — **AND IT IS THE FAMILY'S AMBER, which it was not.**

    `data-footer-tone="blocked"` was on this element and the sentence rendered the resting muted
    grey anyway: `styles.footNote` set `color` INLINE, so the stylesheet's tone rule matched and
    lost. Measured before the fix, `rgb(142, 158, 175)`. The glyph takes the same ink through
    `currentColor`, so both are read here — a colour that reached the word but not the mark
    would be the same bug half-applied.
  */
  const tone = await foot.evaluate((el) => ({
    word: getComputedStyle(el).color,
    mark:
      el.querySelector('svg') === null ? null : getComputedStyle(el.querySelector('svg')!).color,
  }));
  expect(tone.word, 'the blocked clause is this family’s amber').toBe('rgb(245, 200, 121)');
  expect(tone.mark, 'and so is its padlock').toBe('rgb(245, 200, 121)');

  // ── 9b — THE CARD HELP STRIP: standing, inside its own card, and NOT amber ────────
  const note = dialog.locator('[data-remote-host-note]');
  await expect(note).toHaveCount(0);
  await dialog.getByLabel('Primary host').fill('192.168.1.50');
  await expect(note).toHaveCount(1);
  const ink = await note.evaluate((el) => {
    const card = el.closest('.cg-card');
    return {
      colour: getComputedStyle(el).color,
      insideCard: card !== null,
      /* It is the LAST thing in its card — a help strip sits under the body, behind a rule. */
      last: card?.lastElementChild === el,
    };
  });
  expect(ink.insideCard, 'a help strip belongs to ONE card').toBe(true);
  expect(ink.last).toBe(true);
  /*
    🔴 `R-055` — A SIGNAL MUST NOT SAY WHAT IT DOES NOT MEAN. This was an amber `Notice` for a
    fact that refuses nothing: a remote CasparCG is a configuration. Amber in this dialog means
    BLOCKED — the rail's lock, the footer's clause, the banner above — and spending it on an
    always-true explanation drains it where it is real.
  */
  expect(ink.colour, 'a standing explanation is muted, never the blocked amber').not.toBe(
    'rgb(243, 205, 136)',
  );

  // …and every OTHER pane's footer is one short clause too (§9c, checked beyond Servers).
  for (const [tab, clause] of [
    ['Channel', 'Nothing to apply — this section reports, it does not set.'],
    ['Text file delimiters', 'Saved as you go — there is nothing waiting to be applied.'],
  ] as const) {
    await dialog
      .getByRole('tablist', { name: 'Station setup sections' })
      .getByRole('tab', { name: new RegExp(`^${tab}`) })
      .click();
    await expect(dialog.locator('[data-section-footer]')).toHaveText(clause);
  }
});

/**
 * 🔴 §10 — **THE INPUT GUARDS, IN A REAL BROWSER, THROUGH A REAL PASTE.**
 *
 * `fieldValue.test.ts` proves the rules; this proves they are WIRED, and it does the one thing
 * a unit test cannot: it uses the clipboard. **Paste is the path that breaks** — a keystroke
 * filter would pass every "type one bad character" test and drop a pasted phrase whole.
 */
test('§10 — a port takes Persian digits and refuses letters, through typing AND paste', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });
  const dialog = page.getByRole('dialog', { name: 'Station setup' });
  await app.openStationSetupAt('Servers');
  const amcp = dialog.getByLabel('Primary AMCP port');

  // 🔴 §10.2 — THE PERSIAN-DIGIT TRAP. `۵۲۵۰` is what the digit keys emit on that layout.
  await amcp.fill('');
  await page.keyboard.insertText('۵۲۵۰');
  await expect(amcp, 'the operator’s own keyboard must work').toHaveValue('5250');

  // …and the Arabic-Indic family too.
  await amcp.fill('');
  await page.keyboard.insertText('٦٢٥٠');
  await expect(amcp).toHaveValue('6250');

  /*
    🔴 §10.3 — A WHOLE CHUNK OF TEXT ARRIVING AT ONCE, which is the path a keystroke filter
    would drop. `insertText` delivers the entire string in ONE `input` event — exactly what a
    paste looks like to the handler — and that is the property under test.

    ⚠ **IT WAS `navigator.clipboard.writeText` + `Ctrl+V`, AND LINUX CI KILLED IT:**
    `NotAllowedError: Failed to execute 'writeText' on 'Clipboard': Write permission denied`.
    It passed on Windows against system Chrome and failed on the bundled headless Chromium —
    golden rule 12a, exactly: a green Windows run is a signal and never a discharge, and the
    thing it hid here was in the TEST rather than in the product.

    The system clipboard is an OS permission surface, not product behaviour. Routing through
    it added a way for this spec to fail for a reason it is not about, and removed nothing
    from what it proves: the handler cannot tell the two apart.
  */
  await amcp.fill('');
  await amcp.focus();
  await page.keyboard.insertText('AMCP port 5250 (primary)');
  await expect(amcp, 'a pasted phrase keeps its digits and drops the rest').toHaveValue('5250');

  // …and SELECT-ALL then replace still works, which a `preventDefault` guard would have broken.
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('6250');
  await expect(amcp, 'select-all and replace still work').toHaveValue('6250');
  // …as do the caret keys, on a field whose value the handler rewrites under them.
  await page.keyboard.press('Home');
  await page.keyboard.insertText('1');
  await expect(amcp, 'Home put the caret at the start and typing landed there').toHaveValue(
    '16250',
  );

  // §10.3 — OUT OF RANGE IS A REFUSAL, NOT A CLAMP, and it is shown beside the field.
  await amcp.fill('70000');
  await expect(amcp, 'the number is not quietly rewritten').toHaveValue('70000');
  await expect(
    dialog.locator('[data-setup-field="Primary-amcp"] [data-field-error]'),
  ).toContainText('65535');
  await expect(dialog.getByRole('button', { name: 'Apply server settings' })).toBeDisabled();

  /*
    🔴 §10.1/§10.4 — AND THE HOST IS NOT NUMERIC. The contract is `z.string().min(1)` and
    `isLoopbackHost` accepts `localhost`, so letters are legal here and a digits-and-dots rule
    would refuse a value the product already treats as correct.
  */
  const host = dialog.getByLabel('Primary host');
  await host.fill('caspar-a.studio.local');
  await expect(host, 'a hostname is a host').toHaveValue('caspar-a.studio.local');
  await expect(dialog.locator('[data-setup-field="Primary-host"] [data-field-error]')).toHaveCount(
    0,
  );
  // …and a pasted URL stays VISIBLE and is refused, rather than being mangled into a pseudo-host.
  await host.fill('http://192.168.21.114/x');
  await expect(host).toHaveValue('http://192.168.21.114/x');
  await expect(
    dialog.locator('[data-setup-field="Primary-host"] [data-field-error]'),
  ).toContainText('not a URL');
});

/**
 * 🔴 `B-240`'s AMENDMENT, asserted where it is visible: `Close` on the panes with nothing to
 * commit, never beside an `Apply`, and it is the DIALOG's dismissal rather than a fourth act.
 */
test('§5 — Close sits only where there is nothing to commit, and it is the dialog’s own', async ({
  app,
}) => {
  const page = app.page;
  const dialog = page.getByRole('dialog', { name: 'Station setup' });
  const footClose = dialog.getByRole('button', { name: 'Close Station setup' });
  /*
    ⚠ Opened ONCE, then driven by the rail. `openStationSetupAt` presses the console's door
    first, and a second press lands on the scrim rather than on the button — a 30-second click
    timeout that reads as a hang rather than as "the dialog was already open".
  */
  await app.openStationSetupAt('Channel');
  const rail = dialog.getByRole('tablist', { name: 'Station setup sections' });
  const go = async (tab: string): Promise<void> => {
    await rail.getByRole('tab', { name: new RegExp(`^${tab}`) }).click();
    await expect(rail.getByRole('tab', { name: new RegExp(`^${tab}`) })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  };

  for (const tab of ['Channel', 'Live sources', 'Text file delimiters'] as const) {
    await go(tab);
    await expect(footClose, `${tab} has nothing to commit, so it offers the way out`).toBeVisible();
  }
  for (const tab of ['Servers', 'Layers'] as const) {
    await go(tab);
    await expect(footClose, `${tab} carries a Close beside its Apply`).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: /^Apply / })).toBeVisible();
  }

  // …and pressing it dismisses, from a clean tab, exactly as the ✕ does.
  await go('Text file delimiters');
  await footClose.click();
  await expect(dialog).toHaveCount(0);
});
