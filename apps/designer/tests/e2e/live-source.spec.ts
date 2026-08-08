import { test, expect } from './fixtures/designer.js';
import type { DesignerApp } from './fixtures/designer.js';

/**
 * D-137 phase 1 — the **Live Source** element in the real browser: place it, see its
 * SMPTE bars while authoring, and get NOTHING in the export.
 *
 * Maps `openspec/changes/live-source-multibox/specs/designer-live-source/spec.md`,
 * one `test` per `#### Scenario` that has a UI to drive:
 *
 *   - "The element carries its ids and is placeable"
 *   - "A device reference is refused as a source id" (the authoring half)
 *   - "Bars on the authoring surfaces, nothing in the exports"
 *   - "An off-frame Live Source blocks rather than vanishes"
 *   - "An animated hole is refused in v1"
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

/** The Inspector's W / H spinbuttons, for reading the fit action's result. */
const sizeField = (app: DesignerApp, which: 'Width' | 'Height') =>
  app.inspector.getByRole('spinbutton', { name: which });

test.describe('Live Source (D-137 phase 1)', () => {
  test('placeable, carries its ids, and both round-trip through the Inspector', async ({ app }) => {
    await app.newProject('LiveSource');
    await app.addLiveSource({ x: 200, y: 160 });

    // It exists on the canvas, and its default id is the symbolic `live-1`.
    await expect(holes(app)).toHaveCount(1);
    await expect(app.liveSourceIdInput).toHaveValue('live-1');
    await expect(app.liveSourceKeyIdInput).toHaveValue('');

    // Rename the fill id — the bars' label follows, which is what makes several
    // holes on one frame distinguishable at a glance.
    await app.setLiveSourceId('guest-1');
    await expect(label(app)).toHaveText('guest-1');

    // The optional KEY id is settable, and clearing it is legitimate (fill-only is
    // every route:// and media source).
    await app.setLiveSourceId('guest-1-key', 'key');
    await expect(app.liveSourceKeyIdInput).toHaveValue('guest-1-key');
    await app.setLiveSourceId('', 'key');
    await expect(app.liveSourceKeyIdInput).toHaveValue('');

    // No preflight error at any point: a freshly drawn hole is exportable.
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

  test('an ANIMATED hole is refused in v1', async ({ app }) => {
    await app.newProject('LiveSourceAnimated');
    await app.addLiveSource({ x: 200, y: 160 });

    // A position.x keyframe makes the hole movable. `MIXER FILL` is emitted once from
    // the static rect, so a moving hole slides off the source behind it.
    await app.page
      .getByRole('button', { name: /Toggle keyframe for position\.x/ })
      .first()
      .click();

    await openIssues(app);
    await expect(issueRows(app, /keyframe/)).toHaveCount(1);
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

  test('the aspect is chosen by NAME, and “not specified” is a real third state', async ({
    app,
  }) => {
    await app.newProject('LiveSourceAspect');
    await app.addLiveSource({ x: 200, y: 160 });

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

  test('MULTIPLE independent Live Sources each get their own id', async ({ app }) => {
    await app.newProject('LiveSourceMulti');
    // Far apart, so this is about independence and not about the overlap rule.
    await app.addLiveSource({ x: 120, y: 100 });
    await app.addLiveSource({ x: 300, y: 240 });
    await expect(holes(app)).toHaveCount(2);

    // The tool hands out `live-1`, `live-2`: two holes sharing an id would map to ONE
    // producer with nothing saying so.
    const labels = await holes(app).locator('[data-cg-live-source-label]').allTextContents();
    expect(labels.sort()).toEqual(['live-1', 'live-2']);
    await expect(errorPill(app)).toHaveCount(0);
  });
});
