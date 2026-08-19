import { expect, test } from './fixtures/designer.js';

/**
 * ⭐ **LOOKS phase 2 — the 6-box debate, authored the LOOKS way (`design.md` §14).**
 *
 * This is session BB's ACCEPTANCE: the walk the owner will do by hand — create the
 * multi-frame group from the toolbar, declare six sources ONCE, author a 6-box look and
 * a solo look as full sub-scenes, and switch between them with the selector, with the
 * canvas visibly changing through `runtime.setActiveLook` (phase 1's D.5 seam, whose
 * first production caller is this UI).
 *
 * 🔴 What a SCREENSHOT cannot show, asserted by DOM instead: the stage is transparent,
 * so a hidden look and an absent one photograph identically — the hidden looks' plates
 * are asserted GONE from the render (`boundingBox() === null`, i.e. `display: none`
 * up the chain), not merely unphotographed; and panel→canvas coherence is asserted by
 * WRITING a Transform X and reading the rendered box back (the D-154 regression class),
 * which no still image can witness.
 */

test.setTimeout(300_000);

/**
 * The six roughly-3×2 drop points, as FRACTIONS of the canvas surface — the canvas is
 * zoom-scaled (≈24% for 1080p), so absolute pixel points can land outside it and a
 * position-click then waits forever.
 */
const GRID_FRACTIONS = [
  [0.2, 0.25],
  [0.5, 0.25],
  [0.8, 0.25],
  [0.2, 0.65],
  [0.5, 0.65],
  [0.8, 0.65],
] as const;

test('the 6-box debate: group → six sources → two looks → the selector switches the canvas', async ({
  app,
}) => {
  await app.newProject('SixBoxDebate');

  // The home composition's name, captured for the way back from the look sub-scenes.
  await app.showCompositions();
  const homeName = (await app.page.locator('.cg-comp-row').first().innerText()).trim();

  const canvasBox = await app.canvas.boundingBox();
  if (canvasBox === null) throw new Error('canvas not rendered');
  const at = (fx: number, fy: number): { x: number; y: number } => ({
    x: Math.round(canvasBox.width * fx),
    y: Math.round(canvasBox.height * fy),
  });

  // A SHARED BACKGROUND, added before any look so it sits behind the instances
  // (§12.9.2 — one background outside the looks serves every look).
  await app.addRectangle(at(0.5, 0.5));
  await app.deselect();

  // ── the multi-frame group + six declared sources ──────────────────────────
  await app.page.getByRole('button', { name: 'Add multi-frame group' }).click();
  const sourceInput = app.inspector.getByLabel('New source id');
  for (let i = 1; i <= 6; i++) {
    await sourceInput.fill(`live-${String(i)}`);
    await app.inspector.getByRole('button', { name: '+ Source' }).click();
  }
  await expect(app.inspector.getByText('live-6', { exact: true })).toBeVisible();

  // ── look-1: the 6-box, authored freely as a full sub-scene ────────────────
  await app.inspector.getByRole('button', { name: '+ Look' }).click();
  await app.inspector.getByRole('button', { name: 'Edit contents of look-1' }).click();
  for (const [i, [fx, fy]] of GRID_FRACTIONS.entries()) {
    await app.addLiveSource(at(fx, fy));
    // The plate REFERENCES a declared source through the picker — with a group in the
    // project there is no free-text routeKey control at all.
    await expect(app.liveSourceIdInput).toHaveCount(0);
    await app.inspector
      .getByRole('combobox', { name: 'source' })
      .selectOption(`live-${String(i + 1)}`);
    await app.deselect();
  }
  await app.addTextElement(at(0.5, 0.9));
  await app.deselect();
  await app.page.screenshot({ path: '../../docs/handoff/img/bb-step3-sixbox-authoring.png' });

  // ── look-2: the solo, its own sub-scene with its own geometry ─────────────
  await app.openComposition(homeName);
  await app.inspector.getByRole('button', { name: '+ Look' }).click();
  await app.inspector.getByRole('button', { name: 'Edit contents of look-2' }).click();
  await app.addLiveSource(at(0.4, 0.4));
  await app.inspector.getByRole('combobox', { name: 'source' }).selectOption('live-1');

  // §6.6 — panel→canvas coherence, asserted by WRITING: set X to a known value and
  // require the RENDERED box to land there. A screenshot cannot witness this.
  const xField = app.inspector.getByRole('spinbutton', { name: 'X position' });
  await xField.fill('320');
  await xField.press('Enter');
  const soloPlate = app.canvasFrame.locator('[data-cg-live-source="live-1"]');
  const stage = app.canvasFrame.locator('.cg-stage');
  const stageBox = await stage.boundingBox();
  const plateBox = await soloPlate.boundingBox();
  if (stageBox === null || plateBox === null) throw new Error('stage or plate not rendered');
  const scale = stageBox.width / 1920;
  expect(Math.abs(plateBox.x - (stageBox.x + 320 * scale))).toBeLessThan(2);
  await app.deselect();
  await app.page.screenshot({ path: '../../docs/handoff/img/bb-step4-solo-authoring.png' });

  // ── back home: the selector switches, and the canvas VISIBLY changes ──────
  await app.openComposition(homeName);
  const picker = app.page.getByLabel('Active look');
  await expect(picker).toBeVisible();

  const visiblePlates = app.canvasFrame.locator('[data-cg-live-source]:visible');

  await picker.selectOption('look-1');
  await expect(visiblePlates).toHaveCount(6);
  await app.page.screenshot({ path: '../../docs/handoff/img/bb-step5-switched-sixbox.png' });

  await picker.selectOption('look-2');
  await expect(visiblePlates).toHaveCount(1);
  await app.page.screenshot({ path: '../../docs/handoff/img/bb-step5b-switched-solo.png' });

  // What the screenshot cannot show: the 6-box plates are GONE from the render
  // (display:none up the instance chain), not merely covered — a covered plate still
  // has a bounding box; a hidden one has none.
  const anySixPlate = app.canvasFrame.locator('[data-cg-live-source="live-4"]');
  expect(await anySixPlate.boundingBox()).toBeNull();

  // …and each look keeps ITS OWN authored geometry: the solo live-1 is a different
  // rendered box from the 6-box live-1.
  const soloBox = await app.canvasFrame
    .locator('[data-cg-live-source="live-1"]:visible')
    .boundingBox();
  await picker.selectOption('look-1');
  const gridBox = await app.canvasFrame
    .locator('[data-cg-live-source="live-1"]:visible')
    .boundingBox();
  if (soloBox === null || gridBox === null) throw new Error('a live-1 plate not rendered');
  expect(Math.abs(soloBox.x - gridBox.x) + Math.abs(soloBox.y - gridBox.y)).toBeGreaterThan(5);

  // §6.7 (scoped) — the export CARRIES the looks: the single-file HTML embeds the
  // authored group, so what leaves the Designer is the LOOKS template. (A `.vcg`
  // re-import walk has no e2e fixture; the scene→carrier round-trip is pinned at unit
  // level in scene-doc/look-carrier tests.)
  const { html } = await app.exportHtml();
  expect(html).toContain('lookGroups');
  expect(html).toContain('look-2');
});
