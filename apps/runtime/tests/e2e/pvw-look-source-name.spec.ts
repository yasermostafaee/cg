import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/runtime.js';

/**
 * ⭐ **SESSION BQ — PVW NAMES WHAT A TAKE WOULD SHOW, IN THIS LOOK.**
 *
 * ── THE OWNER'S REPORT, 2026-08-21, with a screenshot ───────────────────────
 *
 * A row is ON PVW, PVW LOOK = `look-1`. In LOOK INPUTS he sets that look's plate to
 * **studio 3** and presses UPDATE. **The PVW placeholder still reads "studio 1"** — the
 * template's default. The binding is applied everywhere else; the preview names the old
 * source.
 *
 * That strikes at `R-049`'s stated reason for existing: _"It does what the PAGE never could:
 * show the ASSIGNED SOURCE'S NAME… The Runtime knows the join."_ The join it drew was the
 * wrong one.
 *
 * ── WHY AN E2E AND NOT ONLY THE UNIT TESTS ──────────────────────────────────
 *
 * `tests/livePlateGeometry.test.ts` pins the resolution itself, over all four levels, and
 * `live-look-bindings.test.ts` pins that the bridge and this overlay answer from the SAME
 * function. Neither exercises the operator's path: the Inspector staging a per-look binding,
 * UPDATE sending it, the bridge publishing it back, and the PVW overlay re-rendering from
 * the published item. That chain is where the look dimension was being dropped, and it is
 * the one this drives.
 *
 * ⚠ Against the offline MockRuntime, which shares the bridge's validators. What it cannot
 * show is anything about the PLANT.
 */

const TPL = 'tpl-e2e-pvw-looks';

const LEFT = { x: 0, y: 0, width: 960, height: 540 };
const RIGHT = { x: 960, y: 0, width: 960, height: 540 };
const FULL = { x: 0, y: 0, width: 1920, height: 1080 };

/** The offline mock retains no page, so PVW needs a stand-in to have a frame at all. */
async function stubRetainedPage(page: Page): Promise<void> {
  await page.evaluate(() => {
    (
      window as unknown as { cg: { templates: { html: () => Promise<string> } } }
    ).cg.templates.html = () =>
      Promise.resolve(
        `<!doctype html><html><head><style>
           html,body{width:1920px;height:1080px;margin:0;overflow:hidden;background:transparent}
           .cg-stage{position:absolute;inset:0}
         </style></head><body><div class="cg-stage"></div>
         <script>window.play=function(){};window.stop=function(){};
                 window.update=function(){};window.next=function(){};</script>
         </body></html>`,
      );
  });
}

/** Two sources, and a two-look template whose `l-1` appears in BOTH looks. */
async function setUp(page: Page): Promise<void> {
  await page.evaluate(
    async ({ templateId, left, right, full }) => {
      const w = window as unknown as {
        cg: {
          templates: { import: (req: { template: unknown; html: string }) => Promise<unknown> };
          sources: {
            setConfig: (req: unknown) => Promise<{ ok: boolean }>;
            setAssignments: (req: unknown) => Promise<{ ok: boolean }>;
          };
        };
      };
      await w.cg.sources.setConfig({
        sources: [
          { id: 'studio-1', name: 'Studio 1', producer: { kind: 'route', channel: 2 } },
          { id: 'studio-3', name: 'Studio 3', producer: { kind: 'route', channel: 4 } },
        ],
        layerRange: { start: 30, end: 39 },
      });
      // The TEMPLATE DEFAULT — level 2. This is the name the overlay used to show in
      // every look, whatever the operator bound.
      await w.cg.sources.setAssignments({
        assignments: [
          { templateId, plateId: 'l-1', sourceId: 'studio-1' },
          { templateId, plateId: 'l-2', sourceId: 'studio-1' },
        ],
      });
      await w.cg.templates.import({
        template: {
          templateId,
          name: 'pvw-looks',
          sourceFileName: 'pvw-looks.vcg',
          templateType: 'lower-third',
          fields: [],
          liveSources: {
            resolution: { width: 1920, height: 1080 },
            defaultPosition: { anchor: 'center', offset: { x: 0, y: 0 } },
            sources: [
              { elementId: 'el-1', sourceId: 'l-1', rect: left, dynamic: false },
              { elementId: 'el-2', sourceId: 'l-2', rect: right, dynamic: false },
            ],
            looks: [
              {
                id: 'look-1',
                name: '2-box',
                entered: { mode: 'cut' },
                rects: { 'l-1': left, 'l-2': right },
              },
              { id: 'look-2', name: 'Solo', entered: { mode: 'cut' }, rects: { 'l-1': full } },
            ],
            defaultLookId: 'look-1',
          },
        },
        html: '<!doctype html><html><body>pvw-looks</body></html>',
      });
    },
    { templateId: TPL, left: LEFT, right: RIGHT, full: FULL },
  );
}

const marker = (page: Page, plateId: string) => page.locator(`[data-live-plate="${plateId}"]`);

async function rehearseRow(page: Page, layer: number): Promise<void> {
  await page
    .locator(`[data-layer="${String(layer)}"]`)
    .getByRole('button', { name: 'ON PVW', exact: true })
    .click();
}

test('🔴 the PVW placeholder names the PER-LOOK binding, not the template default', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1600, height: 900 });

  await setUp(page);
  await stubRetainedPage(page);
  const layer = await app.loadTemplate(TPL);
  await rehearseRow(page, layer);
  await app.selectLayerRow(layer);

  // Before the operator binds anything: the template default, which was always right.
  await expect(marker(page, 'l-1')).toContainText('Studio 1');

  /*
    THE OPERATOR'S ACTION, through the real Inspector: pick this look's input and UPDATE.
    Deliberately driven through the UI rather than through a bridge call — the defect lived
    between the published item and the overlay, so a shortcut past the panel would skip it.
  */
  const looks = app.inspector.locator('[aria-label="Look inputs"]');
  await expect(looks).toBeVisible();
  await looks.locator('[data-look-binding="look-1:l-1"]').selectOption('studio-3');
  await app.applyEdits();

  // 🔴 THE ASSERTION. Before this session the placeholder kept reading "Studio 1" — the
  // owner's screenshot — because the overlay's name lookup had no look dimension in it.
  await expect(marker(page, 'l-1')).toContainText('Studio 3');
  // …and the plate the operator did NOT touch is untouched.
  await expect(marker(page, 'l-2')).toContainText('Studio 1');
});

test('the name follows a PVW LOOK switch, not just the boxes', async ({ app }) => {
  /*
    The half the old signature could not express at all: one plate, two looks, two names.
    `B-151` taught this overlay that the RECTS follow the look; this is the same lesson for
    the NAMES, which is why the filing cross-references it in both directions.
  */
  const page = app.page;
  await page.setViewportSize({ width: 1600, height: 900 });

  await setUp(page);
  await stubRetainedPage(page);
  const layer = await app.loadTemplate(TPL);
  await rehearseRow(page, layer);
  await app.selectLayerRow(layer);

  const looks = app.inspector.locator('[aria-label="Look inputs"]');
  await looks.locator('[data-look-binding="look-1:l-1"]').selectOption('studio-3');
  await app.applyEdits();
  await expect(marker(page, 'l-1')).toContainText('Studio 3');

  // Switch the PVW look. `look-2` has NO binding for `l-1`, so it falls through to the
  // template default — and the name must move with the look.
  await page
    .locator(`[data-layer="${String(layer)}"]`)
    .locator('[data-look-picker]')
    .locator('[data-look-id="look-2"]')
    .click();

  await expect(marker(page, 'l-1')).toContainText('Studio 1');
  // …and `l-2` is not in `look-2` at all, so it has no placeholder — absence, not a
  // zero-area box (BB's lesson, asserted here for the same reason).
  await expect(marker(page, 'l-2')).toHaveCount(0);
});
