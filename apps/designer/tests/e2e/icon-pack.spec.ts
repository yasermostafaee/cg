import { test, expect } from './fixtures/designer.js';

/**
 * D-092 — icon pack. Every ad-hoc Unicode-glyph UI icon is replaced by a
 * `lucide-react` vector icon via the shared `Icon` component:
 *   - a migrated control renders an <svg> and no longer its old glyph text,
 *   - the icon inherits the current text colour (`stroke="currentColor"`),
 *   - a `flipRtl` (directional) icon mirrors under RTL while a default one does not.
 */
test.describe('D-092 — shared vector Icon', () => {
  test('a migrated toolbar button renders a vector svg, not its old glyph', async ({ app }) => {
    await app.newProject('Icons E2E');
    const select = app.page.getByRole('button', { name: 'Select', exact: true });

    // It draws a lucide <svg> …
    await expect(select.locator('svg')).toHaveCount(1);
    // … and the old Unicode glyph (↖) is gone.
    await expect(select).not.toContainText('↖');
  });

  test('an icon is monochrome via currentColor', async ({ app }) => {
    await app.newProject('Icons E2E');
    const svg = app.page.getByRole('button', { name: 'Select', exact: true }).locator('svg');
    // lucide strokes with currentColor, so the icon takes the control's text colour.
    await expect(svg).toHaveAttribute('stroke', 'currentColor');
  });

  test('a flipRtl icon mirrors under RTL while a default icon does not', async ({ app }) => {
    await app.newProject('Icons E2E');
    await app.addRectangle();

    // The collapsed timeline row chevron is a directional ChevronRight (flipRtl).
    const chevron = app.page.getByRole('button', { name: /Toggle .* tracks/ }).first();
    if ((await chevron.getAttribute('aria-expanded')) === 'true') await chevron.click();
    const flipIcon = chevron.locator('svg');

    // A tool icon is a non-directional, never-mirrored icon.
    const defaultIcon = app.page
      .getByRole('button', { name: 'Select', exact: true })
      .locator('svg');

    // Put the app in RTL — the flip class keys off an ancestor [dir="rtl"].
    await app.page.evaluate(() => document.documentElement.setAttribute('dir', 'rtl'));

    // scaleX(-1) computes to a matrix whose first component is -1.
    await expect
      .poll(() => flipIcon.evaluate((el) => getComputedStyle(el).transform))
      .toContain('matrix(-1');
    expect(await defaultIcon.evaluate((el) => getComputedStyle(el).transform)).toBe('none');

    await app.page.evaluate(() => document.documentElement.removeAttribute('dir'));
  });
});
