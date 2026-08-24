import { test, expect } from './fixtures/runtime.js';

/**
 * R-010 — the server settings panel + Remove-All, driven against the offline
 * MockRuntime (which mirrors the bridge's on-air gate):
 *
 *   1. With an item ON AIR, the panel opens blocked (reason shown, Apply disabled).
 *   2. Remove-All (confirm accepted) clears the stack.
 *   3. Reopened, the panel is unblocked; a remote host shows the LAN-exposure
 *      warning and Apply round-trips.
 */

test('settings panel: blocked while on air, Remove-All clears + unblocks, remote-host apply round-trips', async ({
  app,
}) => {
  const page = app.page;
  const panel = page.getByRole('dialog', { name: 'Server connection settings' });
  const openSettings = page.getByRole('button', { name: 'Open server settings' });

  // 1. Take an item to air, THEN open the panel → gate mirrored, Apply disabled.
  // R-028 part B — addressed by LAYER, not `.first()`: rows render newest-layer
  // first and most are empty, so the first PLAY on the page belongs to an empty
  // row and is correctly disabled. Layer 70 is the seed's loaded graphic.
  await app.layerRow(70).getByRole('button', { name: 'PLAY' }).click();
  await openSettings.click();
  await expect(panel).toBeVisible();
  await expect(panel.getByLabel('Primary host')).toHaveValue('127.0.0.1');
  await expect(panel.getByText(/on air or unsettled/)).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Apply server settings' })).toBeDisabled();

  /*
    THE HEADER'S `Close` BUTTON IS GONE, and this assertion is why the line below
    changed rather than the code.

    This dialog used to hand-roll its chrome, and its dedicated `Close` BUTTON was
    the odd one out in the app: every other dialog dismisses with the ✕ glyph. The
    modal primitive now owns the chrome, so the word is spent nowhere and the ✕ is
    the close affordance here as everywhere else — plus a real `Cancel` in the
    action row, because this dialog is a FORM and leaving without applying is a
    deliberate choice.

    Pinned, not merely updated: if the hand-rolled button ever comes back, this
    fails.
  */
  await expect(panel.getByRole('button', { name: 'Close server settings' })).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Cancel' }).click();
  await expect(panel).toBeHidden();

  // 2. Remove-All: confirm the app's modal (a deliberate destructive path).
  await page.getByRole('button', { name: 'Remove all items' }).click();
  await page
    .getByRole('dialog', { name: 'Remove all items?' })
    .getByRole('button', { name: 'Remove all', exact: true })
    .click();
  // R-028 part B — there is no separate Stack panel to empty. Remove-All is
  // proved by the LAYER rows: every one of them stops naming an item and offers
  // LOAD again. The rows themselves survive — they are declared layers, not a
  // list of what happens to be loaded.
  await expect(app.layers.locator('[data-item-id]')).toHaveCount(0);
  await expect(app.layerRow(70).getByRole('button', { name: 'LOAD' })).toBeVisible();

  // 3. Reopened: unblocked; remote host → warning; Apply → applied.
  await openSettings.click();
  await expect(panel.getByRole('button', { name: 'Apply server settings' })).toBeEnabled();
  await panel.getByLabel('Primary host').fill('192.168.1.50');
  await expect(panel.getByText(/Remote server \(192\.168\.1\.50\)/)).toBeVisible();
  await expect(panel.getByText(/control connection stays on 127\.0\.0\.1/)).toBeVisible();
  await panel.getByRole('button', { name: 'Apply server settings' }).click();
  await expect(panel.getByText(/^Applied\./)).toBeVisible();
});

/**
 * `C-024` — **the template serve address is set HERE, not on a command line.**
 *
 * `B-162` gave the bridge `--template-serve-host` and no stored layer, so the address had to be
 * re-typed at every start — and an address that must be re-typed is one that will one day not be
 * typed, producing the silent failure `B-162` exists to prevent (`CG ADD` returns 200, health stays
 * green, and the server shows live sources with no graphic over them).
 *
 * ⚠ Driven against the offline MockRuntime, so this proves the SURFACE: that the fields exist
 * beside the server hosts, carry their meaning, and reach `connections.set-config`. The three-layer
 * resolution itself is proved in `tools/caspar-bridge/tests/serve-host-config.test.ts`, where a
 * command line exists to test against; the mock has none and must not pretend otherwise.
 */
test('settings panel: the serve address sits beside the server hosts, offers candidates as candidates, and applies without a restart', async ({
  app,
}) => {
  const page = app.page;
  const panel = page.getByRole('dialog', { name: 'Server connection settings' });

  // The gate is the same one part 1 above proves; clear the stack so Apply is reachable.
  await page.getByRole('button', { name: 'Remove all items' }).click();
  await page
    .getByRole('dialog', { name: 'Remove all items?' })
    .getByRole('button', { name: 'Remove all', exact: true })
    .click();

  await page.getByRole('button', { name: 'Open server settings' }).click();
  await expect(panel).toBeVisible();

  /*
    BESIDE THE SERVER HOSTS, NOT IN A SECTION OF ITS OWN — it is a fact about how THOSE servers
    reach this machine, and the operator sets it in the same visit where they set the hosts it
    depends on.
  */
  const serve = panel.getByRole('region', { name: 'Template serve address' });
  await expect(serve).toBeVisible();
  await expect(serve.getByText(/HOW THOSE SERVERS REACH THIS MACHINE/)).toBeVisible();

  // The port's meaning is stated where it is set: empty is today's behaviour, pinning it is what
  // makes a firewall rule possible — the only reason the field exists.
  await expect(serve.getByText(/Empty = ephemeral/)).toBeVisible();

  /*
    🔴 NOTHING HERE OFFERS TO RESTART THE BRIDGE. Its lifetime is deliberately outside this
    console: `connections.set-config` already re-derives template serving on the running process.
    Pinned as an ABSENCE, because the tempting next feature is exactly the one that must not exist.
  */
  await expect(panel.getByRole('button', { name: /restart/i })).toHaveCount(0);

  await panel.getByLabel('Template serve host').fill('192.168.21.93');
  await panel.getByLabel('Template serve port').fill('7911');
  await panel.getByRole('button', { name: 'Apply server settings' }).click();
  await expect(panel.getByText(/^Applied\./)).toBeVisible();

  // The value survives a close/reopen — which is the whole point of giving it a stored layer.
  await panel.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Open server settings' }).click();
  await expect(panel.getByLabel('Template serve host')).toHaveValue('192.168.21.93');
  await expect(panel.getByLabel('Template serve port')).toHaveValue('7911');
});
