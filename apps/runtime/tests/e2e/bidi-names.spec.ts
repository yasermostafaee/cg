import { expect, test } from './fixtures/runtime.js';
import type { Locator } from '@playwright/test';

/**
 * 🔴 `MODAL-CHROME-10` ADDENDUM B — **A NAME'S CHARACTERS ARE ISOLATED; ITS BOX IS NOT.**
 *
 * The owner saw Persian template titles flushed hard RIGHT in the picker while English ones sat
 * left. The cause was not translation and not an RTL layout: `<bdi>`'s UA default is
 * `unicode-bidi: isolate` **plus `dir=auto`**, so a `<bdi>` holding a Persian name resolves its
 * OWN `direction` to `rtl`. Inline that is harmless and correct. Made a BLOCK — declared, or
 * blockified by a flex/grid parent — its direction reaches its ALIGNMENT and `text-align: start`
 * resolves to RIGHT.
 *
 * ⚠ **The isolation is load-bearing and was NOT removed.** This station's names are mixed
 * (`زیرنویس معرفی — Guest Title`), and without isolation they reorder wrongly — a silent
 * defect, which is worse than a visible one. The box moved to an LTR wrapper (`IsolatedName`);
 * the isolate stayed inline.
 *
 * ── WHAT THIS SPEC MEASURES, AND WHY IT NEEDS A BROWSER ─────────────────────
 *
 * Golden rule 12c: jsdom has no layout, so every box here is zeros there and no unit test could
 * have caught this or can guard it.
 *
 * §1 is the ALIGNMENT claim — a Persian row's title box and an English row's title box start at
 * the same left edge. §2 is the ORDER claim, which a box measurement cannot make: it walks the
 * TEXT NODE with a `Range` and compares where the Latin run and the Persian run actually land,
 * against what the bidi algorithm must do with an RTL-based line. A name that "looks tidier"
 * while having lost its isolation fails §2 and passes §1.
 */

/**
 * The x of a sub-range of one element's text, so character ORDER can be measured.
 *
 * ⚠ It takes a LOCATOR and not a selector string: the element is found by its text, and
 * Playwright's `:has-text()` is not a CSS selector — handing it to `querySelector` throws.
 */
async function runX(target: Locator, needle: string): Promise<{ left: number; right: number }> {
  return target.evaluate((host, want) => {
    const walk = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    while (walk.nextNode()) {
      const node = walk.currentNode;
      const at = (node.textContent ?? '').indexOf(want);
      if (at === -1) continue;
      const r = document.createRange();
      r.setStart(node, at);
      r.setEnd(node, at + want.length);
      const box = r.getBoundingClientRect();
      return { left: +box.left.toFixed(1), right: +box.right.toFixed(1) };
    }
    throw new Error(`the element does not contain ${want}`);
  }, needle);
}

test('§1 — a Persian title and an English title start at the same left edge', async ({ app }) => {
  const page = app.page;
  await page.setViewportSize({ width: 1400, height: 900 });
  await app.openTemplatePicker();

  const names = page.locator('.cg-tpl-name');
  await expect(names).not.toHaveCount(0);

  const edges = await names.evaluateAll((els) =>
    els.map((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const inner = el.firstElementChild;
      return {
        text: (el.textContent ?? '').trim().slice(0, 20),
        // The box's own resolved direction — this is what went wrong, and it must be LTR on
        // every row whatever alphabet the name is in.
        dir: cs.direction,
        boxLeft: +r.left.toFixed(1),
        // …and where the GLYPHS actually begin, which is the thing the owner saw move.
        inkLeft: inner === null ? null : +inner.getBoundingClientRect().left.toFixed(1),
        rtl: /[؀-ࣿ]/.test(el.textContent ?? ''),
      };
    }),
  );

  const persian = edges.filter((e) => e.rtl);
  const latin = edges.filter((e) => !e.rtl);
  expect(persian.length, 'the fixture has no Persian-titled template to measure').toBeGreaterThan(
    0,
  );
  expect(
    latin.length,
    'the fixture has no English-titled template to compare against',
  ).toBeGreaterThan(0);

  for (const row of edges) {
    expect(row.dir, `"${row.text}" resolved its BOX to RTL — the isolate is on the box again`).toBe(
      'ltr',
    );
  }
  const lefts = [...new Set(edges.map((e) => e.boxLeft))];
  expect(lefts, 'the title boxes do not share one left edge').toHaveLength(1);
  const inks = [...new Set(edges.map((e) => e.inkLeft))];
  expect(inks, 'Persian and English titles start their glyphs at different x').toHaveLength(1);

  await app.closeTemplatePicker();
});

test('§2 — a MIXED name still orders correctly: the isolation was kept, not traded away', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1400, height: 900 });
  await app.openTemplatePicker();

  /*
    `زیرنویس معرفی — Guest Title` — Persian first, so the isolate's `dir=auto` gives the NAME an
    RTL base direction. Under that base the Latin run must render to the LEFT of the Persian
    run. If the isolation were deleted, or the name forced to `direction: ltr` to "fix" the
    alignment, the two runs swap and this fails while §1 still passes.
  */
  const row = page.locator('.cg-tpl-name', { hasText: 'زیرنویس' });
  await expect(row).toHaveCount(1);
  const latin = await runX(row, 'Guest Title');
  const persian = await runX(row, 'زیرنویس');
  expect(
    latin.right,
    'the Latin run is no longer left of the Persian run — the name lost its RTL base, so the isolation is gone',
  ).toBeLessThanOrEqual(persian.left);

  // …and the mixture still sits inside ONE box that starts where every other title starts.
  const box = await row.boundingBox();
  const plain = await page.locator('.cg-tpl-name', { hasText: 'Debate' }).first().boundingBox();
  expect(box?.x, 'the mixed row does not share the list column').toBe(plain?.x);

  await app.closeTemplatePicker();
});
