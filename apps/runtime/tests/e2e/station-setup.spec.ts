import type { Locator } from '@playwright/test';
import { test, expect } from './fixtures/runtime.js';

/**
 * `STATION-SETUP-02` + `STATION-CHROME-01` §2/§3/§4 — **one home for the station's settings,
 * in TABS.** Driven against the offline MockRuntime, which mirrors every bridge guard the
 * scenarios turn on (the servers' on-air block, the bank's per-row refusals).
 *
 * ── WHY THIS FILE CHANGED SHAPE ─────────────────────────────────────────────
 *
 * It used to assert that EVERY section was rendered at once, with the comment "never a tab
 * hiding the one a refusal came from". That protection is not dropped — it is delivered
 * differently, and better, and the assertions moved with it:
 *
 *   · a refusal is rendered by the section that raised it, in that section's footer, and is
 *     NOT in front of another section's work;
 *   · a blocked section marks itself IN THE RAIL, from every tab, so nothing is hidden;
 *   · one press lands on the sentence that says why.
 *
 * The scroll only ever showed you the refusal you were standing beside. The rail shows every
 * blocked section at once.
 */

/**
 * Dismiss the dialog.
 *
 * ⭐ `B-240` — this was `footerClose`, and it had to be scoped to `.cg-modal-footer` because
 * TWO controls answered to "Close": a per-section footer button and the primitive's ✕. That
 * ambiguity was the defect, not an inconvenience — dismissal is a property of the DIALOG, and
 * putting it in a section's footer made leaving look like a property of the tab you happened
 * to be standing on. There is one now.
 */
const dismiss = (dialog: Locator): Locator => dialog.getByRole('button', { name: 'Close' });

/** The rail, in the owner's order. */
const TABS = ['Channel', 'Servers', 'Live sources', 'Text file delimiters', 'Layers'];

test('the rail: Settings opens on Channel, and every section is one press away', async ({
  app,
}) => {
  const page = app.page;
  const dialog = page.getByRole('dialog', { name: 'Station setup' });

  await page.getByRole('button', { name: 'Open Station setup', exact: true }).click();
  await expect(dialog).toBeVisible();

  const rail = dialog.getByRole('tablist', { name: 'Station setup sections' });
  await expect(rail).toHaveAttribute('aria-orientation', 'vertical');
  for (const [i, name] of TABS.entries()) {
    await expect(rail.getByRole('tab').nth(i)).toContainText(name);
  }
  // ⭐ §3 — STATION LAYERS IS GONE from settings: it belongs in front of the operator.
  await expect(rail.getByRole('tab', { name: /Station layers/ })).toHaveCount(0);

  // Only ONE section body is mounted at a time — a tab is a switch, not a scroll — and a
  // bare Settings press lands on CHANNEL, the tab that asks nothing of the operator.
  await expect(dialog.locator('[data-station-section]')).toHaveCount(1);
  await expect(dialog.locator('[data-station-section]')).toHaveAttribute(
    'data-station-section',
    'channel',
  );

  // SERVERS is the one tab with an APPLY, and it is named for its scope — in SENTENCE case
  // since `STATION-CHROME-02` §3, like `Apply layers` one tab along and like every dialog
  // title. The shout was a leftover from the dialog this grew out of.
  await rail.getByRole('tab', { name: /^Servers/ }).click();
  await expect(dialog.getByRole('button', { name: 'Apply server settings' })).toHaveText(
    'Apply servers',
  );

  // Every other tab: a quiet Close and no commit action at all.
  await rail.getByRole('tab', { name: 'Live sources' }).click();
  await expect(dialog.locator('[data-station-section]')).toHaveAttribute(
    'data-station-section',
    'sources',
  );
  await expect(dialog.getByRole('button', { name: 'Apply server settings' })).toHaveCount(0);
  /*
    🔴 `STATION-CHROME-02` §5 — the Live-sources footer used to read "Saved as you go — there
    is nothing waiting to be applied" with an `Apply band` six inches above it. One of the two
    was lying, and it was the footer.
  */
  await expect(dialog.locator('[data-section-footer="sources"]')).toContainText(
    'The catalogue saves as you go. The layer band is applied by the button in its own section.',
  );
  await expect(dialog.getByRole('button', { name: 'Apply band' })).toBeVisible();

  await dismiss(dialog).click();
  await expect(dialog).toBeHidden();
});

test('🔴 the refusal stays with its own section, and the rail says which one is blocked', async ({
  app,
}) => {
  const page = app.page;
  const dialog = page.getByRole('dialog', { name: 'Station setup' });

  // The e2e seed puts rows ON AIR, which is exactly the state the Servers guard refuses.
  await page.getByRole('button', { name: 'Open Station setup', exact: true }).click();
  const rail = dialog.getByRole('tablist', { name: 'Station setup sections' });
  /*
    ⭐ AND NOTE WHAT LANDING ON CHANNEL ALREADY PROVES: the dialog opens with rows on air and
    says NOTHING about the Servers block, because the operator is not in Servers. Under the
    scroll that sentence was the first thing on screen whatever he had come to do.
  */
  await expect(dialog.getByText(/Apply is blocked for Servers/)).toHaveCount(0);

  await rail.getByRole('tab', { name: /^Servers/ }).click();
  await expect(dialog.getByText(/Apply is blocked for Servers/)).toBeVisible();
  await expect(dialog.getByText(/Every other section stays editable/)).toBeVisible();
  await expect(dialog.locator('[data-modal-message]')).toBeInViewport();

  // ⭐ THE DEFECT THE SCROLL HAD: on DELIMITERS, that sentence is not in front of him.
  await rail.getByRole('tab', { name: 'Text file delimiters' }).click();
  await expect(dialog.getByText(/Apply is blocked for Servers/)).toHaveCount(0);

  // …and nothing is HIDDEN: the rail still marks Servers, from here, in words as well as
  // colour — one press lands back on the sentence.
  const serversTab = rail.getByRole('tab', { name: /^Servers/ });
  await expect(serversTab.locator('[data-tab-badge="warn"]')).toHaveCount(1);
  await expect(serversTab).toContainText('Servers is blocked');
  await serversTab.click();
  await expect(dialog.getByText(/Apply is blocked for Servers/)).toBeVisible();

  // `B-240` — the way out is the dialog's ✕, not a per-section footer button.
  await dismiss(dialog).click();
});

/**
 * 🔴 `STATION-CHROME-02` §1 — **ONE DOOR, AND THE DEEP LINKS THAT SURVIVE IT.**
 *
 * There were three ways into this dialog: the status bar's SETTINGS, the status bar's
 * SOURCES, and the Layers panel's `Configure`. The owner's decision is one. This spec is the
 * assertion of both halves — the two buttons are GONE from the surfaces that carried them,
 * and the MECHANISM they used is untouched, so the two entry points that sit BESIDE the thing
 * they configure still land on their tab.
 *
 * ⚠ `AUDIT-CLOSE-01` B1 — THE DOOR MOVED TO THE APP HEADER, and the count is what this spec is
 * about, not the bar. The assertions below were already page-wide (`page.getByRole`), so they
 * held through the move without an edit; the TITLE and the comments said "status bar" and were
 * the only thing that had gone false. Corrected rather than left, because a spec whose name
 * describes a surface it does not look at is the next reader's wrong turn.
 */
test('§1 — one settings door in the whole console, and no second one in the Layers bar', async ({
  app,
}) => {
  const page = app.page;

  // Exactly one control opens this dialog, and it is in the app header.
  await expect(page.getByRole('button', { name: 'Open Station setup', exact: true })).toHaveCount(
    1,
  );
  await expect(
    page.locator('[data-app-header]').getByRole('button', { name: 'Open Station setup' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Open Station setup at Live sources' }),
    'the SOURCES button is gone',
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'SOURCES', exact: true })).toHaveCount(0);

  // …and the Layers panel's bar no longer offers `Configure`.
  await expect(
    page.getByRole('button', { name: 'Configure', exact: true }),
    'the Layers bar is not a third door',
  ).toHaveCount(0);

  // POSITIVE CONTROL: the neighbours that are NOT settings doors are untouched, so this is not
  // passing because a bar failed to render — one in the header, one still on the status bar.
  await expect(page.getByRole('button', { name: 'Open audit log' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Manual failover' })).toBeVisible();
});

test('§1 — the surviving deep links still land on their own tab', async ({ app }) => {
  const page = app.page;
  const dialog = page.getByRole('dialog', { name: 'Station setup' });
  const shown = dialog.locator('[data-station-section]');

  // The rail itself — the one door, then the section.
  await app.openStationSetupAt('Live sources');
  await expect(shown).toHaveAttribute('data-station-section', 'sources');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await dismiss(dialog).click();

  await app.openStationSetupAt('Layers');
  await expect(shown).toHaveAttribute('data-station-section', 'candidate-layers');
  const layers = dialog.getByRole('region', { name: 'Layers', exact: true });
  await expect(layers.getByLabel('Show layer 70')).toBeChecked();
  // ⭐ §2 — the bank's commit is in ITS OWN FOOTER now, not in the body.
  await expect(dialog.getByRole('button', { name: 'Apply layers' })).toBeVisible();
  await dismiss(dialog).click();

  await app.openStationSetupAt('Text file delimiters');
  await expect(shown).toHaveAttribute('data-station-section', 'delimiters');
  await dismiss(dialog).click();

  // A bare Settings press lands on CHANNEL — the tab that asks nothing of the operator.
  await page.getByRole('button', { name: 'Open Station setup', exact: true }).click();
  await expect(shown).toHaveAttribute('data-station-section', 'channel');
  await dismiss(dialog).click();
});

/**
 * 🔴 `STATION-CHROME-01` §4 — **the channel raster is REPORTED, not typed.**
 *
 * `STATION-SETUP-02` shipped the first editable UI this control has ever had and the owner's
 * response was «I don't know what this is for». The facts agreed with him: the configured
 * raster reaches AIR (the bridge appends it to the served URL as `?cw=&ch=`), the served page
 * can already derive it from CEF's own viewport when the query is absent, and the console can
 * already derive it from `INFO <channel>`. No case was found where a typed raster is more
 * correct than what the channel reports about itself.
 */
test('the Channel tab REPORTS the raster and the outputs, and offers no way to type either', async ({
  app,
}) => {
  const page = app.page;
  const dialog = page.getByRole('dialog', { name: 'Station setup' });

  await page.getByRole('button', { name: 'Open Station setup', exact: true }).click();
  await dialog
    .getByRole('tablist', { name: 'Station setup sections' })
    .getByRole('tab', { name: 'Channel' })
    .click();

  // `RUNTIME-REDESIGN-01` Phase 7 — the card is the reference's VIDEO FORMAT card; the app's
  // own facts (`Declared by`, `Check`) stay on it.
  const raster = dialog.getByRole('region', { name: 'Video format', exact: true });
  await expect(raster).toContainText('1920 × 1080');
  await expect(raster).toContainText('1080i5000');
  await expect(raster).toContainText('casparcg.config');
  await expect(raster).toContainText('agrees with the server');

  // NOT TYPEABLE — the whole point. No field, and no Set button.
  await expect(dialog.getByLabel('Channel 1 raster width')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: /Set channel .* raster/ })).toHaveCount(0);

  // Outputs moved here, beside the raster: one tab for "what the channel is and what it is
  // coming out of". Still read-only.
  await expect(dialog.getByRole('region', { name: 'Program outputs', exact: true })).toHaveCount(1);
  await expect(dialog.locator('[data-section-footer="channel"]')).toContainText('Nothing to apply');
  await expect(dialog.getByRole('button', { name: 'Apply server settings' })).toHaveCount(0);

  await dismiss(dialog).click();
});
