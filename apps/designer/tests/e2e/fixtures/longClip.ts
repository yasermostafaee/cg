import { expect } from '@playwright/test';
import type { DesignerApp } from './designer.js';

/**
 * A clip longer than a new project's composition, and the one door that adds it — shared by
 * `duration-guard.spec.ts` (D-151, the dialog's choices) and `dialog-footer-fit.spec.ts`
 * (B-319, the dialog's footer geometry), so both open the SAME dialog the same way.
 */

// A minimal allowlist-clean bodymovin export, 5 s long (fr 30, op 150), no markers.
export const CLIP_5S = JSON.stringify({
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
export async function importAndDragLongClip(app: DesignerApp): Promise<void> {
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

/** The dialog the clip raises, by its accessible name. */
export const guardDialog = (app: DesignerApp) =>
  app.page.getByRole('dialog', { name: 'Content longer than the composition' });
