import { expect, test } from './fixtures/designer.js';

/**
 * `B-218` — "keep aspect / free" IS PER PLATE.
 *
 * The owner's report (2026-08-30): in a two-box look, setting ONE box to FREE changed it for
 * every box — and in the other looks too. The lock was a single session flag by `D-155`'s
 * design; it is now keyed by the plate the toggle sits beside.
 *
 * Scenario-level, on the real Inspector: two plates, one freed, the other read back LOCKED,
 * the first read back FREE on reselection. Maps the `designer-live-source` delta's
 * "the lock is per plate" scenarios to Playwright steps.
 */

test('B-218 — freeing one plate’s aspect lock leaves the other plate locked, and survives reselection', async ({
  app,
}) => {
  await app.newProject('AspectLockPerPlate');
  const canvasBox = await app.canvas.boundingBox();
  if (canvasBox === null) throw new Error('canvas not rendered');
  const at = (fx: number, fy: number): { x: number; y: number } => ({
    x: Math.round(canvasBox.width * fx),
    y: Math.round(canvasBox.height * fy),
  });
  const lock = app.inspector.getByRole('button', { name: 'Keep aspect while resizing' });

  // Plate A — a new plate declares 16:9 and the lock is ON by default (D-155).
  const posA = at(0.25, 0.3);
  await app.addLiveSource(posA);
  await expect(app.liveSourceAspectSelect).toHaveValue('16:9');
  await expect(lock).toHaveAttribute('data-aspect-lock', 'on');

  // Free plate A.
  await lock.click();
  await expect(lock).toHaveAttribute('data-aspect-lock', 'off');
  await app.deselect();

  // Plate B — its own lock, still ON: A's toggle did not reach it.
  const posB = at(0.7, 0.7);
  await app.addLiveSource(posB);
  await expect(app.liveSourceAspectSelect).toHaveValue('16:9');
  await expect(
    lock,
    'B-218 — the second plate must not inherit the first plate’s FREE',
  ).toHaveAttribute('data-aspect-lock', 'on');
  await app.deselect();

  // Back to plate A — its FREE survived the selection change (a session preference, per plate).
  await app.clickCanvas(posA);
  await expect(lock).toHaveAttribute('data-aspect-lock', 'off');
});
