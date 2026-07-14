import { buildPositionedVcg, expect, test } from './fixtures/runtime.js';

/**
 * R-011 — the per-item position picker: seeds from the imported template's
 * manifest default, an applied override reaches the bridge (exactly one
 * stack.set-position), and the picker LOCKS once the item is on air. Driven
 * against the offline MockRuntime (the served-URL query + on-air runtime
 * placement are integration/unit-tested).
 */

test('the picker seeds from the manifest default, applies one override, and locks on air', async ({
  app,
}) => {
  const page = app.page;
  const templateId = 'tpl-e2e-pos';
  await app.importVcg('positioned.vcg', await buildPositionedVcg(templateId));
  await app.loadTemplate(templateId);
  await app.selectStackRow(templateId);

  // Seeded from the manifest default (bottom-right, −10/−20).
  const picker = app.inspector;
  await expect(picker.getByRole('button', { name: 'Anchor bottom-right' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(picker.getByLabel('Position offset X')).toHaveValue('-10');
  await expect(picker.getByLabel('Position offset Y')).toHaveValue('-20');

  // Count set-position dispatches, then apply ONE override.
  await page.evaluate(() => {
    const w = window as unknown as {
      __setPositionCalls: unknown[];
      cg: { stack: { setPosition: (req: unknown) => Promise<{ ok: boolean }> } };
    };
    w.__setPositionCalls = [];
    const orig = w.cg.stack.setPosition.bind(w.cg.stack);
    w.cg.stack.setPosition = (req: unknown) => {
      w.__setPositionCalls.push(req);
      return orig(req);
    };
  });
  await picker.getByRole('button', { name: 'Anchor top-left' }).click();
  await picker.getByRole('button', { name: 'Apply position' }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __setPositionCalls: unknown[] }).__setPositionCalls,
      ),
    )
    .toEqual([
      {
        itemId: expect.any(String) as unknown,
        position: { anchor: 'top-left', offset: { x: -10, y: -20 } },
      },
    ]);

  // Take the item on air → the picker locks (bridge-mirrored refusal).
  // R-004 — the row no longer prints its templateId; it carries it as a stable data anchor.
  const row = app.stackRow(templateId).last();
  await row.getByRole('button', { name: 'PLAY' }).click();
  await expect(row.getByText('ON AIR')).toBeVisible({ timeout: 3000 });
  await expect(picker.getByRole('button', { name: 'Apply position' })).toBeDisabled();
  await expect(picker.getByText('locked while on air')).toBeVisible();

  // OUT settles the item back to IDLE → editable again.
  await row.getByRole('button', { name: 'CLEAR', exact: true }).click();
  await expect(row.getByText('IDLE')).toBeVisible({ timeout: 3000 });
  await expect(picker.getByRole('button', { name: 'Apply position' })).toBeEnabled();
});

/**
 * B-072 — the applied override is READ BACK on reselect. The bridge stored and
 * honoured it all along, but nothing carried it home: the picker re-seeded from
 * the manifest default on every reselect, so the UI lied about what was on air —
 * and an innocent re-Apply then reverted the good position to the default.
 *
 * Two items of the SAME template make the reselect real (the picker is keyed by
 * itemId, so switching away and back remounts it) AND prove the override is
 * per-item: item B must still show the manifest default while A shows its
 * override.
 */
test('B-072: an applied override survives deselect → reselect, and re-Apply does not revert it', async ({
  app,
}) => {
  const page = app.page;
  const templateId = 'tpl-e2e-pos';
  await app.importVcg('positioned.vcg', await buildPositionedVcg(templateId));
  // Two items of the same template → selection can move A → B → A.
  await app.loadTemplate(templateId);
  await app.loadTemplate(templateId);

  const picker = app.inspector;
  // R-004 — the rows no longer print the templateId; they carry it as a data anchor. A and B
  // are simply the two rows of this template (the list renders newest-first, which is
  // immaterial here: the test only needs two DISTINCT rows to move selection between).
  //
  // Click each row's LABEL BODY, never the row root — the root's geometric centre can land in
  // the actions column (which stops propagation) or straight on a button. See
  // `RuntimeApp.selectStackRow`: that is the bug which failed all the row-selecting specs on
  // CI while passing locally by 19 pixels.
  const rows = app.stackRow(templateId);
  const selectA = async (): Promise<void> => {
    await rows.nth(0).locator('[data-row-body]').click();
  };
  const selectB = async (): Promise<void> => {
    await rows.nth(1).locator('[data-row-body]').click();
  };

  // Item A seeds from the manifest default (bottom-right, −10/−20), then the
  // operator applies a DIFFERENT position.
  await selectA();
  await expect(picker.getByRole('button', { name: 'Anchor bottom-right' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await picker.getByRole('button', { name: 'Anchor top-left' }).click();
  await picker.getByLabel('Position offset X').fill('42');
  await picker.getByLabel('Position offset Y').fill('7');
  await picker.getByRole('button', { name: 'Apply position' }).click();

  // DESELECT (switch to item B) — B has no override, so it still shows the
  // template's manifest default. This is the per-item proof.
  await selectB();
  await expect(picker.getByRole('button', { name: 'Anchor bottom-right' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(picker.getByLabel('Position offset X')).toHaveValue('-10');

  // RESELECT item A — the picker must show A's APPLIED OVERRIDE, not the
  // manifest default. This is the bug: before B-072 it showed bottom-right/−10.
  await selectA();
  await expect(picker.getByRole('button', { name: 'Anchor top-left' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(picker.getByLabel('Position offset X')).toHaveValue('42');
  await expect(picker.getByLabel('Position offset Y')).toHaveValue('7');

  // BLAST-RADIUS GUARD: re-Apply without editing anything must send the
  // OVERRIDE, never the manifest default — this used to silently revert a
  // correct on-air position.
  await page.evaluate(() => {
    const w = window as unknown as {
      __setPositionCalls: unknown[];
      cg: { stack: { setPosition: (req: unknown) => Promise<{ ok: boolean }> } };
    };
    w.__setPositionCalls = [];
    const orig = w.cg.stack.setPosition.bind(w.cg.stack);
    w.cg.stack.setPosition = (req: unknown) => {
      w.__setPositionCalls.push(req);
      return orig(req);
    };
  });
  await picker.getByRole('button', { name: 'Apply position' }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __setPositionCalls: unknown[] }).__setPositionCalls,
      ),
    )
    .toEqual([
      {
        itemId: expect.any(String) as unknown,
        position: { anchor: 'top-left', offset: { x: 42, y: 7 } },
      },
    ]);
});
