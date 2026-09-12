import type { Locator } from '@playwright/test';
import { expect, test } from './fixtures/runtime.js';

/**
 * `B-224` — the Layers header's STATE tally shows every count whole, and the NAME column
 * fits the longest real row name, at BOTH widths the owner judges by: the panel's default
 * width, and the narrower one with the Inspector open.
 *
 * 🔴 `CONSOLE-LOOK-06` DELTA D5 — THE TALLY MOVED TO THE SUB-BAR, so this spec follows it
 * there. The reference's header is `# / State / Name / Template / …` and its counts live in
 * the sub-bar; ours had a chip there already, and the same number twice on one surface is a
 * pair that can disagree.
 *
 * ⚠ `B-224` IS NOT DISCHARGED BY THE MOVE and is still asserted, because the bug was WIDTH
 * and a wider home is a claim that has to be measured rather than assumed: the counts are
 * whole, unclipped, at BOTH widths the owner judges by — the panel's default, and the
 * narrower one with the Inspector open. `B-213`'s rule travels with them: two numbers that
 * mean two things, never folded into one, with the words back beside them now that there is
 * room. What the real browser adds is LAYOUT — jsdom would pass this against any box
 * (golden rule 12c).
 */

const WIDE = { width: 1280, height: 800 };

/** True when nothing inside `el` is cut off by its own box. */
async function overflows(el: Locator): Promise<boolean> {
  return el.evaluate((node) => node.scrollWidth > node.clientWidth + 1);
}

test('B-224 — the state head and the longest real name are whole at the default width and with the Inspector open', async ({
  app,
}) => {
  await app.page.setViewportSize(WIDE);
  const header = app.layers.getByRole('row').first();
  const stateHead = header
    .locator('span')
    .filter({ hasText: /^State/ })
    .first();
  const subbar = app.layers.locator('[data-layers-subbar]');
  // 🔴 THE HEAD IS CLEAN. Asserted first, so a tally that came back would fail here rather
  // than quietly satisfy the counts below from the wrong element.
  await expect(header.locator('[data-air-tally]')).toHaveCount(0);
  await expect(stateHead).toHaveText('State');
  // The longest real row NAME, seeded on layer 73.
  const name = app.layerRow(73).locator('[data-row-body]').first();
  await expect(name).toContainText('میانبرنامه روی انتن');

  // Put one more count on the head: layer 70 is the seed's loaded graphic. The seed already
  // has rows on air from "another console", so the assertion is RELATIVE — the same reading
  // `audit-legibility.spec.ts` takes — and the number is the whole visible text.
  const air = subbar.locator('[data-air-tally]');
  const before = Number((await air.getAttribute('data-air-tally')) ?? '0');
  await app.layerRow(70).getByRole('button', { name: 'PLAY' }).click();
  await expect(air).toHaveAttribute('data-air-tally', String(before + 1));
  // ⭐ THE WORDS ARE BACK. `B-224` cut them because 160 px would not fit in a 132 px cell;
  // the sub-bar is a full-width line, so the count reads as a sentence again instead of
  // needing a tooltip to say what the number counts.
  await expect(air).toHaveText(`${String(before + 1)} on air`);
  await expect(air).toHaveAttribute('aria-label', `${String(before + 1)} items on air`);

  // Default width: Inspector closed.
  await expect(app.inspector).toHaveCount(0);
  expect(await overflows(air), 'air count clipped at the default width').toBe(false);
  expect(await overflows(name), 'longest real name clipped at the default width').toBe(false);

  // The narrower case: the Inspector open beside the list. Selecting the BOUND row (70)
  // opens it — the Inspector is derived from a selected item, and layer 73 carries none.
  await app.selectLayerRow(70);
  await expect(app.inspector).toBeVisible();
  expect(await overflows(air), 'air count clipped with the Inspector open').toBe(false);
  expect(await overflows(name), 'longest real name clipped with the Inspector open').toBe(false);
  // …and the HEAD still says nothing about air, at the narrow width too.
  await expect(stateHead).toHaveText('State');
  await expect(header).not.toContainText('on air');
});
