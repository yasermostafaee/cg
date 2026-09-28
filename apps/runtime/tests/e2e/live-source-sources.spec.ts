import type { Page } from '@playwright/test';
import { E2E_PLAYOUT, expect, test } from './fixtures/runtime.js';

/**
 * D-137 / C-015 phase 4, re-cut by `PLAYOUT-SOURCES-01` — the CG Control surfaces that make a live
 * plate resolve.
 *
 * TWO surfaces, and the split is still the subject: Station setup's **Live sources** SHOWS what the
 * Playout offers this station — read-only, because the Playout's operators define the inputs and CG
 * Control never does — and the **Inspector** BINDS a selected template's plates to them, through the
 * one source picker. Nothing reaches air until a plate is bound, and the binding lives beside the
 * template rather than in a global list.
 *
 * Driven against the offline MockRuntime seeded with the fake Playout's list (`E2E_PLAYOUT`): its
 * catalogue is built by the bridge's own builder and its bindings pass the bridge's own rule, so
 * every refusal and every consequence below is the one a real station gives.
 *
 * Maps the `#### Scenario`s of `playout-sources` — "Station setup lists the Playout's inputs,
 * read-only", "A binding is never pruned" — and "A template's plate is ASSIGNED a source, once per
 * template".
 */

test.use({ playoutSources: E2E_PLAYOUT });

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

test('sources: Station setup lists the Playout’s inputs, read-only, and binds nothing', async ({
  app,
}) => {
  const page = app.page;
  const dialog = page.getByRole('dialog', { name: 'Station setup' });

  await registerTwoBox(app);
  await app.openStationSetupAt('Live sources');
  await expect(dialog).toBeVisible();

  // The Playout's inputs, in ITS order, by the names its operators gave them.
  const list = dialog.getByRole('region', { name: 'Inputs from the Playout' });
  const rows = list.locator('[data-source-input]');
  await expect(rows.locator('.cg-resource__name')).toHaveText([
    'Studio 1',
    'Studio 2',
    'Studio 3',
    'دوربین خبر',
    'Multicast',
    'ورودی ۳',
    'ورودی ۴',
  ]);
  // The KIND — the one place it is shown: SDI for a route, NDI, Stream.
  await expect(rows.nth(0).locator('[data-source-kind]')).toHaveText('NDI');
  await expect(rows.nth(3).locator('[data-source-kind]')).toHaveText('Stream');
  await expect(rows.nth(5).locator('[data-source-kind]')).toHaveText('SDI');
  // `ROUTE-PLATES-01` §1.G — the gate is gone: neither route is `Unusable` any more…
  for (const i of [5, 6]) {
    await expect(rows.nth(i)).not.toHaveAttribute('data-source-unusable', '');
  }
  // …`ورودی ۳` carries no mark at all, and `ورودی ۴` only the Playout's own `Unavailable`, its
  // reason on hover…
  await expect(rows.nth(5).locator('.cg-source-tag')).toHaveCount(0);
  await expect(rows.nth(6).getByText('Unavailable', { exact: true })).toHaveAttribute(
    'title',
    'no signal',
  );
  // …and control: a camera is marked neither way.
  await expect(rows.nth(0)).not.toHaveAttribute('data-source-unusable', '');
  await expect(rows.nth(0).locator('.cg-source-tag')).toHaveCount(0);
  // When the Playout's list was last read is said.
  await expect(dialog.locator('[data-sources-read]')).toHaveText(/^Last read /);

  /*
    🔴 §1.E — NO ADDRESS, ANYWHERE ON THE PAGE. `دوربین خبر`'s URL carries a user and password;
    a stream URL, an NDI name and a path are never shown — here or on any other surface.
  */
  const html = await page.content();
  for (const address of ['secret', 'rtsp://', 'udp://', 'STUDIO-PC', 'Media Library']) {
    expect(html, `the page shows ${address}`).not.toContain(address);
  }
  // Control: what IS shown is on the page — the names.
  expect(html).toContain('دوربین خبر');

  // 🔴 Nothing here is DEFINED any more: no Add, no Edit, no Remove.
  await expect(dialog.getByRole('button', { name: /^(Add|Edit|Remove)\b/ })).toHaveCount(0);
  // One job: a registered template's plates appear nowhere here — binding is the Inspector's.
  await expect(dialog.getByText('guest-1')).toHaveCount(0);
  // Media are not this list's: they are chosen in the picker, never listed here.
  await expect(dialog.getByText('کلیپ معرفی')).toHaveCount(0);

  // The BAND is the one catalogue fact the station still owns. It must be disjoint from the
  // operator's candidate bank: the mock's seeded bank starts at 80, so 60–85 reaches into it and
  // the refusal names BOTH ranges rather than merely saying no.
  await dialog.getByLabel('Live source band start layer').fill('60');
  await dialog.getByLabel('Live source band end layer').fill('85');
  await dialog.getByRole('button', { name: 'Apply band' }).click();
  await expect(dialog.getByText(/must stay disjoint/)).toBeVisible();
  await expect(dialog.getByText(/Currently/)).toHaveCount(0);

  // A band clear of the bank is accepted, and the hint states what is in force.
  //
  // ⚠ `LAYER-BANDS-16` — the band clear of BOTH the beds (50–59) and the bank is the plate band.
  await dialog.getByLabel('Live source band start layer').fill('60');
  await dialog.getByLabel('Live source band end layer').fill('79');
  await dialog.getByRole('button', { name: 'Apply band' }).click();
  await expect(dialog.getByText(/Currently 60–79/)).toBeVisible();

  // Durable: the band survives closing and reopening the surface, because the value lives on the
  // bridge (here, the mock's store) and not in the modal — and the list is still the Playout's.
  await app.closeStationSetup();
  await expect(dialog).toBeHidden();
  await app.openStationSetupAt('Live sources');
  await expect(dialog.getByText(/Currently 60–79/)).toBeVisible();
  await expect(rows).toHaveCount(7);
  await app.closeStationSetup();
});

test.describe('a Playout that has shared nothing', () => {
  test.use({ playoutSources: null });

  test('sources: the list says so, plainly — `.111`’s real state today', async ({ app }) => {
    const dialog = app.page.getByRole('dialog', { name: 'Station setup' });
    await app.openStationSetupAt('Live sources');
    await expect(dialog.locator('[data-sources-empty]')).toHaveText('No inputs from the Playout.');
    await expect(dialog.locator('[data-source-input]')).toHaveCount(0);
    // …and it has never been read, which is said too, rather than a time nobody read at.
    await expect(dialog.locator('[data-sources-read]')).toHaveText('Not read yet');
    await app.closeStationSetup();
  });
});

test('plates: the Inspector binds them through the picker, TEMPLATE-wide', async ({ app }) => {
  const page = app.page;

  await registerTwoBox(app);

  // Load the template onto a row and select it — that is what shows its plates.
  const first = await app.loadTemplate(TWO_BOX);
  await app.selectLayerRow(first);
  const plates = app.inspector.locator('[aria-label="Live plates"]');
  await expect(plates).toBeVisible();
  /*
    ⚠ `SOURCE-DEFAULTS-20` — THE SCOPE IS STATED WHERE THE CONTROL IS, and the control is in a
    dialog: the section carries the DOOR, with the COUNT of plates still owed a source on it.
  */
  await expect(plates.locator('[data-open-template-defaults]')).toBeVisible();
  await expect(plates.locator('[data-open-template-defaults]')).toHaveAttribute(
    'data-defaults-needed',
    '2',
  );

  /*
    ── A8: EDIT-THEN-ABANDON ──────────────────────────────────────────

    🔴 A TEMPLATE-wide edit must not reach the bridge the instant a field changes — one stray
    click must not silently change what every other row does. The dialog's own `Cancel` /
    `Save defaults` is the confirmation.
  */
  await app.inspector.locator('[data-open-template-defaults]').click();
  const defaults = page.getByRole('dialog', { name: 'Source defaults' });
  await app.chooseSource(defaults.locator('[data-defaults-select="guest-2"]'), {
    input: 'Studio 2',
  });
  // The field now names the choice — by its NAME, never its id.
  await expect(defaults.locator('[data-defaults-select="guest-2"]')).toContainText('Studio 2');
  await expect(defaults.locator('[data-defaults-select="guest-2"]')).toHaveAttribute(
    'data-picker-value',
    'in-studio-2',
  );
  // WHEN it takes effect, said where the change is made — the dialog's own footer.
  await expect(defaults.locator('[data-defaults-foot]')).toContainText('next take');
  await expect(defaults.locator('[data-defaults-foot]')).toContainText('No playout command');
  // ABANDON: Cancel writes nothing, and the plate is still owed a source.
  await defaults.getByRole('button', { name: 'Cancel' }).click();
  await expect(defaults).toHaveCount(0);
  await expect(plates.locator('[data-open-template-defaults]')).toHaveAttribute(
    'data-defaults-needed',
    '2',
  );

  // ── A8: EDIT-THEN-SAVE ──────────────────────────────────────────
  await app.setTemplateDefault('guest-1', 'Studio 1');
  // In force now: one plate answered, one still owed — and the door says so.
  await expect(plates.locator('[data-open-template-defaults]')).toHaveAttribute(
    'data-defaults-needed',
    '1',
  );
  await app.applyEdits();
  await expect(app.inspector.getByRole('button', { name: 'Discard staged edits' })).toBeDisabled();

  // 🔴 TEMPLATE-LEVEL, pinned rather than trusted: a SECOND row carrying the
  // same template reads back the binding the first one saved.
  const second = await app.loadTemplate(TWO_BOX);
  await app.selectLayerRow(second);
  await expect(app.inspector.locator('[data-open-template-defaults]')).toHaveAttribute(
    'data-defaults-needed',
    '1',
  );
});

test.describe('an input the Playout stopped offering', () => {
  /*
    `Studio 5` was bound as a template default while the Playout listed it, and a later read no
    longer lists it. The binding in the store is the one written THEN — which is why it is put
    there before the page starts rather than through the console: binding it NOW is refused, and
    that refusal is this file's control below.
  */
  test.use({
    playoutSources: {
      ...E2E_PLAYOUT,
      departed: [
        { id: 'studio-5', name: 'Studio 5', producer: { kind: 'ndi', source: 'OLD-PC (Cam)' } },
      ],
    },
  });

  test('🔴 the binding is KEPT, reads Unavailable, and still counts as answered', async ({
    app,
  }) => {
    const page = app.page;
    await page.evaluate((templateId) => {
      localStorage.setItem(
        'cg-runtime:source-assignments',
        JSON.stringify({
          assignments: [{ templateId, plateId: 'guest-1', sourceId: 'in-studio-5' }],
        }),
      );
    }, TWO_BOX);
    await page.reload();
    await registerTwoBox(app);
    const layer = await app.loadTemplate(TWO_BOX);
    await app.selectLayerRow(layer);

    // ONE plate is still owed a source — `guest-1`'s binding was not pruned (ADR 0010 rule 14).
    const door = app.inspector.locator('[data-open-template-defaults]');
    await expect(door).toHaveAttribute('data-defaults-needed', '1');
    await door.click();
    const defaults = page.getByRole('dialog', { name: 'Source defaults' });
    const field = defaults.locator('[data-defaults-select="guest-1"]');
    // …and it is named, by its name, with the amber tag and the reason on hover.
    await expect(field.locator('.cg-source-label__name')).toHaveText('Studio 5');
    await expect(field.locator('.cg-source-tag--unavailable')).toHaveText('Unavailable');
    await expect(field.locator('.cg-source-tag--unavailable')).toHaveAttribute(
      'title',
      "Not in the Playout's input list.",
    );
    // It is not offered as a new choice: the picker lists the Playout's inputs as they stand.
    await field.click();
    const panel = page.getByRole('dialog', { name: 'Choose a source' });
    await expect(panel.getByRole('option', { name: 'Studio 5', exact: true })).toHaveCount(0);
    // Control: the Playout's own inputs ARE offered.
    await expect(panel.getByRole('option', { name: 'Studio 1', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await defaults.getByRole('button', { name: 'Cancel' }).click();

    // Control: binding it ANEW is refused — it can be kept, never newly chosen.
    const refused = await page.evaluate(async (templateId) => {
      const w = window as unknown as {
        cg: {
          sources: { setAssignments: (req: unknown) => Promise<{ ok: boolean; reason?: string }> };
        };
      };
      return w.cg.sources.setAssignments({
        assignments: [
          { templateId, plateId: 'guest-1', sourceId: 'in-studio-5' },
          { templateId, plateId: 'guest-2', sourceId: 'in-studio-5' },
        ],
      });
    }, TWO_BOX);
    expect(refused).toMatchObject({ ok: false, reason: 'source-unusable' });
  });
});

test('library: REMOVE FROM CH n is a different act from the row REMOVE, and it keeps the channel’s Source defaults', async ({
  app,
}) => {
  const page = app.page;

  await registerTwoBox(app);

  // Bind a plate, which is what makes this template the one the reported bug hit:
  // binding requires SELECTING the template, which requires LOADING it onto a row.
  const layer = await app.loadTemplate(TWO_BOX);
  await app.selectLayerRow(layer);
  await app.setTemplateDefault('guest-1', 'Studio 1');

  // ── THE REPORTED BUG: while a row still holds it, the removal is REFUSED …
  await app.openTemplatePicker();
  const picker = app.templatePicker;
  /*
    `UI-POLISH-01` C — the removal is the row's own icon (`Manage` is retired). 🔴
    `CHANNEL-TEMPLATES-01` — it takes the template off the picker's row's CHANNEL (the probe row is
    on channel 1), and the owner named it for that: `Remove <name> from CH n`.
  */
  await picker.getByRole('button', { name: /^Remove two box from CH 1$/ }).click();
  await page.getByRole('button', { name: 'Remove from CH 1', exact: true }).click();
  // … and the reason is IN THE DIALOG. It used to go to the command toast, which
  // is rendered under the modal's backdrop — pressing the button did nothing and
  // said nothing.
  await expect(picker.locator('[data-modal-message]')).toContainText(/still holds? this template/);
  /*
    …and the entry is still listed, because it is still there — in the picker's own list, the
    surface the refusal was raised on; the claim is the same one this line has always made.
  */
  await expect(
    picker.locator(`[data-template-list] [data-template-id="${TWO_BOX}"]`),
  ).toBeVisible();
  /*
    `B-212` — and WHERE: the row by the name the Layers table gives it, with the way
    there beside it, and no nudge toward Remove All. Pressing "Show" closes the picker
    and the table goes to the row — it ends SELECTED, so the Inspector shows it too.
  */
  /*
    ⚠ `MODAL-CHROME-10` ADDENDUM C §C4 — THE REMEDIES MOVED AND THE CLAIM DID NOT. They were
    a block under the list (`[data-in-use-references]`), which made the refusal render on TWO
    surfaces: the sentence pinned above, the way out scrolled away below. Both now live in the
    ONE pinned message region, so this reads the region — and asserts the second surface has
    not come back, which is the half a re-pointed locator would otherwise stop checking.
  */
  const references = picker.locator('[data-modal-message]');
  await expect(references).toContainText(/on the row “Bed \d+” \(layer \d+\)/);
  await expect(picker.locator('[data-in-use-references]')).toHaveCount(0);
  await expect(picker).not.toContainText(/Remove All/i);
  // §C4(e) — `Show` did not say whether anything was about to move on screen or on air.
  await references.getByRole('button', { name: /^Go to Bed \d+ \(layer \d+\)$/ }).click();
  await expect(picker).toHaveCount(0);
  await expect(app.layerRow(layer)).toHaveAttribute('aria-pressed', 'true');

  // Clearing the ROW leaves the LIBRARY untouched — R-021 imports once and reuses.
  await app.layerRow(layer).getByRole('button', { name: 'REMOVE' }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await app.openTemplatePicker();
  await expect(app.templateRow(TWO_BOX)).toBeVisible();

  // ── Now the removal goes through, and its confirm names the channel and the fallout.
  await picker.getByRole('button', { name: /^Remove two box from CH 1$/ }).click();
  const confirm = page.getByRole('dialog', { name: /^Remove .* from CH 1\?$/ });
  await expect(confirm).toContainText('every browser');
  // 🔴 The channel's Source defaults are KEPT now, so the confirm no longer says they go…
  await expect(confirm).not.toContainText(/plate binding/i);
  await confirm.getByRole('button', { name: 'Remove from CH 1', exact: true }).click();

  await expect(app.templateRow(TWO_BOX)).toHaveCount(0);
  await app.closeTemplatePicker();
  // …and they are still there: nothing reads them while CH 1 does not list the template, and a
  // later import on CH 1 finds them again (the owner, 2026-09-28: "ignored, never deleted").
  const kept = await page.evaluate(async (templateId) => {
    const w = window as unknown as {
      cg: {
        sources: {
          assignments: () => Promise<{
            assignments: { templateId: string; plateId: string; sourceId: string }[];
          }>;
        };
      };
    };
    return (await w.cg.sources.assignments()).assignments.filter(
      (a) => a.templateId === templateId,
    );
  }, TWO_BOX);
  expect(kept.map((a) => [a.plateId, a.sourceId])).toEqual([['guest-1', 'in-studio-1']]);
});
