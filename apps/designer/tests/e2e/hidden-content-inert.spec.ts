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

/**
 * B-034 (nested) — a hidden driver inside a NESTED composition instance must drop from the PARENT's
 * D-108/D-112 nested checklist (own-content coverage is the test above), and un-hiding must restore
 * the row + its infinite warning. Visibility wins over the per-instance override surface entirely.
 */
test('a hidden driver inside a nested instance drops from the parent nested checklist; un-hiding restores it', async ({
  app,
}) => {
  await app.newProject('HiddenNested');
  // The child keeps a VISIBLE finite countdown (so the nested group still renders) + an infinite
  // ticker (the one we hide).
  await app.newComposition('TitleBlock');
  await app.openComposition('TitleBlock');
  await app.addClock();
  const clockId = (await app.timelineRowIds())[0]!;
  await app.setClockCountdown(5);
  await app.addTicker();
  const tickerId = (await app.timelineRowIds()).find((id) => id !== clockId)!;

  // The parent (comp1) nests the child and holds content-driven.
  await app.openComposition('comp1');
  await app.setPlayoutTiming('auto-out');
  await app.nestCompositionInstance('TitleBlock');
  await app.page.keyboard.press('Escape');
  await app.page.getByRole('combobox', { name: 'Hold source' }).selectOption('content-driven');

  // Two writable nested rows (countdown + infinite ticker); the ticker is flagged.
  const checks = app.page.getByRole('checkbox', { name: /drives the hold/ });
  await expect(checks).toHaveCount(2);
  await expect(app.page.getByText(/loops forever/)).toHaveCount(1);

  // Hide the ticker IN THE CHILD → inert: its parent nested row drops + the warning clears.
  await app.openComposition('TitleBlock');
  await app.toggleElementVisibility(tickerId);
  await app.openComposition('comp1');
  await app.page.keyboard.press('Escape');
  await expect(checks).toHaveCount(1);
  await expect(app.page.getByText(/loops forever/)).toHaveCount(0);

  // Un-hide → the nested row and its infinite warning return.
  await app.openComposition('TitleBlock');
  await app.toggleElementVisibility(tickerId);
  await app.openComposition('comp1');
  await app.page.keyboard.press('Escape');
  await expect(checks).toHaveCount(2);
  await expect(app.page.getByText(/loops forever/)).toHaveCount(1);
});

/**
 * B-034 (transport) — "no effect of any kind from a hidden element": a HIDDEN sequence must not make
 * the scene steppable, so the preview transport's Next control stays disabled. (A VISIBLE sequence
 * enabling Next is covered by sequence.spec.ts.)
 */
test('a hidden sequence does not make the scene steppable (preview Next stays disabled)', async ({
  app,
}) => {
  await app.newProject('HiddenSeqStep');
  await app.addSequence();
  const seqId = (await app.timelineRowIds())[0]!;
  // Hide the only sequence → fully inert: the scene is no longer steppable.
  await app.toggleElementVisibility(seqId);
  await app.openPreviewModal();
  await expect(app.previewDialog.getByRole('button', { name: /Next/ })).toBeDisabled();
});

/**
 * B-034 (ancestor) — hiding a composition INSTANCE makes its WHOLE subtree inert (the master.vcg case
 * the leaf coverage missed). The instance's nested checklist group disappears even though the child's
 * content is itself visible; un-hiding the instance restores it.
 */
test('a hidden composition instance drops its whole subtree from the parent checklist; un-hiding restores it', async ({
  app,
}) => {
  await app.newProject('HiddenAncestor');
  // The child holds a VISIBLE infinite ticker (would drive forever if it counted).
  await app.newComposition('TitleBlock');
  await app.openComposition('TitleBlock');
  await app.addTicker();

  await app.openComposition('comp1');
  await app.setPlayoutTiming('auto-out');
  await app.nestCompositionInstance('TitleBlock');
  const instId = (await app.timelineRowIds())[0]!;
  await app.page.keyboard.press('Escape');
  await app.page.getByRole('combobox', { name: 'Hold source' }).selectOption('content-driven');

  // The visible nested instance contributes a writable driver row + the infinite warning.
  const checks = app.page.getByRole('checkbox', { name: /drives the hold/ });
  await expect(checks).toHaveCount(1);
  await expect(app.page.getByText(/loops forever/)).toBeVisible();

  // Hide the INSTANCE → its whole subtree is inert: the nested group + warning disappear. (Escape to
  // deselect — a canvas click would re-hit the instance, which fills the stage.)
  await app.toggleElementVisibility(instId);
  await app.page.keyboard.press('Escape');
  await expect(checks).toHaveCount(0);
  await expect(app.page.getByText(/loops forever/)).toHaveCount(0);

  // Un-hide → the nested group + its infinite warning come back.
  await app.toggleElementVisibility(instId);
  await app.page.keyboard.press('Escape');
  await expect(checks).toHaveCount(1);
  await expect(app.page.getByText(/loops forever/)).toBeVisible();
});
