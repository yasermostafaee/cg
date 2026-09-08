import type { Page } from '@playwright/test';
import { buildValidVcg, expect, test } from './fixtures/runtime.js';

/**
 * 🔴 `RUNTIME-REDESIGN-01` PHASE 5 — THREE THINGS STAY INDEPENDENT.
 *
 * Which row is SELECTED, which rows are IN PVW, and whether the monitors are SHOWN. Coupling
 * any two is the easiest mistake in the phase and the hardest to notice afterwards, because
 * each pair looks correct in the case one happens to try. So every PAIR is driven here, in
 * BOTH directions — changing A leaves B alone, and changing B leaves A alone — because a
 * single-direction test passes against a coupling that runs the other way.
 *
 * ── HOW EACH TEST WAS TAKEN RED ────────────────────────────────────────────────
 *
 * Six couplings were planted in `App.tsx`, three at a time (`design.md` §12.5): round A
 * wired selection → PVW, selection → monitors and PVW → monitors; round B wired the three
 * reverse directions. Each test below went red under exactly its own coupling and stayed
 * green under the other five, which is what makes the attribution clean.
 *
 * ── WHAT IS READ ───────────────────────────────────────────────────────────────
 *
 * The PVW set is read from the BRIDGE (`rehearse.state()`), never from a badge: the set is
 * bridge state (`R-022`), and a badge is one rendering of it. The selection is read from the
 * row's `aria-pressed` — the one attribute the list uses to claim "you are editing this" —
 * and from the Inspector's existence, which is DERIVED from it. The monitors are read from
 * the strip's presence and the toggle's `aria-expanded`.
 */

const WIDE = { width: 1280, height: 800 };

/** The rows currently in PVW, as the bridge publishes them. */
async function pvwItemIds(page: Page): Promise<string[]> {
  const ids = await page.evaluate(async () => {
    const w = window as unknown as {
      cg: { rehearse: { state: () => Promise<{ itemId: string }[]> } };
    };
    return (await w.cg.rehearse.state()).map((r) => r.itemId);
  });
  return [...ids].sort();
}

async function itemIdOf(page: Page, layer: number): Promise<string> {
  const id = await page.locator(`[data-layer="${String(layer)}"]`).getAttribute('data-item-id');
  expect(id, `row ${String(layer)} carries an item`).not.toBeNull();
  return id ?? '';
}

async function rehearse(page: Page, layer: number): Promise<void> {
  await page
    .locator(`[data-layer="${String(layer)}"]`)
    .getByRole('button', { name: 'ON PVW', exact: true })
    .click();
}

function monitorsToggle(page: Page) {
  return page.getByRole('button', { name: /^(Hide|Show) monitors$/ });
}

function strip(page: Page) {
  return page.locator('[data-monitor-strip]');
}

test.beforeEach(async ({ app }) => {
  await app.page.setViewportSize(WIDE);
});

/* ── PAIR 1: selected ↔ in PVW ─────────────────────────────────────────────── */

test('selecting a row neither adds it to PVW nor removes another from it', async ({ app }) => {
  const page = app.page;
  const a = await app.importVcg('a.vcg', await buildValidVcg('tpl-ind-a'));
  const b = await app.importVcg('b.vcg', await buildValidVcg('tpl-ind-b'));
  await rehearse(page, a);
  const before = await pvwItemIds(page);
  expect(before).toEqual([await itemIdOf(page, a)]);

  // Select B (not in PVW), then A (in PVW), then deselect A: the set never moves.
  await app.selectLayerRow(b);
  await expect(app.layerRow(b)).toHaveAttribute('aria-pressed', 'true');
  expect(await pvwItemIds(page)).toEqual(before);
  await app.selectLayerRow(a);
  await expect(app.layerRow(a)).toHaveAttribute('aria-pressed', 'true');
  expect(await pvwItemIds(page)).toEqual(before);
  await app.selectLayerRow(a);
  await expect(app.layerRow(a)).toHaveAttribute('aria-pressed', 'false');
  expect(await pvwItemIds(page)).toEqual(before);
});

test('putting a row on PVW, or taking it off, neither selects it nor deselects the selected row', async ({
  app,
}) => {
  const page = app.page;
  const a = await app.importVcg('a.vcg', await buildValidVcg('tpl-ind-a'));
  const b = await app.importVcg('b.vcg', await buildValidVcg('tpl-ind-b'));
  await app.selectLayerRow(a);
  await expect(app.layerRow(a)).toHaveAttribute('aria-pressed', 'true');

  await rehearse(page, b);
  await expect.poll(() => pvwItemIds(page)).toEqual([await itemIdOf(page, b)]);
  // A is still the selection, B is not, and the Inspector still edits A.
  await expect(app.layerRow(a)).toHaveAttribute('aria-pressed', 'true');
  await expect(app.layerRow(b)).toHaveAttribute('aria-pressed', 'false');
  await expect(app.inspector).toBeVisible();

  await page
    .locator(`[data-layer="${String(b)}"]`)
    .getByRole('button', { name: 'OFF PVW', exact: true })
    .click();
  await expect.poll(() => pvwItemIds(page)).toEqual([]);
  await expect(app.layerRow(a)).toHaveAttribute('aria-pressed', 'true');
  await expect(app.layerRow(b)).toHaveAttribute('aria-pressed', 'false');
});

/* ── PAIR 2: selected ↔ monitors shown ─────────────────────────────────────── */

test('selecting and deselecting a row leaves the monitors as they were — shown, and hidden', async ({
  app,
}) => {
  const page = app.page;
  const a = await app.importVcg('a.vcg', await buildValidVcg('tpl-ind-a'));
  await expect(strip(page)).toHaveCount(1);
  await expect(monitorsToggle(page)).toHaveAttribute('aria-expanded', 'true');

  await app.selectLayerRow(a);
  await expect(app.inspector).toBeVisible();
  await expect(strip(page)).toHaveCount(1);

  // Hide the monitors, then change the selection both ways: they stay hidden.
  await monitorsToggle(page).click();
  await expect(strip(page)).toHaveCount(0);
  await expect(monitorsToggle(page)).toHaveAttribute('aria-expanded', 'false');
  await app.selectLayerRow(a); // deselect
  await expect(app.inspector).toHaveCount(0);
  await expect(strip(page)).toHaveCount(0);
  await app.selectLayerRow(a); // reselect
  await expect(app.inspector).toBeVisible();
  await expect(strip(page)).toHaveCount(0);
  await expect(monitorsToggle(page)).toHaveAttribute('aria-expanded', 'false');
});

test('hiding and showing the monitors neither deselects the row nor closes its Inspector', async ({
  app,
}) => {
  const page = app.page;
  const a = await app.importVcg('a.vcg', await buildValidVcg('tpl-ind-a'));
  await app.selectLayerRow(a);
  await expect(app.layerRow(a)).toHaveAttribute('aria-pressed', 'true');
  await expect(app.inspector).toBeVisible();

  await monitorsToggle(page).click();
  await expect(strip(page)).toHaveCount(0);
  await expect(app.layerRow(a)).toHaveAttribute('aria-pressed', 'true');
  await expect(app.inspector).toBeVisible();

  await monitorsToggle(page).click();
  await expect(strip(page)).toHaveCount(1);
  await expect(app.layerRow(a)).toHaveAttribute('aria-pressed', 'true');
  await expect(app.inspector).toBeVisible();
});

/* ── PAIR 3: in PVW ↔ monitors shown ───────────────────────────────────────── */

test('putting a row on PVW does not bring hidden monitors back, and taking it off does not hide shown ones', async ({
  app,
}) => {
  const page = app.page;
  const a = await app.importVcg('a.vcg', await buildValidVcg('tpl-ind-a'));

  await monitorsToggle(page).click();
  await expect(strip(page)).toHaveCount(0);
  await rehearse(page, a);
  await expect.poll(() => pvwItemIds(page)).toEqual([await itemIdOf(page, a)]);
  // The row IS on PVW (the bridge says so) and the monitors are STILL hidden: the
  // rehearsal exists whether or not the operator is looking at it.
  await expect(strip(page)).toHaveCount(0);
  await expect(monitorsToggle(page)).toHaveAttribute('aria-expanded', 'false');

  await monitorsToggle(page).click();
  await expect(strip(page)).toHaveCount(1);
  await page
    .locator(`[data-layer="${String(a)}"]`)
    .getByRole('button', { name: 'OFF PVW', exact: true })
    .click();
  await expect.poll(() => pvwItemIds(page)).toEqual([]);
  await expect(strip(page)).toHaveCount(1);
});

test('hiding and showing the monitors leaves the PVW set exactly as it was', async ({ app }) => {
  const page = app.page;
  const a = await app.importVcg('a.vcg', await buildValidVcg('tpl-ind-a'));
  const b = await app.importVcg('b.vcg', await buildValidVcg('tpl-ind-b'));
  await rehearse(page, a);
  await rehearse(page, b);
  const before = await pvwItemIds(page);
  expect(before).toHaveLength(2);

  await monitorsToggle(page).click();
  await expect(strip(page)).toHaveCount(0);
  expect(await pvwItemIds(page)).toEqual(before);
  // …and the rows still SAY so, with the strip gone.
  await expect(
    page
      .locator(`[data-layer="${String(a)}"]`)
      .getByRole('button', { name: 'OFF PVW', exact: true }),
  ).toBeVisible();

  await monitorsToggle(page).click();
  await expect(strip(page)).toHaveCount(1);
  expect(await pvwItemIds(page)).toEqual(before);
});

/* ── The toggle itself, and the guard around it ───────────────────────────── */

test('the toggle folds the strip away and hands its height to the layer list; a fullscreen monitor shows through', async ({
  app,
}) => {
  const page = app.page;
  const layersBefore = await app.layers.boundingBox();
  const stripBox = await strip(page).boundingBox();
  expect(layersBefore).not.toBeNull();
  expect(stripBox).not.toBeNull();

  await monitorsToggle(page).click();
  await expect(strip(page)).toHaveCount(0);
  // No divider for a strip that is not there (guard item 19's own rule, one row up).
  await expect(page.getByRole('separator', { name: 'Resize the monitor strip' })).toHaveCount(0);
  const layersAfter = await app.layers.boundingBox();
  expect(layersAfter).not.toBeNull();
  expect(layersAfter!.height).toBeGreaterThan(layersBefore!.height + stripBox!.height * 0.9);

  // The reset control brings the strip back with everything else (the way out).
  await page.getByRole('button', { name: 'Reset the panel layout' }).click();
  await expect(strip(page)).toHaveCount(1);
  await expect(monitorsToggle(page)).toHaveAttribute('aria-expanded', 'true');
});
