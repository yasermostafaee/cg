import { test, expect } from './fixtures/designer.js';

/**
 * B-034 — a HIDDEN content element (`visible: false`) is fully inert. The runtime effect (a hidden
 * driver does not gate the hold) is covered by packages/template-runtime/tests/hidden-content-inert
 * .test.ts; the render hide (`display:none`) by hide-clock-sequence.spec.ts. Here: the inspector
 * hold checklist (D-107) and the preview per-ticker timing list both drop a hidden content element.
 */
test('a hidden infinite ticker is inert — dropped from the hold checklist + preview timing, warning cleared', async ({
  app,
}) => {
  await app.newProject('HiddenInert');
  await app.addClock();
  const clockId = (await app.timelineRowIds())[0]!;
  await app.setClockCountdown(5); // a VISIBLE countdown keeps the composition content-driven
  await app.addTicker({ x: 120, y: 240 }); // a VISIBLE ticker (defaults to repeat: 'infinite')
  const tickerId = (await app.timelineRowIds()).find((id) => id !== clockId)!;
  await app.addOutPoint();
  await app.setPlayoutTiming('auto-out');
  await app.setHoldSource('content-driven');

  // Both content elements are listed as hold drivers; the infinite ticker is flagged.
  const checks = app.page.getByRole('checkbox', { name: /drives the hold/ });
  await expect(checks).toHaveCount(2);
  await expect(app.page.getByText(/loops forever/)).toBeVisible();

  // Hide the ticker → it becomes inert: dropped from the checklist and its warning clears.
  await app.toggleElementVisibility(tickerId);
  await app.deselect();
  await expect(checks).toHaveCount(1); // only the visible countdown remains a driver
  await expect(app.page.getByText(/loops forever/)).toHaveCount(0);

  // Preview timing: the hidden ticker has no per-ticker timing row (the only ticker is hidden).
  await app.openPreviewModal();
  await expect(app.previewDialog.getByText(/— passes/)).toHaveCount(0);
});
