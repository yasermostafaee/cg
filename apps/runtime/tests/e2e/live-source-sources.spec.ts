import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/runtime.js';

/**
 * D-137 / C-015 phase 4 — the CG Control surfaces that make a live plate resolve.
 *
 * TWO surfaces, and the split is the subject: the **Live sources** modal DEFINES
 * what lives this installation has; the **Inspector** BINDS a selected template's
 * plates to them. Nothing reaches air until both have been done, and the binding
 * lives beside the template rather than in a global list — a dialog that did both
 * jobs listed every plate in the station before the first source existed.
 *
 * Driven against the offline MockRuntime, which shares the bridge's own
 * validators (`checkSourceCatalog` / `checkSourceAssignments`) and its delete
 * CASCADE (`pruneAssignmentsForCatalog`), so every refusal and every consequence
 * below is the one a real station gives.
 *
 * Maps the `#### Scenario`s of "The installation DEFINES its live sources, and an
 * absent catalog fails CLOSED" and "A template's plate is ASSIGNED a source, once
 * per template".
 */

/** A template that declares two live plates, registered as an import would leave it. */
const TWO_BOX = 'tpl-e2e-two-box';

async function registerTwoBox(app: { page: Page }): Promise<void> {
  // Registered through `templates.import` rather than packed as a `.vcg`: the
  // subject here is the CG Control surfaces, and a real package would drag the
  // whole authoring path in to produce one `TemplateInfo` this can state directly.
  await app.page.evaluate(async (templateId) => {
    const w = window as unknown as {
      cg: { templates: { import: (req: { template: unknown; html: string }) => Promise<unknown> } };
    };
    const rect = { x: 0, y: 0, width: 640, height: 360 };
    await w.cg.templates.import({
      template: {
        templateId,
        name: 'two-box',
        sourceFileName: 'two-box.vcg',
        templateType: 'lower-third',
        fields: [],
        liveSources: {
          resolution: { width: 1920, height: 1080 },
          defaultPosition: { anchor: 'center', dx: 0, dy: 0 },
          sources: [
            { elementId: 'el-1', sourceId: 'guest-1', rect, dynamic: false },
            { elementId: 'el-2', sourceId: 'guest-2', rect, dynamic: false },
          ],
        },
      },
      html: '<!doctype html><html><body>two-box</body></html>',
    });
  }, TWO_BOX);
}

test('sources: an installation defines its lives, and the modal binds nothing', async ({ app }) => {
  const page = app.page;
  const dialog = page.getByRole('dialog', { name: 'Live sources' });

  await registerTwoBox(app);
  await page.getByRole('button', { name: 'Open live sources' }).click();
  await expect(dialog).toBeVisible();

  // NOTHING DEFINED is a real, common and important state, and it is said
  // plainly: an operator whose take refuses must be able to find out why here.
  await expect(dialog.getByText(/Nothing is defined yet/)).toBeVisible();

  // 🔴 The dialog has ONE job. A template with two plates is registered above,
  // and none of it appears here — the binding is the Inspector's.
  await expect(dialog.getByText('TEMPLATE PLATES')).toHaveCount(0);
  await expect(dialog.getByText('guest-1')).toHaveCount(0);

  // Define a source. The bridge is authoritative; the modal adopts only what it
  // accepts, so seeing the row appear IS the round-trip.
  await dialog.getByLabel('New source name').fill('Studio A');
  await dialog.getByRole('button', { name: 'Add' }).click();
  await expect(dialog.getByText(/Nothing is defined yet/)).toHaveCount(0);
  // A fresh entry starts as a route, and the resolved form is shown in the
  // words the bridge will send.
  await expect(dialog.getByText('route://1')).toBeVisible();

  await dialog.getByLabel('Route channel for Studio A').fill('3');
  await expect(dialog.getByText('route://3')).toBeVisible();

  // The FORMAT is a picker and the aspect DERIVES from it — a hand-entered
  // aspect is a number that can be wrong on air while looking reasonable.
  await dialog.getByLabel('Signal format for Studio A').selectOption('1080i5000');
  await expect(dialog.getByText('aspect: 16:9 (from the format)')).toBeVisible();

  // ONE source, a fill/key DEVICE PAIR: the pair is a property of the
  // INSTALLATION, and no template ever names it (design.md §1a).
  await dialog.getByLabel('Producer kind for Studio A').selectOption('decklink');
  await dialog.getByLabel('Decklink key device for Studio A').fill('2');
  await expect(dialog.getByText('DECKLINK DEVICE 1 + KEY 2')).toBeVisible();

  // A duplicate NAME is refused, and the refusal is a SENTENCE — never a wire
  // identifier and never a reason code.
  await dialog.getByLabel('New source name').fill('Studio A');
  await dialog.getByRole('button', { name: 'Add' }).click();
  await expect(dialog.getByText(/Another source already has that name/)).toBeVisible();

  // The band must be disjoint from the operator's candidate bank. The mock's
  // seeded bank starts at 70, so 50–75 reaches into it and the refusal names
  // BOTH ranges rather than merely saying no.
  await dialog.getByLabel('Live source band start layer').fill('50');
  await dialog.getByLabel('Live source band end layer').fill('75');
  await dialog.getByRole('button', { name: 'Apply band' }).click();
  await expect(dialog.getByText(/must stay disjoint/)).toBeVisible();
  await expect(dialog.getByText(/Currently/)).toHaveCount(0);

  // A band clear of the bank is accepted, and the hint states what is in force.
  await dialog.getByLabel('Live source band start layer').fill('10');
  await dialog.getByLabel('Live source band end layer').fill('59');
  await dialog.getByRole('button', { name: 'Apply band' }).click();
  await expect(dialog.getByText(/Currently 10–59/)).toBeVisible();

  // Durable: the catalog survives closing and reopening the surface, because the
  // value lives on the bridge (here, the mock's store) and not in the modal.
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Open live sources' }).click();
  await expect(dialog.getByText('DECKLINK DEVICE 1 + KEY 2')).toBeVisible();
  await expect(dialog.getByText(/Currently 10–59/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Done' }).click();
});

test('plates: the Inspector binds them, TEMPLATE-wide, and a deleted source says which it freed', async ({
  app,
}) => {
  const page = app.page;
  const dialog = page.getByRole('dialog', { name: 'Live sources' });

  await registerTwoBox(app);

  // Two sources to choose between, so the picker is a real choice.
  await page.getByRole('button', { name: 'Open live sources' }).click();
  for (const name of ['Studio A', 'Baku']) {
    await dialog.getByLabel('New source name').fill(name);
    await dialog.getByRole('button', { name: 'Add' }).click();
  }
  await dialog.getByRole('button', { name: 'Done' }).click();

  // Load the template onto a row and select it — that is what shows its plates.
  const first = await app.loadTemplate(TWO_BOX);
  await app.selectLayerRow(first);
  const plates = app.inspector.locator('[aria-label="Live plates"]');
  await expect(plates).toBeVisible();
  // The scope is STATED, because editing here changes every row using the
  // template and an operator must not discover that by surprise.
  await expect(plates).toContainText('Set for the template, not this row');
  await expect(plates.locator('[data-plate-unassigned]')).toHaveCount(2);

  await plates.getByLabel('Source for guest-1').selectOption({ label: 'Studio A' });
  await expect(plates.locator('[data-plate-unassigned]')).toHaveCount(1);

  // 🔴 TEMPLATE-LEVEL, pinned rather than trusted: a SECOND row carrying the
  // same template reads back the binding the first one made.
  const second = await app.loadTemplate(TWO_BOX);
  await app.selectLayerRow(second);
  await expect(app.inspector.getByLabel('Source for guest-1')).toHaveValue(/.+/);
  await expect(
    app.inspector.locator('[aria-label="Live plates"] [data-plate-unassigned]'),
  ).toHaveCount(1);

  // Deleting a source that is in use is ALLOWED, CASCADES, and says at the
  // moment of deletion which plates it freed — an operator who learns at the
  // take is learning too late.
  await page.getByRole('button', { name: 'Open live sources' }).click();
  await dialog.getByRole('button', { name: 'Remove Studio A' }).click();
  await expect(dialog.getByText(/need.* a new one/)).toBeVisible();
  // The template is named the way the operator knows it (the imported file
  // name, cleaned), never by its id.
  await expect(dialog.getByText(/two box \/ guest-1/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Done' }).click();

  // …and the plate is back to needing a source, which is a state the whole
  // feature already handles, rather than a dangling binding nobody can see.
  await expect(
    app.inspector.locator('[aria-label="Live plates"] [data-plate-unassigned]'),
  ).toHaveCount(2);
});
