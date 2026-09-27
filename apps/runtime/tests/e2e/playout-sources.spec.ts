import type { Locator, Page } from '@playwright/test';
import { E2E_PLAYOUT, expect, test } from './fixtures/runtime.js';

/**
 * 🔴 `PLAYOUT-SOURCES-01` §2.A / §4 — **THE SOURCE PICKER, IN A REAL ENGINE.**
 *
 * `sourcePicker.dom.test.ts` pins the picker's rules in jsdom: what is listed, what is disabled and
 * why, the keyboard, a choice returned once. It cannot answer what this file is for, because jsdom
 * has no layout (golden rule 12c) and its virtualised list therefore scrolls nothing:
 *
 *   1. the panel HANGS FROM ITS FIELD, at least 440 px wide and at most 480 tall, OVER the dialog it
 *      was opened from rather than as a second modal — and Escape closes it alone;
 *   2. the Media list, scrolled for real, PAGES through the whole library — every item once, never
 *      audio — while the Playout does the searching (Persian normalisation included);
 *   3. inputs and media NEVER MEET, and no address reaches the page;
 *   4. the owner's take: one plate on an input, one on a media item — it plays, and Look inputs
 *      name both with their own icons.
 *
 * Against the offline MockRuntime seeded with the fake Playout's list (`E2E_PLAYOUT`), whose
 * catalogue the bridge's own builder makes. Windows runs are NON-authoritative (golden rule 12a).
 */

test.use({ playoutSources: E2E_PLAYOUT });

const TPL = 'tpl-e2e-picker';

/** Two plates, one look placing both — the shape Look inputs exists for. */
async function registerTemplate(page: Page): Promise<void> {
  await page.evaluate(async (templateId) => {
    const w = window as unknown as {
      cg: { templates: { import: (req: { template: unknown; html: string }) => Promise<unknown> } };
    };
    const left = { x: 0, y: 0, width: 960, height: 540 };
    const right = { x: 960, y: 0, width: 960, height: 540 };
    await w.cg.templates.import({
      template: {
        templateId,
        name: 'picker',
        sourceFileName: 'picker.vcg',
        templateType: 'lower-third',
        fields: [],
        liveSources: {
          resolution: { width: 1920, height: 1080 },
          defaultPosition: { anchor: 'center', dx: 0, dy: 0 },
          sources: [
            { elementId: 'el-1', sourceId: 'l-1', rect: left, dynamic: false },
            { elementId: 'el-2', sourceId: 'l-2', rect: right, dynamic: false },
          ],
          looks: [
            {
              id: 'two',
              name: '2-box',
              entered: { mode: 'cut' },
              rects: { 'l-1': left, 'l-2': right },
            },
          ],
          defaultLookId: 'two',
        },
      },
      html: '<!doctype html><html><body>picker</body></html>',
    });
  }, TPL);
}

/** Load the template onto a row, select it, and open its source defaults. */
async function openDefaults(app: {
  page: Page;
  inspector: Locator;
  loadTemplate: (id: string) => Promise<number>;
  selectLayerRow: (layer: number) => Promise<void>;
}): Promise<Locator> {
  await registerTemplate(app.page);
  const row = await app.loadTemplate(TPL);
  await app.selectLayerRow(row);
  await app.inspector.locator('[data-open-template-defaults]').click();
  const dialog = app.page.getByRole('dialog', { name: 'Source defaults' });
  await expect(dialog).toBeVisible();
  return dialog;
}

const picker = (page: Page): Locator => page.getByRole('dialog', { name: 'Choose a source' });

test('the picker hangs from its field, over the dialog — not a second modal — and Escape closes it alone', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 900 });
  const dialog = await openDefaults(app);
  const field = dialog.locator('[data-defaults-select="l-1"]');

  await field.click();
  const panel = picker(page);
  await expect(panel).toBeVisible();
  await expect(field).toHaveAttribute('aria-expanded', 'true');
  // The dialog it was opened from is still there, under it: the picker is not a modal.
  await expect(dialog).toBeVisible();
  await expect(panel).not.toHaveAttribute('aria-modal', 'true');

  // §2.A geometry — measured, because jsdom cannot: ≥ 440 wide, ≤ 480 tall, hanging BELOW its field.
  const [fieldBox, panelBox] = [await field.boundingBox(), await panel.boundingBox()];
  if (fieldBox === null || panelBox === null)
    throw new Error('the field and the panel must both have a box');
  expect(panelBox.width).toBeGreaterThanOrEqual(440);
  expect(panelBox.height).toBeLessThanOrEqual(480);
  expect(panelBox.y, 'below its field — there is room there').toBeGreaterThanOrEqual(
    fieldBox.y + fieldBox.height,
  );
  await expect(panel).toHaveAttribute('data-popover-side', 'below');

  // The tabs carry their counts: the Playout's seven inputs, and its 124 video items (never audio).
  await expect(panel.getByRole('tab', { name: 'Inputs 7' })).toBeVisible();
  await expect(panel.getByRole('tab', { name: 'Media 124' })).toBeVisible();

  // 🔴 Escape closes the PICKER — the dialog under it survives, and focus is back on the field.
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(field).toBeFocused();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
});

test('Inputs: the Playout’s inputs by name, in its order; a route is an ordinary input now; no address anywhere', async ({
  app,
}) => {
  const page = app.page;
  const dialog = await openDefaults(app);
  const field = dialog.locator('[data-defaults-select="l-1"]');
  await field.click();
  const panel = picker(page);

  await expect(panel.locator('[data-picker-input] .cg-picker-row__name')).toHaveText([
    'Studio 1',
    'Studio 2',
    'Studio 3',
    'دوربین خبر',
    'Multicast',
    'ورودی ۳',
    'ورودی ۴',
  ]);
  // Each row is the icon and the NAME only — no kind word, no address.
  await expect(panel.locator('[data-picker-input="in-studio-1"]')).toHaveText('Studio 1');

  // `ROUTE-PLATES-01` §1.G — the gate is gone: a route is enabled, by its name alone, with no tag
  // (a template's defaults name no channel, so rule 1 is asked where a row takes it)…
  const route = panel.locator('[data-picker-input="in-input-3"]');
  await expect(route).toBeEnabled();
  await expect(route).toHaveText('ورودی ۳');
  await expect(route.locator('.cg-source-tag')).toHaveCount(0);
  // …and control: a camera is enabled, the same way.
  await expect(panel.locator('[data-picker-input="in-studio-1"]')).toBeEnabled();
  await expect(field).toHaveAttribute('data-picker-value', '');

  // 🔴 §1.E — no stream URL, no credentials, no NDI name, no path: anywhere on the page.
  const html = await page.content();
  for (const address of ['secret', 'rtsp://', 'udp://', 'STUDIO-PC', 'Media Library']) {
    expect(html, `the page shows ${address}`).not.toContain(address);
  }
  // Control: the names are there.
  expect(html).toContain('دوربین خبر');
  await page.keyboard.press('Escape');
});

test('Media: searched on the Playout’s side, Persian included; the list pages through every item once, and never audio', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 900 });
  const dialog = await openDefaults(app);
  await dialog.locator('[data-defaults-select="l-1"]').click();
  const panel = picker(page);
  await panel.getByRole('tab', { name: /^Media/ }).click();
  const search = panel.locator('[data-picker-search]');
  // The search field takes focus when the tab opens.
  await expect(search).toBeFocused();
  const names = panel.locator('[data-picker-media] .cg-picker-row__name');

  // The contract's normalisation — Arabic ي/ك as Persian, Persian digits as Latin.
  await search.fill('كليپ');
  await expect(names).toHaveText(['کلیپ معرفی']);
  await search.fill('خبر 1405');
  await expect(names).toHaveText(['خبر ۱۴۰۵']);
  // Control: a term that matches nothing says so, naming what was asked.
  await search.fill('zzzz');
  await expect(panel.locator('[data-picker-empty="media"]')).toHaveText('No media matches “zzzz”.');

  /*
    🔴 PAGING, SCROLLED FOR REAL. Pages of 50, the next fetched as the list nears its end; the list
    is virtualised, so it is walked half a viewport at a time and every row it draws is recorded
    by its INDEX. The whole library must arrive — 124 items, each at exactly one index — and the
    one audio item never.
  */
  await search.fill('');
  const list = panel.locator('[data-picker-tab="media"] [role="listbox"]');
  await expect(list.locator('[data-picker-media]').first()).toBeVisible();
  const byIndex = new Map<number, string>();
  let idleAtEnd = 0;
  for (let step = 0; step < 400 && idleAtEnd < 3; step++) {
    const read = await list.evaluate((el) => {
      const rows = [...el.querySelectorAll('[data-vlist-index][data-picker-media]')].map(
        (n) =>
          [
            Number(n.getAttribute('data-vlist-index')),
            n.getAttribute('data-picker-media') ?? '',
          ] as const,
      );
      const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
      el.scrollTop += Math.max(Math.floor(el.clientHeight / 2), 1);
      return { rows, atEnd };
    });
    const before = byIndex.size;
    for (const [index, id] of read.rows) byIndex.set(index, id);
    idleAtEnd = read.atEnd && byIndex.size === before ? idleAtEnd + 1 : 0;
    await page.waitForTimeout(40);
  }
  const ids = [...byIndex.values()];
  expect(ids.length, 'every item in the library arrived').toBe(124);
  expect(new Set(ids).size, 'no item arrived twice').toBe(ids.length);
  expect(ids, 'audio is never offered').not.toContain('md-m-bed');
  await page.keyboard.press('Escape');
});

test('🔴 separation: the media `Studio 1` is a media row only, and the input `Studio 1` an input only', async ({
  app,
}) => {
  const page = app.page;
  const dialog = await openDefaults(app);
  await dialog.locator('[data-defaults-select="l-1"]').click();
  const panel = picker(page);

  // Media, searching `Studio`: the media item, with the media icon — and no input.
  await panel.getByRole('tab', { name: /^Media/ }).click();
  await panel.locator('[data-picker-search]').fill('Studio');
  const media = panel.locator('[data-picker-media="md-m-studio1"]');
  await expect(media).toContainText('Studio 1');
  await expect(media.locator('.lucide-film')).toHaveCount(1);
  await expect(panel.locator('[data-picker-input]')).toHaveCount(0);

  // Control: Inputs lists the INPUT `Studio 1`, with the input icon — and no media row at all.
  await panel.getByRole('tab', { name: /^Inputs/ }).click();
  const input = panel.locator('[data-picker-input="in-studio-1"]');
  await expect(input).toHaveText('Studio 1');
  await expect(input.locator('.lucide-cable')).toHaveCount(1);
  await expect(panel.locator('[data-picker-media]')).toHaveCount(0);
  await page.keyboard.press('Escape');
});

test('🔴 the owner’s take: a plate on an input and a plate on a media item — it plays, and Look inputs name both', async ({
  app,
}) => {
  const page = app.page;
  await registerTemplate(page);
  const row = await app.loadTemplate(TPL);
  await app.selectLayerRow(row);

  const looks = app.inspector.locator('[aria-label="Look inputs"]');
  await app.chooseSource(looks.locator('[data-look-binding="two:l-1"]'), { input: 'Studio 1' });
  await app.chooseSource(looks.locator('[data-look-binding="two:l-2"]'), {
    media: 'خبر ۱۴۰۵',
    search: 'خبر',
  });
  await app.applyEdits();

  await app.layerRow(row).getByRole('button', { name: 'PLAY' }).click();
  await expect(app.layerRow(row).getByText('ON AIR')).toBeVisible({ timeout: 3000 });

  // Each field names its source by NAME, with its own icon — the input's cable, the clip's film
  // and length — and never an id or an address.
  const first = looks.locator('[data-look-binding="two:l-1"] [data-source-label="input"]');
  await expect(first.locator('.cg-source-label__name')).toHaveText('Studio 1');
  await expect(first.locator('.lucide-cable')).toHaveCount(1);
  const second = looks.locator('[data-look-binding="two:l-2"] [data-source-label="media"]');
  await expect(second.locator('.cg-source-label__name')).toHaveText('خبر ۱۴۰۵');
  await expect(second.locator('.lucide-film')).toHaveCount(1);
  await expect(second.locator('.cg-source-label__meta')).toHaveText('17:39');
  await expect(looks).not.toContainText('md-m-khabar');
});
