import type { Locator, Page } from '@playwright/test';
import { buildListFieldVcg, expect, test } from './fixtures/runtime.js';

/**
 * `RUNTIME-REDESIGN-01` PHASE 5 — THE INSPECTOR'S GEOMETRY, MEASURED IN A REAL ENGINE.
 *
 * Every claim here is a box, an edge, an overflow or a computed style under focus, and jsdom
 * has no layout (golden rule 12c, `B-245`): a dom spec asserting any of it compares zeros and
 * cannot fail. So the four geometry claims of `PROMPT.md` §5 live here:
 *
 *   - the Update button stays PINNED at the foot of the panel, at MORE THAN ONE panel height
 *     and with content both shorter and longer than the panel;
 *   - X and Y keep their compact width and share a row when the Inspector has room;
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
async function expectFootPinned(inspector: Locator, label: string): Promise<void> {
  const panel = await box(inspector);
  const foot = await box(inspector.locator('[data-inspector-actions]'));
  const body = await box(inspector.locator('.cg-inspector-body'));
  const updateButton = inspector
    .locator('[data-inspector-actions]')
    .getByRole('button', { name: /^(Apply staged edits|اعمال تغییرات موقت)$/ });
  const update = await box(updateButton);
  const panelBottom = panel.y + panel.height;
  expect(
    body.y + body.height,
    `${label}: the scroll area ends before the footer`,
  ).toBeLessThanOrEqual(foot.y + 0.5);
  expect(
    Math.abs(foot.y + foot.height - panelBottom),
    `${label}: the foot's bottom edge is the panel's (foot ${String(foot.y + foot.height)}, panel ${String(panelBottom)})`,
  ).toBeLessThanOrEqual(2);
  expect(update.y, `${label}: Update is inside the foot`).toBeGreaterThanOrEqual(foot.y);
  expect(update.y + update.height, `${label}: Update is inside the foot`).toBeLessThanOrEqual(
    foot.y + foot.height + 1,
  );
  // …and inside the viewport, which is the operator's actual question.
  await expect(updateButton).toBeInViewport({ ratio: 1 });
}

test('R-008 — a compact Inspector keeps Ready state, staged placement and complex fields', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize(WIDE);
  const templateId = 'tpl-compact-inspector';
  const otherTemplateId = 'tpl-compact-other';
  await app.importVcg('compact.vcg', await buildListFieldVcg(templateId));
  await app.importVcg('other.vcg', await buildListFieldVcg(otherTemplateId));
  await app.selectStackRow(templateId);

  const inspector = app.inspector;
  const details = inspector.getByRole('button', { name: 'Layer details', exact: true });
  const position = inspector.getByRole('button', { name: 'Position', exact: true });
  const timing = inspector.getByRole('button', { name: 'Timing', exact: true });
  const x = inspector.getByLabel('Position offset X');
  const dirtyPosition = inspector.getByLabel('Position has unapplied changes');
  const title = inspector.getByRole('textbox', { name: 'anchor', exact: true });
  const item = inspector.getByRole('textbox', { name: '_tickerTexts item 1' });
  const readApplied = () =>
    page.evaluate(
      async (id) => (await window.cg.stack.snapshot()).find((row) => row.templateId === id),
      templateId,
    );
  const controlled = async (button: Locator) => {
    const id = await button.getAttribute('aria-controls');
    if (id === null) throw new Error('The disclosure does not name its controlled content');
    return inspector.locator(`[id=${JSON.stringify(id)}]`);
  };

  await expect(details).toHaveAttribute('aria-expanded', 'true');
  await expect(position).toHaveAttribute('aria-expanded', 'true');
  await expect(timing).toHaveAttribute('aria-expanded', 'true');
  expect((await box(timing)).y + (await box(timing)).height).toBeLessThan((await box(position)).y);
  const detailsContent = await controlled(details);
  const positionContent = await controlled(position);
  const heading = inspector.locator('[data-inspector-heading]');
  const template = inspector.locator('[data-inspector-template]');
  await expect(heading).toBeVisible();
  await expect(template).toContainText('compact');
  await expect(inspector.getByText('READY', { exact: true })).toBeVisible();
  const original = await readApplied();
  if (original === undefined) throw new Error('The selected row was not loaded');

  await details.press('Enter');
  await expect(details).toHaveAttribute('aria-expanded', 'false');
  await expect(detailsContent).toBeHidden();
  await expect(position).toHaveAttribute('aria-expanded', 'true');
  await expect(heading).toBeVisible();
  await expect(template).toBeVisible();
  await expect(inspector.getByText('READY', { exact: true })).toBeVisible();

  await inspector.getByRole('button', { name: 'Anchor top-left', exact: true }).click();
  await x.fill('42');
  await position.press('Space');
  await expect(position).toHaveAttribute('aria-expanded', 'false');
  await expect(positionContent).toBeHidden();
  await expect(x).toBeHidden();
  await expect(dirtyPosition).toBeVisible();
  await expect(inspector.getByText('top left · 42, 0', { exact: true })).toBeVisible();
  await expect(inspector.getByRole('button', { name: 'Discard staged edits' })).toBeEnabled();
  const timingContent = await controlled(timing);
  await timing.press('Space');
  await expect(timing).toHaveAttribute('aria-expanded', 'false');
  await expect(timingContent).toBeHidden();
  await expectFootPinned(inspector, 'sections collapsed');

  const label = await box(inspector.locator('[data-field-heading="anchor"]'));
  const field = await box(title);
  expect(label.x + label.width).toBeLessThanOrEqual(field.x);
  expect(Math.min(label.y + label.height, field.y + field.height)).toBeGreaterThan(
    Math.max(label.y, field.y),
  );
  await expect(
    inspector.getByRole('button', { name: 'Reorder _tickerTexts item 1' }),
  ).toBeVisible();
  await item.fill('خبر تازه\nخط دوم');
  await expect(item).toHaveValue('خبر تازه\nخط دوم');
  expect((await readApplied())?.position).toEqual(original.position);
  expect((await readApplied())?.fields).toEqual(original.fields);

  await app.selectStackRow(otherTemplateId);
  await expect(app.stackRow(otherTemplateId)).toHaveAttribute('aria-pressed', 'true');
  await expect(details).toHaveAttribute('aria-expanded', 'false');
  await expect(position).toHaveAttribute('aria-expanded', 'false');
  await expect(timing).toHaveAttribute('aria-expanded', 'false');
  await expect(x).toBeHidden();
  await expect(dirtyPosition).toHaveCount(0);
  await app.selectStackRow(templateId);
  await expect(position).toHaveAttribute('aria-expanded', 'false');
  await expect(dirtyPosition).toBeVisible();
  await expect(inspector.getByText('top left · 42, 0', { exact: true })).toBeVisible();

  await position.press('Enter');
  await expect(position).toHaveAttribute('aria-expanded', 'true');
  await expect(x).toHaveValue('42');
  await expect(item).toHaveValue('خبر تازه\nخط دوم');
  await expect(details).toHaveAttribute('aria-expanded', 'false');
  await position.press('Space');
  await app.applyEdits();
  await expect.poll(readApplied).toMatchObject({
    position: { anchor: 'top-left', offset: { x: 42 } },
    fields: {
      _tickerTexts: expect.arrayContaining([expect.objectContaining({ text: 'خبر تازه\nخط دوم' })]),
    },
  });
  await expect(dirtyPosition).toHaveCount(0);
  await expect(position).toHaveAttribute('aria-expanded', 'false');
  await details.press('Space');
  await expect(detailsContent).toBeVisible();

  await details.press('Space');
  await page.setViewportSize({ width: 720, height: 900 });
  await inspector.getByRole('button', { name: 'Close INSPECTOR' }).click();
  await expect(inspector).toHaveCount(0);
  await app.selectStackRow(otherTemplateId);
  await expect(details).toHaveAttribute('aria-expanded', 'false');
  await expect(position).toHaveAttribute('aria-expanded', 'false');
  await expect(timing).toHaveAttribute('aria-expanded', 'false');
  await timing.press('Enter');
  await expect(await controlled(timing)).toBeVisible();
  await expect(position).toHaveAttribute('aria-expanded', 'false');
});

test('R-008 — the Inspector header toggles every section without losing a layer draft or focus', async ({
  app,
}) => {
  const { page } = app;
  await page.setViewportSize(WIDE);
  const templateId = 'tpl-disclosure-draft';
  const otherTemplateId = 'tpl-disclosure-other';
  await app.importVcg('disclosure-draft.vcg', await buildListFieldVcg(templateId));
  await app.importVcg('disclosure-other.vcg', await buildListFieldVcg(otherTemplateId));
  await app.selectStackRow(templateId);

  const inspector = app.inspector;
  const collapse = inspector.getByRole('button', { name: 'Collapse all sections', exact: true });
  const expand = inspector.getByRole('button', { name: 'Expand all sections', exact: true });
  const timing = inspector.getByRole('button', { name: 'Timing', exact: true });
  const offset = inspector.getByLabel('Position offset X');
  const firstItem = inspector.getByRole('textbox', { name: '_tickerTexts item 1' });
  const draft = 'عنوان تازه\nNew line';
  const expectOpen = async (expanded: boolean) => {
    for (const name of ['Layer details', 'Timing', 'Position', 'Fields']) {
      await expect(inspector.getByRole('button', { name, exact: true })).toHaveAttribute(
        'aria-expanded',
        String(expanded),
      );
    }
  };
  const readApplied = () =>
    page.evaluate(
      async (id) => (await window.cg.stack.snapshot()).find((row) => row.templateId === id),
      templateId,
    );
  const applied = await readApplied();
  expect(applied).toBeDefined();
  await offset.fill('42');
  await firstItem.fill(draft);

  await collapse.press('Space');
  await expect(expand).toBeFocused();
  await expectOpen(false);
  await expect(offset).toBeHidden();
  await expect(firstItem).toBeHidden();
  await expect(inspector.locator('[data-inspector-heading]')).toBeVisible();
  await expect(inspector.locator('[data-inspector-template]')).toContainText('disclosure draft');
  await expect(inspector.getByText('READY', { exact: true })).toBeVisible();
  await expect(inspector.getByRole('button', { name: 'Apply staged edits' })).toBeEnabled();
  await expect(inspector.getByRole('button', { name: 'Discard staged edits' })).toBeEnabled();
  await expectFootPinned(inspector, 'all sections collapsed');

  await timing.press('Enter');
  await expect(timing).toHaveAttribute('aria-expanded', 'true');
  await expect(firstItem).toBeHidden();
  await collapse.press('Enter');
  await expect(expand).toBeFocused();
  await expectOpen(false);

  await app.selectStackRow(otherTemplateId);
  await expect(inspector.locator('[data-inspector-template]')).toContainText('disclosure other');
  await expectOpen(false);
  await app.selectStackRow(templateId);
  await expect(app.stackRow(templateId)).toHaveAttribute('aria-pressed', 'true');
  await expectOpen(false);

  await inspector.getByRole('button', { name: 'Show INSPECTOR fullscreen' }).click();
  await expectOpen(false);
  await expand.press('Enter');
  await expect(collapse).toBeFocused();
  await expectOpen(true);
  await expect(offset).toHaveValue('42');
  await expect(firstItem).toHaveValue(draft);
  expect((await readApplied())?.position).toEqual(applied?.position);
  expect((await readApplied())?.fields).toEqual(applied?.fields);
  await inspector.getByRole('button', { name: 'Exit fullscreen INSPECTOR' }).click();
  await expectOpen(true);

  await app.openStationSetupAt('General');
  const settings = page.getByRole('dialog');
  await settings.locator('#cg-interface-language').selectOption('fa');
  await settings.getByRole('button', { name: 'بستن', exact: true }).last().click();
  const persian = page.getByRole('complementary', { name: 'ویژگی‌ها', exact: true });
  await persian.getByRole('button', { name: 'جمع کردن همهٔ بخش‌ها', exact: true }).press('Space');
  await expect(
    persian.getByRole('button', { name: 'باز کردن همهٔ بخش‌ها', exact: true }),
  ).toBeFocused();

  await page.getByRole('button', { name: 'باز کردن تنظیمات ایستگاه', exact: true }).click();
  await settings.getByRole('tab', { name: 'عمومی', exact: true }).click();
  await settings.locator('#cg-interface-language').selectOption('ar');
  await settings.getByRole('button', { name: 'إغلاق', exact: true }).last().click();
  const arabic = page.getByRole('complementary', { name: 'لوحة الخصائص', exact: true });
  await arabic.getByRole('button', { name: 'توسيع جميع الأقسام', exact: true }).press('Enter');
  await expect(arabic.getByRole('button', { name: 'طيّ جميع الأقسام', exact: true })).toBeFocused();
});

test('Inspector scroll ends before its pinned footer in the split, narrow and fullscreen layouts', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize(WIDE);
  const templateId = 'tpl-geom-foot';
  await app.importVcg('foot.vcg', await buildListFieldVcg(templateId));
  await app.selectStackRow(templateId);
  await expect(app.inspector).toBeVisible();

  await expectFootPinned(app.inspector, 'initial split');

  // Force overflow with staged list items and follow the same draft through both directions.
  const add = app.inspector.getByRole('button', { name: 'Add _tickerTexts item' });
  for (let i = 0; i < 8; i++) await add.click();
  async function checkScroll(inspector: Locator, label: string) {
    const body = inspector.locator('.cg-inspector-body');
    const footer = inspector.locator('[data-inspector-actions]');
    await expect(footer.getByRole('button')).toHaveCount(2);
    await expect
      .poll(() => body.evaluate((el) => el.scrollHeight - el.clientHeight))
      .toBeGreaterThan(100);
    await body.evaluate((el) => {
      el.scrollTop = 0;
    });
    const before = await box(footer);
    await expectFootPinned(inspector, `${label}, top`);
    await body.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBeGreaterThan(100);
    expect(await box(footer)).toEqual(before);
    await expectFootPinned(inspector, `${label}, bottom`);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  }
  await checkScroll(app.inspector, 'English split');

  await app.inspector.getByRole('button', { name: 'Show INSPECTOR fullscreen' }).click();
  await checkScroll(app.inspector, 'English fullscreen');
  await app.inspector.getByRole('button', { name: 'Exit fullscreen INSPECTOR' }).click();

  await app.openStationSetupAt('General');
  const settings = page.getByRole('dialog');
  await settings.locator('#cg-interface-language').selectOption('fa');
  await settings.getByRole('button', { name: 'بستن', exact: true }).last().click();
  const rtl = page.getByRole('complementary', { name: 'ویژگی‌ها', exact: true });
  await expect(rtl).toHaveCSS('direction', 'rtl');
  await checkScroll(rtl, 'Persian split');
  await page.setViewportSize({ width: 620, height: 530 });
  await expect(page.locator('[data-inspector-scrim]')).toBeVisible();
  await checkScroll(rtl, 'Persian narrow overlay');
  await rtl.getByRole('button', { name: /تمام‌صفحه/ }).click();
  await expect(rtl.getByRole('button', { name: /خروج.*تمام‌صفحه/ })).toBeVisible();
  await checkScroll(rtl, 'Persian narrow fullscreen');
});

/**
 * Position groups the anchor, two labeled offsets and the reset. At full width the offsets
 * share a row and remain capped, leaving space for the other controls.
 */
test('Position offsets align above their own compact fields with room for the anchor and Reset', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize(WIDE);
  const templateId = 'tpl-geom-xy';
  await app.importVcg('xy.vcg', await buildListFieldVcg(templateId));
  await app.selectStackRow(templateId);

  const xField = app.inspector.getByLabel('Position offset X');
  const yField = app.inspector.getByLabel('Position offset Y');
  const pad = app.inspector.locator('.cg-anchor-grid');
  const reset = app.inspector.getByRole('button', { name: 'Reset position', exact: true });
  const inputBox = await box(xField);
  const h = await tokenPx(page, '--r-insp-position-field-h');
  expect(Math.round(inputBox.height)).toBe(h);
  await expect(app.inspector.getByRole('button', { name: 'Apply position' })).toHaveCount(0);

  await app.inspector.getByRole('button', { name: 'Show INSPECTOR fullscreen' }).click();
  await expect
    .poll(async () => (await app.inspector.boundingBox())?.width ?? 0)
    .toBeGreaterThan(900);
  const [x, y, anchor, resetButton] = await Promise.all([
    box(xField),
    box(yField),
    box(pad),
    box(reset),
  ]);
  const capped = await tokenPx(page, '--r-insp-position-field-w');
  expect(Math.round(x.width)).toBe(capped);
  expect(Math.abs(x.width - y.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(x.height - y.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(x.y - y.y)).toBeLessThanOrEqual(1);
  expect(anchor.x + anchor.width).toBeLessThanOrEqual(x.x);
  expect(x.x + x.width).toBeLessThanOrEqual(y.x);
  expect(y.x + y.width).toBeLessThanOrEqual(resetButton.x);
  const labels = app.inspector.locator('.cg-position-row .cg-inspector-control-label > span');
  await expect(labels).toHaveCount(2);
  for (const [index, field] of [x, y].entries()) {
    const label = await box(labels.nth(index));
    expect(label.y + label.height).toBeLessThanOrEqual(field.y);
  }
});

test('an input’s focus is one ring, not two — on a position box and on a text field', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize(WIDE);
  const templateId = 'tpl-geom-ring';
  await app.importVcg('ring.vcg', await buildListFieldVcg(templateId));
  await app.selectStackRow(templateId);

  const ringWidth = await tokenPx(page, '--r-focus-ring');
  for (const [label, loc] of [
    ['position X', app.inspector.getByLabel('Position offset X')],
    ['text field', app.inspector.getByRole('textbox', { name: 'anchor' })],
    ['list item', app.inspector.getByRole('textbox', { name: '_tickerTexts item 1' })],
  ] as const) {
    await loc.focus();
    await expect(loc, label).toBeFocused();
    await expect(loc, label).toHaveCSS('outline-style', 'solid');
    await expect(loc, label).toHaveCSS('outline-width', String(ringWidth) + 'px');
    await expect(loc, label).toHaveCSS('box-shadow', 'none');
    const ancestorRings = await loc.evaluate((el) => {
      let rings = 0;
      for (let parent = el.parentElement; parent !== null; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        if (style.outlineStyle !== 'none' || style.boxShadow !== 'none') rings++;
        if (parent.getAttribute('role') === 'complementary') break;
      }
      return rings;
    });
    expect(ancestorRings, label).toBe(0);
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

  // The foot: padded `9px 12px`, two 32 px buttons on a 104 px floor.
  const foot = app.inspector.locator('.cg-inspector-actions');
  expect(await foot.evaluate((el) => getComputedStyle(el).padding)).toBe('9px 12px');
  for (const name of ['Apply staged edits', 'Discard staged edits']) {
    const b = await box(app.inspector.getByRole('button', { name }));
    expect(Math.round(b.height), name).toBe(32);
    expect(b.width, name).toBeGreaterThanOrEqual(await tokenPx(page, '--r-insp-foot-btn-min-w'));
  }
  /*
    🔴 AND THE SUB-LINE IS ASSERTED ABSENT, not merely deleted (`INSPECTOR-AUDIT-05` §3,
    owner). It read "Saves this row’s configuration. No Take is sent." and the reference still
    draws it, so a later parity pass reading `05-row-inspector.html` would put it straight
    back. An absence that is asserted is a guard; an intended one is a wish.
  */
  await expect(foot.getByText(/No Take is sent/i)).toHaveCount(0);
  await expect(app.inspector.locator('.cg-inspector-actions__hint')).toHaveCount(0);
  // Discard leads, Update trails — the reference's order.
  const discard = await box(app.inspector.getByRole('button', { name: 'Discard staged edits' }));
  const update = await box(app.inspector.getByRole('button', { name: 'Apply staged edits' }));
  expect(discard.x + discard.width).toBeLessThanOrEqual(update.x);
});
