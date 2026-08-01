import { expect, test } from './fixtures/runtime.js';

/**
 * INSPECTOR OPENNESS IS DERIVED FROM SELECTION — at both widths.
 *
 * The owner reported the narrow-screen half as a bug and asked for both states to be
 * checked and implemented properly: clicking a layer opened the overlay, dismissing it
 * closed the panel, and the row STAYED SELECTED. Two pieces of state disagreed about
 * one fact, so the list claimed "you are editing this" with no editor behind it.
 *
 * The fix is structural rather than a patched handler: `inspectorOpen` is computed from
 * the selection, and every dismissal path is the same `closeInspector` = deselect. These
 * specs pin the CONSEQUENCE — open ⟺ selected — which is what makes the disagreement
 * unrepresentable. A regression that reintroduced a second boolean would fail here.
 *
 * `panel-scroll.spec.ts` establishes the viewport conventions this file reuses;
 * `NARROW_BREAKPOINT_PX` is 900.
 */

const WIDE = { width: 1280, height: 800 };
const NARROW = { width: 720, height: 900 };

test('WIDE — the Inspector is CLOSED until a row is selected, and its close button reopens the space', async ({
  app,
}) => {
  await app.page.setViewportSize(WIDE);

  // Nothing selected → no Inspector at all. Not an empty panel holding a column open:
  // the owner asked for CLOSED, and the width goes back to the workspace.
  await expect(app.inspector).toHaveCount(0);

  await app.selectLayerRow(70);
  await expect(app.inspector).toBeVisible();

  // CLOSE deselects, so the panel goes and the row lets go together.
  await app.inspector.getByRole('button', { name: 'Close INSPECTOR' }).click();
  await expect(app.inspector).toHaveCount(0);
  await expect(app.layerRow(70)).toHaveAttribute('aria-pressed', 'false');
});

test('WIDE — the resize divider exists only while the Inspector does', async ({ app }) => {
  await app.page.setViewportSize(WIDE);
  const divider = app.page.getByRole('separator', { name: 'Resize the Inspector' });

  // A handle for a column that is not there would be a control that does nothing.
  await expect(divider).toHaveCount(0);
  await app.selectLayerRow(70);
  await expect(divider).toBeVisible();
  await app.inspector.getByRole('button', { name: 'Close INSPECTOR' }).click();
  await expect(divider).toHaveCount(0);
});

test('NARROW — dismissing the overlay DESELECTS the row (the reported bug)', async ({ app }) => {
  await app.page.setViewportSize(NARROW);
  await expect(app.inspector).toHaveCount(0);

  await app.selectLayerRow(70);
  await expect(app.inspector).toBeVisible();
  await expect(app.layerRow(70)).toHaveAttribute('aria-pressed', 'true');

  // Dismiss by the scrim — the operator "clicks the list", which is what they reported.
  // THE ASSERTION THAT MATTERS: the row must not still read selected afterwards.
  await app.page.locator('[data-inspector-scrim]').click({ position: { x: 5, y: 5 } });
  await expect(app.inspector).toHaveCount(0);
  await expect(app.layerRow(70)).toHaveAttribute('aria-pressed', 'false');
});

test('WIDE — a second click on the SAME row closes the Inspector (toggle select and openness agree)', async ({
  app,
}) => {
  await app.page.setViewportSize(WIDE);
  await app.selectLayerRow(70);
  await expect(app.inspector).toBeVisible();

  // Toggle-select and openness are the same fact, so this cannot half-work: the row
  // deselects, and because openness is DERIVED, the panel goes with it.
  await app.selectLayerRow(70);
  await expect(app.inspector).toHaveCount(0);
  await expect(app.layerRow(70)).toHaveAttribute('aria-pressed', 'false');
});

/*
 * WHY THE ABOVE IS A WIDE-ONLY TEST, recorded because the first draft asserted it at
 * NARROW and the failure was informative rather than a test bug.
 *
 * On a narrow screen the scrim spans the viewport, so the Layers list is VISIBLE
 * behind it but not clickable — a click aimed at the selected row hits the scrim.
 * That is the design working: the list stays visible so the operator can see what is
 * ON AIR while editing, and any click outside the panel dismisses. So "click the row
 * again" and "click the scrim" are the same gesture there, and the dismissal case
 * above already covers it. Asserting a second row click at narrow would have been
 * asserting an interaction the design deliberately makes impossible.
 */

test('NARROW — the overlay is FULL HEIGHT, and fullscreen is offered and takes the full width', async ({
  app,
}) => {
  await app.page.setViewportSize(NARROW);
  await app.selectLayerRow(70);

  const before = await app.inspector.boundingBox();
  expect(before).not.toBeNull();
  // Full viewport HEIGHT always (owner request) — the overlay is pinned top and bottom.
  expect(before!.height).toBeGreaterThanOrEqual(NARROW.height - 2);
  // …and NOT full width by default: the Layers list stays visible beside it so the
  // operator can still see what is ON AIR while editing a live graphic.
  expect(before!.width).toBeLessThan(NARROW.width);

  // Fullscreen is now offered at this width too, and it genuinely grows.
  await app.inspector.getByRole('button', { name: 'Show INSPECTOR fullscreen' }).click();
  const full = await app.inspector.boundingBox();
  expect(full).not.toBeNull();
  expect(full!.width).toBeGreaterThan(before!.width);
  expect(full!.width).toBeGreaterThanOrEqual(NARROW.width - 2);
  expect(full!.height).toBeGreaterThanOrEqual(NARROW.height - 2);
});

test('NARROW — closing from FULLSCREEN does not leave the shell focused on a panel that is gone', async ({
  app,
}) => {
  await app.page.setViewportSize(NARROW);
  await app.selectLayerRow(70);
  await app.inspector.getByRole('button', { name: 'Show INSPECTOR fullscreen' }).click();
  await expect(app.inspector).toBeVisible();

  // `Panel` drops the focus before calling onClose. Without that, the shell would
  // still be focused on the Inspector while the Inspector no longer exists — the
  // workspace hidden behind nothing at all.
  await app.inspector.getByRole('button', { name: 'Close INSPECTOR' }).click();
  await expect(app.inspector).toHaveCount(0);
  // The Layers list is back and usable, which is the observable proof the focus cleared.
  await expect(app.layerRow(70)).toBeVisible();
  await app.selectLayerRow(70);
  await expect(app.inspector).toBeVisible();
});
