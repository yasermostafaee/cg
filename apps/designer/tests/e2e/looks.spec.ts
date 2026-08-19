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
 * 🔴 The 6-box grid in SCENE coordinates, WRITTEN through the Transform panel after each
 * plate is placed. The click position only creates the element; relying on it for the
 * final geometry made the spec viewport-dependent — on CI the fraction-derived clicks
 * landed plates overlapping, the preflight refused the export with a `window.alert` the
 * fixture auto-dismisses, and the download wait timed out with nothing saying why.
 * Deterministic authored geometry is also six more panel→canvas writes (the D-154 class).
 */
const GRID_SCENE = [
  { x: 40, y: 160 },
  { x: 680, y: 160 },
  { x: 1320, y: 160 },
  { x: 40, y: 600 },
  { x: 680, y: 600 },
  { x: 1320, y: 600 },
] as const;
const PLATE_W = 560;
const PLATE_H = 280;

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
  const writeField = async (name: string, value: number): Promise<void> => {
    const field = app.inspector.getByRole('spinbutton', { name, exact: true });
    await field.fill(String(value));
    await field.press('Enter');
  };
  for (const [i, cell] of GRID_SCENE.entries()) {
    await app.addLiveSource(at(0.4, 0.4));
    // The plate REFERENCES a declared source through the picker — with a group in the
    // project there is no free-text routeKey control at all.
    await expect(app.liveSourceIdInput).toHaveCount(0);
    await app.inspector
      .getByRole('combobox', { name: 'source' })
      .selectOption(`live-${String(i + 1)}`);
    await writeField('X position', cell.x);
    await writeField('Y position', cell.y);
    await writeField('Width', PLATE_W);
    await writeField('Height', PLATE_H);
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

  // §6.6 — panel→canvas coherence, asserted by WRITING: set X/Y to known values and
  // require the RENDERED box to land there. A screenshot cannot witness this.
  await writeField('X position', 320);
  await writeField('Y position', 180);
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
  // The POSITIVE CONTROL for the export below: the refusal family must be silent, or
  // the export's alert-and-no-download failure mode reads as a bare timeout.
  await expect(app.inspector.getByText('export will refuse')).toHaveCount(0);
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
