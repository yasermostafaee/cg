import type { Locator, Page } from '@playwright/test';
import { buildListFieldVcg, expect, test } from './fixtures/runtime.js';

/**
 * `RUNTIME-REDESIGN-01` PHASE 5 — THE INSPECTOR'S GEOMETRY, MEASURED IN A REAL ENGINE.
 *
 * Every claim here is a box, an edge, an overflow or a computed style under focus, and jsdom
 * has no layout (golden rule 12c, `B-242`): a dom spec asserting any of it compares zeros and
 * cannot fail. So the four geometry claims of `PROMPT.md` §5 live here:
 *
 *   - the Update button stays PINNED at the foot of the panel, at MORE THAN ONE panel height
 *     and with content both shorter and longer than the panel;
 *   - X and Y ALIGN — same top, same height, same width, the button on their baseline;
 *   - an input's focus is ONE ring, not two;
 *   - subtitle items reorder by their GRIP HANDLE — by pointer, not only by the keyboard
 *     path `stage-inspector-edits.spec.ts` already drives.
 *
 * Plus the reference's rendered numbers the phase adopted, read back from the token home so
 * the spec cannot drift from the value it guards (`layer-table-geometry.spec.ts`'s pattern).
 */

const WIDE = { width: 1280, height: 800 };

async function tokenPx(page: Page, name: string): Promise<number> {
  const raw = await page.evaluate(
    (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
    name,
  );
  const px = Number.parseFloat(raw);
  expect(Number.isFinite(px), `${name} resolves to a length (${raw})`).toBe(true);
  return px;
}

async function box(loc: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const b = await loc.boundingBox();
  expect(b).not.toBeNull();
  return b!;
}

/** The Update button's bottom edge sits on the panel's bottom edge — within a border. */
async function expectFootPinned(app: { inspector: Locator }, label: string): Promise<void> {
  const panel = await box(app.inspector);
  const foot = await box(app.inspector.locator('.cg-inspector-actions'));
  const update = await box(app.inspector.getByRole('button', { name: 'Apply staged edits' }));
  const panelBottom = panel.y + panel.height;
  expect(
    Math.abs(foot.y + foot.height - panelBottom),
    `${label}: the foot's bottom edge is the panel's (foot ${String(foot.y + foot.height)}, panel ${String(panelBottom)})`,
  ).toBeLessThanOrEqual(2);
  expect(update.y, `${label}: Update is inside the foot`).toBeGreaterThanOrEqual(foot.y);
  expect(update.y + update.height, `${label}: Update is inside the foot`).toBeLessThanOrEqual(
    foot.y + foot.height + 1,
  );
  // …and inside the viewport, which is the operator's actual question.
  await expect(app.inspector.getByRole('button', { name: 'Apply staged edits' })).toBeInViewport();
}

test('the Update button stays pinned at the foot of the panel at every panel height, short content and long', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize(WIDE);
  const templateId = 'tpl-geom-foot';
  await app.importVcg('foot.vcg', await buildListFieldVcg(templateId));
  await app.selectStackRow(templateId);
  await expect(app.inspector).toBeVisible();

  // SHORT content first: at 800 the field list fits, and the foot must still be at the
  // bottom of the panel rather than trailing the last field.
  await expectFootPinned(app, 'short at 800');

  // LONG content: add items until the body genuinely overflows, so the sticky half of the
  // rule is what holds the foot in place. Staged drafts only — nothing is applied.
  const add = app.inspector.getByRole('button', { name: 'Add _tickerTexts item' });
  for (let i = 0; i < 8; i++) await add.click();
  const body = app.inspector.locator('.cg-inspector-body');
  await expect
    .poll(() => body.evaluate((el) => el.scrollHeight - el.clientHeight))
    .toBeGreaterThan(100);

  // "At every panel height" is not proved by one height. Three, from the reference's
  // 800 down to a cramped 480, with the list scrolled to the top and to the bottom each time.
  for (const height of [800, 620, 480]) {
    await page.setViewportSize({ width: WIDE.width, height });
    await expect
      .poll(async () => (await app.inspector.boundingBox())?.height ?? 0)
      .toBeLessThan(height);
    await body.evaluate((el) => {
      el.scrollTop = 0;
    });
    await expectFootPinned(app, `long at ${String(height)}, scrolled to top`);
    await body.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expectFootPinned(app, `long at ${String(height)}, scrolled to bottom`);
  }
});

test('X and Y align: same top, same height, same width, and Apply position on their baseline', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize(WIDE);
  const templateId = 'tpl-geom-xy';
  await app.importVcg('xy.vcg', await buildListFieldVcg(templateId));
  await app.selectStackRow(templateId);

  const x = await box(app.inspector.getByLabel('Position offset X'));
  const y = await box(app.inspector.getByLabel('Position offset Y'));
  const apply = await box(app.inspector.getByRole('button', { name: 'Apply position' }));
  expect(Math.abs(x.y - y.y), 'same top').toBeLessThanOrEqual(1);
  expect(Math.abs(x.height - y.height), 'same height').toBeLessThanOrEqual(1);
  expect(Math.abs(x.width - y.width), 'same width').toBeLessThanOrEqual(1);
  expect(x.x + x.width, 'X sits before Y').toBeLessThanOrEqual(y.x);
  // The button commits what the two boxes hold, so it sits on THEIR baseline.
  expect(
    Math.abs(apply.y + apply.height - (x.y + x.height)),
    'Apply on the baseline',
  ).toBeLessThanOrEqual(1);
  // The reference's 32 px position boxes, from the token home.
  const h = await tokenPx(page, '--r-insp-position-field-h');
  expect(Math.round(x.height)).toBe(h);
  expect(Math.round(apply.height)).toBe(h);

  // …and they FILL the row between the grid and the button: at a wider panel they grow,
  // and stay equal, rather than sitting at a fixed width.
  await app.inspector.getByRole('button', { name: 'Show INSPECTOR fullscreen' }).click();
  await expect
    .poll(async () => (await app.inspector.boundingBox())?.width ?? 0)
    .toBeGreaterThan(900);
  const xWide = await box(app.inspector.getByLabel('Position offset X'));
  const yWide = await box(app.inspector.getByLabel('Position offset Y'));
  expect(xWide.width).toBeGreaterThan(x.width);
  expect(Math.abs(xWide.width - yWide.width)).toBeLessThanOrEqual(1);
});

/**
 * ONE RING. Read as the browser resolves it once the 120 ms transition has settled — the
 * first reading of this spec landed mid-transition on a 0.2 px shadow.
 */
async function focusRing(
  loc: Locator,
): Promise<{ outline: string; shadows: number; ancestors: number }> {
  await loc.focus();
  await expect
    .poll(() => loc.evaluate((el) => getComputedStyle(el).boxShadow), { timeout: 2000 })
    .not.toMatch(/^rgba\(0, 0, 0, 0\)|^none$|0\.\d+px\)?$/);
  return loc.evaluate((el) => {
    const c = getComputedStyle(el);
    // Count the shadows (rgb(…) …, rgb(…) …) — one ring is one shadow.
    const shadows = c.boxShadow === 'none' ? 0 : c.boxShadow.split(/\),\s*(?=rgb)/).length;
    let ancestors = 0;
    for (let p = el.parentElement; p !== null; p = p.parentElement) {
      const pc = getComputedStyle(p);
      if (pc.outlineStyle !== 'none' || pc.boxShadow !== 'none') ancestors++;
      if (p.getAttribute('role') === 'complementary') break;
    }
    return { outline: c.outlineStyle, shadows, ancestors };
  });
}

test('an input’s focus is one ring, not two — on a position box and on a text field', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize(WIDE);
  const templateId = 'tpl-geom-ring';
  await app.importVcg('ring.vcg', await buildListFieldVcg(templateId));
  await app.selectStackRow(templateId);

  for (const [label, loc] of [
    ['position X', app.inspector.getByLabel('Position offset X')],
    ['text field', app.inspector.getByRole('textbox', { name: 'anchor' })],
    ['list item', app.inspector.getByRole('textbox', { name: '_tickerTexts item 1' })],
  ] as const) {
    const ring = await focusRing(loc);
    // The ring is the box-shadow; the browser's own outline is off, so there is no second one.
    expect(ring.outline, `${label}: no outline beside the shadow`).toBe('none');
    expect(ring.shadows, `${label}: exactly one shadow`).toBe(1);
    // …and nothing between the input and the panel draws a ring of its own (no
    // `:focus-within` halo on the row, the section or the body).
    expect(ring.ancestors, `${label}: no ancestor ring`).toBe(0);
  }
});

test('subtitle items reorder by their grip handle — a pointer drag, not only the keyboard', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize(WIDE);
  const templateId = 'tpl-geom-grip';
  await app.importVcg('grip.vcg', await buildListFieldVcg(templateId));
  await app.selectStackRow(templateId);

  const item1 = app.inspector.getByRole('textbox', { name: '_tickerTexts item 1' });
  const item2 = app.inspector.getByRole('textbox', { name: '_tickerTexts item 2' });
  await expect(item1).toHaveValue('سلام دنیا');
  await expect(item2).toHaveValue('اخبار فوری');

  // Drag item 2's HANDLE onto the upper half of item 1's row: the handle arms the row for
  // dragging on pointer-down, so the drag starts from the grip and nowhere else. `dragTo`
  // drives Chromium's real HTML5 drag — dragstart on the row, dragenter/dragover/drop on the
  // target, dragend — which is the sequence the editor's handlers are written against (a
  // hand-rolled mouse path was measured to deliver none of it).
  const handle2 = app.inspector.getByRole('button', { name: 'Reorder _tickerTexts item 2' });
  const target = app.inspector.locator('.cg-list-item').first();
  await handle2.dragTo(target, { targetPosition: { x: 30, y: 4 } });

  await expect(app.inspector.getByRole('textbox', { name: '_tickerTexts item 1' })).toHaveValue(
    'اخبار فوری',
  );
  await expect(app.inspector.getByRole('textbox', { name: '_tickerTexts item 2' })).toHaveValue(
    'سلام دنیا',
  );
  // A reorder is a staged edit like any other — nothing reached air.
  await expect(app.inspector.getByText('● draft')).toBeVisible();
});

/**
 * The reference's rendered numbers the phase ADOPTED, read back from the token home — so
 * a later "tidy" of a value fails here rather than in the owner's eye (`design.md` §12.3).
 */
test('the Inspector paints the reference’s rendered geometry from the token home', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize(WIDE);
  const templateId = 'tpl-geom-tokens';
  await app.importVcg('tokens.vcg', await buildListFieldVcg(templateId));
  await app.selectStackRow(templateId);

  // The column: the reference's 396 px, as the shipped default.
  const panel = await box(app.inspector);
  expect(Math.round(panel.width)).toBe(396);

  // A text field: 31 px tall at 13 px.
  const field = app.inspector.getByRole('textbox', { name: 'anchor' });
  expect(Math.round((await box(field)).height)).toBe(await tokenPx(page, '--r-insp-field-h'));
  expect(await field.evaluate((el) => getComputedStyle(el).fontSize)).toBe(
    `${String(await tokenPx(page, '--r-insp-field-text'))}px`,
  );

  // A section heading: 12 px, semibold, in the second ink.
  const heading = app.inspector.locator('.cg-inspector-section > h2').first();
  const headingStyle = await heading.evaluate((el) => {
    const c = getComputedStyle(el);
    return { fontSize: c.fontSize, fontWeight: c.fontWeight, color: c.color };
  });
  expect(headingStyle.fontSize).toBe(`${String(await tokenPx(page, '--r-insp-section-text'))}px`);
  expect(headingStyle.fontWeight).toBe('600');
  const secondary = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--r-text-secondary').trim(),
  );
  const secondaryRgb = await page.evaluate((hex) => {
    const el = document.createElement('span');
    el.style.color = hex;
    document.body.appendChild(el);
    const c = getComputedStyle(el).color;
    el.remove();
    return c;
  }, secondary);
  expect(headingStyle.color).toBe(secondaryRgb);

  // The foot: padded `9px 12px`, two 32 px buttons on a 104 px floor, and the hint under them.
  const foot = app.inspector.locator('.cg-inspector-actions');
  expect(await foot.evaluate((el) => getComputedStyle(el).padding)).toBe('9px 12px');
  for (const name of ['Apply staged edits', 'Discard staged edits']) {
    const b = await box(app.inspector.getByRole('button', { name }));
    expect(Math.round(b.height), name).toBe(32);
    expect(b.width, name).toBeGreaterThanOrEqual(await tokenPx(page, '--r-insp-foot-btn-min-w'));
  }
  await expect(foot.getByText('Saves this row’s configuration. No Take is sent.')).toBeVisible();
  // Discard leads, Update trails — the reference's order.
  const discard = await box(app.inspector.getByRole('button', { name: 'Discard staged edits' }));
  const update = await box(app.inspector.getByRole('button', { name: 'Apply staged edits' }));
  expect(discard.x + discard.width).toBeLessThanOrEqual(update.x);
});
