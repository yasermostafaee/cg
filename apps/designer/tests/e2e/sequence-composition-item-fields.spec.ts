import { test, expect } from './fixtures/designer.js';

/**
 * D-083 correction — a composition used as a SEQUENCE ITEM exposes its fields to the
 * operator's field form, NAMESPACED per item (reusing D-025 instance-namespacing), so
 * the text next to a clock/logo is editable. Two bindings are distinct:
 *   (A) the item-LIST (rundown) `sequence-items` binding — text-only, disabled when a
 *       composition item is present (its Data key);
 *   (B) per-ELEMENT field binding — the field INSIDE a composition item — must NEVER be
 *       blocked, and is surfaced + live-applied here.
 */
test.describe('Sequence composition-item fields (D-083 correction)', () => {
  test('a composition item exposes its text field to the operator form; setting it updates the preview', async ({
    app,
  }) => {
    await app.newProject('SeqFields');
    // (B) A composition card whose TEXT element is bound to a field — per-element binding,
    // done inside the composition, NOT blocked by anything.
    await app.newComposition('LabelCard');
    await app.openComposition('LabelCard');
    await app.addTextElement({ x: 120, y: 120 });
    await app.setDataKey('city');
    await app.openComposition('comp1');

    // A sequence whose item 1 is the composition card.
    await app.addSequence();
    await app.inspector
      .getByRole('combobox', { name: 'Sequence item 1 type', exact: true })
      .selectOption('composition');
    await app.inspector
      .getByRole('combobox', { name: 'Sequence item 1 composition', exact: true })
      .selectOption({ label: 'LabelCard' });
    await app.setSequenceDwell(30); // keep item 1 on screen long enough to assert

    // The operator's field form surfaces the comp item's field, namespaced per item.
    await app.openPreviewModal();
    await expect(app.previewDialog.getByText('Sequence[0]')).toBeVisible();
    const cityField = app.previewDialog.getByLabel('city');
    await expect(cityField).toBeVisible();
    await cityField.fill('Tehran');

    // Play → the composition item renders with the field value applied to its inner text
    // (the existing composition-field mechanism running inside the sequence item).
    await app.play();
    await expect(app.previewFrame.getByText('Tehran')).toBeVisible({ timeout: 5000 });
    await app.stop();
  });

  test('the item-list guard is scoped to the rundown; per-element text editing is not blocked', async ({
    app,
  }) => {
    await app.newProject('SeqGuard');
    await app.newComposition('Card');
    await app.openComposition('Card');
    await app.addClock();
    await app.openComposition('comp1');

    await app.addSequence();
    await app.inspector
      .getByRole('combobox', { name: 'Sequence item 1 type', exact: true })
      .selectOption('composition');

    // (A) The item-LIST Data key is disabled, but the message is scoped to the rundown —
    // it explicitly says per-item text + composition-item fields stay editable.
    await app.expandDynamicData();
    await expect(app.dataKeyInput).toBeDisabled();
    await expect(app.inspector.getByText(/item list can.t be data-bound/i)).toBeVisible();
    await expect(app.inspector.getByText(/still edit each item.s text/i)).toBeVisible();

    // Per-element editing NOT blocked: a TEXT item's static text stays directly typeable.
    const item2 = app.inspector.getByRole('textbox', { name: 'Sequence item 2', exact: true });
    await item2.fill('Edited headline');
    await expect(item2).toHaveValue('Edited headline');
  });

  // D-083 follow-up — sequences must NOT auto-expose their text items. An UNBOUND text item
  // is static design-time content; only the composition item's fields (and the list binding)
  // surface automatically — consistent with the rest of the app, where operator-editability
  // requires EXPLICIT binding.
  test('an UNBOUND text item is NOT auto-exposed; the composition item field still is', async ({
    app,
  }) => {
    await app.newProject('MixedSeq');
    // A clock+text composition card; its text element is bound to a field 'city'.
    await app.newComposition('ClockCard');
    await app.openComposition('ClockCard');
    await app.addClock();
    await app.addTextElement({ x: 120, y: 200 });
    await app.setDataKey('city');
    await app.openComposition('comp1');

    // A sequence: item 1 = text (the default, UNBOUND), item 2 = the composition card.
    await app.addSequence();
    await app.setSequenceDwell(30);
    await app.inspector
      .getByRole('combobox', { name: 'Sequence item 2 type', exact: true })
      .selectOption('composition');
    await app.inspector
      .getByRole('combobox', { name: 'Sequence item 2 composition', exact: true })
      .selectOption({ label: 'ClockCard' });

    await app.openPreviewModal();
    // The composition item's field DOES surface (its group + inner 'city' field)…
    await expect(app.previewDialog.getByText('Sequence[1]')).toBeVisible();
    await expect(app.previewDialog.getByLabel('city')).toBeVisible();
    // …but the UNBOUND text item (item 1) contributes NOTHING — no auto-exposed field.
    await expect(app.previewDialog.getByLabel('Sequence[0]')).toHaveCount(0);
    await app.stop();
  });

  // PART 2 — an EXPLICITLY-bound text item DOES surface (a plain text item made
  // operator-editable without wrapping it in a composition, via its per-item data key).
  test('an EXPLICITLY-bound text item surfaces in the operator form + edits the right slide', async ({
    app,
  }) => {
    await app.newProject('BoundTextItem');
    await app.newComposition('ClockCard');
    await app.openComposition('ClockCard');
    await app.addClock();
    await app.addTextElement({ x: 120, y: 200 });
    await app.setDataKey('city');
    await app.openComposition('comp1');

    await app.addSequence();
    await app.setSequenceDwell(30);
    await app.inspector
      .getByRole('combobox', { name: 'Sequence item 2 type', exact: true })
      .selectOption('composition');
    await app.inspector
      .getByRole('combobox', { name: 'Sequence item 2 composition', exact: true })
      .selectOption({ label: 'ClockCard' });

    // EXPLICITLY bind the TEXT item (item 1) to a data key via its per-item bind control.
    await app.setSequenceItemDataKey(1, 'headline');

    await app.openPreviewModal();
    // Now the bound text item surfaces as the 'headline' field; the comp item's 'city' too.
    const headline = app.previewDialog.getByLabel('headline');
    await expect(headline).toBeVisible();
    const cityField = app.previewDialog.getByLabel('city');
    await expect(cityField).toBeVisible();

    await headline.fill('Edited headline');
    await cityField.fill('Tehran');

    // Play → item 1 (the bound text) shows the edited headline; advancing reaches item 2
    // (the composition card) showing 'Tehran' — each edit landed on the right slide.
    await app.play();
    await expect(app.previewFrame.getByText('Edited headline')).toBeVisible({ timeout: 5000 });
    await app.next();
    await expect(app.previewFrame.getByText('Tehran')).toBeVisible({ timeout: 5000 });
    await app.stop();
  });
});
