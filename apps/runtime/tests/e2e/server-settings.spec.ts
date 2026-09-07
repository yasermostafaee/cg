import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/runtime.js';

/**
 * Open Station setup AND land on SERVERS.
 *
 * `STATION-CHROME-01` §2 — the status bar's button is SETTINGS now and opens the dialog at
 * its default tab, CHANNEL, which is the tab that asks nothing of the operator. This whole
 * file is about the Servers tab, so it says so once, here, rather than fifteen times.
 */
async function openServers(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Open Station setup', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Station setup' })
    .getByRole('tablist', { name: 'Station setup sections' })
    .getByRole('tab', { name: /^Servers/ })
    .click();
}

/**
 * R-010 — the Servers section of Station setup + Remove-All, driven against the offline
 * MockRuntime (which mirrors the bridge's on-air gate):
 *
 *   1. With an item ON AIR, the dialog opens blocked (reason shown, APPLY SERVERS disabled).
 *   2. Remove-All (confirm accepted) clears the stack.
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
  // row and is correctly disabled. Layer 70 is the seed's loaded graphic.
  await app.layerRow(70).getByRole('button', { name: 'PLAY' }).click();
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

  /*
    2. 🔴 `R-017` / `operator-surface` §6 — THE REMEDY IS CLEAR-ALL, AND THE ASSERTION
       CHANGES SHAPE RATHER THAN WORDING.

    Remove-All is no longer the unblock path and is no longer even available here: it is
    disabled by exactly the condition the panel is reporting. Clear-All is, because Apply
    gates on the ON-AIR COUNT and not on an empty list.

    That makes this step assert strictly MORE than it used to. Remove-All emptied the rows, so
    "the item is gone" and "Apply is unblocked" were indistinguishable. Clear-All takes the
    graphic off air and KEEPS the row, so the two facts separate: the item must still be
    there, and Apply must still become enabled. The old shape could not have caught a
    Clear-All that quietly removed things.
  */
  await expect(page.getByRole('button', { name: 'Remove all items' })).toBeDisabled();
  await page.getByRole('button', { name: /^Clear all rows/ }).click();
  const clearDialog = page.getByRole('dialog').filter({ hasText: /Clear/ });
  await clearDialog.getByRole('button', { name: /^Clear/ }).click();
  // The ROW and its ITEM both survive — that is the whole difference from Remove-All.
  await expect(app.layers.locator('[data-item-id]')).not.toHaveCount(0);
  await expect(app.layerRow(70).getByRole('button', { name: 'REMOVE' })).toBeVisible();

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

  /*
    🔴 `R-017` / `B-228` — TAKE THE ROWS OFF AIR SO APPLY IS REACHABLE, AND THE REMEDY IS
    CLEAR-ALL.

    This step used to click Remove-All, and `R-017` made that unperformable: Remove-All is now
    withheld while any non-exempt row is on air — which part 1 above ASSERTS, nine lines from
    here — so the click waited the full 30 s on a control that could never enable, and `dev`'s
    Linux `e2e` went red. `pnpm gate` does not run Playwright (`P-028`), so CI was the only
    signal. Part 1 was updated to Clear-All in the same commit and this sibling was missed:
    golden rule 9's sweep, stopping inside the file it had already opened.

    Clear-All is the right remedy rather than a way to go green — Apply gates on the ON-AIR
    COUNT, not on an empty list, and Clear-All takes the graphics off air while KEEPING the
    rows (part 1 asserts that difference explicitly).
  */
  /*
    ⭐ `B-228`'s PIN, and it is an ADDITION rather than a relaxation — this assertion did not
    exist before and it fails on the defect.

    The e2e seed puts TWO rows on air: the look-bearing row, and the RESTORE-BLOCKED row whose
    layer is held by a producer provably not ours. The bridge EXEMPTS the second from the
    remove refusal (`#removeExempt`, `R-021` stage 4 d1), so exactly ONE row may block
    Remove-All. Before `B-228` the bulk gate read the bare predicate and counted both — the UI
    withholding a press the bridge would have accepted. If this number ever reads `2` again,
    the exemption has stopped crossing the seam.
  */
  await expect(page.getByRole('button', { name: 'Remove all items' })).toHaveAttribute(
    'title',
    /^1 row\(s\) are on air/,
  );

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
  const serve = panel.getByRole('region', { name: 'Template serve address' });
  await expect(serve).toBeVisible();
  /*
    ⚠ `STATION-CHROME-02` §3 — matched case-INSENSITIVELY on purpose. The card head's
    `text-transform: uppercase` is the ONE treatment now (`.cg-card__title`), so the string in
    the DOM is sentence case while the pixels are uppercase; Playwright matches the DOM. Pinning
    either spelling would pin the mechanism rather than the words, and the words are the claim.
  */
  await expect(serve.getByText(/how those servers reach this machine/i)).toBeVisible();

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
  await openServers(page);
  await expect(panel.getByLabel('Template serve host')).toHaveValue('192.168.21.93');
  await expect(panel.getByLabel('Template serve port')).toHaveValue('7911');
});
