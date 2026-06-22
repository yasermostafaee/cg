import { test, expect } from './fixtures/designer.js';

/**
 * D-072 — a coordinate badge on the persistent ruler guides. Hovering a guide (or
 * dragging one) shows a small `guide-badge` with its scene coordinate (`y: <n>` for a
 * horizontal guide pulled from the top ruler); the value updates live while dragging;
 * with neither hover nor drag, no badge. Overlay-only, no store/render change.
 */
test.describe('Guide coordinate readout (D-072)', () => {
  test('badge shows on hover, updates live while dragging, hides when neither', async ({ app }) => {
    await app.newProject('GuideBadge');
    // Show the rulers (View ▸ Ruler) so guides can be pulled from them.
    await app.page.getByRole('button', { name: 'View', exact: true }).click();
    await app.page.getByRole('menuitemcheckbox', { name: 'Ruler (R)' }).click();
    const rulerTop = app.page.getByTestId('ruler-top');
    await expect(rulerTop).toBeVisible();

    const badge = app.page.getByTestId('guide-badge');
    await expect(badge).toBeHidden(); // nothing active yet → no badge

    const rt = (await rulerTop.boundingBox())!;
    const x = rt.x + rt.width / 2;
    const y1 = rt.y + 120;
    const y2 = rt.y + 210;

    // Pull a horizontal ('y') guide down from the top ruler; the badge shows DURING the
    // drag and tracks the guide even though the window-level move leaves the thin strip.
    await app.page.mouse.move(x, rt.y + 2);
    await app.page.mouse.down();
    await app.page.mouse.move(x, y1, { steps: 6 });
    await expect(badge).toBeVisible();
    await expect(badge).toContainText('y:'); // horizontal guide → y coordinate
    const t1 = (await badge.textContent())!;
    // Drag further → the value updates live.
    await app.page.mouse.move(x, y2, { steps: 6 });
    await expect.poll(async () => (await badge.textContent()) !== t1).toBe(true);
    await app.page.mouse.up();

    // Neither hovering nor dragging → no badge.
    await app.page.mouse.move(x, rt.y + rt.height + 320);
    await expect(badge).toBeHidden();

    // Hover the placed guide → the badge returns with its coordinate.
    await app.page.mouse.move(x, y2);
    await expect(badge).toBeVisible();
    await expect(badge).toContainText('y:');

    // Move the pointer off the guide → the badge hides again.
    await app.page.mouse.move(x, rt.y + rt.height + 320);
    await expect(badge).toBeHidden();
  });
});
