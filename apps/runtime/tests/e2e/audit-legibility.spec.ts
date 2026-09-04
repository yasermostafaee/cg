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

test('the audit log names the row and the template, shows local time to the second, and keeps the ids', async ({
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
  await expect(take.locator('[data-audit-time]')).toHaveText(/^\d{2}:\d{2}:\d{2}$/);
  await expect(take.locator('[data-audit-time]')).toHaveAttribute(
    'title',
    /\d{4}-\d{2}-\d{2}T.*Z \(UTC\)/,
  );
  // …and the date, once, as a band above the day's rows.
  await expect(log.locator('[data-audit-date]').first()).toHaveText(/^\d{4}-\d{2}-\d{2}$/);
  // `B-211` — the ids are NOT gone: full in the attribute, shortened in the text, copyable.
  await expect(take.locator('[data-audit-id="item"]')).toHaveAttribute(
    'data-audit-full-id',
    /^item-/,
  );
  await expect(take.locator('[data-audit-id="template"]')).toHaveAttribute(
    'data-audit-full-id',
    'tpl-e2e-audit',
  );
  await expect(take.getByRole('button', { name: 'Copy item id' })).toBeVisible();
  // The caveat about WHO is untouched.
  await expect(log).toContainText('It is a LABEL you typed, not a verified sign-in');
  // The footer's Close — the primitive's ✕ is also named Close, and sits first in the DOM.
  await log.getByRole('button', { name: 'Close' }).last().click();
  await expect(log).toHaveCount(0);
});

test('the layer table’s tally says "on air" in words, and only for rows that are', async ({
  app,
}) => {
  const layer = await app.importVcg('tally.vcg', await buildValidVcg('tpl-e2e-tally'));
  const tally = app.layers.locator('[data-air-tally]');
  /*
    The seeded bank already carries one documented on-air row (70), so the tally is not
    zero at rest — read what it says BEFORE the take, and assert the take adds exactly
    one. A LOADED row adds nothing: loading is a list action.
  */
  const before = Number((await tally.getAttribute('data-air-tally')) ?? '0');
  await expect(app.layers.locator('[data-error-tally]')).toHaveCount(0);

  await app.layerRow(layer).getByRole('button', { name: 'PLAY' }).click();
  // `B-213` — the count says what it counts, in words, and moved by exactly the take.
  await expect(tally).toHaveAttribute('data-air-tally', String(before + 1));
  await expect(tally).toHaveText(new RegExp(`\\(${String(before + 1)} on air\\)`));
  await expect(tally).toHaveAttribute('aria-label', `${String(before + 1)} items on air`);
});
