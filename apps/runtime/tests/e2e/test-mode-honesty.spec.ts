import { test, expect } from './fixtures/runtime.js';

/**
 * R-006 — end to end, through the real UI, in the mode the operator was actually in when
 * the safety failure happened.
 *
 * The `app` fixture arms `CG_E2E`, which is now the EXPLICIT test-mode flag (it used to get
 * the mock via the silent fallback — the bug). So this drives exactly what an operator sees
 * after deliberately entering test mode, and pins that it can never be mistaken for air.
 */

test('test mode is loud, badges SIM, and claims no healthy server', async ({ app }) => {
  const page = app.page;

  // The loud banner — the thing a pill could never be.
  const banner = page.getByRole('alert', { name: 'Test mode' });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('NOTHING IS ON AIR');

  // The green "PRIMARY A HEALTHY" pill that sat beside the amber one — and won — is gone.
  // (Scoped + case-sensitive on purpose: a bare getByText('HEALTHY') is substring AND
  // case-insensitive, so it also matches the word "unhealthy" and proves nothing.)
  await expect(page.getByLabel('Status bar')).not.toContainText('HEALTHY');
  await expect(page.getByLabel('Server status')).toContainText('NO SERVER — SIMULATED');

  // Play an item: the simulation still runs (that is its value) …
  // R-028 part B — addressed by LAYER, not `.first()`. Rows render newest-layer-first and
  // most of them are empty, so `.first()` now lands on an empty row whose PLAY is correctly
  // disabled. Layer 70 is the seed's loaded graphic.
  await app.layerRow(70).getByRole('button', { name: 'PLAY' }).click();

  // … but it is badged SIM, never the broadcast-red ON AIR a real playout earns.
  const simBadge = page.getByLabel('status SIM ON AIR').first();
  await expect(simBadge).toBeVisible();
  await expect(page.getByLabel('status ON AIR')).toHaveCount(0);

  // And the banner is still there, dominating — it does not scroll away or auto-dismiss.
  await expect(banner).toBeVisible();
});
