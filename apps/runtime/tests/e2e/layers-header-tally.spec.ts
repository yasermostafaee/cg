import type { Locator } from '@playwright/test';
import { expect, test } from './fixtures/runtime.js';

/**
 * `B-224` — the Layers header's STATE tally shows every count whole, and the NAME column
 * fits the longest real row name, at BOTH widths the owner judges by: the panel's default
 * width, and the narrower one with the Inspector open.
 *
 * The 1-on-air / 2-in-error case is pinned in `layerTableHeader.dom.test.ts` (the mock
 * cannot refuse a take on demand); what the real browser adds here is LAYOUT: the state
 * head is not clipped once a count is on it, and the seeded Persian alias renders on one
 * line without an ellipsis, measured with `scrollWidth` against `clientWidth`.
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
  // The longest real row NAME, seeded on layer 73.
  const name = app.layerRow(73).locator('[data-row-body]').first();
  await expect(name).toContainText('میانبرنامه روی انتن');

  // Put one more count on the head: layer 70 is the seed's loaded graphic. The seed already
  // has rows on air from "another console", so the assertion is RELATIVE — the same reading
  // `audit-legibility.spec.ts` takes — and the number is the whole visible text.
  const air = header.locator('[data-air-tally]');
  const before = Number((await air.getAttribute('data-air-tally')) ?? '0');
  await app.layerRow(70).getByRole('button', { name: 'PLAY' }).click();
  await expect(air).toHaveAttribute('data-air-tally', String(before + 1));
  await expect(air).toHaveText(String(before + 1));

  // Default width: Inspector closed.
  await expect(app.inspector).toHaveCount(0);
  expect(await overflows(stateHead), 'state head clipped at the default width').toBe(false);
  expect(await overflows(name), 'longest real name clipped at the default width').toBe(false);

  // The narrower case: the Inspector open beside the list. Selecting the BOUND row (70)
  // opens it — the Inspector is derived from a selected item, and layer 73 carries none.
  await app.selectLayerRow(70);
  await expect(app.inspector).toBeVisible();
  expect(await overflows(stateHead), 'state head clipped with the Inspector open').toBe(false);
  expect(await overflows(name), 'longest real name clipped with the Inspector open').toBe(false);
  // …and the number is the whole visible text: no words on the head.
  await expect(stateHead).not.toContainText('on air');
});
