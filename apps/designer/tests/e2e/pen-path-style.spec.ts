import { test, expect } from './fixtures/designer.js';

/**
 * B-051 — Path Style edits on a pen-drawn path must mutate the model and render.
 * The Inspector routes fill / stroke colour / stroke width / dash through
 * `commitAnimatable` → (no track) → `writeStaticAnimatable`, whose per-kind guards
 * were shape/text-only (D-056, predating the D-109 path) — every edit silently
 * no-oped on paths. This drives the real Inspector controls and asserts the
 * preview SVG + the single-file HTML export carry the values.
 */
test('pen path: fill, stroke colour, width and dash all apply and export (B-051)', async ({
  app,
}) => {
  await app.newProject('PenStyle');
  await app.selectTool('Pen');
  await app.canvas.click({ position: { x: 140, y: 130 } });
  await app.canvas.click({ position: { x: 280, y: 130 } });
  await app.canvas.click({ position: { x: 210, y: 240 } });
  await app.canvas.click({ position: { x: 140, y: 130 } }); // close → fill visible

  const path = app.canvasFrame.locator('[data-cg-element-id] path');
  await expect(path).toHaveCount(1);
  await expect(path).not.toHaveAttribute('fill', 'none');

  // Stroke width.
  await app.setInspectorNumber('stroke width', 8);
  await expect(path).toHaveAttribute('stroke-width', '8');

  // Dash array.
  await app.setInspectorNumber('dash array', 6);
  await expect(path).toHaveAttribute('stroke-dasharray', '6');

  // Stroke colour (the ColorField's hex input).
  const strokeHex = app.inspector.getByRole('textbox', { name: 'stroke hex value' });
  await strokeHex.fill('FF0000');
  await strokeHex.press('Enter');
  await expect(path).toHaveAttribute('stroke', '#FF0000');

  // Fill colour (the FillField popover's hex input).
  await app.inspector.getByRole('button', { name: 'fill fill' }).click();
  const fillHex = app.page.getByRole('textbox', { name: 'Hex colour value' });
  await fillHex.fill('#00AA00');
  await fillHex.press('Enter');
  await expect(path).toHaveAttribute('fill', '#00AA00');

  // The single-file HTML export carries the same style.
  const { html } = await app.exportHtml();
  expect(html).toContain('#FF0000');
  expect(html).toContain('#00AA00');
  expect(html).toContain('"width":8');
  expect(html).toContain('"dash":[6]');
});
