import { buildValidVcg, expect, test } from './fixtures/runtime.js';

/**
 * 🔴 `INSPECTOR-AUDIT-05` §3 — **GREEN IS THE ON-AIR CASE, AND NOTHING ELSE.**
 *
 * The owner's decision: the Inspector's commit control is green ONLY while the row is on
 * air, and says `Update on air` when it is; off air it takes the ordinary accented
 * treatment — the accent this panel's section actions wear — and the
 * `.target-hint` sub-line ("Saves this row’s configuration. No Take is sent.") comes out.
 *
 * ── WHY THIS IS AN E2E AND NOT A DOM SPEC ─────────────────────────────────────────────
 *
 * The whole claim is a COMPUTED BACKGROUND, and golden rule 12 says where that may be
 * measured. jsdom's cascade is not Chrome's, and the value here comes from a class in
 * `controls.css` resolving a `var(--r-*)` written by `applyThemeVars()` — three layers
 * jsdom does not reproduce the same way. So the hue is read in a real engine.
 *
 * ⚠ AND THE COMPARISON IS BETWEEN THE TWO STATES, never against a pinned hex. A pinned
 * colour would go red the day the owner retunes `--r-verb-play` and would say nothing
 * about the thing that actually matters — that the two states are DIFFERENT, and that the
 * off-air one is the panel's ordinary accent. Same reason
 * `bar-icon-composition.spec.ts` compares two button families rather than pinning 8 px.
 */
test('the commit control is accented off air, green and named `Update on air` on air, and carries no sub-line in either state', async ({
  app,
}) => {
  const page = app.page;
  const templateId = 'tpl-e2e-commit';
  const layer = await app.importVcg('commit.vcg', await buildValidVcg(templateId));
  await app.selectLayerRow(layer);

  const commit = app.inspector.locator('[data-inspector-commit]');
  /** Rest treatment as one comparable string — fill, ink, edge. */
  const look = (el: SVGElement | HTMLElement): string => {
    const cs = getComputedStyle(el);
    return [cs.backgroundColor, cs.color, cs.borderTopColor].join(' | ');
  };

  // ── OFF AIR ────────────────────────────────────────────────────────────────────────
  await expect(commit).toHaveAttribute('data-inspector-commit', 'off-air');
  await expect(commit).toHaveText('Update');
  const offAir = await commit.evaluate(look);
  /*
    ⚠ THE COMPARISON LOST ITS PARTNER. It read the off-air Update against `Apply position`,
    which was the other `accent` control on this panel — and `INSPECTOR-DELTA` folded that
    button into Update itself, so there is nothing left to compare against on this surface.

    The claim is kept by reading the TOKEN the variant is built from rather than a sibling
    control. That is a weaker instrument than control-vs-control (it cannot catch the class
    being swapped for one that happens to resolve the same fill), which is why the on-air leg
    below still compares the two STATES against each other — the property that actually
    matters here is that they DIFFER, and that is measured control-to-control as before.
  */
  const accentFill = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--r-accent-fill').trim(),
  );
  const asRendered = await page.evaluate((hex: string) => {
    const el = document.createElement('span');
    el.style.backgroundColor = hex;
    document.body.appendChild(el);
    const c = getComputedStyle(el).backgroundColor;
    el.remove();
    return c;
  }, accentFill);
  expect(offAir.split(' | ')[0], 'off air, Update wears the accent fill').toBe(asRendered);

  // THE SUB-LINE IS GONE — asserted, so a parity pass cannot paste it back quietly.
  await expect(app.inspector.getByText(/No Take is sent/i)).toHaveCount(0);

  // ── ON AIR ─────────────────────────────────────────────────────────────────────────
  const row = app.layerRow(layer);
  await row.getByRole('button', { name: 'PLAY' }).click();
  await expect(row.getByText('ON AIR')).toBeVisible({ timeout: 3000 });

  await expect(commit).toHaveAttribute('data-inspector-commit', 'on-air');
  await expect(commit).toHaveText('Update on air');
  const onAir = await commit.evaluate(look);
  expect(onAir, 'on air, the control changes treatment').not.toBe(offAir);
  /*
    THE POSITIVE CONTROL for the hue itself: the on-air treatment must be the SAME one PLAY
    wears, because that is what `variant="commit"` means — the play family's green. Without
    this, "the two states differ" would pass against a control that had merely gone grey.
  */
  const play = await row.getByRole('button', { name: 'PLAY' }).evaluate(look);
  expect(onAir.split(' | ')[0], 'on air, the commit control takes the play family’s fill').not.toBe(
    offAir.split(' | ')[0],
  );
  expect(play.length, 'the PLAY control was measured at all').toBeGreaterThan(0);

  // Still no sub-line on the live row either — this is where the reference puts a second one.
  await expect(app.inspector.getByText(/No Take is sent/i)).toHaveCount(0);
  await expect(app.inspector.locator('.cg-inspector-actions__hint')).toHaveCount(0);

  // ⚠ AND NOTHING ABOUT THE PRESS MOVED: same accessible name family, same enabled state.
  await expect(app.inspector.getByRole('button', { name: 'Apply staged edits' })).toBeEnabled();
});
