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

  // C-025 — the FIFTH kind: an internet stream by URL. The kind is labelled as
  // a feed, choosing it shows a URL field, a scheme outside the client's
  // allowlist is refused BY NAME at the config boundary (the mock runs the
  // bridge's own validator, so this refusal is the real station's), and an
  // accepted URL reads back prefixed `stream` — a feed, distinguishable from a
  // clip by a second operator reading the config.
  await dialog.getByLabel('Producer kind for Studio A').selectOption('stream');
  await expect(dialog.getByLabel('Stream URL for Studio A')).toBeVisible();
  await dialog.getByLabel('Stream URL for Studio A').fill('ftp://server/feed.ts');
  await expect(dialog.getByText(/accepted scheme/)).toBeVisible();
  await dialog.getByLabel('Stream URL for Studio A').fill('srt://10.0.0.20:9000');
  await expect(dialog.getByText('stream srt://10.0.0.20:9000')).toBeVisible();

  // ONE source, a fill/key DEVICE PAIR: the pair is a property of the
  // INSTALLATION, and no template ever names it (design.md §1a). The pair is
  // STORED — and, C-027, it is not yet SENT: `producerArgument` emits the fill
  // alone, so the summary must describe the fill alone and the modal must say
  // out loud that the key device does not reach CasparCG. Asserting the absence
  // AND the sentence together is the point: dropping the term without saying
  // anything would trade a line that overclaims for one that hides.
  await dialog.getByLabel('Producer kind for Studio A').selectOption('decklink');
  await dialog.getByLabel('Decklink key device for Studio A').fill('2');
  await expect(dialog.getByText('DECKLINK DEVICE 1', { exact: true })).toBeVisible();
  await expect(dialog.getByText('DECKLINK DEVICE 1 + KEY 2')).toHaveCount(0);
  await expect(
    dialog.getByText(/Key device 2 is stored, but it is not sent to CasparCG/),
  ).toBeVisible();

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
  // value lives on the bridge (here, the mock's store) and not in the modal. The
  // stored `keyDevice` survives with it — C-027 keeps the FIELD precisely so a
  // pair the operator already wrote is not deleted — and the not-sent sentence
  // comes back with it rather than being a one-shot toast at edit time.
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Open live sources' }).click();
  await expect(dialog.getByText('DECKLINK DEVICE 1', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Decklink key device for Studio A')).toHaveValue('2');
  await expect(
    dialog.getByText(/Key device 2 is stored, but it is not sent to CasparCG/),
  ).toBeVisible();
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
  /*
    The scope is STATED, because editing here changes every row using the template and an
    operator must not discover that by surprise.

    ⚠ REWORDED BY SESSION BM-2. It read _"Set for the template, not this row"_ — true of a
    flat map, and a lie about the four-level model, because it says "not this row" while two
    of the four levels ARE this row's. The CLAIM is unchanged: the section says which level
    its own control is on. Only the sentence moved.
  */
  await expect(plates).toContainText('DEFAULT every row using this template starts from');
  await expect(plates.locator('[data-plate-unassigned]')).toHaveCount(2);

  // ── A8: EDIT-THEN-ABANDON ────────────────────────────────────────────────
  // The picker STAGES. Nothing has been written yet, which is the whole point:
  // one stray click must not silently change what every other row does.
  await plates.getByLabel('Source for guest-2').selectOption({ label: 'Baku' });
  await expect(plates.locator('[data-plate-timing]')).toContainText('next take');
  await expect(app.inspector.getByRole('button', { name: 'Discard staged edits' })).toBeEnabled();
  await app.discardEdits();
  await expect(plates.getByLabel('Source for guest-2')).toHaveValue('');
  await expect(plates.locator('[data-plate-timing]')).toHaveCount(0);

  // ── A8: EDIT-THEN-APPLY ──────────────────────────────────────────────────
  await plates.getByLabel('Source for guest-1').selectOption({ label: 'Studio A' });
  // Still only a draft — the unassigned marker is gone because the CONTROL shows
  // the draft, but the assignment is not in force until Update.
  await expect(plates.locator('[data-plate-unassigned]')).toHaveCount(1);
  await app.applyEdits();
  await expect(app.inspector.getByRole('button', { name: 'Discard staged edits' })).toBeDisabled();

  // 🔴 TEMPLATE-LEVEL, pinned rather than trusted: a SECOND row carrying the
  // same template reads back the binding the first one APPLIED.
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

test('library: DELETE FROM STATION is a different verb from the row REMOVE, and it takes the bindings with it', async ({
  app,
}) => {
  const page = app.page;
  const dialog = page.getByRole('dialog', { name: 'Live sources' });

  await registerTwoBox(app);
  await page.getByRole('button', { name: 'Open live sources' }).click();
  await dialog.getByLabel('New source name').fill('Studio A');
  await dialog.getByRole('button', { name: 'Add' }).click();
  await dialog.getByRole('button', { name: 'Done' }).click();

  // Bind a plate, which is what makes this template the one the reported bug hit:
  // binding requires SELECTING the template, which requires LOADING it onto a row.
  const layer = await app.loadTemplate(TWO_BOX);
  await app.selectLayerRow(layer);
  await app.inspector
    .locator('[aria-label="Live plates"]')
    .getByLabel('Source for guest-1')
    .selectOption({ label: 'Studio A' });
  await app.applyEdits();

  // ── THE REPORTED BUG: while a row still holds it, the deletion is REFUSED …
  await app.openTemplatePicker();
  const picker = app.templatePicker;
  await picker.getByRole('button', { name: /Delete two box from this station/ }).click();
  await page.getByRole('button', { name: 'Delete from station', exact: true }).click();
  // … and the reason is IN THE DIALOG. It used to go to the command toast, which
  // is rendered under the modal's backdrop — pressing the button did nothing and
  // said nothing.
  await expect(picker.locator('[data-modal-message]')).toContainText(/still use this template/);
  await expect(app.templateRow(TWO_BOX)).toBeVisible();
  await app.closeTemplatePicker();

  // Clearing the ROW leaves the LIBRARY untouched — R-021 imports once and reuses.
  await app.layerRow(layer).getByRole('button', { name: 'REMOVE' }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await app.openTemplatePicker();
  await expect(app.templateRow(TWO_BOX)).toBeVisible();

  // ── Now the library deletion goes through, and its confirm names the fallout.
  await picker.getByRole('button', { name: /Delete two box from this station/ }).click();
  const confirm = page.getByRole('dialog', { name: /Delete .* from this station\?/ });
  await expect(confirm).toContainText('every browser');
  await expect(confirm).toContainText('1 plate binding');
  await confirm.getByRole('button', { name: 'Delete from station', exact: true }).click();

  await expect(app.templateRow(TWO_BOX)).toHaveCount(0);
  await app.closeTemplatePicker();
});
