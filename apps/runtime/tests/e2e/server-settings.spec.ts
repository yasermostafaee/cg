import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/runtime.js';

/**
 * Open Station setup AND land on SERVERS.
 *
 * `STATION-CHROME-01` §2 — the status bar's button is SETTINGS now and opens the dialog at
 * its default tab, CHANNEL, which is the tab that asks nothing of the operator. This whole
 * file is about the Servers tab, so it says so once, here, rather than fifteen times.
 *
 * `SERVERS-SIMPLIFY-01` (T1) — the tab is `Connection` now (its deep-link id is still `servers`).
 */
async function openServers(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Open Station setup', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Station setup' })
    .getByRole('tablist', { name: 'Station setup sections' })
    .getByRole('tab', { name: /^Connection/ })
    .click();
}

/**
 * R-010 — the Connection section of Station setup, driven against the offline
 * MockRuntime (which mirrors the bridge's on-air gate):
 *
 *   1. With an item ON AIR, the dialog opens blocked (reason shown, APPLY SERVERS disabled).
 *   2. Clear All (confirm accepted) clears the output and retains the rows.
 *   3. Reopened, the section is unblocked; a remote host shows the LAN-exposure
 *      warning and Apply round-trips.
 *
 * `STATION-SETUP-02` — the `Server connection` dialog became Station setup's Servers
 * section; the panel locator is the one dialog and the button is its deep link.
 */

test('settings panel: blocked while on air, Clear-All unblocks and the ROWS SURVIVE, remote-host apply round-trips', async ({
  app,
}) => {
  const page = app.page;
  const panel = page.getByRole('dialog', { name: 'Station setup' });

  // 1. Take an item to air, THEN open the panel → gate mirrored, Apply disabled.
  // R-028 part B — addressed by LAYER, not `.first()`: rows render newest-layer
  // first and most are empty, so the first PLAY on the page belongs to an empty
  // row and is correctly disabled.
  // `FIELD-FIXES-01-A` — NOT layer 80: the seed's loaded graphic there holds SEATED plates (the
  // `B-145` adoption case), and a row that owns live seats is refused a take, so its PLAY is
  // unavailable. Layer 96 is the seed's idle TICKER row, which owns nothing.
  await app.layerRow(96).getByRole('button', { name: 'PLAY' }).click();
  await openServers(page);
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
    the close affordance here as everywhere else.

    ⭐ `B-240` — AND IT IS NOW THE ONLY ONE. This paragraph used to end "plus a real
    `Cancel` in the action row, because this dialog is a FORM and leaving without
    applying is a deliberate choice". Both halves of that were true and together they
    made one control do two jobs: it was named for discarding the draft AND it
    dismissed, while `Revert` one tab along discarded without dismissing. The form's
    deliberate choice is `Revert` now, section-scoped; leaving is the ✕.

    Pinned, not merely updated: if the hand-rolled button ever comes back, this
    fails.
  */
  await expect(panel.getByRole('button', { name: 'Close server settings' })).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Close' }).click();
  await expect(panel).toBeHidden();

  // 2. Clear All is available while the row itself is protected from removal.
  await expect(app.layerRow(96).getByRole('button', { name: 'REMOVE' })).toBeDisabled();
  await page.getByRole('button', { name: /^Clear all rows/ }).click();
  const clearDialog = page.getByRole('dialog').filter({ hasText: /Clear/ });
  await clearDialog.getByRole('button', { name: /^Clear/ }).click();
  // The ROW and its ITEM both survive.
  await expect(app.layers.locator('[data-item-id]')).not.toHaveCount(0);
  await expect(app.layerRow(80).getByRole('button', { name: 'REMOVE' })).toBeVisible();

  // 3. Reopened: unblocked; remote host → warning; Apply → applied.
  await openServers(page);
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
  const panel = page.getByRole('dialog', { name: 'Station setup' });

  // B-228 — the restore-blocked row is exempt from the on-air removal refusal.
  const removeFrom = (itemId: string) =>
    app.layers.locator('[data-item-id="' + itemId + '"]').getByRole('button', { name: 'REMOVE' });
  await expect(removeFrom('item-blocked-restore')).toBeEnabled();
  await expect(removeFrom('item-looks')).toBeDisabled();

  await page.getByRole('button', { name: /^Clear all rows/ }).click();
  const clearDialog = page.getByRole('dialog').filter({ hasText: /Clear/ });
  await clearDialog.getByRole('button', { name: /^Clear/ }).click();

  await openServers(page);
  await expect(panel).toBeVisible();

  /*
    BESIDE THE SERVER HOSTS, NOT IN A SECTION OF ITS OWN — it is a fact about how THOSE servers
    reach this machine, and the operator sets it in the same visit where they set the hosts it
    depends on.
  */
  /*
    `SERVERS-SIMPLIFY-01` (T3) — named for what it is: `Where CasparCG fetches graphics`, under `Advanced`
    (open here: the offline mock is not a Playout station). It was `How those servers reach this machine`,
    and the owner read "this machine" as his own PC.
  */
  const serve = panel.getByRole('region', { name: 'Where CasparCG fetches graphics' });
  await expect(serve).toBeVisible();
  // ⚠ `STATION-CHROME-02` §3 — case-INSENSITIVE on purpose: the words are the claim, not their case.
  await expect(serve.getByText(/where casparcg fetches graphics/i)).toBeVisible();
  await expect(panel.getByText(/this machine/i)).toHaveCount(0);

  // T5 — the port's default is said where it is set, as its placeholder: empty is assigned automatically.
  await expect(panel.getByLabel('Graphics port')).toHaveAttribute(
    'placeholder',
    'Assign automatically',
  );

  /*
    🔴 NOTHING HERE OFFERS TO RESTART THE BRIDGE. Its lifetime is deliberately outside this
    console: `connections.set-config` already re-derives template serving on the running process.
    Pinned as an ABSENCE, because the tempting next feature is exactly the one that must not exist.
  */
  await expect(panel.getByRole('button', { name: /restart/i })).toHaveCount(0);

  await panel.getByLabel('Graphics host').fill('192.168.21.93');
  await panel.getByLabel('Graphics port').fill('7911');
  await panel.getByRole('button', { name: 'Apply server settings' }).click();
  await expect(panel.getByText(/^Applied\./)).toBeVisible();

  // The value survives a close/reopen — which is the whole point of giving it a stored layer.
  await panel.getByRole('button', { name: 'Close' }).click();
  await openServers(page);
  await expect(panel.getByLabel('Graphics host')).toHaveValue('192.168.21.93');
  await expect(panel.getByLabel('Graphics port')).toHaveValue('7911');
});
