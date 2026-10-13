import { test, expect, type DesignerApp } from './fixtures/designer.js';

/**
 * D-122 — pixel-snap drag and nudge at grid zoom. B-042 fixed the alignment TRUTH; D-122
 * makes PLACEMENT land on whole pixels at pixel-grid zoom so a moved element's edges sit on
 * the grid lines (not honestly-but-confusingly between them). Alt bypasses the snap; below
 * the grid threshold nothing changes; Inspector-typed values are always free.
 *
 * The snap MATH is unit-tested (`canvas-geometry.test.ts`); these E2Es prove the WIRING
 * through the real drag/nudge paths at real zoom, asserting the committed model X/Y via the
 * inspector.
 */

const GRID_ZOOM = 6400; // ≥ the 800% threshold — pixel grid active (nudge tests)
const DRAG_ZOOM = 800; // just above the threshold — element stays viewport-sized for a drag
const BELOW_ZOOM = 400; // < the 800% threshold — no pixel snapping

/** Click the zoom-in button until the readout reaches at least `target`% (returns the %). */
async function zoomToAtLeast(app: DesignerApp, target: number): Promise<number> {
  const zoomIn = app.page.getByRole('button', { name: 'Zoom in', exact: true });
  let pct = 0;
  for (let i = 0; i < 90; i++) {
    pct = Number((await app.page.getByTestId('zoom-readout').textContent())!.replace('%', ''));
    if (pct >= target) break;
    await zoomIn.click();
  }
  return pct;
}

/** Fire an arrow-key nudge by dispatching a real KeyboardEvent on `window` — the exact
 *  target the app's global nudge listener is bound to. Deterministic (no dependency on which
 *  element holds DOM focus, which is racy in headless runs); the handler's editable-focus
 *  bail is existing, separately-tested behavior, not part of D-122. */
async function nudge(
  app: DesignerApp,
  key: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown',
  opts: { alt?: boolean; shift?: boolean } = {},
): Promise<void> {
  await app.page.evaluate(
    ({ key, alt, shift }) => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key,
          altKey: alt,
          shiftKey: shift,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    { key, alt: opts.alt === true, shift: opts.shift === true },
  );
  await app.page.waitForTimeout(60);
}

/** Scroll the selected element to the viewport center, then return a press point ON it that
 *  is guaranteed to be inside the visible viewport (at high zoom the element drifts off-view
 *  and the canvas-surface box extends past the viewport, so a naive box center misses). */
async function pressPointOnSelected(app: DesignerApp): Promise<{ x: number; y: number } | null> {
  const gb = await app.gizmoFrame.boundingBox();
  if (gb === null) return null;
  // Scroll the outer canvas viewport so the gizmo's center lands at the viewport center.
  const vp = await app.page.evaluate(
    (giz) => {
      const outer = document.querySelector('[data-testid="canvas-viewport"]');
      if (outer === null) return null;
      const r = outer.getBoundingClientRect();
      outer.scrollLeft += giz.cx - (r.left + r.width / 2);
      outer.scrollTop += giz.cy - (r.top + r.height / 2);
      outer.dispatchEvent(new Event('scroll'));
      const r2 = outer.getBoundingClientRect();
      return { x: r2.left + r2.width / 2, y: r2.top + r2.height / 2 };
    },
    { cx: gb.x + gb.width / 2, cy: gb.y + gb.height / 2 },
  );
  await app.page.waitForTimeout(150);
  return vp;
}

test.describe('D-122 pixel-snap drag', () => {
  test('a drag lands on whole pixels at grid zoom; Alt-drag stays free (fractional)', async ({
    app,
  }) => {
    test.setTimeout(90_000);
    await app.newProject('SnapDrag');
    // Place the shape at the VIEWPORT CENTER so a center-anchored zoom keeps it centered and
    // visible, then switch off the Rectangle tool so a press DRAGS (not places), then zoom
    // just into grid range (the element stays roughly viewport-sized and grabbable).
    const cb = (await app.canvas.boundingBox())!;
    await app.addRectangle({ x: cb.width / 2, y: cb.height / 2 });
    await app.selectTool('Select');
    expect(await zoomToAtLeast(app, DRAG_ZOOM)).toBeGreaterThanOrEqual(800);

    // Snap-drag: press on the element (gizmo ∩ viewport center), move by a delta that maps to
    // a FRACTIONAL scene delta, release. The committed position must be whole integers.
    const beforeX = await app.getInspectorNumber('X position');
    const p1 = await pressPointOnSelected(app);
    expect(p1, 'element not visible for the drag').not.toBeNull();
    await app.page.mouse.move(p1!.x, p1!.y);
    await app.page.mouse.down();
    await app.page.mouse.move(p1!.x + 53, p1!.y + 41, { steps: 10 });
    await app.page.mouse.up();
    const sx = await app.getInspectorNumber('X position');
    const sy = await app.getInspectorNumber('Y position');
    expect(sx, 'sanity: the drag moved X').not.toBe(beforeX);
    expect(Number.isInteger(sx), `snapped X (${String(sx)}) is integer`).toBe(true);
    expect(Number.isInteger(sy), `snapped Y (${String(sy)}) is integer`).toBe(true);

    // Alt-drag from the (now integer) position by a fractional-mapping delta → free placement:
    // the result must be NOT integer (the snap is bypassed).
    const p2 = await pressPointOnSelected(app);
    expect(p2).not.toBeNull();
    await app.page.keyboard.down('Alt');
    await app.page.mouse.move(p2!.x, p2!.y);
    await app.page.mouse.down();
    await app.page.mouse.move(p2!.x + 33, p2!.y + 33, { steps: 8 });
    await app.page.mouse.up();
    await app.page.keyboard.up('Alt');
    const ax = await app.getInspectorNumber('X position');
    const ay = await app.getInspectorNumber('Y position');
    expect(
      Number.isInteger(ax) && Number.isInteger(ay),
      `Alt-drag should be free — X ${String(ax)}, Y ${String(ay)} must not both be integer`,
    ).toBe(false);
  });
});

test.describe('B-180 drag commits whole pixels at ORDINARY zoom', () => {
  /*
    ⭐ **`B-180` half 1 — the supersession of `D-122`'s THRESHOLD, not of its rule.**

    `D-122` snapped a drag to whole pixels only at pixel-grid zoom (≥ 800%), on the reasoning that
    the grid is what the author is aiming at. Below it, a drag committed `startPos + delta / scale`
    — and `scale` is an arbitrary fraction, so EVERY ordinary drag committed an arbitrary
    fractional coordinate that the Inspector then rounded to 2 dp for display. Two boxes the author
    dragged flush both read "350"; the geometry underneath differed in the 14th decimal, and the
    Export died on an overlap nobody could see. That is `B-180`'s first named generator.

    ⚠ The test that matters is THIS one — at the zoom a project actually opens at. The grid-zoom
    drag above still passes unchanged, which is the point: the rule did not change, its scope did.
  */
  test('a drag at default zoom lands on whole pixels; Alt-drag stays free', async ({ app }) => {
    test.setTimeout(90_000);
    await app.newProject('B180Drag');
    const cb = (await app.canvas.boundingBox())!;
    await app.addRectangle({ x: cb.width / 2, y: cb.height / 2 });
    await app.selectTool('Select');

    // Deliberately NO zoom step: whatever the project opens at is the zoom under test, and it is
    // below `D-122`'s 800% threshold — so before this fix nothing here snapped at all.
    const pct = Number(
      (await app.page.getByTestId('zoom-readout').textContent())!.replace('%', ''),
    );
    expect(pct, 'this case must be BELOW the D-122 grid threshold').toBeLessThan(800);

    const beforeX = await app.getInspectorNumber('X position');
    const p1 = await pressPointOnSelected(app);
    expect(p1, 'element not visible for the drag').not.toBeNull();
    await app.page.mouse.move(p1!.x, p1!.y);
    await app.page.mouse.down();
    // An odd screen delta, so `delta / scale` is fractional at any plausible fit zoom.
    await app.page.mouse.move(p1!.x + 53, p1!.y + 41, { steps: 10 });
    await app.page.mouse.up();
    const sx = await app.getInspectorNumber('X position');
    const sy = await app.getInspectorNumber('Y position');
    expect(sx, 'sanity: the drag moved X').not.toBe(beforeX);
    expect(Number.isInteger(sx), `X (${String(sx)}) must be a whole scene pixel`).toBe(true);
    expect(Number.isInteger(sy), `Y (${String(sy)}) must be a whole scene pixel`).toBe(true);

    // `Alt` remains the momentary free-placement bypass — unchanged from `D-122`, and now the
    // ONLY way to place sub-pixel by drag. Asserted here so half 1 cannot be read as removing it.
    const p2 = await pressPointOnSelected(app);
    expect(p2).not.toBeNull();
    await app.page.keyboard.down('Alt');
    await app.page.mouse.move(p2!.x, p2!.y);
    await app.page.mouse.down();
    await app.page.mouse.move(p2!.x + 33, p2!.y + 27, { steps: 8 });
    await app.page.mouse.up();
    await app.page.keyboard.up('Alt');
    const ax = await app.getInspectorNumber('X position');
    const ay = await app.getInspectorNumber('Y position');
    expect(
      Number.isInteger(ax) && Number.isInteger(ay),
      `Alt-drag must stay free — X ${String(ax)}, Y ${String(ay)} must not both be integer`,
    ).toBe(false);
  });

  test('an Inspector-typed fractional value is left alone', async ({ app }) => {
    test.setTimeout(90_000);
    await app.newProject('B180Typed');
    await app.addRectangle({ x: 260, y: 220 });
    // The half-1 gate is on the DRAG COMMIT, never on the model, so a number the author typed
    // deliberately survives untouched. `D-122` made the same promise; `B-180` must not break it.
    await app.setInspectorNumber('X position', 6.69);
    expect(await app.getInspectorNumber('X position')).toBeCloseTo(6.69, 6);
  });
});

test.describe('D-122 pixel-snap nudge', () => {
  /** Common setup: a rectangle set to a fractional X, zoomed to `zoomPct`. The element stays
   *  selected throughout (nudge acts on the selection); focus is irrelevant (see `nudge`). */
  async function nudgeSetup(app: DesignerApp, zoomPct: number): Promise<number> {
    await app.addRectangle({ x: 260, y: 220 });
    await app.setInspectorNumber('X position', 6.69);
    return zoomToAtLeast(app, zoomPct);
  }

  test('first nudge of a fractional coordinate lands on the next integer at grid zoom', async ({
    app,
  }) => {
    test.setTimeout(90_000);
    await app.newProject('SnapNudgeRight');
    expect(await nudgeSetup(app, GRID_ZOOM)).toBeGreaterThanOrEqual(800);

    await nudge(app, 'ArrowRight');
    expect(await app.getInspectorNumber('X position'), 'first Right nudge → next integer').toBe(7);
    await nudge(app, 'ArrowRight');
    expect(await app.getInspectorNumber('X position'), 'then steps by whole pixels').toBe(8);
  });

  test('first nudge left of a fractional coordinate lands on the lower integer', async ({
    app,
  }) => {
    test.setTimeout(90_000);
    await app.newProject('SnapNudgeLeft');
    expect(await nudgeSetup(app, GRID_ZOOM)).toBeGreaterThanOrEqual(800);

    await nudge(app, 'ArrowLeft');
    expect(await app.getInspectorNumber('X position'), 'first Left nudge → lower integer').toBe(6);
  });

  test('Alt bypasses the nudge snap — the fraction is preserved', async ({ app }) => {
    test.setTimeout(90_000);
    await app.newProject('SnapNudgeAlt');
    expect(await nudgeSetup(app, GRID_ZOOM)).toBeGreaterThanOrEqual(800);

    await nudge(app, 'ArrowRight', { alt: true });
    expect(await app.getInspectorNumber('X position'), 'Alt+Right is a relative +1').toBeCloseTo(
      7.69,
      6,
    );
  });

  test('below the grid threshold the nudge stays relative (fraction preserved)', async ({
    app,
  }) => {
    test.setTimeout(90_000);
    await app.newProject('SnapNudgeBelow');
    // Zoom to a level ABOVE default but BELOW the 800% grid threshold.
    const pct = await nudgeSetup(app, BELOW_ZOOM);
    expect(pct, 'must be below the grid threshold').toBeLessThan(800);

    await nudge(app, 'ArrowRight');
    expect(
      await app.getInspectorNumber('X position'),
      'below threshold: relative +1, fraction kept',
    ).toBeCloseTo(7.69, 6);
  });
});
