import { test, expect } from './fixtures/designer.js';
import type { DesignerApp } from './fixtures/designer.js';
import { guardDialog, importAndDragLongClip } from './fixtures/longClip.js';

/**
 * add-time-duration-guard (D-151) — the add-time dialog driven through the real UI: import a
 * 5 s bodymovin clip, drag it onto a 1 s composition (the new-project default: 50 frames at
 * 50 fps), and take each route. Cancel adds nothing; "Add as backdrop" adds a follow-source
 * element and leaves the duration untouched; Extend grows the duration to exactly fit
 * (ceil(5 s × 50 fps) = 250 frames) and adds the element. The comp-insert two-choice form and
 * the per-door chokepoint coverage are unit-pinned in `tests/duration-guard.dom.test.ts`.
 * The clip and its door live in `fixtures/longClip.ts`, shared with `dialog-footer-fit.spec.ts`.
 */

const lottieNode = (app: DesignerApp) => app.canvasFrame.locator('[data-cg-element-id]:has(svg)');

test.describe('add-time duration guard (D-151)', () => {
  test('the dialog names both durations and offers the settled three choices; CANCEL adds nothing', async ({
    app,
  }) => {
    await app.newProject('Guard cancel');
    await importAndDragLongClip(app);

    const dialog = guardDialog(app);
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('5.0 s');
    await expect(dialog).toContainText('1.0 s');
    await expect(dialog.getByRole('button', { name: /extend the composition/i })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /add as backdrop/i })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible();

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).not.toBeVisible();
    await expect(lottieNode(app)).toHaveCount(0); // nothing was added
  });

  test('ADD AS BACKDROP adds a follow-source element and leaves the duration untouched', async ({
    app,
  }) => {
    await app.newProject('Guard backdrop');
    await importAndDragLongClip(app);

    const dialog = guardDialog(app);
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /add as backdrop/i }).click();
    await expect(dialog).not.toBeVisible();

    await expect(lottieNode(app).first()).toBeVisible(); // the element landed…
    // …selected by the add, so the Inspector shows the follow state already ON. A fresh
    // project has no lifecycle yet, so the follow state presents as the §9.1 explanation
    // ("following nothing yet…") rather than the derived window — asserting it here also
    // pins that the backdrop choice is offered and honoured on a no-lifecycle host.
    await expect(app.inspector.getByText(/following nothing yet/i)).toBeVisible();
    // …and the timeline length did not move.
    await app.deselect();
    await expect(app.page.getByLabel('Scene duration in frames', { exact: true })).toHaveValue(
      '50',
    );
  });

  test('EXTEND grows the composition to exactly fit and adds the element', async ({ app }) => {
    await app.newProject('Guard extend');
    await importAndDragLongClip(app);

    const dialog = guardDialog(app);
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /extend the composition/i }).click();
    await expect(dialog).not.toBeVisible();

    await expect(lottieNode(app).first()).toBeVisible();
    await app.deselect();
    // ceil(5 s × 50 fps) = 250 frames — grown to EXACTLY fit, through the duration row's
    // own store action.
    await expect(app.page.getByLabel('Scene duration in frames', { exact: true })).toHaveValue(
      '250',
    );
  });
});
