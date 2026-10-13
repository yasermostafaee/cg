import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  FAKE_ADMIN,
  FAKE_PLAYOUT_PASSWORD,
  startFakePlayout,
  type FakePlayout,
} from '../../../../tools/caspar-bridge/tests/support/fake-playout.js';
import { APP, STATION_KEY, Stage, asCgControl, relay, shotOf } from './fixtures/cg-control.js';

/**
 * 🔴 `SERVERS-SIMPLIFY-01` Part A — **STATION SETUP'S CONNECTION CARD, IN A REAL ENGINE, INSIDE CG CONTROL.**
 *
 * The owner's pictures 3 and 5 (CG Control `0.11.4`, 2026-10-10): the Playout card read
 * `http://192.168.21.32:8080`, its CG Bridge field read `Found automatically` and took his typing, and a tab
 * switch dropped what he typed without a word. Here, on CG Control's own page (`fixtures/cg-control.ts`), with
 * a real CG Bridge and a fake Playout, signed in as a station admin:
 *
 *   - T1 — the two addresses are FACTS (`host : port`), CG Bridge's with where it is (`On the Playout machine`);
 *     CG Bridge's own Change opens its `Host` and `Port`, the defaults their placeholders; a change shows
 *     `Not connected yet` and `Connect`;
 *   - `B-324` — that edit survives a tab switch and marks the rail, and closing discards it;
 *   - `B-325` — re-pointed at ANOTHER CG Bridge while Station setup is open, the fields read that CG Bridge and
 *     none of the first's: the suspected path of the owner's `.93` into `.32`'s server A.
 *
 * Nothing reaches a real station: both CG Bridges are on this loopback, reached at documentation addresses;
 * their CasparCG is port 1. `CG_SHOTS_DIR` set: the report's pictures are written there.
 */

/** Where the station's CG Bridge is, as the console sees it (the owner's `.32`). */
const GOOD_HOST = '192.0.2.32';
/** Another CG Bridge on another host. */
const OTHER_HOST = '192.0.2.33';

const stage = new Stage();
let playout: FakePlayout | null = null;

test.afterEach(async () => {
  await stage.dispose();
  await playout?.stop();
  playout = null;
});

/** A station admin signs in on the gate (CG Control's native sign-in, answered by the fixture). */
async function signIn(page: Page): Promise<void> {
  const user = page.locator('#cg-signin-user');
  await expect(user).toBeEnabled({ timeout: 30_000 });
  await user.fill(FAKE_ADMIN.username);
  await page.locator('#cg-signin-pass').fill(FAKE_PLAYOUT_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(user).toHaveCount(0, { timeout: 30_000 });
}

async function openConnection(
  page: Page,
): Promise<{ setup: Locator; card: Locator; tab: Locator }> {
  await page.getByRole('button', { name: 'Open Station setup', exact: true }).click();
  const setup = page.getByRole('dialog', { name: 'Station setup' });
  await expect(setup).toBeVisible();
  const tab = setup
    .getByRole('tablist', { name: 'Station setup sections' })
    .getByRole('tab', { name: /^Connection/ });
  await tab.click();
  return { setup, card: setup.getByRole('region', { name: 'Playout' }), tab };
}

async function record(page: Page): Promise<unknown> {
  return JSON.parse(
    (await page.evaluate((key) => localStorage.getItem(key), STATION_KEY)) ?? 'null',
  );
}

test('🔴 T1 + B-324 — facts, Host and Port, Connect once something changed, and an edit that survives a tab switch', async ({
  page,
}) => {
  test.setTimeout(120_000);
  playout = await startFakePlayout();
  const good = await stage.startBridge([
    '--playout-issuer',
    playout.issuer,
    '--playout-jwks-url',
    playout.jwksUrl,
  ]);
  const playoutPort = new URL(playout.baseUrl).port;
  await page.setViewportSize({ width: 1400, height: 900 });
  await asCgControl(page, { playoutAddress: `http://${GOOD_HOST}:8080` }, { signIn: true });
  await relay(page, GOOD_HOST, good);
  await page.goto(`${APP}/`);
  await signIn(page);

  const { setup, card, tab } = await openConnection(page);
  // T1 — the two addresses as FACTS, and where CG Bridge is.
  await expect(card.locator('[data-playout-address]')).toHaveText(`${GOOD_HOST} : ${playoutPort}`, {
    timeout: 30_000,
  });
  await expect(card.locator('[data-bridge-address]')).toHaveText(`${GOOD_HOST} : 5280`);
  await expect(card.locator('[data-bridge-placement]')).toHaveText('On the Playout machine');
  // The picture once the check has said its piece (it runs on open for a station admin).
  await expect(card.locator('[aria-label="Connection check"]')).toHaveAttribute(
    'aria-busy',
    'false',
    {
      timeout: 30_000,
    },
  );
  await shotOf(card, 'SERVERS-SIMPLIFY-01-after-1-connection-card.png');

  // CG Bridge's own Change: its Host and Port, each default its placeholder; the Playout stays a fact.
  await card.locator('[data-change="bridge"]').click();
  const host = card.getByLabel('CG Bridge host', { exact: true });
  const port = card.getByLabel('CG Bridge port', { exact: true });
  await expect(host).toHaveValue('');
  await expect(host).toHaveAttribute('placeholder', GOOD_HOST);
  await expect(port).toHaveAttribute('placeholder', '5280');
  await expect(card.locator('[data-playout-address]')).toHaveText(`${GOOD_HOST} : ${playoutPort}`);
  // Nothing changed yet: nothing to connect, and the rail is quiet.
  await expect(card.getByRole('button', { name: 'Connect' })).toHaveCount(0);
  await expect(tab.locator('[data-tab-badge]')).toHaveCount(0);

  // Measured in a real engine (golden rule 12c): the port on its host's row, after it, inside the card.
  const [hostBox, portBox, cardBox] = await Promise.all([
    host.boundingBox(),
    port.boundingBox(),
    card.boundingBox(),
  ]);
  if (hostBox === null || portBox === null || cardBox === null) {
    throw new Error('the card and its two fields need a box');
  }
  expect(Math.abs(hostBox.y - portBox.y), 'the port sits on its host’s row').toBeLessThan(2);
  expect(portBox.x, 'after it').toBeGreaterThan(hostBox.x + hostBox.width);
  expect(portBox.x + portBox.width, 'inside the card').toBeLessThanOrEqual(
    cardBox.x + cardBox.width,
  );

  // A change: the fact that it is not connected, the one commit, and the rail's mark.
  await host.fill('192.0.2.40');
  await expect(card.locator('[data-not-connected]')).toHaveText('Not connected yet');
  await expect(card.getByRole('button', { name: 'Connect' })).toBeVisible();
  await expect(tab.locator('[data-tab-badge="edited"]')).toHaveCount(1);
  await shotOf(card, 'SERVERS-SIMPLIFY-01-after-2-connection-editing.png');

  // B-324 — away and back: the value, the fact and the mark are all still there.
  await setup.getByRole('tab', { name: /^Channel/ }).click();
  await tab.click();
  await expect(card.getByLabel('CG Bridge host', { exact: true })).toHaveValue('192.0.2.40');
  await expect(card.locator('[data-not-connected]')).toBeVisible();
  await expect(tab.locator('[data-tab-badge="edited"]')).toHaveCount(1);

  // Closing discards it, as it discards every unapplied draft — and nothing was saved.
  await setup.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(setup).toHaveCount(0);
  const again = await openConnection(page);
  await expect(again.card.locator('[data-bridge-address]')).toHaveText(`${GOOD_HOST} : 5280`);
  await expect(again.card.getByLabel('CG Bridge host', { exact: true })).toHaveCount(0);
  await expect(again.tab.locator('[data-tab-badge]')).toHaveCount(0);
  expect(await record(page)).toEqual({ playoutAddress: `http://${GOOD_HOST}:8080` });
});

test('🔴 B-325 — re-pointed at another CG Bridge with Station setup open: the fields read that CG Bridge, none of the first', async ({
  page,
}) => {
  test.setTimeout(120_000);
  playout = await startFakePlayout();
  const flags = ['--playout-issuer', playout.issuer, '--playout-jwks-url', playout.jwksUrl];
  // The first CG Bridge drives a CasparCG on `127.0.0.9`, the second on `127.0.0.1` (both port 1: nothing).
  const first = await stage.startBridge(flags, { casparHost: '127.0.0.9' });
  const second = await stage.startBridge(flags);
  await page.setViewportSize({ width: 1400, height: 900 });
  await asCgControl(page, { playoutAddress: `http://${GOOD_HOST}:8080` }, { signIn: true });
  await relay(page, GOOD_HOST, first);
  await relay(page, OTHER_HOST, second);
  await page.goto(`${APP}/`);
  await signIn(page);

  const { card, tab, setup } = await openConnection(page);
  // T2 — a Playout station: CasparCG A is a fact, read off the CG Bridge the console is on.
  const a = setup
    .getByRole('region', { name: 'CasparCG A' })
    .locator('[data-setup-readonly]')
    .first();
  await expect(a).toHaveText('127.0.0.9', { timeout: 30_000 });
  // A draft typed against the FIRST CG Bridge — the owner's own PC, typed as the graphics host.
  await setup.locator('[data-setup-advanced] > summary').click();
  const graphics = setup.getByLabel('Graphics host', { exact: true });
  await graphics.fill('192.0.2.93');
  await expect(tab.locator('[data-tab-badge="edited"]')).toHaveCount(1);

  // Re-pointed: CG Bridge's Change, the other host, Connect — the check answers there, so it saves the card
  // as it reads: the Playout CG Bridge advertises (on its host, at the fake's port), and the CG Bridge typed.
  await card.locator('[data-change="bridge"]').click();
  await card.getByLabel('CG Bridge host', { exact: true }).fill(OTHER_HOST);
  await card.getByRole('button', { name: 'Connect' }).click();
  const playoutPort = new URL(playout.baseUrl).port;
  await expect
    .poll(() => record(page), { timeout: 30_000 })
    .toEqual({ playoutAddress: `http://${GOOD_HOST}:${playoutPort}`, bridgeAddress: OTHER_HOST });

  // Still open: every field reads the CG Bridge the console is on now, and nothing waits to be applied.
  await expect(a).toHaveText('127.0.0.1', { timeout: 30_000 });
  await expect(tab.locator('[data-tab-badge]')).toHaveCount(0);
  await expect(card.locator('[data-bridge-address]')).toHaveText(`${OTHER_HOST} : 5280`);
  await setup.locator('[data-setup-advanced]').evaluate((d) => {
    (d as HTMLDetailsElement).open = true;
  });
  await expect(setup.getByLabel('Graphics host', { exact: true })).toHaveValue('');
});

test('🔴 T2 + T3 + B-326 — CasparCG A is a fact, Advanced is collapsed, and a graphics host on another machine is the check’s failed line', async ({
  page,
}) => {
  test.setTimeout(120_000);
  playout = await startFakePlayout();
  const good = await stage.startBridge([
    '--playout-issuer',
    playout.issuer,
    '--playout-jwks-url',
    playout.jwksUrl,
  ]);
  await page.setViewportSize({ width: 1400, height: 900 });
  await asCgControl(page, { playoutAddress: `http://${GOOD_HOST}:8080` }, { signIn: true });
  await relay(page, GOOD_HOST, good);
  await page.goto(`${APP}/`);
  await signIn(page);
  const { setup, card } = await openConnection(page);

  // T2 — CasparCG A in a Playout station: where it is, its values as facts, nothing to type.
  const a = setup.getByRole('region', { name: 'CasparCG A' });
  await expect(a.locator('[data-caspar-placement]')).toHaveText('On the Playout machine');
  await expect(a.locator('input')).toHaveCount(0);
  await expect(a.locator('[data-setup-readonly]').first()).toHaveText('127.0.0.1');
  await shotOf(a, 'SERVERS-SIMPLIFY-01-after-3-casparcg-a.png');

  // T3 — the graphics address is behind Advanced, collapsed in a Playout station.
  const advanced = setup.locator('[data-setup-advanced]');
  await expect(
    advanced.getByRole('region', { name: 'Where CasparCG fetches graphics' }),
  ).toBeHidden();
  await advanced.locator('summary').click();
  await expect(
    advanced.getByRole('region', { name: 'Where CasparCG fetches graphics' }),
  ).toBeVisible();
  await expect(setup.getByText(/this machine/i)).toHaveCount(0);
  await shotOf(advanced, 'SERVERS-SIMPLIFY-01-after-4-advanced.png');

  // B-326 — the owner's `.93`: applied as the graphics host, CG Bridge judges it another machine.
  await setup.getByLabel('Graphics host', { exact: true }).fill('192.0.2.93');
  await setup.getByRole('button', { name: 'Apply server settings' }).click();
  const line = card.locator('[data-check="graphics"]');
  await expect(line).toHaveAttribute('data-status', 'fail', { timeout: 30_000 });
  await expect(line).toContainText(
    "CasparCG would fetch graphics from 192.0.2.93, another machine than CG Bridge's.",
  );
  await shotOf(card, 'SERVERS-SIMPLIFY-01-after-5-graphics-line.png');

  // Detect automatically clears the field; applied, CG Bridge derives its own address and the line goes.
  await line.getByRole('button', { name: 'Detect automatically' }).click();
  await expect(setup.getByLabel('Graphics host', { exact: true })).toHaveValue('');
  await setup.getByRole('button', { name: 'Apply server settings' }).click();
  await expect(line).toHaveCount(0, { timeout: 30_000 });
});
