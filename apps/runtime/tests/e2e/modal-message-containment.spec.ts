import { test, expect, type Locator } from './fixtures/runtime.js';

/**
 * 🔴 THE FIXED FRAME'S MESSAGE REGION IS CONTAINED BY THE PANE IT BELONGS TO.
 *
 * `modal-message-in-viewport.spec.ts` one file over proves the region is PINNED — outside the
 * scroll container, above the action row, in view when the body is scrolled away from it. That
 * is a different property from this one, and holding it was never evidence for holding this:
 * a band can be perfectly pinned and still be drawn in the wrong COLUMN.
 *
 * Which is what it was. Measured in Chromium at 1280 × 800 on the Servers tab, the refusal
 * card ran from x = 87 to x = 1193 while the SECTION PANE it belongs to starts at x = 297 —
 * so 226 px of an amber refusal about Servers sat underneath the RAIL, across the names of the
 * four sections it explicitly says are still editable. Its bottom edge read 693.0 against the
 * footer's top edge of 693.0: flush, with no separation at all, which is why it read as
 * overlapping the bar rather than sitting above it. The frame that `station-setup-frame.spec.ts`
 * measures on two edges had a band breaking out of it on three.
 *
 * ── WHY THIS IS A PLAYWRIGHT SPEC AND CANNOT BE A DOM ONE ────────────────────────────
 *
 * Golden rule 12(c). Every claim here is an EDGE — `getBoundingClientRect().left` against
 * another element's — and jsdom computes no layout, so all six numbers are zero there and
 * `87 >= 297` reads as `0 >= 0`, which passes. A spec asserting this in jsdom would be green
 * against the defect it was written for.
 *
 * ── THE CHECK HAS TEETH, AND THE FIRST ASSERTION IS WHAT PROVES IT ───────────────────
 *
 * Containment inside the pane is only a claim worth making while the pane is genuinely NARROWER
 * than the frame. If the rail ever went away, `notice.left >= pane.left` would be satisfied by
 * a full-bleed band and this spec would pass while testing nothing. So the rail's width is
 * asserted FIRST and separately: it is the precondition, and it is deliberately the thing that
 * reddens if the frame is restructured under this spec.
 *
 * ── BOTH SECTIONS THAT CAN RAISE ONE ─────────────────────────────────────────────────
 *
 * The band is ONE element in the `Modal` primitive, so the geometry is the frame's rather than
 * any section's — but "one wrong band is rarely alone" is a claim about the tree, not a
 * deduction, so it is checked rather than argued. Servers raises its refusal from the on-air
 * gate; Live sources raises one from the bridge's own `checkSourceCatalog`. Both are asserted.
 */

/** Separation between the message card and the footer's top rule, in px. */
const MIN_FOOTER_GAP_PX = 8;

interface Edges {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

async function edges(locator: Locator, what: string): Promise<Edges> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error(`${what} has no box — it is not laid out`);
  return {
    left: box.x,
    right: box.x + box.width,
    top: box.y,
    bottom: box.y + box.height,
    width: box.width,
    height: box.height,
  };
}

/**
 * The three claims, made against whichever section raised the message.
 *
 * `notice` is the CARD the operator sees, not the region wrapper: the wrapper's padding is
 * exactly the thing under test, so asserting the wrapper's own edges would measure the
 * container against itself.
 */
async function assertContained(dialog: Locator, section: string): Promise<void> {
  const pane = await edges(dialog.locator('[data-station-pane]'), `${section} pane`);
  const frame = await edges(dialog, `${section} frame`);
  const notice = await edges(
    dialog.locator('[data-modal-message] [data-notice]').first(),
    `${section} notice`,
  );
  const footer = await edges(dialog.locator('.cg-modal-footer'), `${section} footer`);

  // THE PRECONDITION, asserted so the containment claims below cannot be vacuous: the pane is
  // genuinely inset from the frame by the rail, so a full-bleed band is a DIFFERENT box.
  expect(
    pane.left - frame.left,
    `${section}: the pane must be inset from the frame by the rail, or containment is vacuous`,
  ).toBeGreaterThan(200);

  // The card is real — a zero-size element would satisfy every edge test below.
  expect(notice.width, `${section}: the notice must have a real width`).toBeGreaterThan(200);
  expect(notice.height, `${section}: the notice must have a real height`).toBeGreaterThan(20);

  // (1) CONTAINED BY THE PANE. The refusal belongs to the section, so it is drawn in the
  // section's column and never across the rail that names the other four.
  expect(
    notice.left,
    `${section}: the notice must start at or after the pane's left edge`,
  ).toBeGreaterThanOrEqual(pane.left);
  expect(
    notice.right,
    `${section}: the notice must end at or before the pane's right edge`,
  ).toBeLessThanOrEqual(pane.right);

  // (2) DOES NOT INTERSECT THE FOOTER, and is visibly clear of it — flush contact is what
  // made this read as an overlap.
  expect(
    footer.top - notice.bottom,
    `${section}: the notice must clear the footer's top rule`,
  ).toBeGreaterThanOrEqual(MIN_FOOTER_GAP_PX);

  // (3) INSIDE THE FRAME, top and bottom — the two edges `station-setup-frame.spec.ts`
  // measures, made about the band rather than about the box.
  expect(notice.top, `${section}: the notice must be inside the frame`).toBeGreaterThan(frame.top);
  expect(notice.bottom, `${section}: the notice must be inside the frame`).toBeLessThan(
    frame.bottom,
  );
}

test('a Servers refusal is drawn inside the section pane, clear of the footer', async ({ app }) => {
  const page = app.page;
  const dialog = page.getByRole('dialog', { name: 'Station setup' });

  await app.openStationSetupAt('Servers');
  await expect(dialog).toBeVisible();

  // The seeded bank has rows on air, which is the Servers gate's own condition — no plant.
  const message = dialog.locator('[data-modal-message]');
  await expect(message).toBeVisible();
  await expect(message).toContainText('Apply is blocked for Servers');

  await assertContained(dialog, 'Servers');
});

test('a Live sources refusal is drawn inside the section pane, clear of the footer', async ({
  app,
}) => {
  const page = app.page;
  const dialog = page.getByRole('dialog', { name: 'Station setup' });

  await app.openStationSetupAt('Live sources');
  await expect(dialog).toBeVisible();

  // The bridge's own validator (`checkSourceCatalog`): the band must be disjoint from the
  // candidate bank the mock seeds at 70 upward, so 50–75 reaches into it.
  await dialog.getByLabel('Live source band start layer').fill('50');
  await dialog.getByLabel('Live source band end layer').fill('75');
  await dialog.getByRole('button', { name: 'Apply band' }).click();

  const message = dialog.locator('[data-modal-message]');
  await expect(message).toBeVisible();

  await assertContained(dialog, 'Live sources');
});
