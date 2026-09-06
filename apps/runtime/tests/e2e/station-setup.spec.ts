import { test, expect } from './fixtures/runtime.js';

/**
 * `STATION-SETUP-02` — **one home for the station's settings, and the channel raster's
 * first UI.** Maps the `#### Scenario`s of `openspec/changes/station-setup` to Playwright
 * steps, driven against the offline MockRuntime (which mirrors every bridge guard the
 * scenarios turn on: the servers' on-air block and the raster's).
 */

const SECTIONS = [
  'Servers',
  'Outputs',
  'Channel raster',
  'Live sources',
  'Text file delimiters',
  'Candidate layers',
  'Station layers',
];

test('one dialog: SERVERS and SOURCES open the same Station setup at different sections, every section rendered', async ({
  app,
}) => {
  const page = app.page;
  const dialog = page.getByRole('dialog', { name: 'Station setup' });

  await page.getByRole('button', { name: 'Open Station setup at Servers' }).click();
  await expect(dialog).toBeVisible();
  // Every section, rendered — never a tab hiding the one a refusal came from. `exact`,
  // because a role name matches as a SUBSTRING by default and `Outputs` would also find the
  // nested `Program outputs` region (the first CI run counted two).
  for (const title of SECTIONS) {
    await expect(dialog.getByRole('region', { name: title, exact: true })).toHaveCount(1);
  }
  await expect(dialog.locator('[data-station-section-requested]')).toHaveAttribute(
    'data-station-section',
    'servers',
  );
  // The footer commits Servers and says so; the other sections carry their own contract.
  await expect(dialog.getByRole('button', { name: 'Apply server settings' })).toHaveText(
    'APPLY SERVERS',
  );
  await expect(dialog.getByRole('region', { name: 'Live sources', exact: true })).toContainText(
    'Saves as you go',
  );
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();

  // ⭐ SOURCES keeps its status-bar button, and it lands ON the Sources section of the
  // SAME dialog — focused and in view — not on a second surface.
  await page.getByRole('button', { name: 'Open Station setup at Live sources' }).click();
  await expect(dialog).toBeVisible();
  const requested = dialog.locator('[data-station-section-requested]');
  await expect(requested).toHaveAttribute('data-station-section', 'sources');
  await expect(requested).toBeInViewport();
  await expect(requested).toBeFocused();
  await expect(page.getByRole('dialog')).toHaveCount(1);
});

test('Configure on the Layers panel deep-links to Candidate layers, whose Apply lives in the section', async ({
  app,
}) => {
  const page = app.page;
  const dialog = page.getByRole('dialog', { name: 'Station setup' });
  await page.getByRole('button', { name: 'Configure', exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-station-section-requested]')).toHaveAttribute(
    'data-station-section',
    'candidate-layers',
  );
  const candidate = dialog.getByRole('region', { name: 'Candidate layers', exact: true });
  await expect(candidate.getByLabel('Show layer 70')).toBeChecked();
  await expect(candidate.getByRole('button', { name: 'Apply candidate layers' })).toBeVisible();
  // …and the reserved/live layers are read-only beside it, declared at bridge start.
  const station = dialog.getByRole('region', { name: 'Station layers', exact: true });
  await expect(station).toContainText('--reserved-layers');
  await expect(station.locator('input, button')).toHaveCount(0);
});

/**
 * 🔴 The channel raster (`R-030`) — the first time this control has been in the UI.
 * `channelSettings.set` existed on the bridge with zero renderer call sites; the mock
 * mirrors the bridge's guards exactly, so what is proved here is the round-trip AND the
 * on-air refusal reaching the pinned region, named for its section.
 */
test('the channel raster: set from its own button, durable, mismatch said from the canonical verdict, refused on air', async ({
  app,
}) => {
  const page = app.page;
  const dialog = page.getByRole('dialog', { name: 'Station setup' });
  const raster = dialog.getByRole('region', { name: 'Channel raster', exact: true });

  /*
    The e2e seed puts rows ON AIR, and the mock mirrors the bridge's raster guard exactly — so
    the first CI run met the on-air REFUSAL where it expected the set to land. That refusal is
    asserted at the end, deliberately; here the rows come off air first, the way
    `server-settings.spec.ts` does it: Clear-All takes the graphics off air and KEEPS the rows.
  */
  await page.getByRole('button', { name: /^Clear all rows/ }).click();
  const clearDialog = page.getByRole('dialog').filter({ hasText: /Clear/ });
  await clearDialog.getByRole('button', { name: /^Clear/ }).click();
  await expect(clearDialog).toBeHidden();

  await page.getByRole('button', { name: 'Open Station setup at Servers' }).click();
  await expect(dialog.getByText(/Apply is blocked for Servers/)).toHaveCount(0);
  await expect(raster.getByLabel('Channel 1 raster width')).toHaveValue('1920');
  await expect(raster.getByLabel('Channel 1 raster height')).toHaveValue('1080');
  await expect(raster).toContainText('agrees');

  await raster.getByLabel('Channel 1 raster width').fill('1280');
  await raster.getByLabel('Channel 1 raster height').fill('720');
  await raster.getByRole('button', { name: 'Set channel 1 raster' }).click();
  await expect(dialog.getByText(/Channel raster: Channel 1 raster set to 1280×720/)).toBeVisible();
  // The mock's channel really is 1080-line, so a configured 720p is a MISMATCH — said here,
  // from `rasterVerdict`, and by the banner behind the dialog.
  await expect(raster).toContainText('MISMATCH');
  await expect(page.getByRole('alert', { name: 'Channel raster mismatch' })).toBeVisible();

  // Durable: the value lives on the bridge (here, the mock's store), not in the dialog.
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Open Station setup at Servers' }).click();
  await expect(raster.getByLabel('Channel 1 raster width')).toHaveValue('1280');

  // Back to the real raster; the verdict agrees again and the banner clears.
  await raster.getByLabel('Channel 1 raster width').fill('1920');
  await raster.getByLabel('Channel 1 raster height').fill('1080');
  await raster.getByRole('button', { name: 'Set channel 1 raster' }).click();
  await expect(raster).toContainText('agrees');
  await expect(page.getByRole('alert', { name: 'Channel raster mismatch' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  // ON AIR: the Servers guard is SCOPED, and the raster's refusal is the BRIDGE's own.
  await app.layerRow(70).getByRole('button', { name: 'PLAY' }).click();
  await page.getByRole('button', { name: 'Open Station setup at Servers' }).click();
  await expect(dialog.getByText(/Apply is blocked for Servers/)).toBeVisible();
  await expect(dialog.getByText(/Every other section stays editable/)).toBeVisible();
  await raster.getByRole('button', { name: 'Set channel 1 raster' }).click();
  await expect(
    dialog.getByText(/Channel raster: The raster cannot change while anything is on air/),
  ).toBeVisible();
  // The refusal is in the PINNED region — visible without hunting for the section.
  await expect(dialog.locator('[data-modal-message]')).toBeInViewport();
});
