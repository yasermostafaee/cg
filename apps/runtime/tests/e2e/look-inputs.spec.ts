import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/runtime.js';

/**
 * ⭐ **SESSION BO — the Inspector's LOOK INPUTS section, driven through the real UI.**
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 *
 * Session BM-2 built this section and shipped no E2E for it, and said so. Three defects
 * followed that no unit suite could see, because each lived in a SEAM rather than in a
 * component: the mock shim dropping a field, retention dropping the map, and a badge asserting
 * a condition nothing tested. The panel is exercised in jsdom against a hand-built item and the
 * bridge at the AMCP wire — so the one thing never exercised was the operator's actual path.
 *
 * This drives that path: register a looks template, load it, select the row, and read what the
 * panel says. Maps the `#### Scenario`s of "a row composes its looks' inputs" and `B-156`'s
 * "the badge states the row's real state".
 *
 * ⚠ Against the offline MockRuntime, which shares the bridge's validators — so a refusal here
 * is the one a real station gives. What it cannot show is anything about the PLANT.
 */

const LOOKS_TPL = 'tpl-e2e-looks';
const FLAT_TPL = 'tpl-e2e-flat';

/** A template with two looks over two plates — the shape the section exists for. */
async function registerLooksTemplate(app: { page: Page }): Promise<void> {
  await app.page.evaluate(async (templateId) => {
    const w = window as unknown as {
      cg: { templates: { import: (req: { template: unknown; html: string }) => Promise<unknown> } };
    };
    const left = { x: 0, y: 0, width: 960, height: 540 };
    const right = { x: 960, y: 0, width: 960, height: 540 };
    await w.cg.templates.import({
      template: {
        templateId,
        name: 'debate',
        sourceFileName: 'debate.vcg',
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
            {
              id: 'solo',
              name: 'Solo',
              entered: { mode: 'cut' },
              rects: { 'l-1': { x: 0, y: 0, width: 1920, height: 1080 } },
            },
          ],
          defaultLookId: 'two',
        },
      },
      html: '<!doctype html><html><body>debate</body></html>',
    });
  }, LOOKS_TPL);
}

/** …and one with NO looks, which must keep the flat editor it has always had. */
async function registerFlatTemplate(app: { page: Page }): Promise<void> {
  await app.page.evaluate(async (templateId) => {
    const w = window as unknown as {
      cg: { templates: { import: (req: { template: unknown; html: string }) => Promise<unknown> } };
    };
    await w.cg.templates.import({
      template: {
        templateId,
        name: 'flat',
        sourceFileName: 'flat.vcg',
        templateType: 'lower-third',
        fields: [],
        liveSources: {
          resolution: { width: 1920, height: 1080 },
          defaultPosition: { anchor: 'center', dx: 0, dy: 0 },
          sources: [
            {
              elementId: 'el-1',
              sourceId: 'guest-1',
              rect: { x: 0, y: 0, width: 640, height: 360 },
              dynamic: false,
            },
          ],
        },
      },
      html: '<!doctype html><html><body>flat</body></html>',
    });
  }, FLAT_TPL);
}

test('LOOK INPUTS lists every look with its own frames, and the flat template keeps its editor', async ({
  app,
}) => {
  await registerLooksTemplate(app);
  await registerFlatTemplate(app);
  const row = await app.loadTemplate(LOOKS_TPL);
  await app.selectLayerRow(row);

  const looks = app.inspector.locator('[aria-label="Look inputs"]');
  await expect(looks).toBeVisible();

  // BOTH looks at once — the whole point: 2-box's inputs and solo's, side by side, so the
  // operator can compose the one that is off air while the other is on it.
  await expect(looks.locator('[data-look-row="two"]')).toBeVisible();
  await expect(looks.locator('[data-look-row="solo"]')).toBeVisible();
  // Each look offers only ITS OWN frames. `l-2` is not in solo.
  await expect(looks.locator('[data-look-binding="two:l-1"]')).toBeVisible();
  await expect(looks.locator('[data-look-binding="two:l-2"]')).toBeVisible();
  await expect(looks.locator('[data-look-binding="solo:l-1"]')).toBeVisible();
  await expect(looks.locator('[data-look-binding="solo:l-2"]')).toHaveCount(0);

  /*
    §3d — THE DEFAULT IS NAMED INSIDE THE CONTROL THAT INHERITS IT. The blank option used to
    read "— template default —" and the section pointed UPWARD at the LIVE PLATES list for what
    that meant. A default the operator cannot see is a value they cannot reason about.
  */
  await expect(looks.locator('[data-look-binding="two:l-1"]')).toContainText('template default');

  /*
    ⚠ §2.1 — A TEMPLATE WITH NO LOOKS GETS NO LOOK INPUTS SECTION, and must therefore keep its
    flat editor. This is the case that makes the section conditional rather than a replacement:
    it is the commonest installation, and it has no other way to point a plate.
  */
  const flatRow = await app.loadTemplate(FLAT_TPL);
  await app.selectLayerRow(flatRow);
  await expect(app.inspector.locator('[aria-label="Look inputs"]')).toHaveCount(0);
  await expect(app.inspector.locator('[aria-label="Live plates"]')).toBeVisible();
});

test('🔴 B-156 — a LOADED row does not claim air; the badge names what is actually true', async ({
  app,
}) => {
  /*
    The owner's report, through the real UI: `ON AIR NOW` in the Inspector beside `READY` in the
    layer table. The badge was gated on which look the ROW IS SET TO, which is true the moment a
    row is loaded — it never tested whether anything was playing.
  */
  await registerLooksTemplate(app);
  const row = await app.loadTemplate(LOOKS_TPL);
  await app.selectLayerRow(row);

  const badge = app.inspector.locator('[data-look-live="two"]');
  await expect(badge).toBeVisible();
  // 🔴 THE ASSERTION. Loaded is not on air, and the words must not say it is.
  await expect(badge).not.toContainText('ON AIR');
  await expect(badge).toHaveAttribute('data-look-badge', 'not-on-air');
  // …and it still marks the look, so the operator can tell which one a take would show.
  await expect(badge).toContainText('TAKE');
});
