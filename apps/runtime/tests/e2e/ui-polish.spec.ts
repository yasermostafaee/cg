import type { Locator, Page } from '@playwright/test';
import { buildInvalidVcg, buildValidVcg, cssColour, test, expect } from './fixtures/runtime.js';

/**
 * 🔴 `UI-POLISH-01` — the owner's first-run check of 2026-09-26, measured in a real engine. Every
 * claim here is about what the browser PAINTS, which the gate's jsdom specs cannot see (golden rule
 * 12 (c)); each absence has its control.
 */

const strip = (page: Page): Locator => page.getByRole('tablist', { name: 'Channels' });

async function declareSecondChannel(page: Page): Promise<void> {
  const ok = await page.evaluate(async () => {
    const cg = (window as unknown as { cg: typeof window.cg }).cg;
    const [first] = await cg.fixedLayers.banks();
    if (first === undefined) return false;
    const res = await cg.fixedLayers.setBanks({ banks: [first, { ...first, channel: 2 }] });
    return res.ok;
  });
  expect(ok, 'the second channel was declared').toBe(true);
}

interface Paint {
  bg: string;
  ink: string;
  bottom: string;
}

function paintOf(loc: Locator): Promise<Paint> {
  return loc.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      bg: s.backgroundColor,
      ink: s.color,
      bottom: `${s.borderBottomWidth} ${s.borderBottomStyle} ${s.borderBottomColor}`,
    };
  });
}

/** WCAG contrast of two computed `rgb()` / `rgba()` colours (alpha ignored — both are opaque here). */
function contrast(a: string, b: string): number {
  const lum = (c: string): number => {
    const [r, g, bl] = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map((v) => Number(v) / 255);
    const lin = (v: number): number => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin(r ?? 0) + 0.7152 * lin(g ?? 0) + 0.0722 * lin(bl ?? 0);
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** A bottom edge that paints nothing: no width, no style, or a transparent colour. */
function noUnderline(bottom: string): boolean {
  return /^0px/.test(bottom) || / none /.test(bottom) || /rgba\(0, 0, 0, 0\)$/.test(bottom);
}

/** Register `count` placeholder templates named `<prefix> N`, through the bridge seam. */
async function registerTemplates(page: Page, prefix: string, count: number): Promise<void> {
  await page.evaluate(
    async ([p, n]) => {
      const cg = (window as unknown as { cg: typeof window.cg }).cg;
      for (let i = 1; i <= n; i += 1) {
        await cg.templates.import({
          template: {
            templateId: `${p}-${String(i)}`,
            name: `${p} ${String(i)}`,
            templateType: 'lower-third',
            fields: [],
          },
          html: '<!doctype html><html><body>t</body></html>',
        });
      }
    },
    [prefix, count] as const,
  );
}

test('B — the divider runs the full body height, with one template listed and with many', async ({
  app,
}) => {
  const { page } = app;
  await registerTemplates(page, 'Zzsolo', 1);
  await registerTemplates(page, 'Filler', 14);
  await app.openTemplatePicker();
  const dialog = app.templatePicker;
  const rows = dialog.locator('[data-template-list] [data-template-id]');
  interface Box {
    bodyBottom: number;
    layoutBottom: number;
    layoutH: number;
    asideTop: number;
    asideBottom: number;
    asideH: number;
  }
  const measure = (): Promise<Box> =>
    dialog.evaluate((d) => {
      const rect = (sel: string): DOMRect => {
        const el = d.querySelector(sel);
        if (el === null) throw new Error(`missing ${sel}`);
        return el.getBoundingClientRect();
      };
      const body = rect('[data-modal-body]');
      const layout = rect('[data-template-layout]');
      const aside = rect('[data-template-aside]');
      return {
        bodyBottom: body.bottom,
        layoutBottom: layout.bottom,
        layoutH: layout.height,
        asideTop: aside.top,
        asideBottom: aside.bottom,
        asideH: aside.height,
      };
    });

  // MANY (the control): the list overflows and the divider already ran to the footer.
  expect(await rows.count()).toBeGreaterThan(10);
  const many = await measure();
  expect(Math.abs(many.asideH - many.layoutH), JSON.stringify(many)).toBeLessThanOrEqual(1);
  expect(Math.abs(many.layoutBottom - many.bodyBottom), JSON.stringify(many)).toBeLessThanOrEqual(
    1,
  );

  // ONE: the owner's case — the divider used to stop just under the one row.
  await dialog
    .getByRole('searchbox', { name: 'Search templates' })
    .or(dialog.getByRole('textbox', { name: 'Search templates' }))
    .fill('Zzsolo');
  await expect(rows).toHaveCount(1);
  const one = await measure();
  expect(Math.abs(one.asideH - one.layoutH), JSON.stringify(one)).toBeLessThanOrEqual(1);
  expect(Math.abs(one.layoutBottom - one.bodyBottom), JSON.stringify(one)).toBeLessThanOrEqual(1);
  // The same box either way: the list's length does not move the divider.
  expect(Math.abs(one.asideH - many.asideH)).toBeLessThanOrEqual(1);
});

test.describe('C — delete is on the row; `Manage` is retired', () => {
  test('an unused template deletes through the existing confirm; one a row holds is refused with the existing line', async ({
    app,
  }) => {
    const { page } = app;
    await registerTemplates(page, 'Zzfree', 1);
    await registerTemplates(page, 'Zzdbl', 1);
    await app.importVcg('held.vcg', await buildValidVcg('tpl-held'));
    await app.openTemplatePicker();
    const picker = app.templatePicker;
    await expect(picker.getByRole('button', { name: 'Manage' })).toHaveCount(0);

    // The row's icon is NEUTRAL at rest — the muted ink, never a danger paint.
    const icon = picker.locator('[data-template-delete="Zzfree-1"]');
    await expect(icon).toBeVisible();
    await expect(icon).toHaveCSS('color', await cssColour(page, 'var(--r-text-muted)'));
    // …on the `icon` variant's own neutral ground, never the deletion family's red (§29.2).
    await expect(icon).not.toHaveCSS(
      'background-color',
      await cssColour(page, 'var(--r-setup-danger-bg)'),
    );
    await expect(icon).not.toHaveCSS('color', await cssColour(page, 'var(--r-setup-danger-ink)'));

    // Selecting a row opens no confirm and deletes nothing.
    const before = await app.templateCount();
    await picker.getByRole('button', { name: 'Select Zzfree 1' }).click();
    await expect(page.getByRole('dialog', { name: /from CH \d+\?$/ })).toHaveCount(0);
    expect(await app.templateCount()).toBe(before);

    // An UNUSED template: the existing confirm — naming the channel (`CHANNEL-TEMPLATES-01`) — then gone.
    await icon.click();
    const confirm = page.getByRole('dialog', { name: /^Remove .* from CH 1\?$/ });
    await expect(confirm).toContainText('every browser');
    await confirm.getByRole('button', { name: 'Remove from CH 1', exact: true }).click();
    await expect(app.templateRow('Zzfree-1')).toHaveCount(0);
    expect(await app.templateCount()).toBe(before - 1);

    // THE CONTROL — a template a row holds: refused, with the existing line, and still listed.
    await picker.getByRole('button', { name: /^Remove held from CH 1$/ }).click();
    await page
      .getByRole('dialog', { name: /^Remove .* from CH 1\?$/ })
      .getByRole('button', { name: 'Remove from CH 1', exact: true })
      .click();
    await expect(picker.locator('[data-modal-message]')).toContainText(
      '1 row still holds this template',
    );
    await expect(app.templateRow('tpl-held')).toHaveCount(1);

    // A double-click LOADS — and deletes nothing.
    await picker.getByRole('button', { name: 'Select Zzdbl 1' }).dblclick();
    await expect(picker).toHaveCount(0);
    expect(await app.templateCount()).toBe(before - 1);
  });
});

test.describe('D — importing is one step: the OS chooser, or a drop on the list', () => {
  test('`Import a .vcg` IS the OS chooser; the package lands selected and loads onto no row', async ({
    app,
  }) => {
    const { page } = app;
    await app.openTemplatePicker();
    const picker = app.templatePicker;
    const before = await app.templateCount();

    const chooser = page.waitForEvent('filechooser');
    await picker.getByRole('button', { name: 'Import a .vcg' }).click();
    const opened = await chooser;
    // The press opened the chooser — and no dialog of ours stands in front of it.
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(page.locator('[data-import-drop]')).toHaveCount(0);
    await opened.setFiles({
      name: 'direct.vcg',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from(await buildValidVcg('tpl-direct')),
    });

    await expect.poll(() => app.templateCount()).toBe(before + 1);
    // Lands SELECTED on the list, one press from the load — which has not happened.
    await expect(app.templateRow('tpl-direct')).toHaveAttribute('data-template-selected', 'true');
    await expect(picker.locator('[data-template-selected="tpl-direct"]')).toBeVisible();
    await app.closeTemplatePicker();
    await expect(app.stackRow('tpl-direct'), 'an import is not a load').toHaveCount(0);

    // THE CONTROL — the instrument sees a load when one happens.
    await app.loadTemplate('tpl-direct');
    await expect(app.stackRow('tpl-direct')).toHaveCount(1);
  });

  test('a package the chain refuses is one line in the picker, and registers nothing', async ({
    app,
  }) => {
    const { page } = app;
    await app.openTemplatePicker();
    const picker = app.templatePicker;
    const before = await app.templateCount();
    const chooser = page.waitForEvent('filechooser');
    await picker.getByRole('button', { name: 'Import a .vcg' }).click();
    await (
      await chooser
    ).setFiles({
      name: 'broken.vcg',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from(buildInvalidVcg()),
    });
    const line = picker.locator('[data-modal-message]');
    await expect(line).toContainText('“broken.vcg” failed verification');
    await expect(line).toHaveCount(1);
    /*
      ONE LINE — counted from the TEXT's own line boxes. A range over the element also returns
      the notice's box, whose top is not a line's, so only text nodes are read. The control: the
      same count, with the notice squeezed to 240 px, must see the wrap it forces.
    */
    const lines = await line.evaluate((el) => {
      const count = (): number => {
        const tops = new Set<number>();
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
          const range = document.createRange();
          range.selectNodeContents(n);
          for (const r of range.getClientRects()) tops.add(Math.round(r.top));
        }
        return tops.size;
      };
      const notice = el.firstElementChild as HTMLElement;
      const asShown = count();
      notice.style.maxWidth = '240px';
      const squeezed = count();
      notice.style.maxWidth = '';
      return { asShown, squeezed };
    });
    expect(lines.squeezed, 'the instrument cannot see a wrap').toBeGreaterThan(1);
    expect(lines.asShown, 'the refusal wraps').toBe(1);
    await expect(page.getByRole('dialog')).toHaveCount(1);
    expect(await app.templateCount()).toBe(before);
    await expect(app.error, 'the refusal is in the picker, not under its backdrop').toHaveCount(0);
  });

  test('a `.vcg` dropped on the list imports it — selected, nothing loaded', async ({ app }) => {
    const { page } = app;
    await registerTemplates(page, 'Zzlisted', 1);
    await app.openTemplatePicker();
    const picker = app.templatePicker;
    const before = await app.templateCount();
    const bytes = Array.from(await buildValidVcg('tpl-dropped'));
    const transfer = await page.evaluateHandle((b) => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(b)], 'dropped.vcg'));
      return dt;
    }, bytes);
    const list = picker.locator('[data-template-list]');
    await list.dispatchEvent('dragenter', { dataTransfer: transfer });
    await list.dispatchEvent('dragover', { dataTransfer: transfer });
    await list.dispatchEvent('drop', { dataTransfer: transfer });

    await expect.poll(() => app.templateCount()).toBe(before + 1);
    await expect(app.templateRow('tpl-dropped')).toHaveAttribute('data-template-selected', 'true');
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await app.closeTemplatePicker();
    await expect(app.stackRow('tpl-dropped'), 'a drop is not a load').toHaveCount(0);
  });
});

/**
 * E — the Playout's channel list, served at the bridge seam. The rows, their paint and the keyboard
 * are what is under test; the list itself is data (golden rule 1), and on this harness there is no
 * Playout to read it from. The rows sit on the station's own CasparCG host, so the declared channel
 * is one of them rather than an extra `CH n` row.
 */
async function serveChannelList(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const cg = (window as unknown as { cg: typeof window.cg }).cg;
    const host = (await cg.connections.config()).servers.A.host;
    cg.setup.catalogue = () =>
      Promise.resolve({
        rows: [
          { id: 'apasai', name: 'آپاسای', casparHost: host, casparChannel: 1 },
          { id: 'cg', name: 'کانال دوم (تست CG)', casparHost: host, casparChannel: 2 },
        ],
      });
  });
}

test.describe('E — channels are picked with checkboxes', () => {
  test('Change channel… opens on the declared channel checked; the row and Space toggle; focus shows; the label follows the count', async ({
    app,
  }) => {
    const { page } = app;
    await serveChannelList(page);
    await app.openStationSetupAt('Channel');
    await page.getByRole('button', { name: 'Change channel…' }).click();
    const one = page.getByRole('checkbox', { name: /^CH 1 · / });
    const two = page.getByRole('checkbox', { name: /^CH 2 · / });
    await expect(two).toBeVisible();
    // Opens on the station's own set: channel 1 checked, channel 2 not.
    await expect(one).toBeChecked();
    await expect(two).not.toBeChecked();
    // The row reads `CH n · <name>`, the name isolated.
    const rowTwo = page.locator('.cg-channel-row[data-channel="2"]');
    await expect(rowTwo).toHaveText('CH 2 · کانال دوم (تست CG)');
    await expect(rowTwo.locator('bdi')).toHaveText('کانال دوم (تست CG)');

    // The KEYBOARD: into the list with Tab (so focus is keyboard focus), Space toggles.
    await one.focus();
    await page.keyboard.press('Tab');
    await expect(two).toBeFocused();
    const outline = (row: Locator): Promise<string> =>
      row.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(await outline(rowTwo), 'the focused row shows it').toBe('solid');
    const rowOne = page.locator('.cg-channel-row[data-channel="1"]');
    expect(await outline(rowOne), 'CONTROL — the row without focus does not').toBe('none');
    await page.keyboard.press('Space');
    await expect(two).toBeChecked();
    await expect(
      page.getByRole('button', { name: 'Use these channels', exact: true }),
    ).toBeVisible();

    // A click on the ROW's name (not the box) toggles it back — and the label follows the count.
    await rowTwo.locator('.cg-channel-row__name').click();
    await expect(two).not.toBeChecked();
    await expect(page.getByRole('button', { name: 'Use this channel', exact: true })).toBeVisible();
    // A checked row wears the "chosen, not on air" fill; an unchecked one does not.
    const bg = (row: Locator): Promise<string> =>
      row.evaluate((el) => getComputedStyle(el).backgroundColor);
    await expect.poll(() => bg(rowOne)).toBe(await cssColour(page, 'var(--r-look-btn-sel-bg)'));
    await page.mouse.move(2, 2);
    await expect.poll(() => bg(rowTwo)).not.toBe(await cssColour(page, 'var(--r-look-btn-sel-bg)'));
  });
});

test.describe('A — the channel tabs', () => {
  test('the active tab is a filled box, AA, with no underline anywhere; switching moves it', async ({
    app,
  }) => {
    const { page } = app;
    await declareSecondChannel(page);
    const one = strip(page).getByRole('tab', { name: 'CHANNEL 1' });
    const two = strip(page).getByRole('tab', { name: 'CHANNEL 2' });
    await expect(one).toHaveAttribute('aria-selected', 'true');

    const active = await paintOf(one);
    const inactive = await paintOf(two);
    // Filled and inked differently — measurably, not by an underline.
    expect(active.bg).not.toBe(inactive.bg);
    expect(active.ink).not.toBe(inactive.ink);
    expect(contrast(active.ink, active.bg), 'active ink on its fill').toBeGreaterThanOrEqual(4.5);
    // No line under the inactive tab, and none under the strip.
    expect(noUnderline(inactive.bottom), `inactive bottom edge: ${inactive.bottom}`).toBe(true);
    const stripBottom = await strip(page).evaluate((el) => {
      const s = getComputedStyle(el);
      return `${s.borderBottomWidth} ${s.borderBottomStyle} ${s.borderBottomColor}`;
    });
    expect(noUnderline(stripBottom), `strip bottom edge: ${stripBottom}`).toBe(true);

    // The control: the active state MOVES with the selection.
    await two.click();
    await expect(two).toHaveAttribute('aria-selected', 'true');
    expect((await paintOf(two)).bg).toBe(active.bg);
    expect((await paintOf(one)).bg).toBe(inactive.bg);
  });

  test('arrows move focus between tabs, visibly; Enter selects', async ({ app }) => {
    const { page } = app;
    await declareSecondChannel(page);
    const one = strip(page).getByRole('tab', { name: 'CHANNEL 1' });
    const two = strip(page).getByRole('tab', { name: 'CHANNEL 2' });
    await one.focus();
    await page.keyboard.press('ArrowRight');
    await expect(two).toBeFocused();
    // Manual activation: focus moved, the channel did not.
    await expect(one).toHaveAttribute('aria-selected', 'true');
    expect(await two.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
    await page.keyboard.press('ArrowRight'); // wraps
    await expect(one).toBeFocused();
    await page.keyboard.press('End');
    await expect(two).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(two).toHaveAttribute('aria-selected', 'true');
  });

  test('a strip mark still reads on the tab it sits on', async ({ app }) => {
    const { page } = app;
    await declareSecondChannel(page);
    await strip(page).getByRole('tab', { name: 'CHANNEL 2' }).click();
    await page.evaluate(() => {
      (window as unknown as { CG_TEST_REFUSE: (m: string) => void }).CG_TEST_REFUSE(
        'Refused on channel 2.',
      );
    });
    await strip(page)
      .getByRole('tab', { name: /^CHANNEL 1/ })
      .click();
    const mark = strip(page).locator('#channel-2 [data-tab-signal]');
    await expect(mark).toBeVisible();
    const markInk = await mark.evaluate((el) => getComputedStyle(el).color);
    const ground = await page
      .locator('[data-app-header]')
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(contrast(markInk, ground), 'the amber mark on the header ground').toBeGreaterThanOrEqual(
      3,
    );
  });
});
