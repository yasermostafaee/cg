import { test, expect } from './fixtures/designer.js';

/**
 * D-029 — the sequence/now-next scenarios driven through the real UI.
 * Frame-precise motion/dwell math lives in @cg/template-runtime unit tests;
 * this guards the integrated path: tool → canvas static item 1 → auto
 * advance in the preview → the transport's Next control (the real
 * runtime.next()) → transition presets → a finite run ending a
 * content-driven hold → data key → live preview items (with dwell).
 */

// D-082 — the default sequence items are English (see element-defaults.ts defaultSequence).
const ITEM_1 = 'Now: first item';
const ITEM_2 = 'Then: second item';
const ITEM_3 = 'Next: third item';

test.describe('Sequence / now-next element (D-029)', () => {
  test('author → item 1 on canvas → auto-advance in the preview → Next advances immediately', async ({
    app,
  }) => {
    await app.newProject('Sequence');
    await app.addSequence();

    // The inspector shows the sequence config (Push up preset) + the
    // time-driven note.
    await expect(app.inspector.getByRole('combobox', { name: 'transition' })).toHaveValue(
      'push-up',
    );
    await expect(app.inspector.getByText('Time-driven', { exact: false })).toBeVisible();

    // The authoring canvas statically shows item 1 only.
    const canvasFrame = app.page.frameLocator('iframe[title="cgpreview"]');
    await expect(canvasFrame.getByText(ITEM_1)).toBeVisible();
    await expect(canvasFrame.getByText(ITEM_2)).toBeHidden();

    // Speed the rotation up, then play: item 2 must arrive ON ITS OWN.
    await app.setSequenceDwell(0.8);
    await app.openPreviewModal();
    await app.play();
    await expect(app.previewFrame.getByText(ITEM_2)).toBeVisible({ timeout: 5000 });

    // The transport's Next control is ENABLED for a sequence scene and
    // advances immediately (the preview runtime's real next()).
    await app.next();
    await expect(app.previewFrame.getByText(ITEM_3)).toBeVisible({ timeout: 2000 });
    await app.stop();
  });

  test('switching the preset to "Slide left" still pages (sequential out-then-in)', async ({
    app,
  }) => {
    await app.newProject('SequenceSlide');
    await app.addSequence();
    await app.inspector.getByRole('combobox', { name: 'transition' }).selectOption('slide-left');
    // The preset wrote the three decomposed fields.
    await expect(app.inspector.getByRole('combobox', { name: 'in', exact: true })).toHaveValue(
      'right',
    );
    await expect(app.inspector.getByRole('combobox', { name: 'out', exact: true })).toHaveValue(
      'left',
    );
    await expect(app.inspector.getByRole('combobox', { name: 'timing', exact: true })).toHaveValue(
      'sequential',
    );
    await app.setSequenceDwell(0.8);
    await app.openPreviewModal();
    await app.play();
    await expect(app.previewFrame.getByText(ITEM_2)).toBeVisible({ timeout: 5000 });
    await app.stop();
  });

  test('a finite run (repeat 1) COMPLETES a content-driven hold — the stage exits on its own', async ({
    app,
  }) => {
    await app.newProject('SequenceFinite');
    await app.addSequence();
    await app.setSequenceDwell(0.5);
    await app.inspector.getByRole('combobox', { name: 'repeat' }).selectOption('count');
    // Passes defaults to 1 on the switch — the run is 3 dwells + 2 transitions.
    await app.setPlayoutTiming('auto-out');
    await app.setHoldSource('content-driven');

    await app.openPreviewModal();
    await app.play();
    // Past the last item the run completes → outro → settled hidden, with NO
    // stop() sent (the same invariant as the finite ticker).
    await expect(app.previewFrame.locator('body')).toHaveClass(/cg-pending/, {
      timeout: 20_000,
    });
  });

  test('data key → preview items editor (with the dwell column) live-updates the stage', async ({
    app,
  }) => {
    await app.newProject('SequenceData');
    await app.addSequence();
    await app.setDataKey('rundown');
    await expect(app.dataKeyInput).toHaveValue('rundown');

    await app.openPreviewModal();
    // The bound list renders the shared items editor INCLUDING the per-item
    // dwell column (sequence-bound lists only).
    const firstItem = app.tickerItemInput('rundown', 1, app.previewDialog);
    await expect(firstItem).toHaveValue(ITEM_1);
    await expect(
      app.previewDialog.getByLabel('rundown item 1 dwell', { exact: true }),
    ).toBeVisible();

    // Editing the CURRENT item corrects it in place on the stage (never yanked).
    // D-087 — the stage is blank until Play; play reveals item 1 carrying the edit.
    await firstItem.fill('Now: breaking news');
    await app.play();
    await expect(app.previewFrame.getByText('Now: breaking news')).toBeVisible();
    await app.stop();
  });
});
