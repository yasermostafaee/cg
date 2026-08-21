import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/runtime.js';

/**
 * ⭐ **SESSION BP — A ROW ON AIR DOES NOT CHANGE ITS PICTURE BECAUSE SOMEBODY EDITED
 * CONFIGURATION, driven through the real UI.**
 *
 * ── WHAT THIS FILE ADDS THAT THE BRIDGE TESTS CANNOT ────────────────────────
 *
 * `assignment-freeze.integration.test.ts` proves the freeze on the AMCP wire, which is the
 * half that decides what goes to air. It cannot see the half that decides whether the
 * operator can TELL: the LIVE PLATES picker shows the template's CURRENT assignment, so on a
 * frozen row it shows a value the row is not resolving. Unsaid, that is a surface that is
 * confidently wrong — the operator edits the default, the panel agrees, nothing on air moves,
 * and there is nothing anywhere to explain the gap.
 *
 * So this drives the operator's actual path: take a row, edit the template default from
 * outside it, and read what the panel says.
 *
 * ⚠ Against the offline MockRuntime, which models the freeze's LIFETIME (pinned at take,
 * thawed at a landed out/stop, dropped at remove) and publishes the field, but seats no
 * producers. What it cannot show is anything about the PLANT.
 */

const TPL = 'tpl-e2e-freeze';

/** A two-plate looks template — the shape the assignment editor is for. */
async function registerTemplate(app: { page: Page }): Promise<void> {
  await app.page.evaluate(async (templateId) => {
    const w = window as unknown as {
      cg: {
        templates: { import: (req: { template: unknown; html: string }) => Promise<unknown> };
        sources: {
          setConfig: (req: unknown) => Promise<{ ok: boolean }>;
          setAssignments: (req: unknown) => Promise<{ ok: boolean }>;
        };
      };
    };
    const left = { x: 0, y: 0, width: 960, height: 540 };
    const right = { x: 960, y: 0, width: 960, height: 540 };
    await w.cg.sources.setConfig({
      sources: [
        { id: 'studio-a', name: 'Studio A', producer: { kind: 'route', channel: 2 } },
        { id: 'studio-b', name: 'Studio B', producer: { kind: 'route', channel: 3 } },
      ],
      layerRange: { start: 30, end: 39 },
    });
    await w.cg.sources.setAssignments({
      assignments: [
        { templateId, plateId: 'l-1', sourceId: 'studio-a' },
        { templateId, plateId: 'l-2', sourceId: 'studio-b' },
      ],
    });
    await w.cg.templates.import({
      template: {
        templateId,
        name: 'freeze',
        sourceFileName: 'freeze.vcg',
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
      html: '<!doctype html><html><body>freeze</body></html>',
    });
  }, TPL);
}

/**
 * Take this template’s row, by the itemId the published snapshot gives it.
 *
 * ⚠ Found by TEMPLATE, not by layer: the mock publishes no `slot` for a merely LOADED row
 * (a slot is reserved when something is on it), so a layer-keyed lookup finds nothing at
 * exactly the moment this helper is called. The template id is the stable handle here
 * because this spec loads it once.
 */
async function takeRow(app: { page: Page }): Promise<void> {
  const accepted = await app.page.evaluate(async (templateId) => {
    const w = window as unknown as {
      cg: {
        stack: {
          snapshot: () => Promise<{ itemId: string; templateId: string }[]>;
          take: (req: { itemId: string }) => Promise<{ accepted: boolean }>;
        };
      };
    };
    const rows = await w.cg.stack.snapshot();
    const row = rows.find((r) => r.templateId === templateId);
    if (row === undefined) return false;
    return (await w.cg.stack.take({ itemId: row.itemId })).accepted;
  }, TPL);
  expect(accepted, 'the row must take').toBe(true);
}

/**
 * 🔴 THE EDIT, MADE FROM OUTSIDE THIS ROW'S PANEL — which is the whole point.
 *
 * The assignment is TEMPLATE-wide and INSTALLATION-wide, so the writer can be another row's
 * Inspector or another station's Runtime against the same bridge. That is why disabling the
 * editor on an on-air row was not enough, and it is why this goes through the bridge API
 * rather than through the picker: the picker is one of many possible writers.
 */
async function repointFromElsewhere(app: { page: Page }): Promise<void> {
  const ok = await app.page.evaluate(async (templateId) => {
    const w = window as unknown as {
      cg: { sources: { setAssignments: (req: unknown) => Promise<{ ok: boolean }> } };
    };
    const res = await w.cg.sources.setAssignments({
      assignments: [
        { templateId, plateId: 'l-1', sourceId: 'studio-b' },
        { templateId, plateId: 'l-2', sourceId: 'studio-b' },
      ],
    });
    return res.ok;
  }, TPL);
  expect(ok, 'the assignment edit must be accepted — it is legal, just late').toBe(true);
}

test('🔴 an ON-AIR row says what it is FROZEN on when the template default is edited under it', async ({
  app,
}) => {
  await registerTemplate(app);
  const row = await app.loadTemplate(TPL);
  await takeRow(app);
  await app.selectLayerRow(row);

  const plates = app.inspector.locator('[aria-label="Live plates"]');
  await expect(plates).toBeVisible();
  // Nothing diverges yet, so the panel says nothing. Silence is the common case.
  await expect(plates.locator('[data-plate-frozen="l-1"]')).toHaveCount(0);

  await repointFromElsewhere(app);

  /*
    🔴 THE ASSERTION. The picker moves to the new default — it is the control for the
    TEMPLATE, and it is also the baseline a staged draft is dirty against, so it must keep
    showing the live value. What must NOT happen is the panel implying that value is on air.
  */
  await expect(plates.locator('select[aria-label="Source for l-1"]')).toHaveValue('studio-b');
  const said = plates.locator('[data-plate-frozen="l-1"]');
  await expect(said).toBeVisible();
  await expect(said).toContainText('Studio A');
  await expect(said).toContainText('frozen at take');

  // ⚠ `l-2` was already Studio B and still is, so it does NOT acquire a line. The statement
  // is per-plate and only where the two actually disagree, or it becomes noise.
  await expect(plates.locator('[data-plate-frozen="l-2"]')).toHaveCount(0);
});

test('an OFF-AIR row is not pinned: the edit is simply what it will take', async ({ app }) => {
  /*
    The freeze must not turn a LOADED row into one that ignores configuration — only a row
    with a picture has one to protect. This is what the panel has always promised for an
    off-air row, and it is the half that makes the assignment editor still work.
  */
  await registerTemplate(app);
  const row = await app.loadTemplate(TPL);
  await app.selectLayerRow(row);

  await repointFromElsewhere(app);

  const plates = app.inspector.locator('[aria-label="Live plates"]');
  await expect(plates.locator('select[aria-label="Source for l-1"]')).toHaveValue('studio-b');
  await expect(plates.locator('[data-plate-frozen="l-1"]')).toHaveCount(0);
});
