import { test, expect } from './fixtures/runtime.js';

/**
 * 🔴 `STATION-CHROME-02` §2 — **ONE DIALOG SIZE, ON EVERY TAB — ASSERTED.**
 *
 * ── WHY THIS SPEC EXISTS AT ALL, AND WHY IT IS A BROWSER SPEC ───────────────
 *
 * `STATION-CHROME-01` collected five sections into a tabbed dialog and left them sizing it:
 * Delimiters is five rows, Layers is thirty-four, Channel is two cards. The frame therefore
 * GREW AND SHRANK under the operator as he moved along the rail — the box he was aiming at,
 * and everything visible behind it, moved on every press.
 *
 * ⭐ **That is the one property an operator notices immediately and no unit test would have
 * caught.** jsdom has no layout: `getBoundingClientRect()` is all zeros there, so a dom spec
 * asserting "the box is the same" would pass on a dialog of any shape, including a broken
 * one. The measurement has to happen in a real engine, which is what makes this a Playwright
 * spec rather than the cheaper thing.
 *
 * It measures TWO edges, and the second is not redundant:
 *
 *   1. the DIALOG's box — x, y, width, height — identical on all five tabs;
 *   2. the FOOTER's TOP edge — because a fixed-height dialog can keep its outer box while
 *      the footer grows into it. A footer note that wraps to a second line moves that edge
 *      and the buttons with it, and the outer box says nothing about it. It is not a
 *      hypothetical: §5's corrected Live-sources sentence did exactly that against a
 *      `maxWidth: 58ch` note, and this assertion is what found it.
 */

const TABS = ['Channel', 'Servers', 'Live sources', 'Text file delimiters', 'Layers'] as const;

/** Rounded, because sub-pixel layout noise is not a moved frame. */
const round = (n: number): number => Math.round(n);

test('§2 — the frame does not move as the operator walks the rail', async ({ app }) => {
  const page = app.page;
  const dialog = page.getByRole('dialog', { name: 'Station setup' });

  await page.getByRole('button', { name: 'Open Station setup', exact: true }).click();
  await expect(dialog).toBeVisible();
  const rail = dialog.getByRole('tablist', { name: 'Station setup sections' });

  const boxes: { tab: string; dialog: string; footTop: number }[] = [];
  for (const name of TABS) {
    await rail.getByRole('tab', { name: new RegExp(`^${name}`) }).click();
    // The pane it switched to must actually be mounted before anything is measured;
    // otherwise the first reading could be of the previous tab's layout.
    await expect(dialog.locator('[data-station-section]')).toHaveCount(1);
    const box = await dialog.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const foot = el.querySelector('.cg-modal-footer');
      if (foot === null) throw new Error('the dialog has no footer');
      return { r: [r.x, r.y, r.width, r.height], footTop: foot.getBoundingClientRect().top };
    });
    boxes.push({
      tab: name,
      dialog: box.r.map(round).join(','),
      footTop: round(box.footTop),
    });
  }

  // ONE box, five tabs. Reported as a table so a failure names which tab moved and by how
  // much, rather than only that two numbers differed.
  const first = boxes[0];
  if (first === undefined) throw new Error('no tabs measured');
  expect(
    boxes.map((b) => `${b.tab}: ${b.dialog}`),
    'the dialog box must be identical on every tab',
  ).toEqual(boxes.map((b) => `${b.tab}: ${first.dialog}`));

  expect(
    boxes.map((b) => `${b.tab}: ${String(b.footTop)}`),
    "the footer's top edge must not move",
  ).toEqual(boxes.map((b) => `${b.tab}: ${String(first.footTop)}`));

  /*
    POSITIVE CONTROL — without it, "every tab is the same" would also pass against a dialog
    that never rendered, or against five readings of one tab. The frame is the reference's
    `min(1140px, 100vw - 64px)` × `min(810px, 100vh - 64px)` (`RUNTIME-REDESIGN-01` Phase 7;
    `station-setup-geometry.spec.ts` asserts the numbers), so at this viewport it is a real,
    NON-ZERO box, and the tabs genuinely differ in how much content they hold.
  */
  const [x, y, w, h] = first.dialog.split(',').map(Number);
  expect(w, 'the frame has a real width').toBeGreaterThan(600);
  expect(h, 'the frame has a real height').toBeGreaterThan(400);
  expect(first.footTop, 'the footer is inside the frame').toBeGreaterThan(Number(y));
  expect(Number(x)).toBeGreaterThanOrEqual(0);
});

test('§2 — the BODY scrolls, and its scrollbar is inside the pane', async ({ app }) => {
  const page = app.page;
  /*
    `RUNTIME-REDESIGN-01` Phase 7 — measured at the programme's viewport (`PROMPT.md` §0:
    1280 × 800), which is where the reference's frame was read. Playwright's default 720-tall
    page gives the `min(810px, 100vh − 64px)` frame only 656 px, and the Delimiters card —
    intrinsically sized, five rows plus its head and help band — then ends 12 px above the
    pane's edge: not a stretched card, a short frame. The slack this asserts is a proxy for
    "not stretched", so it is read where the frame has its measured height.
  */
  await page.setViewportSize({ width: 1280, height: 800 });
  const dialog = page.getByRole('dialog', { name: 'Station setup' });

  await page.getByRole('button', { name: 'Open Station setup', exact: true }).click();
  await dialog
    .getByRole('tablist', { name: 'Station setup sections' })
    .getByRole('tab', { name: /^Layers/ })
    .click();

  // The Layers tab is the long one — thirty-four rows against a frame no taller than 810px.
  const pane = dialog.locator('[data-station-pane]');
  const overflow = await pane.evaluate((el) => ({
    scrolls: el.scrollHeight > el.clientHeight,
    overflowY: getComputedStyle(el).overflowY,
  }));
  expect(overflow.scrolls, 'the Layers pane genuinely overflows its frame').toBe(true);
  expect(overflow.overflowY).toBe('auto');

  // …and the RAIL does not scroll with it: it must stay beside the section it names.
  const railScrolled = await dialog
    .getByRole('tablist', { name: 'Station setup sections' })
    .evaluate((el) => el.scrollHeight > el.clientHeight);
  expect(railScrolled, 'the rail is short enough to stand still').toBe(false);

  /*
    ⚠ §2 — A SHORT SECTION MUST NOT STRETCH TO FILL THE FRAME. Delimiters holds five rows in
    a fixed box, and the correct answer is empty space below the card, not a card grown to
    swallow it. Measured as: the card's bottom sits well above the pane's bottom.
  */
  await dialog
    .getByRole('tablist', { name: 'Station setup sections' })
    .getByRole('tab', { name: 'Text file delimiters' })
    .click();
  const slack = await pane.evaluate((el) => {
    const card = el.querySelector('.cg-card');
    if (card === null) throw new Error('the delimiters section has no card');
    return el.getBoundingClientRect().bottom - card.getBoundingClientRect().bottom;
  });
  expect(slack, 'the short section sits at the top, with space below it').toBeGreaterThan(50);
});
