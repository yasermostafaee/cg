import { test, expect, type DesignerApp } from './fixtures/designer.js';

/**
 * D-133 and B-420 cover authoring Hold start in a composition with an Outro, the
 * authored range's full-height indicators, and the separate loop controls.
 *
 * Scenario coverage, mapped from `specs/designer-playout-lifecycle/spec.md`:
 *
 *   "A shapes-only scene can author a loop range"      → the first test
 *   "Markers span the timeline height"                 → the second (MEASURED, not styled)
 *   "The three loops are distinguishable"              → the third
 *   "The surface explains why an authored range is inert" → the fourth
 *
 * Frame-precise seam arithmetic remains deterministic in
 * `packages/template-runtime/tests/hold-loop-range.test.ts` against an injected clock. Browser
 * coverage here verifies that Preview receives the looping cursor and that an automatic content
 * completion drains forward to Out point instead of jumping or wrapping once more.
 */

/**
 * A shapes-only composition: one rectangle with a fade-in entrance, and an out-point.
 *
 * ⚠ The second keyframe is written by the VALUE EDIT alone, with no diamond click. Once a
 * track exists, `commitAnimatable` routes an edit to a keyframe at the playhead (D-006), so
 * clicking the diamond afterwards would TOGGLE that fresh keyframe straight back off — and
 * the entrance would settle nowhere, leaving a degenerate `[out-point → out-point]` range
 * that silently draws nothing. Observed, not theorised: this spec first failed exactly that
 * way, reporting a `frames 38 → 38` loop.
 */
async function shapesOnlyWithOutPoint(app: DesignerApp): Promise<void> {
  await app.addRectangle({ x: 240, y: 130 });
  await app.setInspectorNumber('Opacity', 0);
  await app.toggleInspectorKeyframe('opacity'); // the track's FIRST keyframe: @0 = 0
  await app.scrubToFrame(20);
  await app.setInspectorNumber('Opacity', 100); // upserts @20 — the entrance settles here
  await expect(app.inspectorDiamond('opacity')).toHaveAttribute('data-variant', 'at-frame');
  await app.scrubToFrame(0);
  await app.deselect();
  await app.addOutPoint();
}

test.describe('D-133 — the loop range is authorable and on the timeline', () => {
  test('D-188 — the loop range stays legible over orange yellow purple and green layers', async ({
    app,
  }, testInfo) => {
    await app.newProject('ColoredLoopRange');
    await shapesOnlyWithOutPoint(app);
    const layerIds: string[] = [];
    for (const [index, color] of ['Orange', 'Yellow', 'Purple', 'Green'].entries()) {
      if (index > 0) {
        // At compact canvas zoom, these nearby placements cross the preceding
        // rectangle's resize handles. Clear its gizmo before placing a new shape:
        // addRectangle returns void, not a guarantee that the click inserted a row.
        await app.selectTool('Select');
        await app.deselect();
        await expect(app.page.locator('.cg-tl-row.cg-tl-selected')).toHaveCount(0);
        await app.addRectangle({ x: 300 + index * 35, y: 150 });
      }
      await expect(app.page.locator('.cg-tl-row[data-element-id]')).toHaveCount(index + 1);
      const ids = await app.timelineRowIds();
      const id = ids.find((candidate) => !layerIds.includes(candidate));
      if (id === undefined) throw new Error(`The ${color} contrast layer was not created`);
      layerIds.push(id);
      await app.selectElementById(id);
      await app.setElementName(`${color} contrast layer`);
      await app.openMenuOnSelectedRow();
      await app.layerMenuItem('Color').hover();
      await app.page.getByRole('menuitemradio', { name: color, exact: true }).click();
    }
    await app.deselect();
    await app.page.getByRole('button', { name: 'Set hold start' }).click();
    const band = app.page.getByTestId('loop-range-band');
    const start = app.page.getByTestId('loop-range-start');
    await expect(band).toHaveCSS('background-image', /^linear-gradient\(/);
    await expect(band).toHaveCSS('z-index', '2');
    await expect(band).toHaveCSS('pointer-events', 'none');
    await expect(start).toHaveCSS('opacity', '1');
    await expect(start).toHaveCSS('filter', 'none');
    await expect(start).toHaveCSS('box-shadow', 'none');
    await expect(start).toHaveCSS('border-left-color', 'rgb(95, 174, 128)');
    await expect(app.page.getByTestId('loop-range-end')).toHaveCSS(
      'border-left-color',
      'rgb(255, 174, 87)',
    );
    await expect(start).toHaveCSS('border-left-style', 'solid');
    // A selected bar formerly covered the range completely. Verify paint order AND that
    // the non-interactive overlay leaves the actual lifespan click usable.
    const bar = app.page.getByTestId(`lifespan-trim-start-${layerIds[3]}`).locator('..');
    const bandBox = (await band.boundingBox())!;
    const barBox = (await bar.boundingBox())!;
    await app.page.mouse.click(bandBox.x + bandBox.width / 2, barBox.y + barBox.height / 2);
    await expect(app.page.locator(`.cg-tl-row[data-element-id="${layerIds[3]}"]`)).toHaveClass(
      /cg-tl-selected/,
    );
    await expect(bar).toHaveCSS('z-index', '1');
    await testInfo.attach('pinned-green-range-selected-colored-layer', {
      body: await app.page.getByRole('region', { name: 'Animation timeline' }).screenshot(),
      contentType: 'image/png',
    });
  });

  test('B-420 — a green Hold range appears on Set and disappears on Clear', async ({ app }) => {
    await app.newProject('GreenHoldRange');
    await shapesOnlyWithOutPoint(app);
    const start = app.page.getByTestId('loop-range-start');
    const band = app.page.getByTestId('loop-range-band');
    const end = app.page.getByTestId('loop-range-end');
    const setHold = app.page.getByRole('button', { name: 'Set hold start' });
    await expect(setHold).toHaveCSS('color', 'rgb(95, 174, 128)');
    await expect(start).toHaveCount(0);
    await expect(band).toHaveCount(0);
    await expect(app.page.getByTestId('body-playhead')).toHaveCSS(
      'border-left-color',
      'rgb(56, 189, 248)',
    );
    await expect(end).toHaveCSS('border-left-color', 'rgb(255, 174, 87)');
    await setHold.click();
    await expect(start).toHaveCSS('border-left-style', 'solid');
    await expect(start).toHaveCSS('border-left-color', 'rgb(95, 174, 128)');
    await expect(band).toHaveCSS('background-color', 'rgba(95, 174, 128, 0.14)');
    await expect(app.page.getByRole('separator', { name: 'Hold start marker' })).toHaveCSS(
      'background-color',
      'rgb(95, 174, 128)',
    );
    await app.page.getByRole('button', { name: 'Clear hold start' }).click();
    await expect(start).toHaveCount(0);
    await expect(band).toHaveCount(0);
    await expect(end).toBeVisible();
  });

  test('a SHAPES-ONLY composition with an out-point offers the content-start pin — no ticker needed', async ({
    app,
  }) => {
    await app.newProject('LoopRangeShapes');
    await shapesOnlyWithOutPoint(app);

    // The gate's CONTENT half is gone: this scene has no ticker, sequence or clock.
    const pin = app.page.getByRole('button', { name: 'Set hold start' });
    await expect(pin).toBeVisible();
    await pin.click();

    // And it wrote a real marker — the affordance is not merely present.
    await expect(app.page.getByRole('button', { name: 'Clear hold start' })).toBeVisible();
    await expect(app.page.getByRole('separator', { name: 'Hold start marker' })).toBeVisible();
  });

  test('the authored Hold range and its indicator lines span the full timeline height', async ({
    app,
  }) => {
    await app.newProject('LoopRangeTimeline');
    await shapesOnlyWithOutPoint(app);
    await app.page.getByRole('button', { name: 'Set hold start' }).click();

    const start = app.page.getByTestId('loop-range-start');
    const end = app.page.getByTestId('loop-range-end');
    const band = app.page.getByTestId('loop-range-band');
    await expect(start).toBeAttached();
    await expect(end).toBeAttached();
    await expect(band).toBeAttached();

    const box = async (loc: typeof start): Promise<{ x: number; height: number }> => {
      const b = await loc.boundingBox();
      if (b === null) throw new Error('loop-range element has no box');
      return { x: b.x, height: b.height };
    };
    const playhead = await box(app.page.getByTestId('body-playhead'));
    const sceneLane = await box(app.page.getByTestId('scene-row-lane'));

    // FULL HEIGHT, measured: exactly as tall as the shipped body playhead, and several
    // times the scene row the draggable grips live on. Asserting only "taller than the
    // scene row" would pass on a line two rows tall.
    for (const loc of [start, end, band]) {
      const b = await box(loc);
      expect(Math.abs(b.height - playhead.height)).toBeLessThan(2);
      expect(b.height).toBeGreaterThan(sceneLane.height * 3);
    }

    // The range runs left→right from the content start to the out-point, and the band
    // spans between them.
    const s = await box(start);
    const e = await box(end);
    expect(e.x).toBeGreaterThan(s.x);
    const bandBox = (await band.boundingBox())!;
    expect(bandBox.x).toBeCloseTo(s.x, 0);
    expect(bandBox.x + bandBox.width).toBeCloseTo(e.x, 0);

    // The scene-lane grips are still where they were — the full-height lines are an
    // addition, not a relocation.
    await expect(app.page.getByRole('separator', { name: 'Outro start marker' })).toBeVisible();
  });

  test('D-188 — coincident authored boundaries remain as two visible full-height lines', async ({
    app,
  }) => {
    await app.newProject('CoincidentRange');
    await shapesOnlyWithOutPoint(app);
    await app.page.getByRole('button', { name: 'Set hold start' }).click();
    // Dragging Hold start through Outro start carries both to the same authored frame.
    await app.dragContentStartMarkerToFraction(1);

    const start = app.page.getByTestId('loop-range-start');
    const end = app.page.getByTestId('loop-range-end');
    await expect(start).toBeAttached();
    await expect(end).toBeAttached();
    const startBox = await start.boundingBox();
    const endBox = await end.boundingBox();
    expect(startBox).not.toBeNull();
    expect(endBox).not.toBeNull();
    expect(Math.abs(endBox!.x - startBox!.x)).toBeGreaterThanOrEqual(2);
    expect(Math.abs(endBox!.x - startBox!.x)).toBeLessThanOrEqual(4);
    expect(await start.evaluate((node) => node.style.left)).toBe(
      await end.evaluate((node) => node.style.left),
    );
  });

  test('the three loops are named apart: preview loop, loop cycle, Middle loop', async ({
    app,
  }) => {
    await app.newProject('LoopRangeNaming');
    await shapesOnlyWithOutPoint(app);
    await app.page.getByRole('combobox', { name: 'On hold' }).selectOption('loop');

    // 1 — the transport toggle is the PREVIEW's, and says so.
    await expect(app.page.getByRole('button', { name: 'Preview loop' })).toBeVisible();
    // Nothing on screen is called plain "Loop".
    await expect(app.page.getByRole('button', { name: 'Loop', exact: true })).toHaveCount(0);

    // 2 — the playback MODE keeps its own concise name…
    await expect(app.page.getByRole('option', { name: 'Loop cycle', exact: true })).toBeAttached();

    // 3 — …and the composition-owned Hold row names the looping Middle range.
    await expect(app.page.getByTestId('hold-loop-state')).toContainText(/loop.*middle/i);
  });

  test('B-376 — the root timeline index advances and wraps with an active hold loop', async ({
    app,
  }) => {
    await app.newProject('LoopRangePlayhead');
    await shapesOnlyWithOutPoint(app);
    await app.addTicker({ x: 140, y: 210 });
    await app.deselect();
    await app.setPlayoutTiming('auto-out');
    await app.setHoldSource('content-driven');
    await app.page.getByRole('combobox', { name: 'On hold' }).selectOption('loop');
    // Let the coalesced scene-replace reach the iframe before starting the lifecycle. This spec
    // exercises the hold-loop playhead, not the separate edit-and-Play-in-the-same-rAF race.
    await app.page.waitForTimeout(100);

    const ruler = app.page.getByRole('slider', { name: 'Frame ruler' });
    await expect(app.page.getByTestId('hold-loop-state')).toContainText(/^loop/i);
    await ruler.evaluate((node) => {
      const samples = [Number(node.getAttribute('aria-valuenow') ?? '0')];
      Object.assign(window, { __cgRootFrameSamples: samples });
      new MutationObserver(() => {
        samples.push(Number(node.getAttribute('aria-valuenow') ?? '0'));
      }).observe(node, { attributes: true, attributeFilter: ['aria-valuenow'] });
    });
    const transport = app.page.getByLabel('Playback transport');
    await transport.getByRole('button', { name: 'Rehearse preview' }).click();
    await transport.getByRole('button', { name: 'Play', exact: true }).click();

    await app.page.waitForTimeout(2_000);

    const samples = await app.page.evaluate(
      () =>
        (window as typeof window & { __cgRootFrameSamples?: number[] }).__cgRootFrameSamples ?? [],
    );
    expect(new Set(samples).size).toBeGreaterThan(5);
    expect(
      samples.some((frame, index) => index > 0 && frame < (samples[index - 1] ?? frame) - 4),
    ).toBe(true);
  });

  test('B-379 — native Freeze keeps Canvas and Preview cursor and Shape at Out point', async ({
    app,
  }) => {
    await app.newProject('NativeFreezeParity');
    await app.setSceneDuration(100);
    await app.addRectangle({ x: 240, y: 130 });
    const [rectId] = await app.timelineRowIds();
    if (rectId === undefined) throw new Error('rectangle timeline row was not created');

    // Give Content start and Out point unmistakably different pictures. Pinning Content start
    // before authoring its later keyframe keeps it independent from the entrance heuristic.
    await app.setInspectorNumber('Opacity', 0);
    await app.toggleInspectorKeyframe('opacity'); // @0 = 0
    await app.addOutPoint(); // @75 in this 100-frame composition
    await app.page.getByRole('button', { name: 'Set hold start' }).click();
    await app.dragContentStartMarkerToFraction(0.25); // Content start = 25
    await app.page.locator(`.cg-tl-row[data-element-id="${rectId}"]`).click();
    await app.scrubToFrame(25);
    await app.setInspectorNumber('Opacity', 25); // Content-start picture = 0.25
    await app.scrubToFrame(75);
    await app.setInspectorNumber('Opacity', 80); // Out-point picture = 0.8
    await app.scrubToFrame(0);
    await app.deselect();
    await app.page.getByRole('combobox', { name: 'On hold' }).selectOption('freeze');
    await expect(app.page.getByTestId('hold-loop-state')).toContainText(/hold at frame 75/i);

    // Main Canvas: actual Play must park both the painted Shape and reported root frame at Out.
    await app.page.waitForTimeout(100);
    const transport = app.page.getByLabel('Playback transport');
    await transport.getByRole('button', { name: 'Rehearse preview' }).click();
    await transport.getByRole('button', { name: 'Play', exact: true }).click();
    const canvasShape = app.canvasFrame.locator(`[data-cg-element-id="${rectId}"]`);
    await expect(canvasShape).toHaveCSS('opacity', '0.8', { timeout: 5_000 });
    await expect(app.page.getByRole('slider', { name: 'Frame ruler' })).toHaveAttribute(
      'aria-valuenow',
      '75',
    );
    await transport.getByRole('button', { name: 'Rehearse preview' }).click();

    // Preview owns a separate runtime, but the same Freeze contract: the status counter and
    // rendered Shape must agree on the Out-point picture rather than splitting 25 / 75.
    await app.openPreviewModal();
    await app.play();
    const previewShape = app.previewFrame.locator(`[data-cg-element-id="${rectId}"]`);
    await expect(previewShape).toHaveCSS('opacity', '0.8', { timeout: 5_000 });
    await expect
      .poll(
        async () =>
          Number.parseInt(
            (await app.previewDialog.getByLabel('Preview frame').locator('strong').textContent()) ??
              '',
            10,
          ),
        { timeout: 5_000 },
      )
      .toBe(75);
  });

  test('B-381 — checked and unchecked Middle clocks keep hit-test and selection boxes aligned', async ({
    app,
  }) => {
    await app.newProject('MixedMiddleSelection');
    await app.setSceneDuration(100);

    const addMovingRectangle = async (
      name: string,
      y: number,
      fromX: number,
      toX: number,
    ): Promise<string> => {
      const before = new Set(await app.timelineRowIds());
      // Placement uses screen pixels at the fitted zoom; author the intentionally separated
      // scene-space Y through the Inspector after placing both shapes inside the visible canvas.
      await app.addRectangle({ x: 240, y: Math.min(y, 200) });
      const id = (await app.timelineRowIds()).find((candidate) => !before.has(candidate));
      if (id === undefined) throw new Error(`${name} timeline row was not created`);
      await app.setElementName(name);
      await app.setInspectorNumber('X position', fromX);
      await app.setInspectorNumber('Y position', y);
      await app.toggleInspectorKeyframe('position.x');
      await app.scrubToFrame(100);
      await app.setInspectorNumber('X position', toX);
      await app.scrubToFrame(0);
      return id;
    };

    const checkedId = await addMovingRectangle('Checked', 120, 100, 600);
    const uncheckedId = await addMovingRectangle('Unchecked', 420, 200, 1_300);
    await app.deselect();
    await app.addOutPoint(); // frame 75
    await app.page.getByRole('button', { name: 'Set hold start' }).click();
    await app.dragContentStartMarkerToFraction(0.25); // frame 25
    await app.page.getByRole('combobox', { name: 'On hold' }).selectOption('loop');
    await app.page
      .getByRole('checkbox', { name: 'Unchecked repeats during Hold', exact: true })
      .uncheck();
    await app.page.waitForTimeout(100); // let the coalesced scene replacement reach the iframe

    const ruler = app.page.getByRole('slider', { name: 'Frame ruler' });
    await ruler.evaluate((node) => {
      const samples = [Number(node.getAttribute('aria-valuenow') ?? '0')];
      Reflect.set(window, '__b381RootFrames', samples);
      new MutationObserver(() => {
        samples.push(Number(node.getAttribute('aria-valuenow') ?? '0'));
      }).observe(node, { attributes: true, attributeFilter: ['aria-valuenow'] });
    });
    const transport = app.page.getByLabel('Playback transport');
    await transport.getByRole('button', { name: 'Rehearse preview' }).click();
    await transport.getByRole('button', { name: 'Play', exact: true }).click();

    // Wait for a real Middle wrap, not a guessed timeout. By then the unchecked rectangle has
    // completed its once-only tail at x=1300 while the checked rectangle follows the wrapped root.
    await expect
      .poll(
        async () =>
          app.page.evaluate(() => {
            const samples = (Reflect.get(window, '__b381RootFrames') as number[] | undefined) ?? [];
            return samples.some(
              (frame, index) => index > 0 && frame < (samples[index - 1] ?? frame) - 10,
            );
          }),
        { timeout: 5_000 },
      )
      .toBe(true);
    const uncheckedShape = app.canvasFrame.locator(`[data-cg-element-id="${uncheckedId}"]`);
    // The authoring iframe's B-045 paint shim intentionally pins CSS `left` at 0 and carries the
    // rendered position in a translate prefix. Read the picture in screen space instead of
    // asserting that private implementation detail: the known 320 px rectangle also gives us the
    // fitted canvas scale, so this resolves back to scene X.
    await expect
      .poll(async () => {
        const [rendered, frame] = await Promise.all([
          uncheckedShape.boundingBox(),
          app.canvas.boundingBox(),
        ]);
        if (rendered === null || frame === null || rendered.width === 0) return -Infinity;
        const fittedScale = rendered.width / 320;
        return (rendered.x - frame.x) / fittedScale;
      })
      .toBeGreaterThan(1_295);
    // Rehearse intentionally has no Pause. Return to authoring and inspect the same once-only
    // terminal picture at frame 100, after the lifecycle assertion above proved the real wrap.
    await transport.getByRole('button', { name: 'Rehearse preview' }).click();
    await app.scrubToFrame(100);

    // Hit-test at the box the iframe really paints. The old root-only clock looked hundreds of
    // pixels earlier and could not select this unchecked member at its visible centre.
    const renderedUnchecked = await uncheckedShape.boundingBox();
    const canvas = await app.canvas.boundingBox();
    if (renderedUnchecked === null || canvas === null) throw new Error('canvas boxes not laid out');
    await app.selectTool('Select');
    await app.canvas.click({
      position: {
        x: renderedUnchecked.x + renderedUnchecked.width / 2 - canvas.x,
        y: renderedUnchecked.y + renderedUnchecked.height / 2 - canvas.y,
      },
    });
    await expect(
      app.page.locator(`.cg-tl-row[data-element-id="${uncheckedId}"].cg-tl-selected`),
    ).toHaveCount(1);

    const center = (box: { x: number; y: number; width: number; height: number }) => ({
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
    });
    await expect
      .poll(async () => {
        const rendered = await uncheckedShape.boundingBox();
        const gizmo = await app.gizmoFrame.boundingBox();
        if (rendered === null || gizmo === null) return Infinity;
        const a = center(rendered);
        const b = center(gizmo);
        return Math.hypot(a.x - b.x, a.y - b.y);
      })
      .toBeLessThanOrEqual(3);

    // Multi-select proves both clocks are resolved in the same render: one member remains on the
    // wrapping Middle cursor, the other remains at its independent tail end.
    await app.page
      .locator(`.cg-tl-row[data-element-id="${checkedId}"]`)
      .click({ modifiers: ['Shift'] });
    await expect(app.multiBoxes).toHaveCount(2);
    await expect
      .poll(async () => {
        const rendered = await Promise.all([
          app.canvasFrame.locator(`[data-cg-element-id="${checkedId}"]`).boundingBox(),
          uncheckedShape.boundingBox(),
        ]);
        const overlays = await Promise.all([
          app.multiBoxes.nth(0).boundingBox(),
          app.multiBoxes.nth(1).boundingBox(),
        ]);
        if (rendered.some((box) => box === null) || overlays.some((box) => box === null)) {
          return Infinity;
        }
        const paintedCenters = rendered.map((box) => center(box!)).sort((a, b) => a.y - b.y);
        const overlayCenters = overlays.map((box) => center(box!)).sort((a, b) => a.y - b.y);
        return Math.max(
          ...paintedCenters.map((painted, index) => {
            const overlay = overlayCenters[index]!;
            return Math.hypot(painted.x - overlay.x, painted.y - overlay.y);
          }),
        );
      })
      .toBeLessThanOrEqual(3);
  });

  test('D-187 — Preview drains the current Middle pass before automatic Outro', async ({ app }) => {
    await app.newProject('LoopRangeGracefulExit');
    await app.setSceneDuration(100);
    await shapesOnlyWithOutPoint(app); // Content start 20, Out point 75 at 50 fps.
    await app.addClock({ x: 140, y: 210 });
    await app.setClockCountdown(2); // starts at frame 20, completes mid-Middle near frame 65
    await app.setPlayoutTiming('auto-out');
    await app.setHoldSource('content-driven');
    await app.page.getByRole('combobox', { name: 'On hold' }).selectOption('loop');
    await app.page.waitForTimeout(100);
    await app.openPreviewModal();

    const frameStatus = app.previewDialog.getByLabel('Preview frame').locator('strong');
    await frameStatus.evaluate((node) => {
      const history: string[] = [node.textContent ?? ''];
      Reflect.set(window, '__gracefulExitFrames', history);
      new MutationObserver(() => history.push(node.textContent ?? '')).observe(node, {
        characterData: true,
        childList: true,
        subtree: true,
      });
    });
    await app.previewFrame.locator('[data-cg-clock-time]').evaluate((node) => {
      let sawRunningValue = false;
      const markCompletion = (): void => {
        const value = node.textContent ?? '';
        const isZero = /^(?:00:00(?::00)?|۰۰:۰۰(?::۰۰)?)$/.test(value.trim());
        // A reset countdown can briefly render zero before Play. Arm only after the
        // actual run has shown a non-zero value, then record its later transition to zero.
        if (!isZero) {
          if (value.trim() !== '') sawRunningValue = true;
          return;
        }
        if (!sawRunningValue) return;
        const history = Reflect.get(window.parent, '__gracefulExitFrames') as string[] | undefined;
        if (Reflect.get(window.parent, '__gracefulExitCompletionIndex') === undefined) {
          Reflect.set(window.parent, '__gracefulExitCompletionIndex', history?.length ?? 0);
        }
      };
      new MutationObserver(markCompletion).observe(node, {
        characterData: true,
        childList: true,
        subtree: true,
      });
      markCompletion();
    });

    await app.play();
    const previewBody = app.previewFrame.locator('body');
    await expect(previewBody).not.toHaveClass(/cg-pending/);
    await expect(previewBody).toHaveClass(/cg-pending/, { timeout: 10_000 });

    const sample = await app.page.evaluate(() => ({
      history: (Reflect.get(window, '__gracefulExitFrames') as string[] | undefined) ?? [],
      completionIndex:
        (Reflect.get(window, '__gracefulExitCompletionIndex') as number | undefined) ?? -1,
    }));
    expect(sample.completionIndex).toBeGreaterThanOrEqual(0);
    const afterCompletion = sample.history
      .slice(sample.completionIndex)
      .map((value) => Number.parseInt(value, 10))
      .filter(Number.isFinite);
    const firstOutroFrame = afterCompletion.findIndex((frame) => frame > 75);
    expect(firstOutroFrame).toBeGreaterThan(0);
    const drainedMiddle = afterCompletion.slice(0, firstOutroFrame);
    expect(drainedMiddle).toContain(75);
    expect(
      drainedMiddle.every((frame, index) => index === 0 || frame >= drainedMiddle[index - 1]!),
    ).toBe(true);
  });

  test('B-370 — Playout info icons share one right-edge column', async ({ app }) => {
    await app.newProject('PlayoutInfoAlignment');
    await shapesOnlyWithOutPoint(app);
    await app.setPlayoutTiming('loop-cycle');

    const names = [
      'About Template settings',
      'About Operator defaults',
      'About Delay between passes',
      'About Outro start',
      'About Automatic Hold start',
      'About On hold',
    ];
    const rightEdges: number[] = [];
    for (const name of names) {
      const button = app.page.getByRole('button', { name });
      await expect(button).toBeVisible();
      const box = await button.boundingBox();
      expect(box, name).not.toBeNull();
      rightEdges.push(box!.x + box!.width);
    }

    expect(Math.max(...rightEdges) - Math.min(...rightEdges)).toBeLessThanOrEqual(1);
  });

  test('D-188 — phase actions are short, equal and easy to hit in every marker state', async ({
    app,
  }) => {
    await app.newProject('PlaybackPhaseActions');
    await shapesOnlyWithOutPoint(app);

    const sizes: { width: number; height: number }[] = [];
    const sample = async (name: string, visible: string): Promise<void> => {
      const action = app.page.getByRole('button', { name });
      await expect(action).toHaveText(visible);
      const box = await action.boundingBox();
      expect(box, name).not.toBeNull();
      sizes.push({ width: box!.width, height: box!.height });
    };

    await sample('Clear outro start', 'Clear');
    await expect(app.page.getByRole('separator', { name: 'Outro start marker' })).toHaveAttribute(
      'title',
      'Outro start',
    );
    await sample('Set hold start', 'Set');
    await app.page.getByRole('button', { name: 'Set hold start' }).click();
    await expect(app.page.getByRole('separator', { name: 'Hold start marker' })).toHaveAttribute(
      'title',
      'Hold start',
    );
    await sample('Clear hold start', 'Clear');
    await app.page.getByRole('button', { name: 'Clear outro start' }).click();
    await sample('Set outro start', 'Set');

    expect(Math.min(...sizes.map((size) => size.height))).toBeGreaterThanOrEqual(28);
    expect(
      Math.max(...sizes.map((size) => size.width)) - Math.min(...sizes.map((size) => size.width)),
    ).toBeLessThanOrEqual(1);
  });

  test('Freeze, an empty Middle and an active Middle each explain the effective Hold picture', async ({
    app,
  }) => {
    await app.newProject('LoopRangeState');
    await shapesOnlyWithOutPoint(app);
    const state = app.page.getByTestId('hold-loop-state');

    // 1 — Freeze is the default composition policy and states the parked frame.
    await expect(state).toContainText(/^freeze/i);
    await expect(state).toContainText(/hold at frame/i);
    await app.page.getByRole('button', { name: 'About On hold' }).click();
    await expect(app.page.getByRole('dialog')).toContainText(/keeps its settled/i);
    await app.page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();

    // 2 — selecting Loop middle and moving its start onto the out point makes the range empty.
    await app.page.getByRole('combobox', { name: 'On hold' }).selectOption('loop');
    await app.page.getByRole('button', { name: 'Set hold start' }).click();
    // Pin writes the automatic entrance frame; dragging beyond the out point advances Outro
    // start to the same frame and therefore creates an explicitly-authored empty Middle.
    await app.dragContentStartMarkerToFraction(1);
    await expect(state).toContainText(/^empty/i);
    await app.page.getByRole('button', { name: 'About On hold' }).click();
    await expect(app.page.getByRole('dialog')).toContainText(/nothing to replay/i);
    await app.page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();

    // 3 — moving the same marker earlier makes the composition-owned Middle range active.
    await app.dragContentStartMarkerToFraction(0);
    await expect(state).toContainText(/^loop/i);
    await expect(state).toContainText(/middle frames/i);
    await app.page.getByRole('button', { name: 'About On hold' }).click();
    await expect(app.page.getByRole('dialog')).toContainText(/do not restart/i);
  });
});
