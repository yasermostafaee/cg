import { test, expect } from './fixtures/designer.js';

/**
 * D-060 — auto-size text (consume `fitMode`) + D-046 align interaction, verified in a
 * REAL browser end-to-end. The D-046 keyframe→confirm-modal→delete→one-undo logic is
 * covered deterministically by the `sizing-commit` store unit test (authoring a size
 * keyframe through the UI is not a supported text flow); here we exercise the toggle's
 * real rendering + the align-control interaction.
 */

test.describe('D-060 — auto-size text', () => {
  test('toggling Sizing to Auto makes the runtime hug the content; the anchor stays put', async ({
    app,
  }) => {
    await app.goto();
    await app.newProject();
    await app.addTextElement({ x: 240, y: 140 });

    const el = app.canvasFrame.locator('[data-cg-element-id]').last();
    const leftBefore = await el.evaluate((e) => (e as HTMLElement).getBoundingClientRect().left);

    await app.inspector.getByRole('button', { name: 'Auto', exact: true }).click();

    // The runtime consumed fitMode: the box is content-sized (max-content) and does not
    // wrap (white-space: pre) — the CSS contract that produces the hug.
    await expect.poll(() => el.evaluate((e) => (e as HTMLElement).style.width)).toBe('max-content');
    expect(await el.evaluate((e) => (e as HTMLElement).style.whiteSpace)).toBe('pre');

    // The top-left anchor stays put (LTR) — growth doesn't reposition the element.
    const leftAfter = await el.evaluate((e) => (e as HTMLElement).getBoundingClientRect().left);
    expect(Math.abs(leftAfter - leftBefore)).toBeLessThan(2);

    // Back to Fixed renders from transform.size again (no max-content).
    await app.inspector.getByRole('button', { name: 'Fixed', exact: true }).click();
    await expect
      .poll(() => el.evaluate((e) => (e as HTMLElement).style.width))
      .not.toBe('max-content');
  });

  test('vertical-align is disabled while Auto (no slack), horizontal stays enabled', async ({
    app,
  }) => {
    await app.goto();
    await app.newProject();
    await app.addTextElement({ x: 240, y: 140 });

    const vMiddle = app.inspector.getByRole('button', { name: 'Vertical middle' });
    const hCenter = app.inspector.getByRole('button', { name: 'Align center' });

    await app.inspector.getByRole('button', { name: 'Auto', exact: true }).click();
    await expect(vMiddle).toBeDisabled();
    await expect(hCenter).toBeEnabled();

    await app.inspector.getByRole('button', { name: 'Fixed', exact: true }).click();
    await expect(vMiddle).toBeEnabled();
  });
});
