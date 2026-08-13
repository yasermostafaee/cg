import { test, expect } from './fixtures/designer.js';
import type { DesignerApp } from './fixtures/designer.js';

/**
 * D-125 Phase 3c — `lottie-override` field bindings, end to end through the REAL UI:
 * create a field, bind it from canvas onto a placed Lottie (the resolver picks the
 * clip's first text layer), then drive a live value through the preview form and see
 * the ANIMATION's own text change. Until this phase the binding target existed but the
 * runtime handler was a literal no-op.
 */

/** Furniture with a shape layer ('bar') and a TEXT layer ('title', authored "HELLO"). */
const TEXT_FURNITURE = JSON.stringify({
  v: '5.7.0',
  fr: 30,
  ip: 0,
  op: 120,
  w: 400,
  h: 200,
  nm: 'text-furniture',
  ddd: 0,
  assets: [],
  fonts: { list: [{ fName: 'sans', fFamily: 'sans-serif', fStyle: 'Regular', ascent: 75 }] },
  layers: [
    {
      ddd: 0,
      ind: 1,
      ty: 4,
      nm: 'bar',
      sr: 1,
      ks: {
        o: { a: 0, k: 100 },
        r: { a: 0, k: 0 },
        p: { a: 0, k: [200, 100, 0] },
        a: { a: 0, k: [0, 0, 0] },
        s: { a: 0, k: [100, 100, 100] },
      },
      ao: 0,
      shapes: [
        {
          ty: 'gr',
          it: [
            {
              ty: 'rc',
              d: 1,
              s: { a: 0, k: [300, 80] },
              p: { a: 0, k: [0, 0] },
              r: { a: 0, k: 0 },
            },
            { ty: 'fl', c: { a: 0, k: [0.1, 0.2, 0.8, 1] }, o: { a: 0, k: 100 }, r: 1 },
            {
              ty: 'tr',
              p: { a: 0, k: [0, 0] },
              a: { a: 0, k: [0, 0] },
              s: { a: 0, k: [100, 100] },
              r: { a: 0, k: 0 },
              o: { a: 0, k: 100 },
            },
          ],
          nm: 'Group',
        },
      ],
      ip: 0,
      op: 120,
      st: 0,
      bm: 0,
    },
    {
      ddd: 0,
      ind: 2,
      ty: 5,
      nm: 'title',
      sr: 1,
      ks: {
        o: { a: 0, k: 100 },
        r: { a: 0, k: 0 },
        p: { a: 0, k: [200, 110, 0] },
        a: { a: 0, k: [0, 0, 0] },
        s: { a: 0, k: [100, 100, 100] },
      },
      ao: 0,
      t: {
        d: {
          k: [
            {
              s: { s: 36, f: 'sans', t: 'HELLO', j: 2, tr: 0, lh: 43, ls: 0, fc: [1, 1, 1] },
              t: 0,
            },
          ],
        },
        p: {},
        m: { g: 1, a: { a: 0, k: [0, 0] } },
        a: [],
      },
      ip: 0,
      op: 120,
      st: 0,
      bm: 0,
    },
  ],
  markers: [
    { tm: 20, cm: 'intro-end', dr: 0 },
    { tm: 100, cm: 'outro-start', dr: 0 },
  ],
});

/** Import a bodymovin JSON via Project Assets and drag it onto the canvas. */
async function importAndPlaceLottie(
  app: DesignerApp,
  filename: string,
  json: string,
): Promise<void> {
  await app.page.getByRole('button', { name: 'Project assets', exact: true }).click();
  await app.page.getByRole('button', { name: 'Add asset', exact: true }).click();
  const chooser = app.page.waitForEvent('filechooser');
  await app.page.getByRole('menuitem', { name: /Lottie/ }).click();
  await (
    await chooser
  ).setFiles({ name: filename, mimeType: 'application/json', buffer: Buffer.from(json) });
  const panel = app.page.locator('aside[aria-label="Project assets"]');
  const tile = panel
    .locator('[draggable="true"]')
    .filter({ hasText: filename.replace(/\.json$/, '') })
    .first();
  await expect(tile).toBeVisible();
  await tile.dragTo(app.canvas, { targetPosition: { x: 220, y: 130 } });
}

test.describe('D-125 Phase 3c — lottie-override field bindings', () => {
  test('bind a text field to a Lottie from canvas; a live preview value replaces the clip text', async ({
    app,
  }) => {
    await app.newProject('LottieOverride');
    // D-151 — the add-time duration guard fires when content outsizes the host; size the host to FIT this spec’s clip so its own subject stays under test.
    await app.setSceneDuration(250);

    // A field needs to exist before it can be re-bound: the Data-key convenience
    // layer creates one on a text element, and the × unbinds it (keeping the field).
    await app.addTextElement({ x: 340, y: 260 });
    await app.setDataKey('headline');
    await app.deselect();
    const card = app.fieldCard('headline');
    await card.getByRole('button', { name: 'Unbind' }).click();

    // Place the furniture and BIND FROM CANVAS onto it: the resolver reads the parsed
    // clip's layers (from the asset cache) and targets the first TEXT layer.
    await importAndPlaceLottie(app, 'textclip.json', TEXT_FURNITURE);
    await app.bindFromCanvas('headline', { x: 220, y: 130 });
    await expect(card.getByText(/lottie title\.text/)).toBeVisible();

    // Lottie renders text as per-glyph nodes, so assert on the whole SVG's text
    // content with whitespace collapsed.
    const svgText = async (): Promise<string> =>
      ((await app.previewFrame.locator('svg').first().textContent()) ?? '').replace(/\s+/g, '');

    // On play the BOUND FIELD'S DEFAULT applies — like every bound field — so the
    // clip's authored "HELLO" is already replaced by the field default ("New text",
    // inherited from the Data-key source element). That IS the override working.
    await app.openPreviewModal();
    await app.play();
    await expect.poll(svgText).toContain('Newtext');

    // …and a live operator value replaces it THROUGH the update() path — the same
    // seam every other bound field uses. The stored template is untouched. Wait past
    // the intro (20f @ 30fps = 667 ms) so the driver is FROZEN on the hold first:
    // the primary broadcast case is retitling a lower third mid-hold, and an early
    // update would sneak inside the still-ticking intro window and prove nothing
    // (updateDocumentData alone renders only during a renderer pass — the frozen
    // path needs applyOverride's forced same-frame repaint).
    await app.page.waitForTimeout(900);
    await app.setPreviewField('headline', 'ON AIR');
    await app.updateAllPreviewFields();
    await expect.poll(svgText).toContain('ONAIR');
  });
});
