import type { Locator, Page } from '@playwright/test';
import { test, expect } from './fixtures/runtime.js';

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
