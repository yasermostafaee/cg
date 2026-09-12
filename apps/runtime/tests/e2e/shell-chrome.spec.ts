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
    `Layers | Live plates | Station layers`. Asserted as containment rather than by counting
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

test('§B2 — the filter narrows the list, and never hides a row that would lose its only surface', async ({
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
  /*
    The tally says how much of the list is showing, so a narrowed list is never mysterious.
    `CONSOLE-LOOK-06` §3 took the reference's `N/M rows` form; the TOTAL is what this asserts
    and it must not move when the shown count does.

    ⚠ Not to be confused with Station setup's own `29 of 29 rows` (`CandidateLayersSection`,
    `[data-layers-results]`), which is a different pane on a different surface and keeps its
    own wording — `station-setup-match.spec.ts` pins that one.
  */
  await expect(app.layers.locator('[data-layers-tally-rows]')).toContainText(
    `/${String(before)} rows`,
  );

  /*
    A query that matches nothing by NAME still leaves the rows the override protects, and
    `CONSOLE-MATCH-03` narrowed WHICH those are: on air, or a producer nothing of ours is
    bound to. `layerFilter.test.ts` proves the predicate; this proves it reaches the list.
  */
  await search.fill('zzz-no-such-row-zzz');
  const survivors = await app.layers.locator('[data-layer]').count();
  expect(
    survivors,
    'a row that would lose its only surface is never filtered away',
  ).toBeGreaterThan(0);
  /*
    🔴 THE OTHER HALF, and the one the owner reported. Layer 70 is bound, IDLE, and observed
    carrying an `html` producer — the ordinary PRE-ROLLED row, which is what the station's
    rows look like nearly all the time. It used to be unhideable, which made the search box
    useless there. It must filter away like anything else.
  */
  await expect(app.layers.locator('[data-layer="70"]')).toHaveCount(0);

  await search.fill('');
  await expect.poll(rowsNow).toBe(before);

  // HIDE EMPTY drops the rows carrying nothing, and keeps the rest.
  await app.layers.getByText('Hide empty').click();
  await expect.poll(rowsNow).toBeLessThan(before);
  await app.layers.getByText('Hide empty').click();
  await expect.poll(rowsNow).toBe(before);
});

/**
 * 🔴 `CONSOLE-MATCH-03` §2 — WHAT THE LAYERS CARD SAYS ABOUT ITSELF.
 *
 * Three additions, each measured against the rendered reference at 1280 × 800 (never against
 * a rule read out of its stylesheet — four waves, only the last paints, `PROMPT.md` §0):
 * the `CH N` scope at the head of the bulk group, the rule that splits the irreversible verb
 * off from the two remedies, and the card's footer hint. Boxes belong in a real engine
 * (golden rule 12c).
 */
test('§C1 — the bulk group states its scope, and the irreversible verb is fenced off', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });

  const target = page.locator('[data-bulk-target]');
  await expect(target).toHaveText('CH 1');
  const rule = page.locator('.cg-bulk-divider');
  await expect(rule).toHaveCount(1);

  const tBox = await target.boundingBox();
  const rBox = await rule.boundingBox();
  const clearAll = page.getByRole('button', { name: 'Clear all rows holding a layer' });
  const removeAll = page.getByRole('button', { name: 'Remove all items' });
  const cBox = await clearAll.boundingBox();
  const mBox = await removeAll.boundingBox();
  expect(tBox).not.toBeNull();
  expect(rBox).not.toBeNull();
  expect(cBox).not.toBeNull();
  expect(mBox).not.toBeNull();

  // The reference's rule is 1 × 17. The WIDTH is the assertion that matters: a "divider"
  // that laid out at zero would pass a presence check and draw nothing.
  expect(rBox!.width).toBeCloseTo(1, 1);
  expect(rBox!.height).toBeCloseTo(17, 1);

  // The scope is AHEAD of the verbs it scopes, and the rule is BETWEEN the remedies and the
  // one that cannot be undone. Ordering, in the reading direction, measured rather than assumed.
  expect(tBox!.x, 'the scope leads the group').toBeLessThan(cBox!.x);
  expect(rBox!.x, 'the rule follows CLEAR ALL').toBeGreaterThan(cBox!.x);
  expect(rBox!.x, 'and precedes REMOVE ALL').toBeLessThan(mBox!.x);
});

test('§C2 — the card closes with the hint, below the list and never scrolling with it', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });

  const hint = page.locator('[data-layers-foothint]');
  await expect(hint).toHaveText(
    'Click a populated row to inspect · ON PVW adds to the composite · Play takes the row on air',
  );
  const hBox = await hint.boundingBox();
  expect(hBox).not.toBeNull();
  // The reference's 24 px foot.
  expect(hBox!.height).toBeCloseTo(24, 0);

  /*
    IT DOES NOT SCROLL WITH THE LIST. Proved by scrolling the list to its end and reading the
    hint's box again: a hint inside the scroll area would move. This is the same property the
    sub-bar has and for the mirror reason — a line describing a list you cannot see while
    reading it describes nothing.
  */
  const before = hBox!.y;
  await page.evaluate(() => {
    const rows = document.querySelectorAll('[data-layer]');
    rows[rows.length - 1]?.scrollIntoView({ block: 'end' });
  });
  await page.waitForTimeout(200);
  const after = (await hint.boundingBox())?.y;
  expect(after).toBeCloseTo(before, 0);
});

/**
 * 🔴 `CONSOLE-MATCH-03` §1 — THE MONITOR HEADS.
 *
 * Both panes name the output and the CHANNEL, PVW counts what is on it, and PGM states the
 * return signal and the air count on one strip. The last of those is the one with a real
 * safety argument behind it: "no return signal" is about the FEED (`MONITORS-01`/`C-016`),
 * "N rows on air" is about AIR, and an operator must never read the first as the second.
 */
test('§C3 — both monitor heads name their output and their channel, and PGM separates feed from air', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole('button', { name: 'Show monitors' }).click();
  await expect(page.getByRole('button', { name: 'Hide monitors' })).toBeVisible();

  const pvwHead = page.locator('.cg-monitor-label--pvw');
  const pgmHead = page.locator('.cg-monitor-label--pgm');
  await expect(pvwHead).toContainText('PREVIEW');
  await expect(pvwHead).toContainText('CH 1');
  await expect(pgmHead).toContainText('PROGRAM');
  await expect(pgmHead).toContainText('CH 1');

  // Nothing is on PVW at boot, and the head says so rather than hiding the count.
  await expect(page.locator('[data-pvw-count]')).toHaveText('0 layers on PVW');

  const strip = page.locator('[data-monitor-pgm-strip]');
  await expect(strip).toContainText('No return signal');
  await expect(strip).toContainText('on air');
  // The reference's 31 px strip.
  const sBox = await strip.boundingBox();
  expect(sBox).not.toBeNull();
  expect(sBox!.height).toBeCloseTo(31, 0);

  /*
    🔴 PROTOTYPE FURNITURE NOT COPIED. The reference's own head reads `3 rows on air · demo`
    and its status bar reads `Local prototype · no bridge connection`; both are the drawing
    labelling itself. Asserted as an ABSENCE so a later paste of the reference's markup cannot
    bring them in quietly.
  */
  await expect(strip).not.toContainText('demo');
  await expect(page.locator('footer')).not.toContainText('Local prototype');
  await expect(page.locator('[data-app-header]')).not.toContainText('PROTOTYPE');
});

/**
 * 🔴 `CONSOLE-MATCH-03` §5 — NO UNICODE-GLYPH ICONS ANYWHERE ON THE SHELL.
 *
 * CLAUDE.md's design system is flat about this and the status bar had four (`⚠` × 3, `⇄`,
 * `🔒`). It is asserted over the whole rendered shell rather than over one component, because
 * the rule is about the SURFACE: the next one to appear will appear somewhere else.
 */
test('§C4 — the shell draws its marks with icons, never with text glyphs', async ({ app }) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });
  const stray = await page.evaluate(() => {
    const text = document.body.innerText;
    // Emoji and the dingbat/miscellaneous-symbol blocks the four offenders came from. The
    // bullet `·` and the `●`/`○` LEDs are deliberately NOT in this range: they are typographic
    // marks in a sentence, not icons standing in for a control.
    return [...new Set([...text].filter((c) => /[🌀-🫿☀-➿]/u.test(c)))];
  });
  expect(stray, `text glyphs still on the shell: ${stray.join(' ')}`).toEqual([]);
});

/* ─────────────────────────────────────────────────────────────────────────────
   §D — `CONSOLE-LOOK-06` DELTA 1. Four claims, all of them paint or geometry, so all of
   them belong in a real engine: jsdom has no layout and its cascade is not Chrome's, so
   every one of these would pass against a broken surface (golden rule 12c).
   ───────────────────────────────────────────────────────────────────────────── */

test('§D1 — the PVW transport draws ICONS, at the reference’s 12 px, beside the words', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });
  // At this width the monitors start hidden — the shell's own choice, not this test's.
  const show = page.getByRole('button', { name: 'Show monitors' });
  if ((await show.count()) > 0) await show.click();
  const pvw = page.getByRole('region', { name: 'PREVIEW' });
  await expect(pvw).toBeVisible();

  for (const verb of ['PLAY', 'NEXT', 'STOP'] as const) {
    const button = pvw.getByRole('button', { name: new RegExp(`^${verb}`) }).first();
    const svg = button.locator('svg');
    await expect(svg, `${verb} has no icon`).toHaveCount(1);
    const box = await svg.boundingBox();
    expect(box, `${verb} icon has no box`).not.toBeNull();
    expect(Math.round(box!.width), `${verb} icon width`).toBe(12);
    expect(Math.round(box!.height), `${verb} icon height`).toBe(12);
    // …and the WORD is still there. The reference draws `${I('play')}PLAY`, not a bare glyph:
    // an icon-only transport would make three cyan squares of three different verbs.
    await expect(button).toContainText(verb);
  }

  // 🔴 NO UNICODE GLYPH stood in for an icon (the design system forbids them, and this
  // transport is exactly where one would be tempting).
  const text = (await pvw.locator('[data-pvw-controls]').textContent()) ?? '';
  expect(text).not.toMatch(/[▷▶■⊘⏭⏹]/);
});

test('§D2 — a tab that was clicked keeps NO underline: exactly one coloured bottom border, always', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });
  const strip = page.getByRole('tablist', { name: 'Layer surfaces' });
  const tabs = strip.getByRole('tab');
  const n = await tabs.count();
  expect(n).toBeGreaterThan(1);

  /*
    🔴 THE DEFECT THIS PINS, measured on 2026-09-12 before the fix: the tab's base carried
    `border-bottom: 2px solid transparent` (a SHORTHAND) and the selected state merged
    `borderBottomColor` (a LONGHAND) over it as an inline style. React removes the longhand on
    deselect and the shorthand's colour goes with it, so a visited tab was left holding a
    width and a style with no colour — Chrome painted `rgb(255, 255, 255)`. The owner saw a
    light underline under `Live plates` and `Station layers` after clicking them.

    It is the same bug `STATION-CHROME-02` found on the RAIL, one surface over, and it has
    the same fix: the selected state is a SELECTOR now, so there is no style diff to get
    wrong. Which is why the assertion is not "the border is transparent" but the invariant —
    EXACTLY ONE coloured border, no matter what has been clicked.
  */
  const coloured = async (): Promise<number> =>
    strip.evaluate((list) => {
      const opaque = (c: string): boolean => !/^rgba\(.*,\s*0\)$/.test(c) && c !== 'transparent';
      return [...list.querySelectorAll('[role=tab]')].filter((b) => {
        const cs = getComputedStyle(b);
        return parseFloat(cs.borderBottomWidth) > 0 && opaque(cs.borderBottomColor);
      }).length;
    });

  expect(await coloured(), 'at rest').toBe(1);
  for (let i = 0; i < n; i += 1) {
    await tabs.nth(i).click();
    await page.mouse.move(5, 780); // off every control: a :hover reading is a different rule
    await expect(tabs.nth(i)).toHaveAttribute('aria-selected', 'true');
    expect(await coloured(), `after visiting tab ${String(i)}`).toBe(1);
  }
  // …and back to the first, with every tab now visited — the state the owner reported from.
  await tabs.nth(0).click();
  await page.mouse.move(5, 780);
  expect(await coloured(), 'after visiting every tab and returning').toBe(1);
});

test('§D2b — the tabs are SENTENCE CASE and the column heads are UPPER: that contrast is the design', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });
  const strip = page.getByRole('tablist', { name: 'Layer surfaces' });

  // The reference renders `Layers` · `Live plates` · `Station layers` with NO `text-transform`
  // on `.layer-tabs button` at all — measured, and the owner set our three to match.
  const tab = strip.getByRole('tab').first();
  await expect(tab).toHaveText('Layers');
  await expect(tab).toHaveCSS('text-transform', 'none');
  await expect(tab).toHaveCSS('font-size', '13px');
  // Tracking goes to `normal` WITH the casing: 0.04em was kept only because the labels were
  // upper, and upper at `normal` sets too tight.
  await expect(tab).toHaveCSS('letter-spacing', 'normal');

  // …and the head below it is the opposite, which is the point.
  const head = app.layers.getByRole('row').first().locator('span').first();
  await expect(head).toHaveCSS('text-transform', 'uppercase');
});

test('§D4 — the bulk verbs are the reference’s toolbar button, and a disabled one stays disabled under the pointer', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });
  const stop = app.layers.locator('[data-verb-tone="stop"]').first();
  await expect(stop).toBeVisible();

  // Measured off the reference at 1280 × 800. ⚠ `font-size` is 12, not the candidate list's
  // 11: a later wave overrides the rule the list quotes, and the measurement wins.
  await expect(stop).toHaveCSS('font-size', '12px');
  await expect(stop).toHaveCSS('padding', '5px 8px');
  const box = await stop.boundingBox();
  expect(box).not.toBeNull();
  expect(Math.round(box!.height), 'the reference toolbar button is 32 px').toBe(32);

  /*
    ⭐ "A disabled one keeps the disabled look on hover." The reference states it as a rule
    (`.layer-toolbar .btn:disabled:hover` restates the disabled paint); ours gets it for free
    because every hover rule in the sheet is written `:hover:not(:disabled)`. Asserted as a
    NEGATIVE — the paint does not move — rather than by adding a declaration that would look
    like the fix and hide the real reason.
  */
  const remove = app.layers.locator('[data-verb-tone="remove"]').first();
  await expect(remove).toBeDisabled();
  const paint = async (): Promise<string> =>
    remove.evaluate((el) => {
      const cs = getComputedStyle(el);
      return `${cs.backgroundColor}|${cs.borderColor}|${cs.color}`;
    });
  await page.mouse.move(5, 780);
  const off = await paint();
  await remove.hover({ force: true });
  await page.waitForTimeout(120);
  expect(await paint(), 'a disabled bulk verb lit up under the pointer').toBe(off);
});

test('§D5 — the on-air count is in the SUB-BAR and not in the table head, and it is stated once', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });
  const head = app.layers.getByRole('row').first();
  const subbar = app.layers.locator('[data-layers-subbar]');

  // The reference's header is `# / State / Name / Template / …` and nothing else.
  await expect(head.locator('[data-air-tally]')).toHaveCount(0);
  await expect(head.locator('[data-error-tally]')).toHaveCount(0);
  await expect(head).not.toContainText('on air');

  // …and the count is in the sub-bar, exactly once on the whole surface. Stating one number
  // in two places is a pair that can disagree, which is what this move removed.
  await expect(subbar.locator('[data-air-tally]')).toHaveCount(1);
  await expect(app.layers.locator('[data-air-tally]')).toHaveCount(1);

  // The `#` column STAYS. The reference has one too (measured), and it carries the row's
  // position — the layer number golden rule 11 asks to keep reachable.
  await expect(head.locator('span').first()).toHaveText('#');
});

test('§D5b — the air count wears the air colour, and drops it when nothing can confirm it', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 800 });
  const air = app.layers.locator('[data-air-tally]');
  await expect(air).toHaveCount(1);

  /*
    🔴 THE PAINT, in a real engine. `layersPanel.unreachableLabels.dom.test.ts` asserts §4's
    ATTRIBUTE contract — `data-unverifiable` present or absent — because the colour moved out
    of an inline style and into a selector when the count moved to the sub-bar, and jsdom is
    not running this sheet. This is the other half: the two states really do paint apart.

    Asserted as a DIFFERENCE, not against a hex — `--r-onair` is the owner's held value and
    a test that re-spells it is a second home for it (§4's "by TOKEN, never by hex").
  */
  const unverifiable = await air.getAttribute('data-unverifiable');
  const colour = await air.evaluate((el) => getComputedStyle(el).color);
  const muted = await app.layers
    .locator('[data-layers-tally-rows]')
    .evaluate((el) => getComputedStyle(el).color);

  if (unverifiable === null) {
    // Confirmed: the count wears the sacred green, distinct from the muted text beside it.
    expect(colour, 'a confirmed air count must not read as ordinary text').not.toBe(muted);
  } else {
    // Withdrawn: it keeps the number and gives up the claim, which is exactly the grey.
    expect(colour, 'an unconfirmed air count must not wear the air colour').toBe(muted);
  }
});
