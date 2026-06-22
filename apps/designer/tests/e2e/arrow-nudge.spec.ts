import { test, expect, type DesignerApp } from './fixtures/designer.js';

/**
 * D-073 — arrow-key nudge for the selection. Arrows move the selected element(s) by 1px
 * (Shift = 10px) in spatial screen directions; a held key (auto-repeat) collapses to one
 * undo step; with nothing selected, or the focus in an editable field, the arrows do
 * nothing. The X position is read from the inspector's X field (so re-select after undo,
 * which clears the selection by design).
 */
test.describe('Arrow-key nudge (D-073)', () => {
  const xField = (app: DesignerApp) =>
    app.inspector.getByRole('spinbutton', { name: 'X position' });
  const xVal = async (app: DesignerApp): Promise<number> => Number(await xField(app).inputValue());
  const RECT = { x: 240, y: 200 };
  // Re-select after a deselect/undo (undo clears the selection by design). The shape stays
  // at its placement (RECT top-left), and the overlay hit-tests the STORE scene — present
  // synchronously after undo, independent of the (async) iframe rebuild — so click a fixed
  // interior point on the stable canvas-surface (no racy iframe boundingBox). The small
  // +10/+8 offset is inside the 320×120 rect even at the lowest fit zooms.
  async function reselect(app: DesignerApp): Promise<void> {
    await app.clickCanvas({ x: RECT.x + 10, y: RECT.y + 8 });
  }

  test('ArrowRight nudges +1px, Shift+ArrowRight +10px, spatially', async ({ app }) => {
    await app.newProject('Nudge1');
    await app.addRectangle(RECT);
    const x0 = await xVal(app);

    await app.page.keyboard.press('ArrowRight');
    await expect.poll(() => xVal(app)).toBe(x0 + 1);

    await app.page.keyboard.press('Shift+ArrowRight');
    await expect.poll(() => xVal(app)).toBe(x0 + 11);

    await app.page.keyboard.press('ArrowLeft'); // Left = −x (spatial, independent of RTL)
    await expect.poll(() => xVal(app)).toBe(x0 + 10);
  });

  test('a held key (auto-repeat) collapses to ONE undo step', async ({ app }) => {
    await app.newProject('NudgeUndo');
    await app.addRectangle(RECT);
    const xPre = await xVal(app);

    // Simulate a held ArrowRight: one non-repeat keydown (opens the undo run) + two repeat
    // keydowns. Playwright emits no OS auto-repeat, so dispatch on window directly (target
    // is window, not an input, so the global handler runs).
    await app.page.evaluate(() => {
      for (let i = 0; i < 3; i += 1) {
        window.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'ArrowRight',
            repeat: i > 0,
            bubbles: true,
            cancelable: true,
          }),
        );
      }
    });
    await expect.poll(() => xVal(app)).toBe(xPre + 3);

    // ONE undo reverts the WHOLE run. Undo clears the selection (by design), so re-select
    // to read the field again.
    await app.page.keyboard.press('Control+z');
    await reselect(app);
    await expect.poll(() => xVal(app)).toBe(xPre);
  });

  test('an arrow does nothing when an editable field is focused', async ({ app }) => {
    await app.newProject('NudgeField');
    await app.addRectangle(RECT);
    const x0 = await xVal(app);
    // Focus the X field; ArrowRight there moves the caret (the field owns it) — it must NOT
    // nudge the element via the global handler.
    await xField(app).focus();
    await app.page.keyboard.press('ArrowRight');
    await expect.poll(() => xVal(app)).toBe(x0);
  });

  test('arrows do nothing with no selection', async ({ app }) => {
    await app.newProject('NudgeNone');
    await app.addRectangle(RECT);
    const x0 = await xVal(app);
    await app.deselect(); // clears the selection
    await app.page.keyboard.press('ArrowRight'); // no selection → no nudge, no preventDefault
    await reselect(app); // re-select to read the field
    await expect.poll(() => xVal(app)).toBe(x0);
  });
});
