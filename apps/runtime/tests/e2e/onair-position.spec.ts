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
  const row = app.stack
    .locator('div')
    .filter({ hasText: templateId })
    .filter({ has: page.getByRole('button', { name: 'PLAY' }) })
    .last();
  await row.getByRole('button', { name: 'PLAY' }).click();
  await expect(row.getByText('ON AIR')).toBeVisible({ timeout: 3000 });
  await expect(picker.getByRole('button', { name: 'Apply position' })).toBeDisabled();
  await expect(picker.getByText('locked while on air')).toBeVisible();

  // OUT settles the item back to IDLE → editable again.
  await row.getByRole('button', { name: 'OUT' }).click();
  await expect(row.getByText('IDLE')).toBeVisible({ timeout: 3000 });
  await expect(picker.getByRole('button', { name: 'Apply position' })).toBeEnabled();
});
