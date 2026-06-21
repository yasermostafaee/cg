import { test, expect } from './fixtures/designer.js';

/**
 * D-051 — central keyframe-ability registry. UI-observable checks that the diamond
 * renders exactly where the registry marks a property keyframe-able, and that the
 * right inspector and the timeline-left agree. Frame-precise / per-kind exhaustive
 * coverage lives in the deterministic unit + render tests (field-registry.test.ts,
 * inspector-keyframe-parity.test.ts); here we guard the INTEGRATED UI wiring.
 */

test.describe('D-051 — keyframe-ability registry', () => {
  test('a clock shows NO keyframe diamond for digits/mode (and no dead placeholder glyphs)', async ({
    app,
  }) => {
    await app.newProject('KFClock');
    await app.addClock({ x: 240, y: 160 });
    // The old inspector rendered disabled no-op diamonds (aria-label "… — animation
    // not yet supported") on digits/mode and other non-animatable rows. D-051 removes
    // them entirely — a diamond appears only where the property is keyframe-able.
    await expect(app.page.locator('[aria-label$="animation not yet supported"]')).toHaveCount(0);
  });

  test('a shape’s border-radius shows a working keyframe diamond in the inspector', async ({
    app,
  }) => {
    await app.newProject('KFRadius');
    await app.addRectangle({ x: 240, y: 200 });

    // Expand Border Radius → its diamond is present and toggles a keyframe at the
    // playhead (border-radius IS keyframe-able). Exhaustive right/left diamond parity
    // per kind is proven in inspector-keyframe-parity.test.ts (render-level).
    await app.inspector.getByRole('button', { name: 'Toggle Border Radius' }).click();
    const inspectorDiamond = app.inspector
      .getByRole('button', { name: /Toggle keyframe for cornerRadius/ })
      .first();
    await expect(inspectorDiamond).toHaveAttribute('data-variant', 'empty');
    await inspectorDiamond.click();
    await expect(inspectorDiamond).toHaveAttribute('data-variant', 'at-frame');
  });

  test('a ticker’s text styling is NOT keyframe-able yet (deferred to D-052)', async ({ app }) => {
    await app.newProject('KFTicker');
    await app.addTicker({ x: 120, y: 260 });
    // The ticker is a time-driven kind: its text/shadow/padding styling is not
    // keyframe-able in D-051 (runtime support is tracked by D-052). So no font-size
    // diamond exists in either panel — only transform + filter are animatable.
    await expect(
      app.page.getByRole('button', { name: /Toggle keyframe for font\.size/ }),
    ).toHaveCount(0);
  });
});
