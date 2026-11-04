import { buildValidVcg, expect, test } from './fixtures/runtime.js';

/**
 * `RUNTIME-FIX-0904` — the surfaces that knew something and did not say it.
 *
 * Maps the `#### Scenario`s of "The audit log is read in the operator's terms" and
 * "The layer table's tally says what it counts" to the operator flow: load a template
 * onto a row, take it, and read what the log and the header now say about it.
 *
 * Driven against the offline MockRuntime, whose audit entries carry the same slot the
 * bridge's do (`B-211` parity) and whose take settles the row `on-air`.
 */

test('the audit log names the row and template, shows local time, and exposes full ids in details', async ({
  app,
}) => {
  const page = app.page;
  const layer = await app.importVcg('news.vcg', await buildValidVcg('tpl-e2e-audit'));
  await app.layerRow(layer).getByRole('button', { name: 'PLAY' }).click();

  await page.getByRole('button', { name: 'Open audit log' }).click();
  const log = page.getByRole('dialog', { name: 'Audit log' });
  await expect(log).toBeVisible();

  // Newest first: the take is the top row.
  const take = log.locator('[data-audit-row]').first();
  await expect(take).toContainText('take');
  // `B-211` — NAMES: the row as the table calls it, the template as the picker calls it
  // (the file name, `news.vcg` → `news`).
  await expect(take.locator('[data-audit-names]')).toHaveText(/^Layer \d+ · news$/);
  // `B-210` — the clock, not the ISO stamp; the UTC stamp is one hover away.
  await expect(take.locator('[data-audit-time] strong')).toHaveText(/^\d{2}:\d{2}:\d{2}$/);
  await expect(take.locator('[data-audit-time] small')).toHaveText(/^\d{4}-\d{2}-\d{2}$/);
  await expect(take.locator('[data-audit-time]')).toHaveAttribute('title', /\d{4}-\d{2}-\d{2}T.*Z/);
  // Technical identifiers stay out of the scanning row and are complete in its details overlay.
  const itemId = await take.getAttribute('data-audit-item-id');
  expect(itemId).toMatch(/^item-/);
  const details = log.getByRole('complementary', { name: 'Event details' });
  await expect(take).toHaveAttribute('aria-pressed', 'true');
  await expect(details).toBeVisible();
  await expect(details.locator('[data-audit-technical="Item ID"] code')).toHaveText(itemId ?? '');
  await expect(details.locator('[data-audit-technical="Template ID"] code')).toHaveText(
    'tpl-e2e-audit',
  );
  await expect(details.getByRole('button', { name: 'Copy Item ID' })).toBeVisible();
  /*
    🔴 `OPERATOR-NAME-SWEEP-01` — **THE CAVEAT IS GONE, AND THIS ASSERTS ITS ABSENCE.**

    It read "the caveat about WHO is untouched" and pinned the sentence. Identity is proven
    now, so that sentence would be false above these rows.

    ⭐ **The positive control is the line above and the two below**: this same locator is
    asserted to CONTAIN the item id, the Copy button and — next line — a real actor value. A
    bare "does not contain" against a panel that failed to open would pass for the wrong
    reason, which is exactly what `PLAYOUT-AUTHZ-01`'s first e2e did before a control caught
    it.
  */
  await expect(log).not.toContainText('LABEL you typed');
  await expect(log).not.toContainText('not a verified sign-in');
  // …and the ACTOR column is still there, carrying a value — the control for the two above.
  await expect(log.locator('[data-audit-actor]').first()).not.toBeEmpty();
  // Pressing the selected row again closes its details.
  await take.click();
  await expect(details).toHaveCount(0);
  // The footer's Close — the primitive's ✕ is also named Close, and sits first in the DOM.
  await log.getByRole('button', { name: 'Close' }).last().click();
  await expect(log).toHaveCount(0);
});

test('the layer table’s tally is the number in the air colour, says "on air" in its accessible name, and moves only for rows that are', async ({
  app,
}) => {
  const layer = await app.importVcg('tally.vcg', await buildValidVcg('tpl-e2e-tally'));
  const tally = app.layers.locator('[data-air-tally]');
  /*
    The seeded bank already carries one documented on-air row (80), so the tally is not
    zero at rest — read what it says BEFORE the take, and assert the take adds exactly
    one. A LOADED row adds nothing: loading is a list action.
  */
  const before = Number((await tally.getAttribute('data-air-tally')) ?? '0');
  await expect(app.layers.locator('[data-error-tally]')).toHaveCount(0);

  await app.layerRow(layer).getByRole('button', { name: 'PLAY' }).click();
  // `B-213` — the count says what it counts and moved by exactly the take. `B-224` had cut
  // the words for want of 28 px in the STATE head; `CONSOLE-LOOK-06` D5 moved the count to
  // the sub-bar, where the line is full-width, so the words are back on the visible chip and
  // are no longer carried by the accessible name alone.
  await expect(tally).toHaveAttribute('data-air-tally', String(before + 1));
  await expect(tally).toHaveText(`${String(before + 1)} on air`);
  await expect(tally).toHaveAttribute('aria-label', `${String(before + 1)} items on air`);
  await expect(tally).toHaveAttribute('title', new RegExp(`^${String(before + 1)} on air`));
});

/**
 * `INSPECTOR-AUDIT-05` §5(a) — prototype copy stays absent while production tools remain.
 *
 * `CONSOLE-MATCH-03` §25.5 asserted three of the drawing's own scaffolding strings as
 * absences, in `shell-chrome.spec.ts` — but all three live on the SHELL, and the audit
 * dialog's share of that list (`Sample records · UTC`, and "Identifiers and this event are
 * sample data.") was written down as not-copied and never guarded. It has been an intention,
 * not a guard, since. An absence that is asserted is a guard; an intended one is a wish.
 *
 * The production panel now has a live-tail checkbox, date range, and row details. This guard
 * distinguishes those real controls from the prototype's sample labels and fake `View event`
 * action, so a parity pass cannot restore scaffolding while removing useful operator tools.
 *
 * ⚠ THE POSITIVE CONTROL IS NOT OPTIONAL. Every assertion below is a NEGATIVE observation,
 * and a negative observation is void until the instrument is shown able to report the
 * opposite: a mistyped dialog name, a panel that failed to open, a `getByText` scoped to
 * nothing would pass all of them against a blank screen. So the same locator is asked for
 * something that IS there, in the same run.
 */
test('the audit log keeps production controls and none of the prototype scaffolding', async ({
  app,
}) => {
  const page = app.page;
  await page.getByRole('button', { name: 'Open audit log' }).click();
  const log = page.getByRole('dialog', { name: 'Audit log' });
  await expect(log).toBeVisible();

  // THE POSITIVE CONTROL, first: this locator can find what the dialog really says.
  await expect(log.getByText('Station actions and their recorded outcomes.')).toBeVisible();
  await expect(log.getByRole('button', { name: 'Refresh' })).toBeVisible();

  // ── THE PROTOTYPE'S OWN SCAFFOLDING ──────────────────────────────────────────────────
  for (const furniture of [/Sample records/i, /sample data/i, /PROTOTYPE/]) {
    await expect(log.getByText(furniture)).toHaveCount(0);
  }
  // `Time`, not `Time · UTC` — ours reads the control room's clock (`RUNTIME-FIX-0904`).
  await expect(log.getByText(/·\s*UTC/i)).toHaveCount(0);

  // ── THE THREE WE DECLINED ────────────────────────────────────────────────────────────
  await expect(log.getByRole('checkbox', { name: 'Follow new events' })).toBeVisible();
  await expect(log.getByRole('button', { name: /^View event/i })).toHaveCount(0);
  await expect(log.locator('[data-audit-details]')).toHaveCount(0);
  await expect(log.getByLabel('Audit from date')).toBeVisible();
  await expect(log.getByLabel('Audit to date')).toBeVisible();
  for (const name of ['Action', 'Result', 'Channel', 'Actor']) {
    await expect(log.getByLabel(name, { exact: true })).toHaveCount(1);
  }
});

/**
 * 🔴 `INSPECTOR-AUDIT-05` §5(b) — **THE LOG IS WHERE THE IDS LIVE IN FULL.**
 *
 * Golden rule 11's division has two halves: the scanning row carries operator-facing names,
 * while selecting it opens the complete technical identifiers and their copy actions.
 */
test('every technical id is complete in the selected row details and copyable', async ({ app }) => {
  const page = app.page;
  const templateId = 'tpl-e2e-audit-ids';
  const layer = await app.importVcg('ids.vcg', await buildValidVcg(templateId));
  await app.layerRow(layer).getByRole('button', { name: 'PLAY' }).click();

  await page.getByRole('button', { name: 'Open audit log' }).click();
  const log = page.getByRole('dialog', { name: 'Audit log' });
  const take = log.locator('[data-audit-row]').first();
  await expect(take).toContainText('take');

  const itemId = await take.getAttribute('data-audit-item-id');
  expect(itemId, 'the row retains the item identity used to open its details').toMatch(/^item-/);
  const details = log.getByRole('complementary', { name: 'Event details' });
  await expect(details).toBeVisible();
  for (const [label, full] of [
    ['Item ID', itemId ?? ''],
    ['Template ID', templateId],
  ] as const) {
    const fact = details.locator(`[data-audit-technical="${label}"]`);
    await expect(fact.locator('code')).toHaveText(full);
    await expect(fact.locator('code')).toHaveAttribute('title', full);
    await expect(fact.getByRole('button', { name: `Copy ${label}` })).toBeVisible();
  }

  /*
    …and the SENTENCE half, which is the other side of the same rule: the names the operator
    reads carry no id at all. Asserted on the names element rather than on the row, because
    the selected row's details legitimately carry both.
  */
  await expect(take.locator('[data-audit-names]')).not.toContainText(templateId);
  await expect(take.locator('[data-audit-names]')).not.toContainText(/item-[0-9a-f]{8}/);
});
