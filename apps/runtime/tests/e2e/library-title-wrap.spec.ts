import { test, expect } from './fixtures/runtime.js';

/**
 * B-083 — a Library name wraps at WORD level, never one letter per line.
 *
 * The regression (from #306, which added the second `Remove` button): the row was a
 * `1fr auto` grid whose `auto` track held two `white-space: nowrap` buttons. They measured
 * 134.75px of a 214px row, leaving the name 53.25px — and `overflow-wrap: anywhere` let the
 * name collapse to a ONE-CHARACTER min-content, so it rendered "پ / ن / ل" stacked, 3–5
 * lines tall.
 *
 * It shipped because nothing asserted GEOMETRY. Every existing library spec checks text and
 * visibility, and a one-letter-per-line title is still perfectly "visible" with the right
 * text content — so this is deliberately a measuring test, not a text one: the width the name
 * box actually gets, and the number of lines it actually occupies.
 *
 * The runtime E2E harness boots with the bridge pinned at a dead port, so every assertion
 * here is made in the DISCONNECTED state — the one with the connection banner on screen,
 * which was suspected of squeezing the panel. (It cannot: the banner is a sibling ROW above
 * the shell's column, so it can only consume height. This pins that it stays that way.)
 */

/** A seeded starter whose Persian/Latin name is long enough to have wrapped per-character. */
const LONG_NAME = 'زیرنویس معرفی — Guest Title';

test('library names wrap at word level and are never squeezed to one letter per line', async ({
  app,
}) => {
  const page = app.page;

  // The banner IS up — this is the disconnected state, the one the bug was reported in.
  await expect(page.getByRole('alert').first()).toBeVisible();

  const name = app.library.getByText(LONG_NAME);
  await expect(name).toBeVisible();

  const box = await name.evaluate((el) => {
    const cs = getComputedStyle(el);
    const lineHeight = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
    const rect = el.getBoundingClientRect();
    return {
      width: rect.width,
      lines: Math.round(rect.height / lineHeight),
      overflowWrap: cs.overflowWrap,
    };
  });

  // The name box gets real width — not the ~53px scrap left over beside two rigid buttons.
  // 120px is a floor with headroom, well under the ~196px the stacked row actually gives it
  // and far above anything that could wrap per-character.
  expect(box.width).toBeGreaterThan(120);

  // The load-bearing assertion: a ~27-character name occupying 3–5 lines IS the bug. At full
  // row width this name fits on one line; the bound tolerates a legitimate word-level wrap
  // to a second line (a longer name, a different font) while still failing the regression,
  // which needed one line PER CHARACTER.
  expect(box.lines).toBeLessThanOrEqual(2);

  // `anywhere` is what let min-content fall to a single glyph. It must not come back.
  expect(box.overflowWrap).not.toBe('anywhere');
});

test('every library name stays within two lines — including the longest seeded starter', async ({
  app,
}) => {
  const page = app.page;

  const worst = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[data-testid^="library-template-"]'));
    let maxLines = 0;
    let minWidth = Number.POSITIVE_INFINITY;
    let text = '';
    for (const row of rows) {
      const el = row.querySelector('span');
      if (el === null) continue;
      const cs = getComputedStyle(el);
      const lineHeight = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
      const rect = el.getBoundingClientRect();
      const lines = Math.round(rect.height / lineHeight);
      if (lines > maxLines) {
        maxLines = lines;
        text = el.textContent ?? '';
      }
      minWidth = Math.min(minWidth, rect.width);
    }
    return { rows: rows.length, maxLines, minWidth, text };
  });

  expect(worst.rows).toBeGreaterThan(0);
  expect(worst.minWidth).toBeGreaterThan(120);
  // Names the operator has to READ. Per-character stacking made the worst of these 5 lines.
  expect(worst.maxLines).toBeLessThanOrEqual(2);
});
