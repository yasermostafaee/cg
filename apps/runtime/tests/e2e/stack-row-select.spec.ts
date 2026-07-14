import { buildValidVcg, expect, test } from './fixtures/runtime.js';

/**
 * Selecting a stack row must not depend on where the row's geometric centre happens to fall.
 *
 * The regression this pins: the page object clicked the row ROOT, and Playwright clicks an
 * element's CENTRE. The row is a `[badge] [1fr body] [auto actions]` grid, so the centre's
 * landing spot depends on how wide the four action buttons render — i.e. on font metrics.
 * On Windows/system-Chrome it cleared the actions column by 19px and every local run passed;
 * on CI's Linux/bundled-Chromium the wider buttons dragged the column left across the centre,
 * the click hit the actions area (which stops propagation) or a BUTTON, the row never
 * selected, and all 8 row-selecting specs failed deterministically.
 *
 * This test forces the pathological geometry — a viewport narrow enough that the row's centre
 * lands ON a button — and asserts selection still works and nothing is dispatched. It fails
 * against the row-root click and passes against the label-body click.
 */
test('a row selects by its label, even when its centre lands on a button', async ({ app }) => {
  const page = app.page;
  const templateId = 'tpl-e2e-select';

  await app.importVcg('select.vcg', await buildValidVcg(templateId));
  await app.loadTemplate(templateId);

  // Reproduce CI's geometry. The body is `1fr` and the actions are `auto`, so anything that
  // widens the buttons eats the body and drags the actions column LEFT across the row's
  // centre. CI does that with wider font metrics; narrowing the viewport applies the exact
  // same pressure and is deterministic on any machine.
  //
  // 1240px is chosen deliberately: the centre lands on a control (the hazard is live) while
  // the body is still ~116px wide (so the click target itself is real). At the default 1280
  // the centre clears the actions column by a mere 19px on Windows/system-Chrome — which is
  // the entire reason this shipped green locally and red on CI.
  await page.setViewportSize({ width: 1240, height: 800 });

  const row = app.stackRow(templateId).last();
  const centreHitsAControl = await row.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return hit?.closest('button') !== null;
  });
  // Guard the guard: if this ever stops being true, the geometry changed and this test is no
  // longer exercising the hazard it was written for.
  expect(centreHitsAControl).toBe(true);

  // The row still selects — because we click its LABEL, not its centre.
  await app.selectStackRow(templateId);
  await expect(app.inspector.getByText('Anchor name')).toBeVisible();

  // …and selecting it dispatched NOTHING: a centre-click would have pressed PLAY and put the
  // item on air. The badge must still read READY.
  await expect(row.getByText('READY')).toBeVisible();
  await expect(row.getByText('ON AIR')).toHaveCount(0);
});
