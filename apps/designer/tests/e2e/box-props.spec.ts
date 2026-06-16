import { test, expect } from './fixtures/designer.js';

/**
 * D-042 — per-corner border radius + stroke on background-capable elements through
 * the real UI. Uses a TEXT element (a non-shape background-capable kind) to prove
 * the cross-cutting box style: the per-corner toggle (uniform ↔ four inputs), the
 * corner rendering in the preview, and a static stroke rendering on a non-shape
 * kind. The registry/store/runtime details are unit-tested; this guards the
 * integrated inspector → store → preview path.
 */
test.describe('Box props for all background-capable elements (D-042)', () => {
  test('per-corner border-radius toggle on a text element: uniform ↔ four corners; a corner renders', async ({
    app,
  }) => {
    await app.newProject('D042Radius');
    await app.addTextElement({ x: 220, y: 160 });

    // Expand the Border Radius section (collapsed by default).
    await app.inspector.getByRole('button', { name: 'Toggle Border Radius' }).click();
    await expect(
      app.inspector.getByRole('spinbutton', { name: 'radius', exact: true }),
    ).toBeVisible();

    // Toggle to per-corner → four corner inputs appear; the single radius is gone.
    await app.inspector.getByRole('button', { name: 'Use per-corner border radius' }).click();
    await expect(app.inspector.getByRole('spinbutton', { name: 'top left radius' })).toBeVisible();
    await expect(
      app.inspector.getByRole('spinbutton', { name: 'bottom right radius' }),
    ).toBeVisible();
    await expect(
      app.inspector.getByRole('spinbutton', { name: 'radius', exact: true }),
    ).toHaveCount(0);

    // Set the top-left corner → the preview text element gets a rounded corner.
    const tl = app.inspector.getByRole('spinbutton', { name: 'top left radius' });
    await tl.fill('24');
    await tl.press('Enter');
    await expect.poll(() => app.canvasElementsWithRoundedCorner()).toBeGreaterThan(0);

    // Toggle back to uniform → the four corner inputs collapse to one.
    await app.inspector.getByRole('button', { name: 'Use a single border radius' }).click();
    await expect(
      app.inspector.getByRole('spinbutton', { name: 'radius', exact: true }),
    ).toBeVisible();
    await expect(app.inspector.getByRole('spinbutton', { name: 'top left radius' })).toHaveCount(0);
  });

  test('B-015 — a uniform keyframe migrates to four corners and survives the round-trip', async ({
    app,
  }) => {
    await app.newProject('B015Radius');
    await app.addTextElement({ x: 220, y: 160 });

    await app.inspector.getByRole('button', { name: 'Toggle Border Radius' }).click();

    // Add a keyframe on the uniform radius at the playhead.
    const uniformDot = app.inspector.getByRole('button', {
      name: /^Toggle keyframe for cornerRadius at frame \d+$/,
    });
    await expect(uniformDot).toHaveAttribute('data-variant', 'empty');
    await uniformDot.click();
    await expect(uniformDot).toHaveAttribute('data-variant', 'at-frame');

    // Toggle to per-corner → four corner diamonds appear, each carrying the migrated keyframe.
    await app.inspector.getByRole('button', { name: 'Use per-corner border radius' }).click();
    for (const c of ['tl', 'tr', 'br', 'bl']) {
      await expect(
        app.inspector.getByRole('button', {
          name: new RegExp(`^Toggle keyframe for cornerRadius\\.${c} at frame \\d+$`),
        }),
      ).toHaveAttribute('data-variant', 'at-frame');
    }

    // Round-trip back to uniform → the keyframe survives (Option-2: top-left representative).
    await app.inspector.getByRole('button', { name: 'Use a single border radius' }).click();
    await expect(
      app.inspector.getByRole('button', {
        name: /^Toggle keyframe for cornerRadius at frame \d+$/,
      }),
    ).toHaveAttribute('data-variant', 'at-frame');
  });

  test('D-052 — a clock keyframes its text colour (diamond appears, empty → at-frame)', async ({
    app,
  }) => {
    await app.newProject('D052Clock');
    await app.addClock({ x: 240, y: 160 });

    // The Clock Text section is expanded by default; its text-colour diamond is the
    // D-052 un-gate (was static before). Clicking it adds a keyframe at the playhead.
    const dot = app.inspectorDiamond('text.color');
    await expect(dot).toHaveAttribute('data-variant', 'empty');
    await app.toggleInspectorKeyframe('text.color');
    await expect(dot).toHaveAttribute('data-variant', 'at-frame');
  });

  test('D-056 — a ticker exposes only text colour + Text Shadow (no box controls)', async ({
    app,
  }) => {
    await app.newProject('D056Ticker');
    await app.addTicker({ x: 120, y: 260 });
    const ins = app.inspector;
    // Box-styling controls are removed for the content-driven kinds.
    await expect(ins.getByRole('button', { name: 'Toggle Border Radius' })).toHaveCount(0);
    await expect(ins.getByRole('spinbutton', { name: 'stroke width' })).toHaveCount(0);
    // The shadow section is renamed "Text Shadow" (not "Drop Shadow").
    await expect(ins.getByRole('button', { name: 'Toggle Text Shadow' })).toBeVisible();
    await expect(ins.getByRole('button', { name: 'Toggle Drop Shadow' })).toHaveCount(0);
    // Text colour is kept — its keyframe diamond renders.
    await expect(app.inspectorDiamond('text.color')).toBeVisible();
  });

  test('D-057 — text shows Text Shadow + Box Shadow sections; shape shows Box Shadow', async ({
    app,
  }) => {
    await app.newProject('D057');
    await app.addTextElement({ x: 220, y: 160 });
    const ins = app.inspector;
    // Text: two independent shadow sections (the former "Drop Shadow" → "Text Shadow",
    // plus the new "Box Shadow"). No "Drop Shadow".
    await expect(ins.getByRole('button', { name: 'Toggle Text Shadow' })).toBeVisible();
    await expect(ins.getByRole('button', { name: 'Toggle Box Shadow' })).toBeVisible();
    await expect(ins.getByRole('button', { name: 'Toggle Drop Shadow' })).toHaveCount(0);

    // Shape: its shadow section is relabelled "Box Shadow" (was "Drop Shadow").
    await app.addRectangle({ x: 320, y: 220 });
    await expect(ins.getByRole('button', { name: 'Toggle Box Shadow' })).toBeVisible();
    await expect(ins.getByRole('button', { name: 'Toggle Drop Shadow' })).toHaveCount(0);
  });

  test('a static stroke set on a text element renders a border in the preview', async ({ app }) => {
    await app.newProject('D042Stroke');
    await app.addTextElement({ x: 220, y: 160 });

    // The Path Style (stroke) section is now present on text (D-042).
    await app.inspector.getByRole('button', { name: 'Toggle Path Style' }).click();
    const width = app.inspector.getByRole('spinbutton', { name: 'stroke width' });
    await expect(width).toBeVisible();
    await width.fill('4');
    await width.press('Enter');

    await expect.poll(() => app.canvasElementsWithBorder()).toBeGreaterThan(0);
  });
});
