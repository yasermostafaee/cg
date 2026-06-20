import { test, expect, type Locator } from './fixtures/designer.js';

/**
 * D-094 — the shared button recipe draws NO default border (the old opaque
 * `colors.border` outline AND the user-agent `<button>` border), and the variants that
 * relied on the border (secondary/default + primary) stay visible via a background fill.
 * The SAVE control's amber unsaved indicator (D-089) is preserved.
 *
 * We assert on border-STYLE (`none` = no border at all) — width/colour are confounded by
 * `currentcolor` and reserved transparent borders, but `border-style: none` is exact.
 */

const TRANSPARENT = 'rgba(0, 0, 0, 0)';
const NO_BORDER = ['none', 'none', 'none', 'none'];

function sideBorderStyles(loc: Locator): Promise<string[]> {
  return loc.evaluate((el) => {
    const s = getComputedStyle(el);
    return [s.borderTopStyle, s.borderRightStyle, s.borderBottomStyle, s.borderLeftStyle];
  });
}

function bg(loc: Locator): Promise<string> {
  return loc.evaluate((el) => getComputedStyle(el).backgroundColor);
}

test.describe('D-094 — global button restyle', () => {
  test('no default border; secondary + primary stay visible via a fill', async ({ app }) => {
    const page = app.page;
    // The New-Project dialog has a primary (Create) + secondary (Cancel) button.
    await page.getByRole('button', { name: 'New project' }).click();
    const dialog = page.getByRole('dialog', { name: 'New project' });
    await dialog.waitFor();
    const create = dialog.getByRole('button', { name: 'Create' });
    const cancel = dialog.getByRole('button', { name: 'Cancel' });

    // No border at all on either variant (no UA border, no default outline).
    expect(await sideBorderStyles(create)).toEqual(NO_BORDER);
    expect(await sideBorderStyles(cancel)).toEqual(NO_BORDER);

    // Both remain visible without a border — each has a non-transparent fill.
    expect(await bg(create)).not.toBe(TRANSPARENT); // primary = accent fill
    expect(await bg(cancel)).not.toBe(TRANSPARENT); // secondary = raised neutral fill
  });

  test('the SAVE control keeps its amber unsaved indicator (D-089)', async ({ app }) => {
    const page = app.page;
    await app.newProject();
    await app.addRectangle({ x: 240, y: 200 }); // an edit → the scene is now dirty

    const save = page.getByRole('button', { name: 'SAVE', exact: true });
    // The dirty SAVE shows the amber top bar (#ffdd40 = rgb(255,221,64))…
    await expect
      .poll(() => save.evaluate((el) => getComputedStyle(el).borderTopColor))
      .toBe('rgb(255, 221, 64)');
    // …with the amber as a real top border and NO border on the other three sides.
    const [top, right, bottom, left] = await sideBorderStyles(save);
    expect(top).toBe('solid');
    expect([right, bottom, left]).toEqual(['none', 'none', 'none']);
  });
});
