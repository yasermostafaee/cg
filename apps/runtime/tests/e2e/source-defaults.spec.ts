import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/runtime.js';

/**
 * 🔴 `SOURCE-DEFAULTS-20` §4 — **WHAT MUST STILL BE TRUE AFTER THE MOVE.**
 *
 * The editor for a template's source defaults left the Inspector for a dialog. The values, the
 * store and the channel are unchanged, so the two safety properties the old surface had must
 * survive the move — and "must survive" is not a thing to assert by reading the diff:
 *
 *   1. **ROW OVERRIDES REMAIN SEPARATE.** Changing a default must not touch a row that
 *      overrode that plate, and must move the ones that inherit.
 *   2. **AN ON-AIR ROW THAT INHERITS DOES NOT RE-POINT A PLATE ALREADY SEATED.** The change
 *      takes effect at the next seat — the next take, or the next look that seats that frame.
 *
 * ⚠ **WHAT THIS FILE IS AND IS NOT EVIDENCE FOR.** It drives the OPERATOR'S PATH through the
 * new dialog against the offline MockRuntime, which shares the bridge's own validators. The
 * AMCP-level proof that an assignment edit reaches no wire lives where the wire is —
 * `tools/caspar-bridge/tests/assignment-freeze.integration.test.ts` (a look switch after an
 * edit carries no producer change; the re-take adopts it) and
 * `live-look-reconcile.integration.test.ts` ("the assignment reaches no wire of its own").
 * Those are not duplicated here; what is new is the DIALOG as the writer, so that is what is
 * exercised.
 */

const SOURCES = [
  { id: 'src-a', name: 'Studio A', producer: { kind: 'route', channel: 2 } },
  { id: 'src-b', name: 'Studio B', producer: { kind: 'route', channel: 3 } },
] as const;

async function defineSources(page: Page): Promise<void> {
  const res = await page.evaluate(
    async (sources) => {
      const w = window as unknown as {
        cg: { sources: { setConfig: (r: unknown) => Promise<{ ok: boolean; message?: string }> } };
      };
      return w.cg.sources.setConfig({ sources });
    },
    SOURCES as unknown as unknown[],
  );
  expect(res.ok, `the catalogue was accepted: ${res.message ?? ''}`).toBe(true);
}

/** A template with two plates and one look, registered as an import would leave it. */
async function registerTwoBox(page: Page, templateId: string): Promise<void> {
  await page.evaluate(async (id) => {
    const w = window as unknown as {
      cg: { templates: { import: (r: { template: unknown; html: string }) => Promise<unknown> } };
    };
    const rect = { x: 0, y: 0, width: 640, height: 360 };
    const sources = [
      { elementId: 'el-1', sourceId: 'guest-1', rect, dynamic: false },
      { elementId: 'el-2', sourceId: 'guest-2', rect, dynamic: false },
    ];
    await w.cg.templates.import({
      template: {
        templateId: id,
        name: id,
        sourceFileName: `${id}.vcg`,
        templateType: 'lower-third',
        fields: [],
        liveSources: {
          resolution: { width: 1920, height: 1080 },
          defaultPosition: { anchor: 'center', dx: 0, dy: 0 },
          sources,
          defaultLookId: 'both',
          looks: [
            {
              id: 'both',
              name: 'Both',
              rects: { 'guest-1': rect, 'guest-2': rect },
            },
          ],
        },
      },
      html: '<!doctype html><html><body>two-box</body></html>',
    });
  }, templateId);
}

/** Open the defaults dialog, set one plate, and save. */
async function setDefault(
  app: { page: Page; inspector: ReturnType<Page['locator']> },
  plateId: string,
  label: string,
): Promise<void> {
  await app.inspector.locator('[data-open-template-defaults]').click();
  const dialog = app.page.getByRole('dialog', { name: 'Source defaults' });
  await expect(dialog).toBeVisible();
  await dialog.locator(`[data-defaults-select="${plateId}"]`).selectOption({ label });
  await dialog.locator('[data-defaults-save]').click();
  await expect(dialog).toHaveCount(0);
}

test('🔴 §4.1 — a ROW OVERRIDE survives a default change, and the inheriting plate moves', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 900 });
  await defineSources(page);
  const templateId = 'tpl-defaults-override';
  await registerTwoBox(page, templateId);
  const row = await app.loadTemplate(templateId);
  await app.selectLayerRow(row);

  // Both plates start on the SAME default.
  await setDefault(app, 'guest-1', 'Studio A');
  await setDefault(app, 'guest-2', 'Studio A');

  /*
    THE OVERRIDE: this ROW, in this look, pins `guest-1` to Studio B. Level 3 of the chain —
    above the template default and below an emergency patch.
  */
  const looks = app.inspector.locator('[aria-label="Look inputs"]');
  await looks.locator('[data-look-binding="both:guest-1"]').selectOption({ label: 'Studio B' });
  await app.applyEdits();
  await expect
    .poll(() => looks.locator('[data-look-binding="both:guest-1"]').inputValue())
    .toBe('src-b');

  // …now move the TEMPLATE default for BOTH plates to Studio B → A is the new default.
  await setDefault(app, 'guest-1', 'Studio B');
  await setDefault(app, 'guest-2', 'Studio B');

  /*
    🔴 THE CLAIM. `guest-1` is overridden on this row, so its value is untouched by anything
    the dialog did — it still reads the operator's own choice, not the new default.
  */
  await expect(
    looks.locator('[data-look-binding="both:guest-1"]'),
    'the row override is untouched by a default change',
  ).toHaveValue('src-b');

  /*
    …AND THE POSITIVE CONTROL, without which the assertion above is worthless: the plate that
    is NOT overridden must have MOVED to the new default. A dialog that wrote nothing at all
    would pass the first assertion and fail this one.

    The inheriting plate shows its default inside the control that inherits it — the blank
    option NAMES it — so the change is read there rather than from the store.
  */
  await expect(
    looks.locator('[data-look-binding="both:guest-2"] option[value=""]'),
    'the inheriting plate follows the new default',
  ).toHaveText('Default (Studio B)');
});

test('🔴 §4.2 — changing a default while a row is ON AIR sends nothing and re-points nothing', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 900 });
  await defineSources(page);
  const templateId = 'tpl-defaults-onair';
  await registerTwoBox(page, templateId);
  const row = await app.loadTemplate(templateId);
  await app.selectLayerRow(row);
  await setDefault(app, 'guest-1', 'Studio A');
  await setDefault(app, 'guest-2', 'Studio A');

  // ON AIR. The take is what SEATS the plates, and what FREEZES the assignment it resolved.
  await app.layerRow(row).getByRole('button', { name: 'PLAY' }).click();
  await expect(app.layerRow(row).getByText('ON AIR')).toBeVisible({ timeout: 3000 });

  /*
    Count everything the page could send that reaches a graphic. Installed AFTER the take, so
    the take's own traffic is not what is being measured — the question is only what the
    DIALOG causes.
  */
  await page.evaluate(() => {
    const w = window as unknown as {
      __stackCalls: string[];
      cg: { stack: Record<string, unknown> };
    };
    w.__stackCalls = [];
    for (const name of Object.keys(w.cg.stack)) {
      const orig = w.cg.stack[name];
      if (typeof orig !== 'function') continue;
      w.cg.stack[name] = (...args: unknown[]) => {
        w.__stackCalls.push(name);
        return (orig as (...a: unknown[]) => unknown).apply(w.cg.stack, args);
      };
    }
  });

  // THE EDIT, on a live row, through the dialog.
  await setDefault(app, 'guest-1', 'Studio B');

  /*
    🔴 THE CLAIM: not one stack intent. An assignment is read when a row is TAKEN; it never
    re-composites the graphic already on the channel, and `setSourceAssignments` on the bridge
    validates, assigns and emits — it reconciles nothing.
  */
  expect(
    await page.evaluate(() => (window as unknown as { __stackCalls: string[] }).__stackCalls),
    'a default change must reach no stack intent at all while a row is on air',
  ).toEqual([]);

  /*
    …and the row is still resolving what its take froze. The Inspector says so ON the row,
    which is the surface that had to survive the move: `this row: <source> (frozen at take)`.
  */
  const plates = app.inspector.locator('[aria-label="Live plates"]');
  await expect(
    plates.locator('[data-plate-frozen="guest-1"]'),
    'the row states that it is still on what it froze',
  ).toBeVisible();
  await expect(plates.locator('[data-plate-frozen="guest-1"]')).toContainText('Studio A');

  /*
    ⚠ THE POSITIVE CONTROL FOR THE SPY. Every assertion above is "nothing happened", which is
    TRUE and WORTHLESS of a spy that was never wired. A verb that DOES send must be seen.
  */
  await app.layerRow(row).getByRole('button', { name: 'STOP' }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __stackCalls: string[] }).__stackCalls))
    .not.toEqual([]);
});
