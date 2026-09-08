import type { Locator, Page } from '@playwright/test';
import { defaultLayerAlias, layerAlias, type FixedLayerBank } from '@cg/shared-ipc';
import { expect, test } from './fixtures/runtime.js';

/**
 * 🔴 `RUNTIME-REDESIGN-01` PHASE 6 — **live plates and audio, in a real engine.**
 *
 * Three things only Chromium can prove (golden rule 12c):
 *
 *   1. the audio dialog opens by RIGHT-CLICK and by the keyboard (`Shift+F10`, `ContextMenu`)
 *      from BOTH doors — the layer row's menu and the seated plate itself — and lands focus on
 *      the plate the operator pointed at;
 *   2. the LIVE PLATES table and the dialog carry the reference's rendered geometry
 *      (`07-live-plates.html` / `08-live-audio.html` at 1280 × 800, `design.md` §13.3), read
 *      back from the token home rather than spelled here;
 *   3. the Inspector's heading is the selected ROW's name (owner answer A14 (a), `R-061`),
 *      through the same bank the mock publishes.
 *
 * The jsdom twins are `plateAudioAccess.dom.test.ts` and `inspectorHeading.dom.test.ts`; the
 * wire twin is `tools/caspar-bridge/tests/audio-does-not-take.integration.test.ts`.
 */

const WIDE = { width: 1280, height: 800 };
/** The seeded row that declares plates (`e2e-looks`, four boxes). */
const PLATE_ROW = 89;

test.beforeEach(async ({ app }) => {
  await app.page.setViewportSize(WIDE);
});

function audioDialog(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Live plate audio' });
}

async function token(page: Page, name: string): Promise<number> {
  const raw = await page.evaluate(
    (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
    name,
  );
  const px = Number.parseFloat(raw);
  expect(Number.isFinite(px), `${name} is declared (${raw})`).toBe(true);
  return px;
}

async function box(locator: Locator): Promise<{ w: number; h: number }> {
  const b = await locator.boundingBox();
  if (b === null) throw new Error('no box');
  return { w: b.width, h: b.height };
}

test('the PLATE door — right-click on a seated plate opens the owner’s audio on THAT plate; Shift+F10 and ContextMenu do the same', async ({
  app,
}) => {
  const page = app.page;
  await app.liveSourcesTab.click();
  const held = app.liveSourceRow('1-11');
  await expect(held).toBeVisible();

  // Pointer.
  await held.click({ button: 'right' });
  const dialog = audioDialog(page);
  await expect(dialog).toBeVisible();
  // The OWNER is named, in the operator's words — the template the row carries is one of them.
  await expect(dialog.locator('[data-audio-subtitle]')).toContainText('News Composite');
  // Focus lands on the plate the operator pointed at — the HIDDEN frame, `guest-2`.
  await expect(page.locator(':focus')).toHaveAttribute('aria-label', 'Volume for guest-2');
  await expect(dialog.locator('[data-audio-plate="guest-2"]')).toContainText('HIDDEN BY THIS LOOK');
  await dialog.locator('button', { hasText: /^Close$/ }).click();
  await expect(dialog).toHaveCount(0);

  // Keyboard, twice — the two keys the reference wires.
  const shown = app.liveSourceRow('1-10');
  await shown.focus();
  await page.keyboard.press('Shift+F10');
  await expect(dialog).toBeVisible();
  await expect(page.locator(':focus')).toHaveAttribute('aria-label', 'Volume for guest-1');
  await dialog.locator('button', { hasText: /^Close$/ }).click();
  await expect(dialog).toHaveCount(0);

  await shown.focus();
  await page.keyboard.press('ContextMenu');
  await expect(dialog).toBeVisible();
  await expect(page.locator(':focus')).toHaveAttribute('aria-label', 'Volume for guest-1');
});

test('the ROW door — right-click → menu → AUDIO, and Shift+F10 → menu → Enter, both open the row’s dialog', async ({
  app,
}) => {
  const page = app.page;
  const row = page.locator(`[data-layer="${String(PLATE_ROW)}"]`);
  await expect(row).toHaveAttribute('data-item-id', 'item-looks');

  await row.click({ button: 'right' });
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: 'AUDIO' }).click();
  const dialog = audioDialog(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-audio-plate]')).toHaveCount(4);
  await expect(dialog.locator('[data-audio-plate="live-1"]')).toContainText('NOT SEATED');
  await dialog.locator('button', { hasText: /^Close$/ }).click();
  await expect(dialog).toHaveCount(0);

  await row.focus();
  await page.keyboard.press('Shift+F10');
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: 'AUDIO' }).focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
});

test('the LIVE PLATES table and the audio dialog carry the reference’s rendered geometry, from the token home', async ({
  app,
}) => {
  const page = app.page;
  await app.liveSourcesTab.click();
  const shown = app.liveSourceRow('1-10');
  await expect(shown).toBeVisible();

  // The head and the ordinary row — the reference's 30 px and 42 px.
  const head = page.locator('[role="table"] .cg-plate-head');
  expect((await box(head)).h).toBeGreaterThanOrEqual(await token(page, '--r-plate-head-h'));
  const rowMin = await token(page, '--r-plate-row-min-h');
  const rowH = (await box(shown)).h;
  expect(rowH).toBeGreaterThanOrEqual(rowMin);
  // …and the ordinary row is ONE line: no sentence under it (the held row keeps its caveat).
  expect(rowH).toBeLessThan(rowMin * 1.5);
  await expect(shown.locator('.cg-plate-detail')).toHaveCount(0);
  await expect(app.liveSourceRow('1-11').locator('.cg-plate-detail')).toHaveCount(1);

  // The verbs — ON/OFF at 40 × 32, SOLO at 46 × 32.
  const strip = shown.locator('[data-plate-audio="guest-1"]');
  const on = strip.getByRole('button', { name: /^Full volume for guest-1/ });
  const solo = strip.getByRole('button', { name: /^Solo guest-1/ });
  expect((await box(on)).w).toBeCloseTo(await token(page, '--r-plate-verb-w'), 0);
  expect((await box(on)).h).toBeCloseTo(await token(page, '--r-plate-verb-h'), 0);
  expect((await box(solo)).w).toBeCloseTo(await token(page, '--r-plate-solo-w'), 0);
  // The fader — 140 px wide.
  const fader = strip.getByRole('slider');
  expect((await box(fader)).w).toBeCloseTo(await token(page, '--r-plate-gain-w'), 0);

  // The dialog — 58 × 36 verbs on rows no shorter than 83 px.
  await shown.click({ button: 'right' });
  const dialog = audioDialog(page);
  await expect(dialog).toBeVisible();
  const dialogOn = dialog.getByRole('button', { name: /^Full volume for guest-1/ });
  expect((await box(dialogOn)).w).toBeCloseTo(await token(page, '--r-audio-verb-w'), 0);
  expect((await box(dialogOn)).h).toBeCloseTo(await token(page, '--r-audio-verb-h'), 0);
  const mixerRow = dialog.locator('[data-audio-plate="guest-1"]');
  expect((await box(mixerRow)).h).toBeGreaterThanOrEqual(await token(page, '--r-audio-row-min-h'));
  // The footer's two facts are on the surface, not behind a hover.
  await expect(dialog).toContainText('ON = 100% · OFF = 0%');
  await expect(dialog).toContainText('including hidden frames');
});

test('the Inspector is headed by the selected ROW’s name, from the bank the mock publishes, and follows selection', async ({
  app,
}) => {
  const page = app.page;
  const bank = await page.evaluate(async () => {
    const w = window as unknown as {
      cg: { fixedLayers: { config: () => Promise<FixedLayerBank | null> } };
    };
    return w.cg.fixedLayers.config();
  });
  expect(bank).not.toBeNull();
  const nameOf = (layer: number): string =>
    layerAlias(bank as FixedLayerBank, layer) ?? defaultLayerAlias(bank as FixedLayerBank, layer);

  const heading = app.inspector.locator('[data-inspector-heading]');
  await page.locator(`[data-layer="${String(PLATE_ROW)}"] [data-row-body]`).click();
  await expect(heading).toHaveText(nameOf(PLATE_ROW));
  await expect(heading).toHaveAttribute('title', /item-looks/);
  // The template moved to the line beneath.
  await expect(app.inspector.locator('[data-inspector-template]')).toContainText('Debate');

  // Follows the selection: the seeded news row, wherever the bank puts it.
  const newsRow = page.locator('[data-item-id="item-irib-news"]');
  const newsLayer = Number(await newsRow.getAttribute('data-layer'));
  await newsRow.locator('[data-row-body]').click();
  await expect(heading).toHaveText(nameOf(newsLayer));
  expect(nameOf(newsLayer)).not.toBe(nameOf(PLATE_ROW));
});
