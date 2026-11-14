import { readFile } from 'node:fs/promises';
import type { Scene } from '@cg/shared-schema';
import { buildTemplateLiveSources, packProject, unpack } from '@cg/vcg-format';
import { defaultLiveSource } from '../../src/renderer/state/element-defaults.js';
import { test, expect } from './fixtures/designer.js';
import type { DesignerApp } from './fixtures/designer.js';

/**
 * D-137 phase 1 — the **Live Source** element in the real browser: place it, see its
 * SMPTE bars while authoring, and get NOTHING in the export.
 *
 * Maps `openspec/changes/live-source-multibox/specs/designer-live-source/spec.md`,
 * one `test` per `#### Scenario` that has a UI to drive:
 *
 *   - "The element carries its id and is placeable" + "The scene never declares a
 *     key source"
 *   - "A device reference is refused as a source id" (the authoring half)
 *   - "A selectable fallback on the authoring surfaces and in the export"
 *   - "An off-frame Live Source blocks rather than vanishes"
 *   - "The affordances that cannot reach air are absent" + "The author is told why,
 *     once"
 *   - "Overlapping Live Sources are reported"
 *   - "Multiple independent Live Sources"
 *   - D-147's "the aspect is chosen by NAME" and "fit the plate to the aspect"
 *
 * The scenarios with NO UI to drive in phase 1 are pinned deterministically instead,
 * and named here so the mapping is complete rather than quietly partial:
 *   - "A bound id is settable at playout" → the RESOLVER rule and the target's
 *     shape are pinned in `tests/live-source-preflight.test.ts` and
 *     `packages/shared-schema/tests/live-source.test.ts`. The playout half is
 *     genuinely later work: nothing consumes the value until the bridge resolves it
 *     against the installation's source mapping (phase 6), so an E2E here could only
 *     assert that a binding row exists — which the unit tests already do, without
 *     implying the value reaches air.
 *   - "A stored scene authored before this change still parses" →
 *     `packages/shared-schema/tests/live-source.test.ts`
 *   - "An authored zone cannot fill the hole on air" → `zoneOverrides` is reachable
 *     from no Designer surface, so it is pinned in
 *     `packages/template-runtime/tests/live-source-render.test.ts`
 *   - "A nested Live Source declares its true rect" → the DECLARATION is phase 2;
 *     phase 1 pins only that a nested hole inherits the render mode (same file).
 *   - "An animated hole is refused in v1" and "A rotated plate — or a rotated parent
 *     — is refused" → `tests/live-source-preflight.test.ts`. These USED to be driven
 *     here, by clicking a keyframe diamond and reading the resulting error row.
 *     There is no diamond to click any more, which is the improvement: the refusals
 *     are now PREVENTED while authoring rather than reported at export. The ANCESTOR
 *     halves (an animated or rotated CONTAINER above a static plate) could not be
 *     driven here in any case — the Designer has no UI that creates a container.
 */

/** Every rendered Live Source box in the editor canvas iframe. */
const holes = (app: DesignerApp) =>
  app.canvasFrame.locator('[data-cg-placeholder-for="video-placeholder"]');

/** The bars' id label inside the first hole. */
const label = (app: DesignerApp) => holes(app).first().locator('[data-cg-live-source-label]');

/** The status bar's error pill — present only when preflight has an error. */
const errorPill = (app: DesignerApp) => app.page.getByRole('button', { name: 'Show issues' });

/** The issues MODAL. Scoped deliberately: the same rows also render in the sidebar
 *  Issues panel, so an unscoped `getByText` is a strict-mode violation, not a bug. */
const issuesModal = (app: DesignerApp) => app.page.getByRole('dialog', { name: 'Issues' });

/** Issue messages are selectable text. Navigation uses a separate button. */
const issueRows = (app: DesignerApp, text: RegExp) => issuesModal(app).getByText(text);

async function openIssues(app: DesignerApp): Promise<void> {
  await errorPill(app).click();
  await expect(issuesModal(app)).toBeVisible();
}

/**
 * The Inspector's W / H spinbuttons, for reading the fit action's result.
 *
 * `exact` is REQUIRED, not tidiness: Playwright's `name` matches by SUBSTRING, and
 * the §9a.1 Frame section below adds a `stroke width` row to this same Inspector — so
 * an inexact `Width` resolves to two elements and fails strict mode. The under-
 * specification was here all along; the new control is only what exposed it.
 */
const sizeField = (app: DesignerApp, which: 'Width' | 'Height') =>
  app.inspector.getByRole('spinbutton', { name: which, exact: true });

test.describe('Live Source (D-137 phase 1)', () => {
  test('placeable, carries its id, and it round-trips through the Inspector', async ({ app }) => {
    await app.newProject('LiveSource');
    await app.addLiveSource({ x: 200, y: 160 });

    /*
      🔴 `B-187` (owner, 2026-10-14, Q2 (c)) — IT EXISTS ON THE CANVAS WITH AN AUTOMATIC NAME,
      AND SAYS THE NAME IS AUTOMATIC.

      `B-183` made a drawn plate point at NOTHING, because its old automatic name was a suggestion the
      author had not accepted. The owner reopened the default on one condition — the surface
      says the tool chose it — so the plate is born `plate-1`, marked "auto" until the author
      keeps it or types another. "Nothing lands unconfirmed" holds: the name lands labelled.
    */
    await expect(holes(app)).toHaveCount(1);
    await expect(app.liveSourceIdInput).toHaveValue('plate-1');
    await expect(label(app)).toHaveText('plate-1');
    const auto = app.inspector.getByTestId('live-source-auto');
    await expect(auto).toHaveText('auto');
    // …and it is exportable: the operator maps `plate-1` in CG Control, as any id.
    await expect(errorPill(app)).toHaveCount(0);

    // Choose one — the bars' label follows, which is what makes several holes on one
    // frame distinguishable at a glance. A typed id is the author's: "auto" goes.
    await app.setLiveSourceId('guest-1');
    await expect(label(app)).toHaveText('guest-1');
    await expect(auto).toHaveCount(0);

    // ONE id. The key-source-id control is gone: whether an id resolves to a single
    // device or to a fill/key PAIR is a property of the installation's mapping in CG
    // Control, and the author cannot know it (design.md §1a).
    await expect(app.inspector.getByRole('textbox', { name: 'Plate key source id' })).toHaveCount(
      0,
    );

    /*
      `B-183` survives for a CLEARED plate: emptying the field unassigns it, the bars say
      `no source`, and the export refuses it (`live-source-unset`) until a source is chosen.
      ⚠ Asserted on the PILL only: opening the Issues modal deselects the plate, and the
      message is pinned by value in `plate-source-unassigned.dom.test.ts`.
    */
    await app.setLiveSourceId('');
    await expect(label(app)).toHaveText('no source');
    await expect(errorPill(app)).toHaveCount(1);
    await app.setLiveSourceId('guest-1');
    await expect(errorPill(app)).toHaveCount(0);
  });

  test('B-187 — keeping the automatic name drops "auto" and keeps the name', async ({ app }) => {
    await app.newProject('LiveSourceAutoKeep');
    await app.addLiveSource({ x: 200, y: 160 });
    const auto = app.inspector.getByTestId('live-source-auto');
    await expect(auto).toHaveAttribute(
      'title',
      'Named automatically when the plate was drawn. Keep it, or type your own.',
    );
    const autoPolicy = app.inspector.getByRole('checkbox', {
      name: 'auto source id',
      exact: true,
    });
    await expect(autoPolicy).toBeChecked();
    await autoPolicy.click();
    await expect(auto).toHaveCount(0);
    await expect(app.liveSourceIdInput).toHaveValue('plate-1');
    await expect(label(app)).toHaveText('plate-1');
  });

  test('a device reference is REFUSED as a source id, and the value reverts', async ({ app }) => {
    await app.newProject('LiveSourceDevice');
    await app.addLiveSource({ x: 200, y: 160 });
    await app.setLiveSourceId('guest-1');

    // `DECKLINK DEVICE 3` is a concrete device. A template names sources
    // SYMBOLICALLY; which device an id resolves to is set per installation.
    await app.setLiveSourceId('DECKLINK DEVICE 3');
    // Refused, not sanitised: the committed value is unchanged and the input shows
    // it, so the author is never looking at a value the scene does not hold.
    await expect(app.liveSourceIdInput).toHaveValue('guest-1');
    await expect(label(app)).toHaveText('guest-1');

    // The refusal explains where the mapping DOES belong. Matched on a phrase unique
    // to the NOTICE: D-147's key-id hint also mentions CG Control, and an unscoped
    // match would pass on the hint while the notice never appeared.
    await expect(app.page.getByText(/is not a Plate id/)).toBeVisible();
  });

  test('a new live plate uses Bars and still offers a solid-colour fallback', async ({ app }) => {
    await app.newProject('LiveSourceBars');
    await app.addLiveSource({ x: 200, y: 160 });
    await app.setLiveSourceId('guest-1');

    await expect(label(app)).toHaveText('guest-1');
    const fallback = holes(app).first().locator('[data-cg-live-fallback]');
    await expect
      .poll(() => fallback.evaluate((el) => getComputedStyle(el).backgroundImage))
      .toContain('gradient');
    await app.inspector.getByRole('button', { name: 'fallback', exact: true }).click();
    const picker = app.page.getByRole('dialog', { name: 'Choose picture for fallback' });
    const bars = picker.getByRole('button', { name: 'Bars', exact: true });
    const thumbnail = bars.locator('img');
    await expect(thumbnail).toBeVisible();
    await expect
      .poll(() => thumbnail.evaluate((node) => (node as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
    await picker.getByRole('button', { name: 'Solid colour', exact: true }).click();
    await expect(fallback).toHaveCSS('background-color', 'rgb(0, 0, 0)');
    const showFallback = app.inspector.getByRole('checkbox', {
      name: 'Show fallback on air',
      exact: true,
    });
    await expect(showFallback).toBeChecked();
    await showFallback.uncheck();
    await expect(fallback).toHaveCSS('background-color', 'rgb(0, 0, 0)');
    await expect(label(app)).toHaveText('guest-1');
    const { html: hiddenFallback } = await app.exportHtml();
    expect(hiddenFallback).toContain('"showFallback":false');
    const output = await app.page.context().newPage();
    try {
      await output.setContent(hiddenFallback);
      const outputPlate = output.locator('[data-cg-live-source="guest-1"]');
      await expect(outputPlate).toHaveCount(1);
      await expect(outputPlate.locator('[data-cg-live-fallback]')).toHaveCount(0);
    } finally {
      await output.close();
    }

    const transport = app.page.getByLabel('Playback transport');
    const rehearse = transport.getByRole('button', { name: 'Rehearse preview' });
    await rehearse.click();
    await transport.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(fallback).toBeVisible();
    await expect(fallback).toHaveCSS('background-color', 'rgb(0, 0, 0)');
    await transport.getByRole('button', { name: 'Stop', exact: true }).click();
    await rehearse.click();

    await app.openPreviewModal();
    await app.play();
    const previewFallback = app.previewFrame.locator('[data-cg-live-fallback]');
    await expect(previewFallback).toBeVisible();
    await expect(previewFallback).toHaveCSS('background-color', 'rgb(0, 0, 0)');
    await app.previewDialog.getByRole('button', { name: 'Close' }).click();

    const [plateId] = await app.timelineRowIds();
    await app.selectElementById(plateId!);
    await showFallback.check();
    await expect(fallback).toHaveCSS('background-color', 'rgb(0, 0, 0)');
    await app.inspector.getByRole('button', { name: 'fallback', exact: true }).click();
    await bars.click();
    await expect
      .poll(() => fallback.evaluate((el) => getComputedStyle(el).backgroundImage))
      .toContain('gradient');

    // EXPORT carries the same fallback choice. The authoring label is drawn only in Preview.
    const { html } = await app.exportHtml();
    expect(html).toContain('"type":"video-placeholder"');
    expect(html).toContain('"routeKey":"guest-1"');
    expect(html).toContain('"fallbackKind":"bars"');
    expect(html).toContain("mode: 'output'");
    // The exported page has no static authoring label.
    expect(html).not.toContain('data-cg-live-source-label');
  });

  test('D-202 — legacy linked reveals still export without a Reveal masks editor', async ({
    app,
    page,
  }) => {
    const timestamp = '2026-11-08T00:00:00.000Z';
    const resolution = { width: 1920, height: 1080 };
    const frameRange = { in: 0, out: 75 };
    const revealMask = {
      targetSourceId: 'lower',
      rect: { x: 0.05, y: 0.7, width: 0.9, height: 0.25 },
      additionalRects: [{ x: 0.25, y: 0.2, width: 0.5, height: 0.15 }],
    };
    const scene: Scene = {
      schemaVersion: 1,
      id: 'legacy-reveal-project',
      name: 'Legacy reveal',
      templateType: 'custom',
      resolution,
      frameRate: 25,
      frameRange,
      safeAreas: { title: 10, action: 5 },
      editorBackdrop: 'transparent',
      layers: [],
      fields: [],
      bindings: [],
      fonts: [],
      metadata: { createdAt: timestamp, updatedAt: timestamp },
      entryCompositionId: 'comp1',
      compositions: [
        {
          id: 'comp1',
          allowLivePlateOverlap: false,
          name: 'Main',
          resolution,
          frameRange,
          editorBackdrop: 'transparent',
          layers: [
            {
              id: 'plate-layer',
              name: 'Plates',
              visible: true,
              locked: false,
              blendMode: 'normal',
              children: [
                { ...defaultLiveSource('lower', 480, 300), routeKey: 'lower' },
                { ...defaultLiveSource('upper', 480, 300), routeKey: 'upper', revealMask },
              ],
            },
          ],
        },
      ],
    };
    const bytes = await packProject({
      scene,
      index: [],
      files: new Map(),
      savedAt: timestamp,
    });
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Import project', exact: true }).click();
    await (
      await chooser
    ).setFiles({
      name: 'Legacy reveal.cgproj',
      mimeType: 'application/zip',
      buffer: Buffer.from(bytes),
    });
    await app.expectStudio();
    await expect(holes(app)).toHaveCount(2);
    await app.selectElementById('upper');

    const masks = holes(app).filter({ hasText: 'upper' }).locator('[data-cg-live-reveal-mask]');
    await expect(masks).toHaveText(['Mask 1', 'Mask 2']);
    await expect(masks.first()).toHaveAttribute('style', /left: 5%; top: 70%/);
    await expect(masks.nth(1)).toHaveAttribute('style', /left: 25%; top: 20%/);
    const maskName = masks.first().getByText('Mask 1', { exact: true });
    await expect.poll(async () => (await maskName.boundingBox())?.height ?? 0).toBeGreaterThan(16);
    await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
    await expect.poll(async () => (await maskName.boundingBox())?.height ?? 0).toBeGreaterThan(16);
    await expect(
      app.inspector.getByRole('group', { name: 'Plate mask', exact: true }),
    ).toBeVisible();
    await expect(app.inspector.getByRole('group', { name: 'Reveal masks' })).toHaveCount(0);
    await expect(app.inspector.getByLabel('reveal lower plate')).toHaveCount(0);
    await expect(page.getByTestId('mask-editor')).toHaveCount(0);
    await expect(errorPill(app)).toHaveCount(0);

    const { html } = await app.exportHtml();
    expect(html).toContain('"revealMask":' + JSON.stringify(revealMask));

    await app.selectElementById('lower');
    await page.keyboard.press('Delete');
    await expect(holes(app)).toHaveCount(1);
    await expect(masks).toHaveCount(0);
    await expect(errorPill(app)).toHaveCount(0);
    await app.undo();
    await expect(holes(app)).toHaveCount(2);
    await expect(masks).toHaveCount(2);
  });

  test('D-202 — a single plate can Mask, Revert and remove its windows', async ({ app }) => {
    await app.newProject('SinglePlateMask');
    await app.addLiveSource({ x: 200, y: 160 });
    const plate = holes(app).first();
    const bounds = await plate.boundingBox();
    if (bounds === null) throw new Error('Plate is not visible');
    const { x, y, width, height } = bounds;
    const maskControls = app.inspector.getByRole('group', { name: 'Plate mask', exact: true });
    const guides = plate.locator('[data-cg-live-plate-mask]');
    const edit = maskControls.getByRole('button', { name: 'Edit plate mask on Canvas' });
    await expect(maskControls.getByRole('button', { name: 'Redraw plate mask' })).toHaveCount(0);
    for (const top of [0.15, 0.6]) {
      await maskControls.getByRole('button', { name: 'Add plate mask' }).click();
      await app.page.mouse.move(x + width * 0.2, y + height * top);
      await app.page.mouse.down();
      await app.page.mouse.move(x + width * 0.8, y + height * (top + 0.2), { steps: 5 });
      await app.page.mouse.up();
    }
    await expect(guides).toHaveText(['Mask 1', 'Mask 2']);
    await expect(edit).toHaveAttribute('aria-pressed', 'true');
    await expect(edit).toHaveCSS('background-color', 'rgb(58, 63, 89)');
    await maskControls.getByRole('button', { name: 'Add plate mask' }).click();
    await expect(edit).toHaveAttribute('aria-pressed', 'false');
    await app.page.keyboard.press('Escape');
    await expect(edit).toHaveAttribute('aria-pressed', 'false');
    await expect(guides).toHaveCount(2);
    const selector = maskControls.getByLabel('plate mask', { exact: true });
    await selector.selectOption('0');
    const sibling = await guides.nth(1).getAttribute('style');
    const editor = app.page.getByTestId('mask-editor');
    const beforeMove = await editor.boundingBox();
    if (beforeMove === null || sibling === null)
      throw new Error('The mask windows are not visible');
    const centerX = beforeMove.x + beforeMove.width / 2;
    const centerY = beforeMove.y + beforeMove.height / 2;
    await app.page.mouse.move(centerX, centerY);
    await app.page.mouse.down();
    await app.page.mouse.move(centerX + width * 0.1, centerY + height * 0.1, { steps: 5 });
    await app.page.mouse.up();
    const editedRect = () =>
      guides.first().evaluate((node) => {
        const { left, top, width, height } = (node as HTMLElement).style;
        return [left, top, width, height].map(Number.parseFloat);
      });
    await expect.poll(async () => (await editedRect())[0]).toBeCloseTo(30, -1);
    await expect.poll(async () => (await editedRect())[1]).toBeCloseTo(25, -1);
    const moved = await editedRect();
    await expect(guides.nth(1)).toHaveAttribute('style', sibling);

    const corner = app.page.getByTestId('mask-resize-bottom-right');
    const grip = await corner.boundingBox();
    if (grip === null) throw new Error('The resize handle is not visible');
    const gripX = grip.x + grip.width / 2;
    const gripY = grip.y + grip.height / 2;
    await app.page.mouse.move(gripX, gripY);
    await app.page.mouse.down();
    await app.page.mouse.move(x + width * 1.3, gripY + height * 0.1, { steps: 5 });
    await app.page.keyboard.press('Escape');
    await app.page.mouse.up();
    await expect(editor).toHaveCount(0);
    await expect(edit).toHaveAttribute('aria-pressed', 'false');
    await expect(edit).not.toHaveCSS('background-color', 'rgb(58, 63, 89)');
    expect(await editedRect()).toEqual(moved);

    await edit.click();
    await expect(corner).toBeVisible();
    await app.page.mouse.move(gripX, gripY);
    await app.page.mouse.down();
    await app.page.mouse.move(x + width * 1.3, gripY + height * 0.1, { steps: 5 });
    await app.page.mouse.up();
    await expect.poll(async () => (await editedRect())[2]).toBeCloseTo(70, -1);
    await expect.poll(async () => (await editedRect())[3]).toBeCloseTo(30, -1);
    await expect(guides.nth(1)).toHaveAttribute('style', sibling);
    await app.undo();
    await expect.poll(editedRect).toEqual(moved);
    const [plateId] = await app.timelineRowIds();
    if (plateId === undefined) throw new Error('The plate row is missing');
    await app.selectElementById(plateId);
    await expect(edit).toHaveAttribute('aria-pressed', 'true');
    await app.canvas.click({ position: { x: 20, y: 20 } });
    await expect(editor).toHaveCount(0);
    await expect(maskControls).toHaveCount(0);
    await app.selectElementById(plateId);
    await expect(edit).toHaveAttribute('aria-pressed', 'true');
    await expect(guides.first()).toHaveAttribute('data-cg-live-plate-mask', 'inside');
    const fallback = plate.locator('[data-cg-live-fallback]');
    await expect(fallback.locator('clipPath rect')).toHaveCount(2);
    await maskControls.getByRole('checkbox', { name: 'Revert' }).check();
    await expect(guides.first()).toHaveAttribute('data-cg-live-plate-mask', 'outside');
    await expect.poll(() => fallback.locator('clipPath rect').count()).toBeGreaterThan(2);
    await expect(errorPill(app)).toHaveCount(0);
    const permission = app.inspector.getByRole('checkbox', {
      name: 'Allow mask editing in CG Control',
    });
    await expect(permission).not.toBeChecked();
    await permission.check();
    const { html } = await app.exportHtml();
    expect(html).toContain('"liveMask":{"mode":"outside","rects":');
    expect(html).toContain('"allowOperatorMaskEdit":true');
    await maskControls.getByRole('button', { name: 'Remove plate mask' }).click();
    await expect(guides).toHaveCount(1);
    await maskControls.getByRole('button', { name: 'Remove plate mask' }).click();
    await expect(guides).toHaveCount(0);
    await expect(fallback).toHaveCSS('clip-path', 'none');
  });

  test('an OFF-FRAME Live Source blocks the export instead of vanishing', async ({ app }) => {
    await app.newProject('LiveSourceOffFrame');
    await app.addLiveSource({ x: 200, y: 160 });

    // Park it fully off-frame (the frame is 1920 wide).
    const xField = app.inspector.getByRole('spinbutton', { name: 'X position' });
    await xField.fill('5000');
    await xField.press('Enter');

    // An ordinary graphic would be DELETED from the export here, silently. A Live
    // Source is exempt from that drop — the element survives…
    await expect(holes(app)).toHaveCount(1);
    // …and preflight raises an ERROR instead, which is what blocks the export.
    await openIssues(app);
    await expect(issueRows(app, /entirely outside/)).toHaveCount(1);
  });

  /**
   * The v1 refusals are now PREVENTED at authoring time rather than reported at
   * export, so this test asserts the affordances are absent instead of driving them
   * and reading the error.
   *
   * That is a deliberate inversion of what it used to do: it clicked the
   * `position.x` diamond and expected a preflight row. There is no diamond to click
   * any more — which is the point. The author cannot reach the error, so the error's
   * own coverage moved to `tests/live-source-preflight.test.ts`, where the ANCESTOR
   * cases (an animated or rotated CONTAINER above a static plate) live too. Those
   * cannot be driven here at all: the Designer has no UI that creates a container.
   */
  test('the Inspector offers nothing a plate cannot honour', async ({ app }) => {
    await app.newProject('LiveSourceAffordances');
    await app.addLiveSource({ x: 200, y: 160 });
    // `B-183` — a new plate is UNASSIGNED, so it is a preflight error until a source is
    // chosen. This test is about which CONTROLS the Inspector offers, so the source is set
    // to keep the composition clean; the unassigned state has its own test above.
    await app.setLiveSourceId('guest-1');

    // No keyframe diamond on ANY transform field — the rect is composed once at
    // import and sent as a static MIXER FILL, so an animated hole would slide off
    // the picture behind it.
    await expect(app.page.getByRole('button', { name: /^Toggle keyframe for / })).toHaveCount(0);

    // `DESIGNER-FIX-0905` — rotation (MIXER FILL is axis-aligned) and opacity (the plate
    // paints nothing on air; the picture is drawn above the page) are WITHHELD, not hidden:
    // present, disabled, and carrying their reason as the tooltip.
    const rotation = app.inspector.getByRole('spinbutton', { name: 'Rotation' });
    const opacity = app.inspector.getByRole('spinbutton', { name: 'Opacity' });
    await expect(rotation).toHaveCount(1);
    await expect(rotation).toBeDisabled();
    await expect(rotation).toHaveAttribute('title', /withheld on a live plate/i);
    await expect(opacity).toHaveCount(1);
    await expect(opacity).toBeDisabled();
    await expect(opacity).toHaveAttribute('title', /withheld on a live plate/i);

    // The Filter section is a WITHHELD header, not an expandable section: filters paint
    // pixels, and in 'author' mode one would tint only the SMPTE bars.
    await expect(app.inspector.getByRole('button', { name: 'Toggle Filter' })).toHaveCount(0);
    const filterStub = app.inspector.getByTestId('section-withheld').filter({ hasText: 'Filter' });
    await expect(filterStub).toHaveCount(1);
    await expect(filterStub).toContainText(/withheld/i);

    // What DOES stay: the box itself. A static scale is composed into the declared
    // rect, so these six describe the hole, and the hole is the contract.
    // (`exact` — the §9a.1 `stroke width` row makes an inexact `Width` match two.)
    for (const field of ['X position', 'Y position', 'Width', 'Height', 'Scale X', 'Scale Y']) {
      await expect(app.inspector.getByRole('spinbutton', { name: field, exact: true })).toHaveCount(
        1,
      );
    }

    // ⭐ §9a.1 — and what the plate CAN honour is offered: the Frame. It is the one
    // thing this element paints, it paints outside the hole, so it is not in the
    // subtraction above. Asserted HERE, in the test that owns the subtraction, so the
    // two can never drift into disagreeing about the same Inspector.
    await expect(app.inspector.getByRole('spinbutton', { name: 'stroke width' })).toHaveCount(1);
    await expect(app.inspector.getByRole('textbox', { name: 'stroke hex value' })).toHaveCount(1);

    // And the author is told WHY, here, rather than at export: the STATE inline, the
    // mechanism behind the `i` at reading size — written against the reorder (no hole).
    const state = app.inspector.getByTestId('live-source-state');
    await expect(state).toContainText(/static and axis-aligned/i);
    await expect(app.inspector).not.toContainText(/\bhole\b/i);
    await state.getByRole('button', { name: /About Live plates on air/ }).click();
    const tip = app.page.getByRole('dialog', { name: 'Live plates on air' });
    await expect(tip).toContainText(/composited below the live pictures/i);
    await expect(tip).not.toContainText(/\bhole\b/i);
    await app.page.keyboard.press('Escape');
    await expect(tip).toHaveCount(0);

    // A freshly drawn plate is still exportable.
    await expect(errorPill(app)).toHaveCount(0);
  });

  test('OVERLAPPING Live Sources are reported against both', async ({ app }) => {
    await app.newProject('LiveSourceOverlap');
    await app.addLiveSource({ x: 200, y: 160 });
    await app.addLiveSource({ x: 230, y: 190 });
    await expect(holes(app)).toHaveCount(2);

    await app.inspector.getByRole('checkbox', { name: 'Allow live plate overlap' }).uncheck();
    await openIssues(app);
    // One message per participant.
    await expect(issueRows(app, /overlaps/)).toHaveCount(2);
  });

  test('D-213 allows authored overlap by default and remembers an explicit opt-out', async ({
    app,
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'storage', { configurable: true, value: undefined });
    });
    await app.goto();
    await app.newProject('Authored overlap');
    await app.addLiveSource({ x: 200, y: 160 });
    await app.setLiveSourceId('back');
    await app.setInspectorNumber('X position', 550);
    await app.setInspectorNumber('Y position', 360);
    const allowMove = app.inspector.getByRole('checkbox', { name: 'Allow move', exact: true });
    const resize = app.inspector.getByRole('combobox', { name: 'Resize', exact: true });
    await allowMove.check();
    await expect(resize).toHaveValue('locked');
    await app.addLiveSource({ x: 230, y: 190 });
    await app.setLiveSourceId('front');
    await app.setInspectorNumber('X position', 1170);
    await app.setInspectorNumber('Y position', 700);
    await resize.selectOption('free');
    await expect(allowMove).not.toBeChecked();
    const idOf = (source: string) =>
      holes(app)
        .filter({ hasText: source })
        .evaluate((plate) =>
          plate.closest('[data-cg-element-id]')?.getAttribute('data-cg-element-id'),
        );
    const [back, front] = await Promise.all([idOf('back'), idOf('front')]);
    if (back == null || front == null) throw new Error('The two plates need timeline rows');
    const exportButton = app.page.getByRole('button', { name: 'Export .vcg', exact: true });
    await expect(exportButton).not.toHaveAttribute('data-export-blocked', 'errors');
    const allow = app.inspector.getByRole('checkbox', { name: 'Allow live plate overlap' });
    const selectedControls = app.inspector.locator('[data-section="CG Control"]');
    const autoLayoutName = 'Allow Auto layout in CG Control';
    await expect(app.inspector.getByRole('checkbox', { name: autoLayoutName })).toHaveCount(0);
    await expect(
      selectedControls.getByRole('checkbox', { name: 'Allow live plate overlap' }),
    ).toBeChecked();
    for (const checkbox of [allowMove, allow]) {
      expect(await checkbox.boundingBox()).toMatchObject({ width: 14, height: 14 });
    }
    await expect(app.inspector.getByRole('group', { name: 'Reveal masks' })).toHaveCount(0);
    await allow.uncheck();
    await expect(exportButton).toHaveAttribute('data-export-blocked', 'errors');
    await allow.check();
    await expect(app.inspector.getByRole('group', { name: 'Reveal masks' })).toHaveCount(0);
    await expect(exportButton).not.toHaveAttribute('data-export-blocked', 'errors');
    await expect(errorPill(app)).toHaveCount(0);

    await app.selectElementById(front);
    await app.page.locator(`.cg-tl-row[data-element-id="${back}"]`).click({ modifiers: ['Shift'] });
    const multiControls = app.multiInspector.locator('[data-section="CG Control"]');
    await expect(multiControls.getByRole('combobox', { name: 'Resize' })).toHaveValue(
      '__cg_mixed__',
    );
    await expect(multiControls.getByRole('checkbox', { name: 'Allow move' })).toHaveJSProperty(
      'indeterminate',
      true,
    );
    await multiControls.getByRole('combobox', { name: 'Fit', exact: true }).selectOption('cover');
    await expect(app.multiInspector.getByRole('checkbox', { name: autoLayoutName })).toHaveCount(0);

    await app.deselect();
    await expect(app.inspector.getByRole('checkbox', { name: autoLayoutName })).toHaveCount(0);
    await expect(allow).toBeChecked();
    await allow.uncheck();
    await expect(exportButton).toHaveAttribute('data-export-blocked', 'errors');
    await allow.check();
    await expect(exportButton).not.toHaveAttribute('data-export-blocked', 'errors');

    await expect.poll(() => app.timelineRowIds()).toEqual([front, back]);
    await app.dragRowAboveRow(back, front);
    await expect.poll(() => app.timelineRowIds()).toEqual([back, front]);
    const [download] = await Promise.all([app.page.waitForEvent('download'), exportButton.click()]);
    const { scene, manifest } = await unpack(await readFile(await download.path()));
    expect(scene.allowLivePlateOverlap).toBe(true);
    expect(scene.allowOperatorAutoLayout).toBeUndefined();
    expect(manifest.compatibility.minRuntimeVersion).toBe('1.2.3');
    const carrier = buildTemplateLiveSources(scene);
    expect(carrier.platePaintOrder).toEqual(['front', 'back']);
    expect(carrier.allowOperatorAutoLayout).toBeUndefined();
    expect(carrier.sources.map((source) => source.fitMode)).toEqual(['cover', 'cover']);
    const permission = (id: string) =>
      carrier.sources.find((source) => source.sourceId === id)?.operatorFrame;
    expect(permission('back')).toMatchObject({ resize: 'move-only' });
    expect(permission('front')).toMatchObject({ resize: 'free', move: false });

    await app.deselect();
    await allow.uncheck();
    await expect(exportButton).toHaveAttribute('data-export-blocked', 'errors');
    const saving = page.waitForEvent('download');
    await page.getByRole('button', { name: 'SAVE', exact: true }).click();
    const project = await saving;
    const projectBytes = await readFile(await project.path());
    await page.reload();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Import project', exact: true }).click();
    await (
      await chooser
    ).setFiles({
      name: project.suggestedFilename(),
      mimeType: 'application/zip',
      buffer: projectBytes,
    });
    await app.expectStudio();
    await expect(allow).not.toBeChecked();
    await expect(exportButton).toHaveAttribute('data-export-blocked', 'errors');
  });

  test('Authorizes CG Control Auto layout independently in each preset', async ({ app }) => {
    await app.newProject('Auto layout permission');
    const permission = app.inspector.getByRole('checkbox', {
      name: 'Allow Auto layout in CG Control',
      exact: true,
    });
    await app.newComposition('Titled frame');
    await app.addLiveSource();
    await app.addTextElement();
    await app.deselect();
    await expect(permission).toHaveCount(0);

    await app.openComposition('comp1');
    await app.addMultiFrameGroup();
    await app.addLook();
    await app.addLook();
    await expect(permission).toHaveCount(0);

    await app.openComposition('preset-1');
    await app.nestCompositionInstance('Titled frame');
    await expect(permission).toHaveCount(0);
    await app.page.keyboard.press('Escape');
    await expect(permission).not.toBeChecked();
    expect(await permission.boundingBox()).toMatchObject({ width: 14, height: 14 });
    await permission.check();

    await app.openComposition('preset-2');
    await app.nestCompositionInstance('Titled frame');
    await expect(permission).toHaveCount(0);
    await app.page.keyboard.press('Escape');
    await expect(permission).not.toBeChecked();
    await permission.check();
    await permission.uncheck();

    await app.openComposition('preset-1');
    await expect(permission).toBeChecked();
    await app.openComposition('Titled frame');
    await expect(permission).toHaveCount(0);
    await app.openComposition('comp1');
    await expect(permission).toHaveCount(0);

    const [download] = await Promise.all([
      app.page.waitForEvent('download'),
      app.page.getByRole('button', { name: 'Export .vcg', exact: true }).click(),
    ]);
    const { scene } = await unpack(await readFile(await download.path()));
    const carrier = buildTemplateLiveSources(scene);
    expect(carrier.allowOperatorAutoLayout).toBeUndefined();
    expect(
      carrier.looks?.map(({ name, allowOperatorAutoLayout }) => [name, allowOperatorAutoLayout]),
    ).toEqual([
      ['preset-1', true],
      ['preset-2', false],
    ]);
  });

  /**
   * ⭐ `D-157` — the refusal is VISIBLE on the boxes that cause it, and the dead Export button
   * answers instead of shrugging. Maps
   * `openspec/changes/designer-export-block-visible/specs/designer-live-source/`.
   */
  test('D-157 — overlapping boxes are MARKED on the canvas, and the marks clear when fixed', async ({
    app,
  }) => {
    await app.newProject('ExportBlockMarks');
    await app.addLiveSource({ x: 200, y: 160 });
    /*
      ⭐ `B-183` — THE FIRST PLATE GETS A SOURCE; THE SECOND IS LEFT AS DRAWN.

      Written when a drawn plate pointed at nothing: with both unassigned the marks could never
      reach zero (the surviving plate's own `live-source-unset`). `B-187` now names a drawn plate
      `plate-N` (marked "auto"), so that hazard is gone, and the reason that remains is the undo:
      setting a source on the second would add a history entry between the two the test relies
      on, so the single `undo()` below would revert that id instead of removing the plate.
    */
    await app.setLiveSourceId('guest-1');
    await app.inspector.getByRole('checkbox', { name: 'Allow live plate overlap' }).uncheck();
    await app.addLiveSource({ x: 230, y: 190 });
    await expect(holes(app)).toHaveCount(2);

    // 🔴 BOTH participants are marked — the whole point. One mark would name a culprit where
    // there is a pair. The marks are a designer overlay, so they are plain page locators.
    const marks = app.page.locator('[data-testid^="canvas-error-mark-"]');
    await expect(marks).toHaveCount(2);

    // …and the mark carries the reason non-chromatically, so colour is not the only channel.
    await expect(marks.first().getByRole('img')).toHaveAttribute('aria-label', /overlaps/);

    // Remove the second plate — the marks clear with no further action from the author, because
    // they are driven by the live preflight rather than by anything the author must re-press.
    await app.undo();
    await expect(holes(app)).toHaveCount(1);
    await expect(marks).toHaveCount(0);
  });

  test('D-157 — a blocked Export names the offender and opens the Issues panel', async ({
    app,
  }) => {
    await app.newProject('ExportBlockRefusal');
    await app.addLiveSource({ x: 200, y: 160 });
    await app.setElementName('Host frame');
    await app.setLiveSourceId('host');
    await app.addLiveSource({ x: 230, y: 190 });
    await app.setElementName('Guest frame');
    await app.setLiveSourceId('guest');
    await app.inspector.getByRole('checkbox', { name: 'Allow live plate overlap' }).uncheck();

    const exportBtn = app.page.getByRole('button', { name: 'Export .vcg' });
    // 🔴 NOT inert. A natively disabled button can show no tooltip at all — which is how the old
    // generic sentence managed to be both useless and invisible — and `aria-disabled` would tell
    // a screen-reader user not to press the one control that explains the problem.
    await expect(exportBtn).toBeEnabled();
    await expect(exportBtn).not.toHaveAttribute('aria-disabled', 'true');
    // The "blocked" appearance is a data attribute, so styling never depends on a lie to AT.
    await expect(exportBtn).toHaveAttribute('data-export-blocked', 'errors');
    // The tooltip now carries the COUNT and the FIRST OFFENDER, not "Resolve validation errors".
    // ⚠ The offender is named exactly as the Issues panel names it — the element's NAME, via the
    // preflight's own `label()`. Lifting it from the message rather than re-deriving it is what
    // stops the tooltip naming a different box from the panel it points at.
    await expect(exportBtn).toHaveAttribute('title', /Export blocked — \d+ error/);
    await expect(exportBtn).toHaveAttribute('title', /starting with “(?:Host frame|Guest frame)”/);
    await expect(exportBtn).not.toHaveAttribute('title', 'Resolve validation errors first');
    const offender = /starting with “([^”]+)”/.exec((await exportBtn.getAttribute('title'))!)![1]!;

    // ONE action from the control the author pressed to the full message.
    await exportBtn.click();
    const issues = app.page.getByRole('dialog', { name: 'Issues' });
    await expect(issues).toBeVisible();
    const message = issues.getByText(`Plate "${offender}" overlaps`, { exact: false });
    await expect(message).toBeVisible();
    await expect(message).toHaveCSS('user-select', 'text');
    await message.click({ position: { x: 5, y: 6 } });
    await expect(issues).toBeVisible();
    const drag = await message.evaluate((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      const lines = [...range.getClientRects()];
      const first = lines[0]!;
      const last = lines.at(-1)!;
      document.addEventListener(
        'copy',
        (event) => {
          node.setAttribute('data-copied-issue', window.getSelection()?.toString() ?? '');
          event.preventDefault();
        },
        { once: true },
      );
      // Integer pointer coordinates match the native pointer selection path in Chrome.
      return {
        start: { x: Math.ceil(first.left), y: Math.round(first.top + first.height / 2) },
        end: { x: Math.ceil(last.right), y: Math.round(last.top + last.height / 2) },
      };
    });
    await app.page.mouse.move(drag.start.x, drag.start.y);
    await app.page.mouse.down();
    await app.page.mouse.move(drag.end.x, drag.end.y, { steps: 12 });
    await app.page.mouse.up();
    const selected = await app.page.evaluate(() => window.getSelection()?.toString() ?? '');
    expect(selected).toBe(await message.textContent());
    await app.page.keyboard.press('ControlOrMeta+c');
    await expect(message).toHaveAttribute('data-copied-issue', selected);
    await expect(issues).toBeVisible();
    await issues.getByRole('button', { name: 'Go to element', exact: true }).first().press('Enter');
    await expect(issues).toBeHidden();
  });

  test('D-157 — the POSITIVE CONTROL: a clean composition marks nothing and Export is live', async ({
    app,
  }) => {
    await app.newProject('ExportBlockClean');
    await app.addLiveSource({ x: 120, y: 120 });
    // `B-183` — "clean" now REQUIRES a chosen source: a plate points at nothing until the
    // author says otherwise, and this test is the positive control for the MARKS, so its
    // composition has to actually be clean.
    await app.setLiveSourceId('guest-1');

    await expect(app.page.locator('[data-testid^="canvas-error-mark-"]')).toHaveCount(0);
    const exportBtn = app.page.getByRole('button', { name: 'Export .vcg' });
    await expect(exportBtn).toBeEnabled();
    await expect(exportBtn).not.toHaveAttribute('aria-disabled', 'true');
    await expect(errorPill(app)).toHaveCount(0);
  });

  test('the aspect is chosen by NAME, and “not specified” is a real third state', async ({
    app,
  }) => {
    await app.newProject('LiveSourceAspect');
    await app.addLiveSource({ x: 200, y: 160 });
    // `B-183` — set the source so the ASPECT is the only thing under test here.
    await app.setLiveSourceId('guest-1');

    // D-147 — a new plate shows its aspect as a NAMED preset, with the decimal
    // beside it: `16:9` and `1.78` are two spellings of one number and the field
    // takes the decimal, so printing only one of them is the ambiguity that
    // prompted this item.
    await expect(app.liveSourceAspectSelect).toHaveValue('16:9');
    await expect(app.liveSourceAspectSelect.locator('option:checked')).toHaveText(/16:9.*1\.78/);

    // `— not specified —` is the author declining to assert anything about the
    // source. It writes the field ABSENT — which is why the fit action, whose whole
    // input is that assertion, disables itself and says so.
    await app.setLiveSourceAspect('unspecified');
    await expect(app.liveSourceFitButton).toBeDisabled();
    await expect(app.liveSourceFitButton).toHaveAttribute('title', /not specified|Pick an aspect/i);

    // `Custom…` reveals the numeric input that existed before, so an unusual ratio
    // stays reachable.
    await app.setLiveSourceAspect('custom');
    await expect(app.inspector.getByRole('spinbutton', { name: 'custom aspect' })).toBeVisible();

    // Nothing here is a preflight error: declaring an aspect is not a geometry change.
    await expect(errorPill(app)).toHaveCount(0);
  });

  test('“Fit plate to aspect” resizes the plate, and is disabled when it already matches', async ({
    app,
  }) => {
    await app.newProject('LiveSourceFit');
    await app.addLiveSource({ x: 200, y: 160 });
    // Pin Y near the top. Where a canvas click lands in SCENE pixels depends on the
    // zoom, and a plate low in the frame legitimately triggers the bottom-edge flip —
    // which is its own test below. This one is about the ordinary width-preserving
    // case, so it starts somewhere the ordinary case applies.
    const yField = app.inspector.getByRole('spinbutton', { name: 'Y position' });
    await yField.fill('100');
    await yField.press('Enter');

    // A fresh 640×360 plate already renders 16:9, so there is nothing to do.
    await expect(app.liveSourceFitButton).toBeDisabled();
    await expect(app.liveSourceFitButton).toHaveAttribute('title', /already/i);

    // Declare 4:3 and the plate no longer matches — the action arms itself and says
    // which side it will preserve.
    await app.setLiveSourceAspect('4:3');
    await expect(app.liveSourceFitButton).toBeEnabled();
    await expect(app.liveSourceFitButton).toHaveAttribute('title', /keeps X, Y and W/);

    await app.liveSourceFitButton.click();
    // W preserved, H solved: 640 / (4/3) = 480. This is exactly the arithmetic the
    // item exists to take off the author.
    await expect(sizeField(app, 'Width')).toHaveValue('640');
    await expect(sizeField(app, 'Height')).toHaveValue('480');
    // …and having done it, the action disables itself again.
    await expect(app.liveSourceFitButton).toBeDisabled();

    // The ONE-undo-entry property is pinned in `live-source-aspect.dom.test.ts`, not
    // here, and deliberately: the store coalesces writes within 300 ms into a single
    // history entry, so an E2E undo assertion would be measuring Playwright's action
    // latency against that window rather than the action's write count. The DOM test
    // marks an explicit history boundary and asserts the real property.
  });

  /**
   * ⭐ `C-028` — maps `openspec/changes/live-plate-fit-mode/specs/designer-live-source/`,
   * all three of its `#### Scenario`s.
   *
   * The mode's EFFECT — the fitted rect, and the mask hole punched at it rather than at
   * the box — has no Designer surface to observe: the plate shows SMPTE bars while
   * authoring and the hole is a property of the export. It is pinned across the package
   * boundary in `packages/template-runtime/tests/live-fit-two-axis.test.ts`, which
   * asserts the surface and the wire for one input in one test. What belongs HERE is what
   * the AUTHOR can actually do: find the control, change it, and have the change stick.
   */
  test('C-028 — the fit mode is authored per plate, and defaults to `contain`', async ({ app }) => {
    await app.newProject('LiveSourceFitMode');
    await app.addLiveSource({ x: 200, y: 160 });
    // `B-183` — set the source so the FIT MODE is the only thing under test here.
    await app.setLiveSourceId('guest-1');

    // Scenario: "An existing plate defaults to `contain`". A fresh plate stores NO value
    // and the control reads the default — absent is `contain`, never `cover`.
    await expect(app.liveSourceFitModeSelect).toBeVisible();
    await expect(app.liveSourceFitModeSelect).toHaveValue('contain');
    // …and the label says what happens to the PICTURE, not to the box: the natural
    // misreading is that the box changes shape, and it does not.
    await expect(app.liveSourceFitModeSelect.locator('option:checked')).toHaveText(
      /whole picture/i,
    );
    const cropLabel = label(app).getByText('Crop edges', { exact: true });
    await expect(cropLabel).toHaveCount(0);
    await expect(label(app)).toHaveCSS('font-size', '16px');
    const nameHeight = (await label(app).boundingBox())?.height ?? 0;
    expect(nameHeight).toBeGreaterThan(27);
    await app.page.getByRole('button', { name: 'Zoom out', exact: true }).click();
    await expect
      .poll(async () => (await label(app).boundingBox())?.height ?? 0)
      .toBeCloseTo(nameHeight, 1);

    // Scenario: "The fit mode is chosen in the Inspector" — both modes are offered.
    await expect(app.liveSourceFitModeSelect.locator('option')).toHaveCount(2);
    await app.setLiveSourceFitMode('cover');
    await expect(app.liveSourceFitModeSelect).toHaveValue('cover');
    await expect(app.liveSourceFitModeSelect.locator('option:checked')).toHaveText(/crop/i);
    await expect(cropLabel).toBeVisible();
    await expect(label(app)).toHaveCSS('font-size', '16px');

    // Choosing a fit is not a geometry change, so nothing is a preflight error.
    await expect(errorPill(app)).toHaveCount(0);

    // …and it SURVIVES a reselect: the value is on the ELEMENT, not in the control's own
    // state. That is the failure worth driving in a real browser — a control wired to
    // `useState` reads correctly for as long as it stays mounted and silently loses the
    // value the moment it does not.
    const [elementId] = await app.timelineRowIds();
    await app.deselect();
    await expect(app.liveSourceFitModeSelect).toHaveCount(0);
    await app.selectElementById(elementId as string);
    await expect(app.liveSourceFitModeSelect).toHaveValue('cover');
    await app.setLiveSourceFitMode('contain');
    await expect(cropLabel).toHaveCount(0);
  });

  test('MULTIPLE independent Live Sources each get their own id', async ({ app }) => {
    await app.newProject('LiveSourceMulti');
    await app.addLiveSource({ x: 120, y: 100 });
    await app.addLiveSource({ x: 300, y: 240 });
    await expect(holes(app)).toHaveCount(2);

    /*
      ⚠ SEPARATION IS SET IN SCENE UNITS, NOT ASSUMED FROM THE CLICKS.

      This test is about INDEPENDENCE, not about the overlap rule, and it says so
      — but two canvas CLICKS cannot express that intent. A plate is born 640×360
      SCENE px wide at the point clicked, while the clicks are CANVAS px: the
      scene distance between them is `delta / zoom`, and the zoom is
      `canvasWidth / 1920`, which depends on how wide the surrounding panels
      happen to render. MEASURED here: a 464px-wide canvas gives zoom 0.2417, so
      the two clicks are 745 scene px apart and the 640-wide plates clear each
      other by ~105px. A canvas wider than ~540px flips that — the same two
      clicks land the plates ON TOP of each other and preflight correctly reports
      an overlap. That is the product behaving as designed (a plate is born where
      you click, never offset onto its neighbour) and the FIXTURE being
      knife-edge, which is how it passed here and failed on CI's browser.

      So the separation is now stated in the units the rule is evaluated in.
    */
    const ids = await holes(app).evaluateAll((nodes) =>
      nodes.map((n) => n.closest('[data-cg-element-id]')?.getAttribute('data-cg-element-id') ?? ''),
    );
    expect(ids.filter((id) => id !== '')).toHaveLength(2);
    await app.selectElementById(ids[0]!);
    await app.setInspectorNumber('X position', 0);
    await app.setInspectorNumber('Y position', 0);
    await app.selectElementById(ids[1]!);
    await app.setInspectorNumber('X position', 1000);
    await app.setInspectorNumber('Y position', 0);

    /*
      🔴 D-171 — THE TOOL HANDS OUT `plate-1`, `plate-2`, AND SAYS IT DID.

      `B-183` had stopped the tool naming plates (its names were suggestions nobody accepted);
      the owner reopened it marked "auto" (Q2 (c)). Two plates drawn in one template get two
      DIFFERENT names — the next free one each time — so they never land on one input
      (`live-source-repeated` / `look-source-duplicate` would refuse that), and the export is
      not blocked. Independence is then asserted on ids the author chooses.
    */
    await expect
      .poll(async () => await holes(app).locator('[data-cg-live-source-label]').allTextContents())
      .toEqual(['plate-1', 'plate-2']);
    await expect(errorPill(app)).toHaveCount(0);

    await app.selectElementById(ids[0]!);
    await app.setLiveSourceId('guest-1');
    await app.selectElementById(ids[1]!);
    await app.setLiveSourceId('guest-2');

    // The SAME expectation, read with retry: the Enter that commits an id re-renders the canvas
    // on a later frame, and a one-shot `allTextContents()` raced it — CI run 35850329430 read
    // `no source` for the second plate on both attempts while the code under test was
    // byte-identical to the last green run's.
    await expect
      .poll(async () =>
        (await holes(app).locator('[data-cg-live-source-label]').allTextContents()).sort(),
      )
      .toEqual(['guest-1', 'guest-2']);
    await expect(errorPill(app)).toHaveCount(0);
  });

  test('B-359 — a Live Source multi-selection disables Scale until every lock is freed', async ({
    app,
  }) => {
    await app.newProject('LockedLiveSourceMultiScale');
    await app.addLiveSource({ x: 120, y: 100 });
    await app.addLiveSource({ x: 300, y: 240 });
    const ids = await app.timelineRowIds();
    expect(ids).toHaveLength(2);

    const selectBoth = async (): Promise<void> => {
      await app.selectElementById(ids[0]!);
      await app.page
        .locator(`.cg-tl-row[data-element-id="${ids[1]!}"]`)
        .click({ modifiers: ['Shift'] });
      await expect(app.multiInspector).toBeVisible();
    };

    await selectBoth();
    const scaleX = app.multiInspector.getByRole('spinbutton', { name: 'Scale X', exact: true });
    const scaleY = app.multiInspector.getByRole('spinbutton', { name: 'Scale Y', exact: true });
    await expect(scaleX).toBeDisabled();
    await expect(scaleY).toBeDisabled();
    await expect(scaleX).toHaveAttribute('title', /aspect locked/i);

    await app.selectElementById(ids[1]!);
    const lock = app.inspector.getByRole('button', { name: 'Keep aspect while resizing' });
    await lock.click();
    await expect(lock).toHaveText('FREE');

    await selectBoth();
    // A shared scale must not deform the remaining locked plate.
    await expect(scaleX).toBeDisabled();
    await expect(scaleY).toBeDisabled();

    await app.selectElementById(ids[0]!);
    await lock.click();
    await expect(lock).toHaveText('FREE');
    await selectBoth();
    await expect(scaleX).toBeEnabled();
    await expect(scaleY).toBeEnabled();
  });

  test('B-360 — three selected Live Sources auto-layout as a symmetric 2+1 grid', async ({
    app,
  }) => {
    await app.newProject('LiveSourceAutoLayout');
    // Keep placement clicks inside the visible canvas. Their starting geometry is
    // intentionally rough and overlapping; the command below is what must repair it.
    await app.addLiveSource({ x: 200, y: 160 });
    await app.addLiveSource({ x: 230, y: 190 });
    await app.addLiveSource({ x: 260, y: 220 });
    const ids = await app.timelineRowIds();
    expect(ids).toHaveLength(3);

    await app.selectElementById(ids[0]!);
    for (const id of ids.slice(1)) {
      await app.page.locator(`.cg-tl-row[data-element-id="${id}"]`).click({ modifiers: ['Shift'] });
    }
    await expect(app.multiInspector).toBeVisible();
    await app.multiInspector.getByRole('button', { name: 'More frames on top' }).click();

    const readGeometry = () =>
      holes(app).evaluateAll((nodes) =>
        nodes
          .map((node) => {
            const rect = node.getBoundingClientRect();
            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
          })
          .sort((a, b) => a.y - b.y || a.x - b.x),
      );
    await expect
      .poll(async () => {
        const [left, right] = await readGeometry();
        return left === undefined || right === undefined ? Infinity : Math.abs(left.y - right.y);
      })
      .toBeLessThan(0.05);
    const geometry = await readGeometry();
    expect(geometry).toHaveLength(3);
    const [topLeft, topRight, bottom] = geometry;
    expect(topLeft!.y).toBeCloseTo(topRight!.y, 1);
    expect(bottom!.y).toBeGreaterThan(topLeft!.y + topLeft!.height);
    const horizontalGap = topRight!.x - (topLeft!.x + topLeft!.width);
    const verticalGap = bottom!.y - (topLeft!.y + topLeft!.height);
    expect(horizontalGap).toBeCloseTo(verticalGap, 1);
    expect(topLeft!.width / topLeft!.height).toBeCloseTo(16 / 9, 2);
    expect(bottom!.x + bottom!.width / 2).toBeCloseTo(
      (topLeft!.x + topRight!.x + topRight!.width) / 2,
      1,
    );
  });

  test('B-360 — two Live Sources can stack, use a vertical gap, and exchange seats', async ({
    app,
  }) => {
    await app.newProject('LiveSourceVerticalAutoLayout');
    await app.addLiveSource({ x: 180, y: 140 });
    await app.setLiveSourceAspect('custom');
    const customAspect = app.inspector.getByRole('spinbutton', { name: 'custom aspect' });
    await customAspect.fill('0.75');
    await customAspect.press('Enter');
    const portraitId = (await app.timelineRowIds())[0]!;
    await app.addLiveSource({ x: 240, y: 190 });
    const ids = await app.timelineRowIds();
    expect(ids).toHaveLength(2);
    const wideId = ids.find((id) => id !== portraitId)!;

    await app.selectElementById(ids[0]!);
    await app.page
      .locator(`.cg-tl-row[data-element-id="${ids[1]!}"]`)
      .click({ modifiers: ['Shift'] });
    await expect(app.multiInspector).toBeVisible();

    await app.multiInspector.getByRole('combobox', { name: 'layout' }).selectOption('vertical');
    const verticalGap = app.multiInspector.getByRole('spinbutton', {
      name: 'vertical gap',
      exact: true,
    });
    await verticalGap.fill('120');
    await verticalGap.press('Enter');

    const readGeometry = async () =>
      await holes(app).evaluateAll((nodes) =>
        nodes.map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            id: node.closest('[data-cg-element-id]')?.getAttribute('data-cg-element-id') ?? '',
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          };
        }),
      );

    await expect
      .poll(async () => {
        const [top, bottom] = (await readGeometry()).sort((a, b) => a.y - b.y);
        return top === undefined || bottom === undefined ? 0 : bottom.y - top.y - top.height;
      })
      .toBeGreaterThan(0);
    const before = await readGeometry();
    const firstBefore = before.find((item) => item.id === ids[0]);
    const secondBefore = before.find((item) => item.id === ids[1]);
    expect(firstBefore).toBeDefined();
    expect(secondBefore).toBeDefined();
    const orderedBefore = [firstBefore!, secondBefore!].sort((a, b) => a.y - b.y);
    const topBefore = orderedBefore[0]!;
    const bottomBefore = orderedBefore[1]!;
    expect(bottomBefore.y).toBeGreaterThan(topBefore.y + topBefore.height);
    expect(firstBefore!.x + firstBefore!.width / 2).toBeCloseTo(
      secondBefore!.x + secondBefore!.width / 2,
      1,
    );
    const portraitBefore = before.find((item) => item.id === portraitId)!;
    const wideBefore = before.find((item) => item.id === wideId)!;
    expect(portraitBefore.width / portraitBefore.height).toBeCloseTo(3 / 4, 2);
    expect(wideBefore.width / wideBefore.height).toBeCloseTo(16 / 9, 2);

    await app.multiInspector.getByRole('button', { name: 'Swap frame order' }).click();
    // Store updates precede the rAF-throttled iframe repaint. Wait for the actual rendered
    // order, not merely the click or parent message, before measuring the final geometry.
    await expect
      .poll(async () =>
        (await readGeometry())
          .filter((item) => ids.includes(item.id))
          .sort((a, b) => a.y - b.y)
          .map((item) => item.id),
      )
      .toEqual([bottomBefore.id, topBefore.id]);
    const after = await readGeometry();
    const firstAfter = after.find((item) => item.id === ids[0]);
    const secondAfter = after.find((item) => item.id === ids[1]);
    const orderedAfter = [firstAfter!, secondAfter!].sort((a, b) => a.y - b.y);
    const topAfter = orderedAfter[0]!;
    const bottomAfter = orderedAfter[1]!;
    expect(topAfter.id).toBe(bottomBefore.id);
    expect(bottomAfter.id).toBe(topBefore.id);
    const portraitAfter = after.find((item) => item.id === portraitId)!;
    const wideAfter = after.find((item) => item.id === wideId)!;
    expect(portraitAfter.width / portraitAfter.height).toBeCloseTo(3 / 4, 2);
    expect(wideAfter.width / wideAfter.height).toBeCloseTo(16 / 9, 2);
  });

  test('Auto layout arranges and swaps titled live compositions inside one preset', async ({
    app,
  }) => {
    await app.newProject('Preset Auto layout');
    const frameSpecs = [
      {
        name: 'Guest A',
        source: 'guest-a',
        title: 'استودیو الف',
        x: 80,
        y: 60,
        color: '204060',
        background: 'rgb(32, 64, 96)',
      },
      {
        name: 'Guest B',
        source: 'guest-b',
        title: 'استودیو ب',
        x: 500,
        y: 280,
        color: '604020',
        background: 'rgb(96, 64, 32)',
      },
    ];
    const titleIds: string[] = [];
    for (const frame of frameSpecs) {
      await app.newComposition(frame.name);
      await app.openComposition(frame.name);
      await app.addLiveSource();
      await app.setLiveSourceId(frame.source);
      await app.setInspectorNumber('X position', frame.x);
      await app.setInspectorNumber('Y position', frame.y);

      const [plateId] = await app.timelineRowIds();
      await app.addTextElement({ x: 300, y: 200 });
      const titleId = (await app.timelineRowIds()).find((id) => id !== plateId);
      if (titleId === undefined) throw new Error('The title needs a timeline row');
      titleIds.push(titleId);
      await app.selectTool('Select');
      await app.canvas.dblclick({ position: { x: 330, y: 215 } });
      const editor = app.page.locator('[contenteditable="true"]');
      await editor.fill(frame.title);
      await editor.press('Enter');
      await app.setInspectorNumber('X position', frame.x + 52);
      await app.setInspectorNumber('Y position', frame.y + 20);
      await app.inspector.getByRole('button', { name: 'Toggle Text Padding' }).click();
      await app.setInspectorNumber('padding', 16);
      await app.inspector.getByRole('button', { name: 'Background fill' }).click();
      const background = app.page.getByRole('textbox', { name: 'Hex colour value' });
      await background.fill(frame.color);
      await background.press('Enter');
      await app.page.keyboard.press('Escape');
    }

    const plate = (source: string) => app.canvasFrame.locator(`[data-cg-live-source="${source}"]`);
    const title = (index: number) =>
      app.canvasFrame.locator(`[data-cg-element-id="${titleIds[index]!}"]`);
    await app.openComposition('comp1');
    await app.addMultiFrameGroup();
    await app.addLook();
    await app.addLook();
    await app.openComposition('preset-2');
    await app.nestCompositionInstance('Guest A');
    await expect(plate('guest-a')).toBeVisible();
    const soloBefore = await plate('guest-a').boundingBox();

    await app.openComposition('preset-1');
    await app.nestCompositionInstance('Guest A');
    const [firstRef] = await app.timelineRowIds();
    await app.nestCompositionInstance('Guest B');
    const layerOrder = await app.timelineRowIds();
    const secondRef = layerOrder.find((id) => id !== firstRef);
    if (firstRef === undefined || secondRef === undefined) {
      throw new Error('Both nested compositions need timeline rows');
    }
    await app.selectElementById(secondRef);
    await app.setInspectorNumber('X position', 360);
    await app.setInspectorNumber('Y position', 160);
    await app.page
      .locator(`.cg-tl-row[data-element-id="${firstRef}"]`)
      .click({ modifiers: ['Shift'] });

    const readGeometry = () =>
      app.canvasFrame.locator('.cg-stage').evaluateAll(
        ([stage], markers) => {
          if (stage === undefined) return [];
          const bounds = (element: Element) => {
            const { x, y, width, height } = element.getBoundingClientRect();
            return { x, y, width, height };
          };
          return markers.flatMap(({ source, titleId }) => {
            const picture = stage.querySelector(`[data-cg-live-source="${source}"]`);
            const label = stage.querySelector(`[data-cg-element-id="${titleId}"]`);
            return picture === null || label === null
              ? []
              : [{ picture: bounds(picture), label: bounds(label) }];
          });
        },
        frameSpecs.map(({ source }, index) => ({ source, titleId: titleIds[index]! })),
      );
    await expect.poll(readGeometry).toHaveLength(2);
    const before = await readGeometry();
    const arrange = app.multiInspector.getByRole('button', { name: 'Arrange evenly' });
    const swap = app.multiInspector.getByRole('button', { name: 'Swap frame order' });
    await expect(arrange).toBeVisible();
    await arrange.click();
    await expect
      .poll(async () => {
        const [a, b] = await readGeometry();
        return a === undefined || b === undefined ? Infinity : Math.abs(a.picture.y - b.picture.y);
      })
      .toBeLessThan(0.1);
    const arranged = await readGeometry();
    const [left, right] = arranged.map(({ picture }) => picture).sort((a, b) => a.x - b.x);
    expect(right!.x).toBeGreaterThan(left!.x + left!.width);
    expect(left!.width).toBeCloseTo(right!.width, 1);
    expect(left!.width / left!.height).toBeCloseTo(16 / 9, 2);
    const aWasLeft = arranged[0]!.picture.x < arranged[1]!.picture.x;

    await swap.click();
    await expect
      .poll(async () => {
        const [a, b] = await readGeometry();
        return a === undefined || b === undefined ? null : a.picture.x < b.picture.x;
      })
      .toBe(!aWasLeft);
    const swapped = await readGeometry();
    for (const [index, { label, picture }] of swapped.entries()) {
      const original = before[index]!;
      expect((label.x - picture.x) / picture.width).toBeCloseTo(
        (original.label.x - original.picture.x) / original.picture.width,
        2,
      );
      expect((label.y - picture.y) / picture.height).toBeCloseTo(
        (original.label.y - original.picture.y) / original.picture.height,
        2,
      );
      await expect(title(index)).toHaveText(frameSpecs[index]!.title);
      await expect(title(index)).toHaveCSS('padding-left', '16px');
      await expect(title(index)).toHaveCSS('background-color', frameSpecs[index]!.background);
    }
    await expect.poll(() => app.timelineRowIds()).toEqual(layerOrder);

    await app.undo();
    await expect.poll(readGeometry).toEqual(arranged);
    await app.openComposition('preset-2');
    await expect.poll(() => plate('guest-a').boundingBox()).toEqual(soloBefore);

    await app.openComposition('comp1');
    const exportButton = app.page.getByRole('button', { name: 'Export .vcg', exact: true });
    await expect(exportButton).not.toHaveAttribute('data-export-blocked', 'errors');
    const [download] = await Promise.all([app.page.waitForEvent('download'), exportButton.click()]);
    const { scene } = await unpack(await readFile(await download.path()));
    const carrier = buildTemplateLiveSources(scene);
    const layout = carrier.looks?.find(({ name }) => name === 'preset-1')?.rects;
    const a = layout?.['guest-a'];
    const b = layout?.['guest-b'];
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a!.y).toBeCloseTo(b!.y, 1);
    expect(a!.x < b!.x).toBe(aWasLeft);
    expect(a!.width / a!.height).toBeCloseTo(16 / 9, 2);
  });

  test('Keeps a nested live composition proportional when resizing inside a preset', async ({
    app,
  }) => {
    await app.newProject('Nested live proportions');
    await app.newComposition('Titled frame');
    await app.openComposition('Titled frame');
    await app.addLiveSource();
    await app.setLiveSourceId('nested-frame');
    await app.addTextElement({ x: 280, y: 210 });
    await app.openComposition('comp1');
    await app.addMultiFrameGroup();
    await app.addLook();
    await app.openComposition('preset-1');
    await app.nestCompositionInstance('Titled frame');
    const [instance] = await app.timelineRowIds();
    if (instance === undefined) throw new Error('Missing nested composition');
    await app.selectElementById(instance);

    const lock = app.inspector.getByRole('checkbox', { name: 'Keep proportions' });
    const restore = app.inspector.getByRole('button', { name: 'Restore composition ratio' });
    const scaleX = app.inspector.getByRole('spinbutton', { name: 'Scale X' });
    const scaleY = app.inspector.getByRole('spinbutton', { name: 'Scale Y' });
    const readSize = async () =>
      Promise.all([app.getInspectorNumber('Width'), app.getInspectorNumber('Height')]);
    const picture = app.canvasFrame.locator('[data-cg-live-source="nested-frame"]');
    const readPictureAspect = async () => {
      const box = await picture.boundingBox();
      return box === null ? 0 : box.width / box.height;
    };
    await expect(lock).toBeChecked();
    await expect(restore).toBeDisabled();
    await expect(scaleX).toBeDisabled();
    await expect(scaleY).toBeDisabled();

    // Recreate a legacy free resize including unequal authored scale. Enabling
    // the lock must leave the existing geometry until the author repairs it.
    await lock.uncheck();
    await app.setInspectorNumber('Width', 720);
    await app.setInspectorNumber('Height', 720);
    await app.setInspectorNumber('Scale X', 125);
    await expect.poll(readPictureAspect).toBeCloseTo(1.25, 2);
    await lock.check();
    await expect.poll(readSize).toEqual([720, 720]);
    await expect.poll(readPictureAspect).toBeCloseTo(1.25, 2);
    await restore.click();
    await expect.poll(readSize).toEqual([720, 506.25]);
    await expect.poll(readPictureAspect).toBeCloseTo(16 / 9, 2);
    await expect(scaleX).toHaveValue('125');
    await expect(scaleY).toHaveValue('100');
    await app.undo();
    await app.selectElementById(instance);
    await expect.poll(readSize).toEqual([720, 720]);

    await app.setInspectorNumber('Width', 640);
    await expect.poll(readSize).toEqual([640, 450]);
    await expect.poll(readPictureAspect).toBeCloseTo(16 / 9, 2);
    await app.setInspectorNumber('Height', 360);
    await expect.poll(readSize).toEqual([512, 360]);
    await app.undo();
    await app.selectElementById(instance);
    await expect.poll(readSize).toEqual([640, 450]);

    const corner = await app.page.locator('.cg-gizmo-corner').nth(3).boundingBox();
    if (corner === null) throw new Error('The nested composition has no corner handle');
    const x = corner.x + corner.width / 2;
    const y = corner.y + corner.height / 2;
    await app.page.mouse.move(x, y);
    await app.page.mouse.down();
    await app.page.mouse.move(x + 37, y + 10, { steps: 4 });
    await app.page.mouse.up();
    await expect.poll(async () => (await readSize())[0]).toBeGreaterThan(640);
    await expect.poll(readPictureAspect).toBeCloseTo(16 / 9, 2);
    await app.undo();
    await app.selectElementById(instance);
    await expect.poll(readSize).toEqual([640, 450]);

    await lock.uncheck();
    await expect(scaleX).toBeEnabled();
    await app.setInspectorNumber('Height', 500);
    await expect.poll(readSize).toEqual([640, 500]);
    await expect.poll(readPictureAspect).toBeCloseTo(1.6, 2);
  });

  /**
   * 🔴 `B-148` — ONE source on TWO plates, in a template without looks, blocks the export and
   * names both. The comment above used to credit `look-source-duplicate` with this, which only
   * judges a template WITH a look group; here nothing refused it. The composition-copies door
   * (one box composition instanced twice) is pinned by value in
   * `repeated-source-preflight.dom.test.ts`; this is the same rule through the real browser.
   */
  test('B-148 — one source on TWO plates is refused, both are marked, and a second id clears it', async ({
    app,
  }) => {
    await app.newProject('RepeatedSource');
    await app.addLiveSource({ x: 120, y: 100 });
    await app.addLiveSource({ x: 300, y: 240 });
    await expect(holes(app)).toHaveCount(2);
    const ids = await holes(app).evaluateAll((nodes) =>
      nodes.map((n) => n.closest('[data-cg-element-id]')?.getAttribute('data-cg-element-id') ?? ''),
    );
    expect(ids.filter((id) => id !== '')).toHaveLength(2);
    // Separated in SCENE units, as the test above explains, so overlap never enters into it.
    await app.selectElementById(ids[0]!);
    await app.setInspectorNumber('X position', 400);
    await app.setInspectorNumber('Y position', 300);
    await app.setLiveSourceId('guest-1');
    await app.selectElementById(ids[1]!);
    await app.setInspectorNumber('X position', 1200);
    await app.setInspectorNumber('Y position', 300);
    await app.setLiveSourceId('guest-1');

    const marks = app.page.locator('[data-testid^="canvas-error-mark-"]');
    await expect(marks).toHaveCount(2);
    await expect(marks.first().getByRole('img')).toHaveAttribute(
      'aria-label',
      /Source "guest-1" is shown in 2 places/,
    );
    const exportBtn = app.page.getByRole('button', { name: 'Export .vcg' });
    await expect(exportBtn).toHaveAttribute('data-export-blocked', 'errors');
    await openIssues(app);
    await expect(issueRows(app, /is shown in 2 places/)).toHaveCount(2);
    await app.page.keyboard.press('Escape');
    await expect(issuesModal(app)).toHaveCount(0);

    // The author's next move, as the sentence names it: give the second plate its own id.
    await app.selectElementById(ids[1]!);
    await app.setLiveSourceId('guest-2');
    await expect
      .poll(() =>
        marks
          .getByRole('img')
          .evaluateAll((icons) => icons.map((icon) => icon.getAttribute('aria-label'))),
      )
      .toEqual([]);
    await expect(errorPill(app)).toHaveCount(0);
  });
});

/**
 * ⭐ Tasks 1.5e + 1.5g — **THE PLATE'S FRAME**, in the real browser.
 *
 * Maps `openspec/changes/live-source-multibox/specs/designer-live-source/spec.md`:
 *   - "A frame is authored on the plate and survives both exports"
 *   - "Overlapping frames are not a fault; overlapping holes are"
 *
 * The canvas is where the whole point is observable: the frame must paint AROUND the
 * declared rect, not inside it, and only a real browser computes the cascade of the
 * page's `*{box-sizing:border-box}` reset against the plate's own opt-out. jsdom
 * agrees (`tests/live-source-frame.test.ts`) — this is the same claim on Chromium.
 */
test.describe('Live Source — the frame (§9a.1)', () => {
  const strokeWidth = (app: DesignerApp) =>
    app.inspector.getByRole('spinbutton', { name: 'stroke width' });
  const strokeHex = (app: DesignerApp) =>
    app.inspector.getByRole('textbox', { name: 'stroke hex value' });

  /**
   * Set the frame through the Inspector exactly as an author would — WIDTH FIRST.
   * `DESIGNER-FIX-0905`: at width 0 the colour field is WITHHELD (disabled, its colour kept,
   * "set a width to paint it" as its tooltip), so the hex box only accepts a value once a
   * width exists. Filling the hex first used to work and now waits on a disabled input.
   */
  async function setFrame(app: DesignerApp, width: number, hex: string): Promise<void> {
    await strokeWidth(app).fill(String(width));
    await strokeWidth(app).press('Enter');
    await strokeHex(app).fill(hex);
    await strokeHex(app).press('Enter');
  }

  test('the frame paints around the plate, and the declared rect does not move', async ({
    app,
  }) => {
    await app.newProject('LiveSourceFrame');
    await app.addLiveSource({ x: 200, y: 160 });
    await app.setLiveSourceId('guest-1');

    /*
      The HOLE — the plate's box, in page pixels — read BEFORE the frame exists.

      This is the measurement that matters and the only one a REAL browser can give:
      the hole is what CasparCG composites the live picture into, and
      `collectLiveSources` declares it from `transform` alone. If the frame moves or
      resizes it, the composited picture and the drawn frame disagree on air, and
      nothing in the Designer would show it.
    */
    const readHole = () =>
      holes(app)
        .first()
        .evaluate((el) => {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          return {
            // Inset by any border, so this stays a CONTENT-box measurement even if a
            // future change puts a border back — which is the case it must catch.
            x: Math.round(r.left + parseFloat(cs.borderLeftWidth)),
            y: Math.round(r.top + parseFloat(cs.borderTopWidth)),
            w: Math.round(
              r.width - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth),
            ),
            h: Math.round(
              r.height - parseFloat(cs.borderTopWidth) - parseFloat(cs.borderBottomWidth),
            ),
          };
        });
    await expect.poll(async () => (await readHole()).w).toBeGreaterThan(0);
    const before = await readHole();

    await setFrame(app, 8, 'FF8800');

    // The write path is real — the row is not inert (the failure mode this repo has
    // shipped before). Polled, because the canvas iframe rebuilds on the edit.
    await expect
      .poll(() =>
        holes(app)
          .first()
          .evaluate((el) => getComputedStyle(el).outlineWidth),
      )
      .toBe('8px');
    const after = await readHole();
    const style = await holes(app)
      .first()
      .evaluate((el) => {
        const cs = getComputedStyle(el);
        return { outlineColor: cs.outlineColor, borderTopWidth: cs.borderTopWidth };
      });

    /*
      THE ASSERTION, and it is about GEOMETRY rather than about a CSS property: the
      hole is exactly where it was, at the size it was, with an 8px frame drawn
      entirely outside it.

      Two distinct ways a BORDER-based frame fails this, both silent on air and both
      measured before the outline was chosen (see `buildLiveSource`):
        - box-sizing left to the page's own `*{box-sizing:border-box}` reset → the
          hole SHRINKS by 16px on each axis;
        - `content-box` declared to escape that → `left`/`top` position the BORDER
          edge, so the hole SLIDES 8px right and down while the declaration still
          names the old rect.
      An outline has neither failure mode: it takes no layout at all.
    */
    expect(after).toEqual(before);
    expect(style.borderTopWidth).toBe('0px');
    expect(style.outlineColor).toBe('rgb(255, 136, 0)');

    // Still exportable: a frame is not a preflight concern.
    await expect(errorPill(app)).toHaveCount(0);
  });

  test('a width of 0 means NO frame, and the colour is kept', async ({ app }) => {
    await app.newProject('LiveSourceFrameZero');
    await app.addLiveSource({ x: 200, y: 160 });
    await setFrame(app, 8, '00FF00');
    await expect
      .poll(() =>
        holes(app)
          .first()
          .evaluate((el) => getComputedStyle(el).outlineWidth),
      )
      .toBe('8px');

    // Dial it off. Zero is "no frame", not "unset" — nothing paints…
    await strokeWidth(app).fill('0');
    await strokeWidth(app).press('Enter');
    await expect
      .poll(() =>
        holes(app)
          .first()
          .evaluate((el) => getComputedStyle(el).outlineWidth),
      )
      .toBe('0px');
    // …and the colour survives the trip through zero, so turning it back up returns
    // the frame the author chose rather than a default.
    await expect(strokeHex(app)).toHaveValue('00FF00');
    await strokeWidth(app).fill('4');
    await strokeWidth(app).press('Enter');
    await expect
      .poll(() =>
        holes(app)
          .first()
          .evaluate((el) => getComputedStyle(el).outlineColor),
      )
      .toBe('rgb(0, 255, 0)');
  });

  test('1.5g — overlapping FRAMES are fine; overlapping HOLES are not', async ({ app }) => {
    await app.newProject('LiveSourceFrameOverlap');

    // Two plates, both framed thickly. The Designer's default plate is 640x360, so
    // parking the second 20px clear of the first leaves the HOLES apart while the
    // two 40px frames overlap by 60px.
    await app.addLiveSource({ x: 200, y: 160 });
    await app.setLiveSourceId('guest-1');
    await setFrame(app, 40, 'FF8800');
    const x1 = app.inspector.getByRole('spinbutton', { name: 'X position' });
    const w1 = await sizeField(app, 'Width').inputValue();
    await x1.fill('0');
    await x1.press('Enter');

    await app.addLiveSource({ x: 400, y: 160 });
    await app.setLiveSourceId('guest-2');
    await setFrame(app, 40, 'FF8800');
    const x2 = app.inspector.getByRole('spinbutton', { name: 'X position' });
    await x2.fill(String(Number(w1) + 20));
    await x2.press('Enter');

    await app.inspector.getByRole('checkbox', { name: 'Allow live plate overlap' }).uncheck();
    await expect(holes(app)).toHaveCount(2);
    // NOT a fault. The overlap check reads the declared rect and only that.
    await expect(errorPill(app)).toHaveCount(0);

    // Now overlap the HOLES themselves — that IS a fault, reported against both.
    await x2.fill(String(Number(w1) - 40));
    await x2.press('Enter');
    await openIssues(app);
    await expect(issueRows(app, /overlaps/)).toHaveCount(2);
  });

  test('the frame survives the export and comes back on reopen', async ({ app }) => {
    await app.newProject('LiveSourceFrameExport');
    await app.addLiveSource({ x: 200, y: 160 });
    await app.setLiveSourceId('guest-1');
    await setFrame(app, 6, 'FF8800');
    await expect
      .poll(() =>
        holes(app)
          .first()
          .evaluate((el) => getComputedStyle(el).outlineWidth),
      )
      .toBe('6px');

    const { html } = await app.exportHtml();
    // The artifact CEF loads builds its DOM at boot from this inlined literal, so
    // the stroke being IN it is what makes a frame possible on air at all.
    const m = /var scene = (\{[\s\S]*?\});\n/.exec(html);
    expect(m?.[1]).toBeDefined();
    const scene = JSON.parse((m?.[1] ?? '{}').replace(/\u003c/g, '<')) as {
      layers: { children: { type: string; stroke?: { width: number; color: string } }[] }[];
    };
    const plate = scene.layers
      .flatMap((l) => l.children)
      .find((c) => c.type === 'video-placeholder');
    // Uppercase: the hex input normalises on commit (`normalizeHexColor`), so this
    // is the value the scene actually holds rather than the text that was typed.
    expect(plate?.stroke).toEqual({ width: 6, color: '#FF8800' });
  });
});
