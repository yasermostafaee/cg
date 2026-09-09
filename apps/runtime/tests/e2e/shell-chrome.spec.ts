import { expect, test } from './fixtures/runtime.js';

/**
 * 🔴 `AUDIT-CLOSE-01` B — THE CHROME ABOVE THE FIRST DATA ROW, MEASURED.
 *
 * The audit's number and the reason this file exists: at 1280 × 800 the reference spends
 * **166.3 px** between the top of the page and its first layer row and shows **10 rows**; the
 * app spent **481 px** and showed **4**. Nothing in ten phases' property tables contained a
 * single row about any of that, because the three surfaces that make it up were bucket D —
 * the app header (`design.md` §1.1 recorded it as absent and never decided it), the layers
 * sub-bar (§1.1 asserted it already existed; it did not) and the split of one toolbar into two
 * bars.
 *
 * ── WHY EVERY NUMBER HERE IS PLAYWRIGHT'S ────────────────────────────────────────────
 *
 * Golden rule 12(c). These are edges and heights; jsdom returns zeros for all of them, so the
 * whole file would pass against any layout at all, including the one it was written to
 * replace. The FILTER's set behaviour is proved without a browser in `layerFilter.test.ts` —
 * the split is deliberate, and it is the same rule read in both directions.
 *
 * ── ⚠ THE MOCK'S BANNERS ARE SUBTRACTED, AND THE SUBTRACTION IS MEASURED ─────────────
 *
 * With no bridge the app wears its honest amber `TEST MODE` band — ~46 px of chrome that does
 * not exist on a station with a bridge. Measuring through it would report a number the
 * operator never sees, so the BANNER REGION is measured and taken off: it is exactly the gap
 * between the app header's bottom edge and the top of the channel tabpanel that wraps the
 * workspace, because every banner is an in-flow child of `main` between those two.
 *
 * That is a measurement rather than a constant, so a band that changed height cannot quietly
 * shift the budget — and it is asserted to be positive here, since the whole point is that
 * there IS a band in this harness. The budget below is therefore a REAL-BRIDGE number and can
 * be compared to the reference's 166.3 directly.
 */

/**
 * The ceiling for the app's own chrome above the first row, in px, on a real bridge.
 *
 * It is a BUDGET and not a pin: the exact figure today is **181.5**, and every pixel of the
 * 15.2 it spends over the reference's 166.3 is itemised —
 *
 *   +9.5  the panel bar is `--r-panel-bar-h` 53 against the reference's 43.5. A height that
 *         belongs to BEING A PANEL and is shared by four of them; changing it is its own item.
 *   +2.5  the column head is 28.3 against 25.8: `B-224`'s State tally wraps inside it and the
 *         reference has no tally.
 *   +3.2  the shell's own padding and the panel's border.
 *
 * 166.3 + 15.2 = 181.5, so there is no unaccounted chrome above that row. The ceiling leaves
 * ~14 px of slack, which is less than any of the three lines this session removed or folded
 * away — so a regression past it means a NEW LINE appeared, which is exactly what this spec
 * exists to catch, and not that a padding was tuned by a pixel.
 */
const CHROME_BUDGET_PX = 195;

/** The reference's own figure, for the failure message to compare against. */
const REFERENCE_CHROME_PX = 166.3;

test('§B — one bar carries the tabs and the bulk verbs, and the sub-bar is under it', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });

  // THE APP HEADER — the surface that did not exist.
  const header = page.locator('[data-app-header]');
  await expect(header).toBeVisible();
  const tokens = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const read = (n: string): string => cs.getPropertyValue(n).trim();
    return { headH: read('--r-app-head-h'), subbarH: read('--r-subbar-h') };
  });
  for (const [name, value] of Object.entries(tokens)) {
    expect(value, `${name} is declared`).not.toBe('');
  }
  const headBox = await header.boundingBox();
  expect(headBox, 'the header is laid out').not.toBeNull();
  expect(Math.round(headBox?.y ?? -1), 'the header is the first thing on the page').toBe(0);
  expect(Math.round(headBox?.height ?? 0), 'the header is its declared height').toBe(
    Number.parseFloat(tokens.headH),
  );

  // The CHANNEL axis is in it, and the two doors are the ones the reference draws there.
  await expect(header.getByRole('tablist', { name: 'Channels' })).toBeVisible();
  await expect(header.getByRole('button', { name: 'Open Station setup' })).toBeVisible();
  await expect(header.getByRole('button', { name: 'Open audit log' })).toBeVisible();

  /*
    🔴 ONE BAR, NOT TWO. The layers card's tablist is INSIDE the panel's header bar, which is
    the whole of B3: the bar used to say `LAYERS` and a strip beneath it said
    `LAYERS | LIVE SOURCES | STATION LAYERS`. Asserted as containment rather than by counting
    lines, because containment is the mechanism and a line count is a symptom.
  */
  const panelBar = app.layers.locator('.cg-panel-header').first();
  const layerTabs = app.layers.getByRole('tablist', { name: 'Layer surfaces' });
  await expect(layerTabs).toBeVisible();
  expect(
    await panelBar.evaluate(
      (bar, sel) => bar.contains(document.querySelector(sel)),
      '[role="tablist"][aria-label="Layer surfaces"]',
    ),
    'the layer tabs must sit inside the panel bar, not on a line of their own',
  ).toBe(true);

  // THE SUB-BAR — its declared height, and the three things on it.
  const subbar = app.layers.locator('[data-layers-subbar]');
  await expect(subbar).toBeVisible();
  const subBox = await subbar.boundingBox();
  expect(Math.round(subBox?.height ?? 0), 'the sub-bar is its declared height').toBe(
    Number.parseFloat(tokens.subbarH),
  );
  await expect(subbar.getByLabel('Find row or template')).toBeVisible();
  await expect(subbar.getByText('Hide empty')).toBeVisible();
  await expect(subbar.locator('[data-layers-tally]')).toBeVisible();
});

/**
 * 🔴 `MONITORS-01` §B4 — THE CONSOLE BOOTS WITH THE MONITORS FOLDED AWAY, AND THE OPERATOR
 * CAN ALWAYS TELL THEY ARE THERE.
 *
 * The default moved to HIDDEN because neither box is confidence monitoring: PGM renders a
 * fixed empty placeholder for the unbuilt `C-016`, and PVW is a LOCAL browser render of the
 * rehearsing rows (`R-022` — nothing is ever sent to CasparCG). `design.md` §19 carries the
 * trace and §19.1 separates this from owner answer A13, which is about PERSISTENCE and is
 * untouched.
 *
 * ── WHY THE SECOND HALF IS THE PART THAT MATTERS ─────────────────────────────────────
 *
 * A default that hides a surface is only defensible if the surface still announces itself.
 * The failure this guards is not "the strip is hidden" — that is the decision — but a console
 * on which an operator who has never seen the strip has no way to learn it exists. So the
 * assertions are: the toggle is in the HEADER, it is VISIBLE, it carries the WORD `SHOW
 * MONITORS` and not only a glyph, and pressing it produces the strip with both boxes in it.
 *
 * Every claim here is Playwright's (golden rule 12c): visibility, containment and a bounding
 * box are all zero or vacuous in jsdom, so this whole file would pass against a header with
 * no button in it at all. The WIRING half — the flag's default, its axis, its non-persistence
 * — is proved without a browser in `shellLayout.monitorsShown.dom.test.ts`.
 */
test('§B4 — the console boots with the monitors folded, and says so in the header', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });

  // THE BOOT STATE, untouched: nothing in this test has pressed anything yet.
  await expect(page.locator('[data-monitor-strip]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Hide monitors' })).toHaveCount(0);

  const show = page.getByRole('button', { name: 'Show monitors' });
  await expect(show, 'the one control that says the monitors exist').toBeVisible();
  await expect(show).toHaveAttribute('aria-expanded', 'false');
  // IN THE HEADER — containment, not proximity, because a button that drifted onto another
  // bar would still be "visible somewhere on the page".
  expect(
    await page
      .locator('[data-app-header]')
      .evaluate((h, btn) => h.contains(btn), await show.elementHandle()),
    'the monitors toggle sits in the app header',
  ).toBe(true);
  // IN WORDS. A lone glyph on a bar the operator has never opened is not a statement that a
  // surface is there — and this is the state in which nothing else on screen mentions PVW or
  // PGM at all.
  await expect(show).toContainText('SHOW MONITORS');
  const box = await show.boundingBox();
  expect(box, 'the toggle is laid out').not.toBeNull();
  expect(box?.width ?? 0, 'the toggle is a real target, not a collapsed one').toBeGreaterThan(60);

  // AND IT DELIVERS: one press brings both boxes back.
  await show.click();
  await expect(page.locator('[data-monitor-strip]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Hide monitors' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'PREVIEW (PVW)' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'PROGRAM (PGM)' })).toBeVisible();
});

test('§B — the chrome above the first data row, and how many rows fit', async ({ app }) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });

  // The reference's own state, which is now the app's own boot state too (`MONITORS-01`):
  // the monitors folded away, the toggle reading `Show monitors`. The click is kept as a
  // no-op guard so this measurement cannot silently start reading the other state.
  const hide = page.getByRole('button', { name: 'Hide monitors' });
  if (await hide.count()) await hide.first().click();
  await expect(page.getByRole('button', { name: 'Show monitors' })).toBeVisible();

  const measure = async (): Promise<{ chrome: number; banners: number; rows: number }> =>
    page.evaluate(() => {
      const box = (sel: string): DOMRect | undefined =>
        document.querySelector(sel)?.getBoundingClientRect();
      const rows = [...document.querySelectorAll('[data-layer]')];
      const first = rows[0]?.getBoundingClientRect();
      const head = box('[data-app-header]');
      const workspace = box('[role="tabpanel"][id^="channelpanel-"]');
      const foot = box('footer');
      // Every banner is an in-flow child of `main` between the header and the workspace.
      const banners =
        head === undefined || workspace === undefined ? 0 : workspace.top - head.bottom;
      return {
        chrome: first === undefined ? -1 : first.top - banners,
        banners,
        rows: rows.filter((r) => {
          const b = r.getBoundingClientRect();
          const floor = foot === undefined ? window.innerHeight : foot.top;
          return b.height > 0 && b.bottom <= floor;
        }).length,
      };
    });

  const hidden = await measure();
  expect(hidden.chrome, 'the first row is laid out').toBeGreaterThan(0);
  // The subtraction is REAL in this harness — the mock's test-mode band is up.
  expect(hidden.banners, 'the banner region is measured, not assumed').toBeGreaterThan(0);
  expect(
    hidden.chrome,
    `chrome above the first data row: ${String(Math.round(hidden.chrome))} px, against the reference's ${String(REFERENCE_CHROME_PX)} px`,
  ).toBeLessThanOrEqual(CHROME_BUDGET_PX);
  // …and it buys rows, which is what the number is FOR.
  expect(
    hidden.rows,
    'rows visible above the status bar with the monitors folded',
  ).toBeGreaterThanOrEqual(7);

  /*
    WITH THE MONITORS SHOWN — the app's own default, and the one place it still differs from
    the reference by a whole surface rather than by pixels. The strip is 230 px of MONITORING,
    which is a safety default and the owner's to set; what is asserted here is only that the
    chrome ABOVE it did not grow back.
  */
  await page.getByRole('button', { name: 'Show monitors' }).click();
  await expect(page.getByRole('button', { name: 'Hide monitors' })).toBeVisible();
  const shown = await measure();
  expect(shown.chrome).toBeGreaterThan(hidden.chrome);
  expect(shown.rows, 'the list still shows rows with the strip up').toBeGreaterThanOrEqual(3);
});

test('§B2 — the filter narrows the list, and never hides a row the bridge has something on', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 1000 });

  const rowsNow = (): Promise<number> => app.layers.locator('[data-layer]').count();
  const before = await rowsNow();
  expect(before, 'the seeded bank has rows to narrow').toBeGreaterThan(5);

  const search = app.layers.getByLabel('Find row or template');
  await search.fill('DEBATE');
  await expect.poll(rowsNow).toBeLessThan(before);
  // The tally says how much of the list is showing, so a narrowed list is never mysterious.
  await expect(app.layers.locator('[data-layers-tally-rows]')).toContainText(
    `of ${String(before)} rows`,
  );

  // A query that matches nothing by NAME still leaves the occupied rows, which is the
  // override: `layerFilter.test.ts` proves the predicate, this proves it reaches the list.
  await search.fill('zzz-no-such-row-zzz');
  const survivors = await app.layers.locator('[data-layer]').count();
  expect(survivors, 'a row the bridge reports something on is never filtered away').toBeGreaterThan(
    0,
  );

  await search.fill('');
  await expect.poll(rowsNow).toBe(before);

  // HIDE EMPTY drops the rows carrying nothing, and keeps the rest.
  await app.layers.getByText('Hide empty').click();
  await expect.poll(rowsNow).toBeLessThan(before);
  await app.layers.getByText('Hide empty').click();
  await expect.poll(rowsNow).toBe(before);
});
