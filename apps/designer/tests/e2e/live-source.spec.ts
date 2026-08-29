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
 *   - "Bars on the authoring surfaces, nothing in the exports"
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

/** Issue ROWS in the modal matching `text`. Addressed by ROLE, not by text alone:
 *  a row nests its message in a span, so `getByText` matches the row AND the span. */
const issueRows = (app: DesignerApp, text: RegExp) =>
  issuesModal(app).getByRole('button', { name: text });

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
      ⭐ `B-183` — IT EXISTS ON THE CANVAS AND POINTS AT NOTHING.

      This asserted `toHaveValue('live-1')`. That default was the placeholder text of the
      Looks panel's source input — a suggestion the author had not accepted — so a freshly
      drawn plate was born pointed at something the owner never typed. ⚠ `B-188` has since
      deleted the DECLARATION the guess used to contradict; the reason survives it unchanged,
      because it was never about the declaration. The owner's principle: nothing lands
      unconfirmed.
    */
    await expect(holes(app)).toHaveCount(1);
    await expect(app.liveSourceIdInput).toHaveValue('');
    // And the bars SAY so, rather than looking finished.
    await expect(label(app)).toHaveText('no source');

    /*
      🔴 So a freshly drawn hole is NOT exportable — that is the feature, not a regression.

      ⚠ Asserted on the PILL only, deliberately. Opening the Issues modal to read the message
      DESELECTS the plate (measured — the next `setLiveSourceId` then timed out waiting for an
      Inspector input that is not rendered for an empty selection), and re-selecting it here
      would be plumbing in service of a string this suite is not the right place to pin. The
      message is asserted BY VALUE in `plate-source-unassigned.dom.test.ts`, and the modal's
      own mechanics are covered by the `D-157` tests below.
    */
    await expect(errorPill(app)).toHaveCount(1);

    // Choose one — the bars' label follows, which is what makes several holes on one
    // frame distinguishable at a glance.
    await app.setLiveSourceId('guest-1');
    await expect(label(app)).toHaveText('guest-1');

    // ONE id. The key-source-id control is gone: whether an id resolves to a single
    // device or to a fill/key PAIR is a property of the installation's mapping in CG
    // Control, and the author cannot know it (design.md §1a).
    await expect(
      app.inspector.getByRole('textbox', { name: 'Live Source key source id' }),
    ).toHaveCount(0);

    // `B-183` — and choosing a source CLEARS it: the refusal is a prompt, not a wall.
    await expect(errorPill(app)).toHaveCount(0);
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
    await expect(app.page.getByText(/is not a Live Source id/)).toBeVisible();
  });

  test('bars on the canvas and in the Preview modal; NOTHING in the export', async ({ app }) => {
    await app.newProject('LiveSourceBars');
    await app.addLiveSource({ x: 200, y: 160 });
    await app.setLiveSourceId('guest-1');

    // CANVAS — procedural bars (a gradient, never a bundled bitmap) + the id label.
    // The label lands with the same re-render as the bars, so waiting on it first
    // removes the race; the background is then POLLED rather than read once, because
    // a single `evaluate` can catch the iframe between builds and read an empty
    // string that means "not yet", not "no bars".
    await expect(label(app)).toHaveText('guest-1');
    await expect
      .poll(() =>
        holes(app)
          .first()
          .evaluate((el) => getComputedStyle(el).backgroundImage),
      )
      .toContain('gradient');

    // PREVIEW MODAL — also an authoring surface, so also bars. (Play is not needed:
    // the element is static furniture, and the modal renders the same built scene.)
    await app.openPreviewModal();
    const previewHole = app.previewFrame.locator('[data-cg-placeholder-for="video-placeholder"]');
    await expect(previewHole).toHaveCount(1);
    await expect
      .poll(() => previewHole.first().evaluate((el) => getComputedStyle(el).backgroundImage))
      .toContain('gradient');
    await app.previewDialog.getByRole('button', { name: 'Close' }).click();

    // EXPORT — the element is still THERE (it is a contract with the runtime), and it
    // paints nothing: no gradient anywhere in the emitted document, and the boot call
    // names 'output'.
    const { html } = await app.exportHtml();
    expect(html).toContain('"type":"video-placeholder"');
    expect(html).toContain('"routeKey":"guest-1"');
    expect(html).toContain("mode: 'output'");
    // No STATIC markup for the bars ships: the DOM is built at boot, so a label node
    // or an authoring style baked into the document would mean the bars had leaked
    // out of the mode branch and into the artifact.
    expect(html).not.toContain('data-cg-live-source-label');
    expect(html).not.toContain('linear-gradient(to right, #c0c0c0');
    /*
      DELIBERATELY NOT asserted here: that the SMPTE colour strings are absent from
      the file. They ARE present — the bundled `cg.js` carries the `SMPTE_BARS`
      constant, as it carries every other code path it does not take. Their presence
      says nothing about what paints; `mode: 'output'` is what decides that, and the
      zero-painted-pixels property is pinned where it can actually be observed —
      `packages/template-runtime/tests/live-source-render.test.ts` builds the same
      scene in both modes and asserts the output box has no background and no
      children. An assertion that "the string is absent" would have looked like proof
      and been about the bundler.
    */
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

    // No rotation (MIXER FILL is axis-aligned) and no opacity (the plate paints zero
    // pixels on air and cannot reach the layer composited behind it).
    await expect(app.inspector.getByRole('spinbutton', { name: 'Rotation' })).toHaveCount(0);
    await expect(app.inspector.getByRole('spinbutton', { name: 'Opacity' })).toHaveCount(0);

    // No Filter section: filters paint pixels, and in 'author' mode one would tint
    // only the SMPTE bars — an effect that reaches nothing on air.
    await expect(app.inspector.getByRole('button', { name: 'Filter' })).toHaveCount(0);

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

    // And the author is told WHY, here, rather than at export.
    await expect(app.inspector.getByText(/static and axis-aligned/i)).toBeVisible();

    // A freshly drawn plate is still exportable.
    await expect(errorPill(app)).toHaveCount(0);
  });

  test('OVERLAPPING Live Sources are reported against both', async ({ app }) => {
    await app.newProject('LiveSourceOverlap');
    await app.addLiveSource({ x: 200, y: 160 });
    await app.addLiveSource({ x: 230, y: 190 });
    await expect(holes(app)).toHaveCount(2);

    await openIssues(app);
    // One row per participant, so clicking either takes you to a real element.
    await expect(issueRows(app, /overlaps/)).toHaveCount(2);
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
      ⭐ `B-183` — THE FIRST PLATE GETS A SOURCE; THE SECOND DELIBERATELY DOES NOT.

      A plate now points at nothing until the author chooses, so with both left unassigned the
      marks could never reach zero: after the undo the SURVIVING plate still carries its own
      `live-source-unset` error, and this test failed exactly there (`expected 0, received 1`).

      Assigning only the FIRST is what keeps the undo honest. Setting a source on the second
      would add a history entry between the two the test relies on, so the single `undo()`
      below would revert that id instead of removing the plate — and the test would then be
      asserting undo granularity rather than the marks. The second plate is removed wholesale,
      so whether it had a source never mattered.
    */
    await app.setLiveSourceId('guest-1');
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
    await app.addLiveSource({ x: 230, y: 190 });

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
    await expect(exportBtn).toHaveAttribute('title', /Live Source/);
    await expect(exportBtn).not.toHaveAttribute('title', 'Resolve validation errors first');

    // ONE action from the control the author pressed to the full message.
    await exportBtn.click();
    await expect(app.page.getByRole('dialog', { name: 'Issues' })).toBeVisible();
    await expect(app.page.getByText(/overlaps/).first()).toBeVisible();
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

    // Scenario: "The fit mode is chosen in the Inspector" — both modes are offered.
    await expect(app.liveSourceFitModeSelect.locator('option')).toHaveCount(2);
    await app.setLiveSourceFitMode('cover');
    await expect(app.liveSourceFitModeSelect).toHaveValue('cover');
    await expect(app.liveSourceFitModeSelect.locator('option:checked')).toHaveText(/crop/i);

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
      ⭐ `B-183` — THE TOOL NO LONGER HANDS OUT IDS, SO INDEPENDENCE IS THE AUTHOR'S.

      This asserted `['live-1', 'live-2']` on the grounds that "two holes sharing an id
      would map to ONE producer with nothing saying so". That reasoning still holds and is
      now enforced where it belongs — on ids the author actually chose (`look-source-duplicate`)
      — rather than by a generator inventing undeclared names nobody had accepted.

      Both plates therefore start unassigned, SAY so on their bars, and are refused until the
      author names them. Independence is then asserted on the chosen ids.
    */
    const before = await holes(app).locator('[data-cg-live-source-label]').allTextContents();
    expect(before).toEqual(['no source', 'no source']);
    await expect(errorPill(app)).toHaveCount(1);

    await app.selectElementById(ids[0]!);
    await app.setLiveSourceId('guest-1');
    await app.selectElementById(ids[1]!);
    await app.setLiveSourceId('guest-2');

    const labels = await holes(app).locator('[data-cg-live-source-label]').allTextContents();
    expect(labels.sort()).toEqual(['guest-1', 'guest-2']);
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

  /** Set the frame through the Inspector exactly as an author would. */
  async function setFrame(app: DesignerApp, width: number, hex: string): Promise<void> {
    await strokeHex(app).fill(hex);
    await strokeHex(app).press('Enter');
    await strokeWidth(app).fill(String(width));
    await strokeWidth(app).press('Enter');
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
