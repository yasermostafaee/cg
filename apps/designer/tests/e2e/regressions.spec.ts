import { test, expect } from './fixtures/designer.js';

/**
 * E2E regressions for recently-fixed bugs (P-005). Each maps a fixed behavior to a
 * UI-observable check. Frame-precise / store-precise internals (e.g. exact cascade
 * hold frames, keyframe value capture) stay in the deterministic unit tests; here we
 * guard the INTEGRATED UI path so a regression in the wiring fails the suite.
 */

test.describe('Regressions', () => {
  test('B-009 — data-key input shows the selected element’s own value on selection change', async ({
    app,
  }) => {
    await app.newProject('B009');
    // Element A: type an UNCOMMITTED data-key draft (no Enter/blur).
    await app.addTextElement({ x: 200, y: 120 });
    await app.expandDynamicData();
    await app.dataKeyInput.fill('draftA');

    // Select element B (auto-selected on add). The inspector must re-init the input.
    await app.addTextElement({ x: 200, y: 260 });
    await expect(app.dataKeyInput).toHaveValue(''); // B's own value, not A's draft
  });

  test('B-008 — "Bind from canvas" is disabled once the field is bound', async ({ app }) => {
    await app.newProject('B008');
    await app.addTextElement({ x: 220, y: 140 });
    // A data key creates the field AND its convenience binding to this element.
    await app.setDataKey('title');

    await app.deselect();
    const bind = app.fieldCard('title').getByRole('button', { name: /Bind from canvas/ });
    await expect(bind).toBeDisabled(); // already bound — can't add another
  });

  test('B-006 — a colour edit applies to the shape in the preview', async ({ app }) => {
    await app.newProject('B006');
    await app.addRectangle({ x: 240, y: 200 });
    // Give it a visible stroke, then set the stroke colour via the inspector hex
    // field (committed on blur). The display syncs and the shape picks it up.
    await app.inspector.getByRole('spinbutton', { name: 'stroke width' }).fill('6');
    const hex = app.inspector.getByRole('textbox', { name: 'stroke hex value' });
    await hex.fill('#1188FF');
    await hex.press('Enter');

    await app.openPreviewModal();
    const shape = app.previewFrame.locator('[data-cg-element-id]').first();
    await expect(shape).toHaveCSS('border-top-color', 'rgb(17, 136, 255)');
  });

  test('D-025 — a nested namespaced field updates the right child in the parent preview', async ({
    app,
  }) => {
    await app.newProject('Child'); // opens "comp1" — the child
    await app.addTextElement({ x: 200, y: 120 });
    await app.setDataKey('teamName');

    // A parent that nests the child instance.
    await app.newComposition('Parent');
    await app.nestCompositionInstance('comp1');

    // The parent preview exposes the child's field under its instance namespace.
    // D-087 — blank until Play; play reveals the nested child. D-106 — a namespaced
    // field edit is pending until an explicit Update, then it lands on the right child.
    await app.openPreviewModal();
    await app.play();
    await expect(app.previewFrame.getByText('New text')).toBeVisible();
    await app.setPreviewField('teamName', 'Galaxy');
    await expect(app.previewFrame.getByText('Galaxy')).toBeHidden(); // pending until Update
    await app.updateAllPreviewFields();
    await expect(app.previewFrame.getByText('Galaxy')).toBeVisible();
  });

  test('D-026 — per-scope preview timing controls are grouped by nested instance', async ({
    app,
  }) => {
    await app.newProject('Child2'); // "comp1" — the child
    await app.addTextElement({ x: 200, y: 120 });
    await app.setPlayoutTiming('loop-cycle'); // child authored as a timing-relevant mode

    await app.newComposition('ParentT');
    await app.nestCompositionInstance('comp1');

    await app.openPreviewModal();
    // Root group plus a per-child timing group, labelled by the instance name.
    await expect(app.previewDialog.getByText('Timing (session)')).toBeVisible();
    await expect(app.previewDialog.getByText(/Timing — comp1/)).toBeVisible();
  });

  test('B-005/B-007 — the diamond adds a keyframe at the playhead', async ({ app }) => {
    await app.newProject('KF');
    await app.addRectangle({ x: 240, y: 200 });
    const diamond = app.page
      .getByRole('button', { name: /Toggle keyframe for stroke\.width/ })
      .first();
    await expect(diamond).toHaveAttribute('data-variant', 'empty'); // none yet
    // Add a keyframe at the playhead via the inspector diamond.
    await diamond.click();
    await expect(diamond).toHaveAttribute('data-variant', 'at-frame'); // captured at the frame
  });

  test('B-014 — switching a keyframed fill to a gradient deletes the orphaned colour track', async ({
    app,
  }) => {
    await app.newProject('B014');
    await app.addRectangle({ x: 240, y: 200 });

    // Keyframe the solid fill colour at the playhead (Path Style is pinned/visible).
    const diamond = () =>
      app.inspector.getByRole('button', { name: /Toggle keyframe for fill\.color/ });
    await diamond().first().click();
    await expect(diamond().first()).toHaveAttribute('data-variant', 'at-frame');

    // Switch the fill to a linear gradient via the fill popover → the diamond is gone
    // (gradient isn't keyframe-able, D-051).
    const editor = app.page.getByRole('dialog', { name: 'Fill editor' });
    await app.inspector.getByRole('button', { name: 'fill fill' }).click();
    await editor.getByRole('button', { name: 'Linear' }).click();
    await expect(diamond()).toHaveCount(0);

    // Switch back to solid → the diamond is EMPTY: the keyframes were DELETED, not
    // hidden (before B-014 they survived and re-appeared as 'at-frame').
    await editor.getByRole('button', { name: 'Solid' }).click();
    await expect(diamond().first()).toHaveAttribute('data-variant', 'empty');
  });

  test('D-026 — parent play cascades into a nested child (child renders)', async ({ app }) => {
    await app.newProject('CascadeChild'); // "comp1" — the child, with a bound text
    await app.addTextElement({ x: 200, y: 120 });
    await app.setDataKey('label');

    await app.newComposition('CascadeParent');
    await app.nestCompositionInstance('comp1');

    await app.openPreviewModal();
    await app.play();
    // The nested child's element renders (cascade reached it); frame-precise hold
    // is covered by the template-runtime unit tests.
    await expect(app.previewFrame.getByText('New text')).toBeVisible();
  });
});
