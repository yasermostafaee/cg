import { test, expect } from './fixtures/designer.js';
import type { DesignerApp } from './fixtures/designer.js';

/**
 * add-time-duration-guard (D-151) — the add-time dialog driven through the real UI: import a
 * 5 s bodymovin clip, drag it onto a 1 s composition (the new-project default: 50 frames at
 * 50 fps), and take each route. Cancel adds nothing; "Add as backdrop" adds a follow-source
 * element and leaves the duration untouched; Extend grows the duration to exactly fit
 * (ceil(5 s × 50 fps) = 250 frames) and adds the element. The comp-insert two-choice form and
 * the per-door chokepoint coverage are unit-pinned in `tests/duration-guard.dom.test.ts`.
 */

// A minimal allowlist-clean bodymovin export, 5 s long (fr 30, op 150), no markers.
const CLIP_5S = JSON.stringify({
  v: '5.7.0',
  fr: 30,
  ip: 0,
  op: 150,
  w: 400,
  h: 200,
  nm: 'longclip',
  ddd: 0,
  assets: [],
  layers: [
    {
      ddd: 0,
      ind: 1,
      ty: 4,
      nm: 'bar',
      sr: 1,
      ks: {
        o: { a: 0, k: 100 },
        r: { a: 0, k: 0 },
        p: { a: 0, k: [200, 100, 0] },
        a: { a: 0, k: [0, 0, 0] },
        s: { a: 0, k: [100, 100, 100] },
      },
      ao: 0,
      shapes: [
        {
          ty: 'gr',
          it: [
            {
              ty: 'rc',
              d: 1,
              s: { a: 0, k: [300, 80] },
              p: { a: 0, k: [0, 0] },
              r: { a: 0, k: 0 },
            },
            { ty: 'fl', c: { a: 0, k: [0.2, 0.4, 1, 1] }, o: { a: 0, k: 100 }, r: 1 },
            {
              ty: 'tr',
              p: { a: 0, k: [0, 0] },
              a: { a: 0, k: [0, 0] },
              s: { a: 0, k: [100, 100] },
              r: { a: 0, k: 0 },
              o: { a: 0, k: 100 },
            },
          ],
          nm: 'Group',
        },
      ],
      ip: 0,
      op: 150,
      st: 0,
      bm: 0,
    },
  ],
});

/** Import the 5 s clip via Project Assets and drag it onto the canvas — door L1. */
async function importAndDragLongClip(app: DesignerApp): Promise<void> {
  await app.page.getByRole('button', { name: 'Project assets', exact: true }).click();
  await app.page.getByRole('button', { name: 'Add asset', exact: true }).click();
  const chooser = app.page.waitForEvent('filechooser');
  await app.page.getByRole('menuitem', { name: /Lottie/ }).click();
  await (
    await chooser
  ).setFiles({ name: 'longclip.json', mimeType: 'application/json', buffer: Buffer.from(CLIP_5S) });
  const panel = app.page.locator('aside[aria-label="Project assets"]');
  const tile = panel.locator('[draggable="true"]').filter({ hasText: 'longclip' }).first();
  await expect(tile).toBeVisible();
  await tile.dragTo(app.canvas, { targetPosition: { x: 220, y: 130 } });
}

const guardDialog = (app: DesignerApp) =>
  app.page.getByRole('dialog', { name: 'Content longer than the composition' });
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
