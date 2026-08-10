import { buildValidVcg, expect, test } from './fixtures/runtime.js';

/**
 * D-137 / C-015 phase 2.4 — **ABSENT IS NOT "NONE".**
 *
 * A template's Live Source declaration is derived at the ONE moment the app holds
 * the unpacked scene, and carried on `TemplateInfo`. A template imported by a
 * build that predates that derivation carries no block at all — and nothing left
 * in the product can recover the answer: the scene is discarded after import
 * (`LibraryEntry` is `{ template, html }`) and the bridge parses no HTML.
 *
 * The failure this spec exists to prevent is therefore not a wrong badge; it is
 * the operator loading a template with real holes and getting a black rectangle
 * where a guest should be, with nothing anywhere saying why — because the hole is
 * transparent by design and no error is raised.
 *
 * The legacy record is injected through `templates.import` rather than built as a
 * `.vcg`, deliberately: the import path now ALWAYS emits the block, so no package
 * this build can produce would reproduce the state under test. Registering the
 * `TemplateInfo` directly is the only honest way to stage a pre-carrier record.
 */

const LEGACY_ID = 'tpl-e2e-legacy-carrier';

test('a template imported before Live Sources were recorded reads re-import-required', async ({
  app,
}) => {
  // A real, current import first — its row is the CONTROL. Without it the spec
  // would pass against an implementation that badges every row in the picker.
  const currentId = 'tpl-e2e-current-carrier';
  await app.importVcg('current.vcg', await buildValidVcg(currentId));

  // …and a pre-carrier record beside it, registered through the bridge exactly as
  // an older browser would have.
  await app.page.evaluate(async (templateId) => {
    const w = window as unknown as {
      cg: {
        templates: {
          import: (req: { template: unknown; html: string }) => Promise<unknown>;
        };
      };
    };
    await w.cg.templates.import({
      template: {
        templateId,
        name: 'legacy',
        sourceFileName: 'legacy.vcg',
        templateType: 'lower-third',
        fields: [],
      },
      html: '<!doctype html><html><body>legacy</body></html>',
    });
  }, LEGACY_ID);

  await app.openTemplatePicker();

  // The pre-carrier row says what is true: the answer is unknown, re-import it.
  const legacyRow = app.templateRow(LEGACY_ID);
  await expect(legacyRow).toBeVisible();
  await expect(legacyRow.locator('[data-live-sources="unknown"]')).toHaveCount(1);
  await expect(legacyRow).toContainText('Re-import required');

  // The freshly imported one does NOT — its carrier is present and simply empty,
  // which is a real answer and not a gap.
  const currentRow = app.templateRow(currentId);
  await expect(currentRow.locator('[data-live-sources="none"]')).toHaveCount(1);
  await expect(currentRow).not.toContainText('Re-import required');

  await app.closeTemplatePicker();
});
