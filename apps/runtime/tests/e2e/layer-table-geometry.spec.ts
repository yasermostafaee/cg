import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/runtime.js';

/**
 * 🔴 `RUNTIME-REDESIGN-01` §3 — **THE LAYERS TABLE, MEASURED IN A REAL ENGINE.**
 *
 * ── WHY THIS IS A BROWSER SPEC ────────────────────────────────────────────────
 *
 * jsdom has no layout: `getBoundingClientRect()` is all zeros there, so a dom spec asserting
 * a row's height, a verb's box or a band's padding compares zeros and cannot fail (golden
 * rule 12c, `B-242`). Every number below is read from Chromium, and every expectation is
 * read from the TOKEN HOME — the row is asserted to be exactly what `--r-row-pad`,
 * `--r-row-icon-btn-w/-h` and `--r-bed-divider-h` declare, never what a literal here
 * happens to say. A literal would go red at the next palette tune while saying nothing
 * about the property; a token read says "the surface and its home agree".
 *
 * ── WHAT THE REFERENCE DRAWS, so the assertions are not circular ──────────────
 *
 * The same properties were measured on `docs/ui-reference/runtime-redesign/
 * 04-playout-layers.html` in Chromium (`design.md` §10): 67 px rows with `15px 12px`
 * cells, six `48 × 36` verbs in a 12 px grid, a 25 px Graphics-beds band, the header's
 * muted labels, hover on a loaded row and none on an empty one, and a selected row that
 * carries a 2 px accent frame. The token home holds those numbers; this spec proves the
 * app renders them.
 */

const round = (n: number): number => Math.round(n);
const px = (s: string): number => Number.parseFloat(s);

/** WCAG 2.x contrast, the same arithmetic `emptiedAirRowContrast.dom.test.ts` uses. */
function contrast(a: string, b: string): number {
  const parse = (c: string): [number, number, number] => {
    const hex = /^#([0-9a-f]{6})$/i.exec(c.trim());
    if (hex !== null) {
      const h = hex[1] ?? '';
      return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as [
        number,
        number,
        number,
      ];
    }
    const m = /^rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/i.exec(c.trim());
    if (m === null) throw new Error(`not a colour: ${c}`);
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  };
  const lum = ([r, g, b]: [number, number, number]): number => {
    const f = (v: number): number => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const [hi, lo] = [lum(parse(a)), lum(parse(b))].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

test('§3 — a row, its cells and its six verbs are exactly what the token home declares', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 1000 });

  const tokens = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const read = (n: string): string => cs.getPropertyValue(n).trim();
    return {
      rowPad: read('--r-row-pad'),
      verbW: read('--r-row-icon-btn-w'),
      verbH: read('--r-row-icon-btn-h'),
      verbGap: read('--r-row-verb-gap'),
      verbGlyph: read('--r-row-verb-glyph'),
      bedH: read('--r-bed-divider-h'),
      headBg: read('--r-table-head-bg'),
      muted: read('--r-text-muted'),
      rowBg: read('--r-row-bg'),
      emptyBg: read('--r-row-empty-bg'),
      raised: read('--r-surface-raised'),
      rowHover: read('--r-row-hover-bg'),
      selectedFill: read('--r-row-selected-fill'),
      accent: read('--r-accent'),
    };
  });
  // Non-empty FIRST, then identity: a token that does not exist reads '' and would make
  // every equality below `expect('').toBe('')` (`PROMPT.md` §11).
  for (const [name, value] of Object.entries(tokens)) {
    expect(value, `${name} is declared`).not.toBe('');
  }
  const [padY, padX] = tokens.rowPad.split(/\s+/).map(px) as [number, number];

  // A LOADED row (layer 70 is the seed's loaded graphic) and an EMPTY one (74).
  const loaded = app.layerRow(70);
  const empty = app.layerRow(74);
  await loaded.scrollIntoViewIfNeeded();

  const row = await loaded.evaluate((el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const verbs = [...el.querySelectorAll<HTMLElement>('[data-verb-block] button')].map((b) => {
      const br = b.getBoundingClientRect();
      const svg = b.querySelector('svg')?.getBoundingClientRect();
      return { w: br.width, h: br.height, glyph: svg?.width ?? 0 };
    });
    const block = el.querySelector('[data-verb-block]');
    return {
      h: r.height,
      padding: cs.padding,
      background: cs.backgroundColor,
      borderBottom: px(cs.borderBottomWidth),
      verbs,
      blockGrid: block === null ? '' : getComputedStyle(block).gridTemplateColumns,
      blockGap: block === null ? '' : getComputedStyle(block).columnGap,
    };
    function px(s: string): number {
      return Number.parseFloat(s);
    }
  });

  // THE CELL PADDING — the token, verbatim.
  expect(row.padding, 'row padding reads --r-row-pad').toBe(tokens.rowPad);
  // THE ROW HEIGHT — padding above, the verb, padding below, and the rule under it. This
  // is the number the reference paints (67), reached from the tokens rather than pinned.
  expect(round(row.h), 'row height = padY + verb + padY + rule').toBe(
    round(padY + px(tokens.verbH) + padY + row.borderBottom),
  );
  // THE SIX VERB BOXES — every one the declared box, in a grid of six declared columns.
  expect(row.verbs.length, 'six verbs on the row').toBe(6);
  for (const [i, v] of row.verbs.entries()) {
    expect(round(v.w), `verb ${String(i)} width`).toBe(px(tokens.verbW));
    expect(round(v.h), `verb ${String(i)} height`).toBe(px(tokens.verbH));
    expect(round(v.glyph), `verb ${String(i)} glyph`).toBe(px(tokens.verbGlyph));
  }
  expect(row.blockGrid).toBe(Array.from({ length: 6 }, () => tokens.verbW).join(' '));
  expect(row.blockGap).toBe(tokens.verbGap);
  // THE HEADER SHARES THE ROW'S HORIZONTAL PADDING, so the `#` column has one left edge
  // in the header and in every row — the header used to spell its own `12`.
  const headPadLeft = await app.layers
    .getByRole('row')
    .first()
    .evaluate((el) => Number.parseFloat(getComputedStyle(el).paddingLeft));
  expect(headPadLeft, 'header left padding = the row padding token').toBe(padX);
  // GROUNDS — a loaded row on its own ground, an empty row sunk below it.
  expect(row.background).toBe(await cssColour(page, tokens.rowBg));
  expect(await empty.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
    await cssColour(page, tokens.emptyBg),
  );
  // POSITIVE CONTROL — a real box, not a page that never laid out.
  expect(row.h).toBeGreaterThan(40);
  expect(padY).toBeGreaterThan(0);
});

test('§3 — hover lifts a loaded row and leaves an empty one alone; selection is a fill and a frame', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 1000 });
  const t = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const read = (n: string): string => cs.getPropertyValue(n).trim();
    return {
      raised: read('--r-surface-raised'),
      rowHover: read('--r-row-hover-bg'),
      emptyBg: read('--r-row-empty-bg'),
      selectedFill: read('--r-row-selected-fill'),
      accent: read('--r-accent'),
    };
  });
  for (const [name, value] of Object.entries(t)) expect(value, `${name} is declared`).not.toBe('');

  const bg = (layer: number): Promise<string> =>
    app.layerRow(layer).evaluate((el) => getComputedStyle(el).backgroundColor);
  // `.cg-row` transitions `background`, so read the SETTLED colour (the reason
  // `rehearse-layout.spec.ts` polls too).
  const expectBg = (layer: number, rgb: string): Promise<void> =>
    expect.poll(() => bg(layer), { message: `layer ${String(layer)} background` }).toBe(rgb);

  /*
    HOVER — the loaded row LIFTS.

    ⚠ `REPAIR-03` A2 — it used to read `--r-surface-raised`, which measured **1.02:1** against
    the row and was DARKER than it: an invisible hover on the one table whose whole interaction
    is clicking a row. The reference is no better at 1.04:1, so there was nothing to adopt and
    the row now has its own `--r-row-hover-bg` at 1.20:1. The RATIO is asserted in
    `layer-row-hover.spec.ts`; what this line pins is that the row reads the token it is
    supposed to read.
  */
  await app.layerRow(70).locator('[data-row-body]').hover();
  await expectBg(70, await cssColour(page, t.rowHover));
  // …and the EMPTY row does not react: it has nothing to select and must not invite it.
  await app.layerRow(74).locator('[data-row-body]').hover();
  await expectBg(74, await cssColour(page, t.emptyBg));
  await page.mouse.move(0, 0);

  // SELECTED — the accent wash and a 2 px inset frame in the accent, with the pointer
  // parked away so this is the RESTING look of a selected row.
  await app.selectLayerRow(70);
  await expect(app.inspector).toBeVisible();
  await page.mouse.move(0, 0);
  await expectBg(70, await cssColour(page, t.selectedFill));
  const shadow = await app.layerRow(70).evaluate((el) => getComputedStyle(el).boxShadow);
  expect(shadow).toContain('inset');
  expect(shadow).toContain(await cssColour(page, t.accent));
  expect(shadow).toMatch(/\b2px\b/);
});

test('§3 — the header sits on its own ground, its labels clear AA, and the beds band is the declared height', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 1000 });
  const header = app.layers.getByRole('row').first();
  const head = await header.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, ink: cs.color, h: el.getBoundingClientRect().height };
  });
  const rowBg = await app.layers
    .locator('[data-layer][data-template-id]')
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  const rowRulePainted = await app.layers
    .locator('[data-layer][data-template-id]')
    .first()
    .evaluate((el) => getComputedStyle(el).borderBottomColor);
  const t = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const read = (n: string): string => cs.getPropertyValue(n).trim();
    return {
      headBg: read('--r-layer-head-bg'),
      headInk: read('--r-layer-head-ink'),
      rowRule: read('--r-row-rule'),
      onAir: read('--r-onair'),
      errorText: read('--r-error-text'),
      errorMark: read('--r-error-mark'),
      bedH: read('--r-bed-divider-h'),
    };
  });
  for (const [name, value] of Object.entries(t)) expect(value, `${name} is declared`).not.toBe('');

  expect(head.bg).toBe(await cssColour(page, t.headBg));
  expect(head.ink).toBe(await cssColour(page, t.headInk));
  /*
    🔴 `AUDIT-CLOSE-01` C2 — THE REFERENCE'S OWN PAIR, AND EVERY INK ON IT.

    Phase 3 answered A6 by moving the GROUND to `--soft` and leaving `--r-text-muted` alone,
    which cleared the 4.5 floor at 4.89:1. C2 took the reference's rendered PAIR instead —
    ground `rgb(45, 55, 69)` and its own ink `rgb(156, 163, 175)` — because the prototype
    declares this console's `--soft` and `--muted` and then paints its table with neither.
    A6's constraint is honoured the way A6 meant it: `--r-text-muted` did not move, the layer
    header simply stopped borrowing it.

    So the floor is re-asserted on the pair that is actually painted, and — this is the part
    the old spec did not do — on EVERY OTHER INK the header puts on that ground. The tally's
    two numbers and its warning glyph are painted here too, and a ground change moves all of
    them at once. Their tokens are read from `:root` rather than from a rendered tally,
    because whether a tally is showing is a property of the seeded bank and not of the palette.
  */
  expect(contrast(head.ink, head.bg), 'header labels on the header ground').toBeGreaterThanOrEqual(
    4.5,
  );
  expect(
    contrast(t.onAir, t.headBg),
    'the on-air tally on the header ground',
  ).toBeGreaterThanOrEqual(4.5);
  expect(
    contrast(t.errorText, t.headBg),
    'the refused-count number on the header ground',
  ).toBeGreaterThanOrEqual(4.5);
  // The tally's triangle is a GRAPHIC and answers to the 3.0 floor (Phase 2A's split).
  expect(
    contrast(t.errorMark, t.headBg),
    'the refused-count mark on the header ground',
  ).toBeGreaterThanOrEqual(3);

  /*
    THE LID. The sticky band exists to read as a lid ON the list rather than as another row of
    it, which is a claim about the header against the ROW — not against the page. It survived
    Phase 3 "narrowed" at 1.13:1; on the reference's own ground it is back over 1.2. Measured
    from what the two elements actually painted, so a row whose ground moved would be caught.
  */
  expect(contrast(head.bg, rowBg), 'the header reads as a lid over a loaded row').toBeGreaterThan(
    1.2,
  );

  // …and the rule between rows is the token, not the panel border it used to borrow.
  expect(rowRulePainted).toBe(await cssColour(page, t.rowRule));
  expect(head.h, 'the header laid out').toBeGreaterThan(10);

  // THE SIX WORDS, in the order the buttons emit — the channel that retires the
  // STOP/CLEAR misread — and no seventh.
  const heads = await app.layers.locator('[data-verb-head]').allTextContents();
  expect(heads.map((h) => h.toUpperCase())).toEqual([
    'ITEM',
    'PLAY',
    'ON PVW',
    'NEXT',
    'STOP',
    'CLEAR',
  ]);

  // THE GRAPHICS-BEDS BAND — drawn once, the declared height, and ruled off above.
  const band = app.layers.locator('[data-bed-group-head]');
  await expect(band).toHaveCount(1);
  await band.scrollIntoViewIfNeeded();
  const bandBox = await band.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { h: el.getBoundingClientRect().height, top: cs.borderTopWidth };
  });
  expect(round(bandBox.h)).toBe(px(t.bedH));
  expect(px(bandBox.top)).toBeGreaterThanOrEqual(1);
});

test('§3 — the top bar’s STOP ALL and CLEAR ALL hover to their own verb colours; REMOVE ALL does not light while refused', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 1000 });
  const t = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const read = (n: string): string => cs.getPropertyValue(n).trim();
    return {
      stop: read('--r-verb-stop'),
      clear: read('--r-verb-clear'),
      remove: read('--r-verb-remove'),
    };
  });
  for (const [name, value] of Object.entries(t)) expect(value, `${name} is declared`).not.toBe('');
  const bar = (name: string) => app.layers.getByRole('button', { name, exact: true });
  const bg = (name: string): Promise<string> =>
    bar(name).evaluate((el) => getComputedStyle(el).backgroundColor);
  const expectBg = (name: string, rgb: string): Promise<void> =>
    expect.poll(() => bg(name), { message: `${name} background` }).toBe(rgb);

  // The seed has rows on air from "another console", so both are enabled.
  await bar('Stop all on-air items').hover();
  await expectBg('Stop all on-air items', await cssColour(page, t.stop));
  await bar('Clear all rows holding a layer').hover();
  await expectBg('Clear all rows holding a layer', await cssColour(page, t.clear));

  // REMOVE ALL is WITHHELD while anything is on air (`R-017`), and a refused control must
  // not advertise itself under the pointer: its colour is not the remove red.
  const remove = bar('Remove all items');
  await expect(remove).toBeDisabled();
  await remove.hover({ force: true });
  expect(await bg('Remove all items')).not.toBe(await cssColour(page, t.remove));
  await page.mouse.move(0, 0);
});

/**
 * Resolve a token's declared value (`#1b2532`, `rgb(30 38 51)`, `rgba(…)`) to the exact
 * string `getComputedStyle(...).backgroundColor` reports, by letting the browser do the
 * normalising. Comparing strings this way keeps the assertion on IDENTITY with the token
 * rather than on a parser here agreeing with Chromium's.
 */
async function cssColour(page: Page, declared: string): Promise<string> {
  return page.evaluate((value) => {
    const probe = document.createElement('div');
    probe.style.backgroundColor = value;
    document.body.appendChild(probe);
    const out = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return out;
  }, declared);
}
