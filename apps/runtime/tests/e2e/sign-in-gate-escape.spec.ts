import { expect, test } from '@playwright/test';
import {
  startFakePlayout,
  type FakePlayout,
} from '../../../../tools/caspar-bridge/tests/support/fake-playout.js';
import {
  APP,
  STATION_KEY,
  Stage,
  asCgControl,
  deadPort,
  relay,
  shot,
} from './fixtures/cg-control.js';

/**
 * 🔴 `B-320` + `B-321` (`SIGNIN-ESCAPE-01`) — **THE OWNER'S STUCK CONSOLE, IN A REAL ENGINE.**
 *
 * CG Control `0.11.4` on the owner's PC (2026-10-10): its station record named his own PC, where a CG
 * Bridge had just been installed with no Playout behind it (`http://127.0.0.1:8080`, nothing there).
 * CG Bridge answered and advertised `auth: playout`, so the console opened on the sign-in gate — and the
 * gate had no way out: no Change, no Set up again, no ✕, and the fields locked by the check's one line,
 * `127.0.0.1 answers, but nothing listens on port 8080.`, under a card that said `192.168.21.93`.
 * Reinstalling changed nothing (the record lives in the WebView2 profile).
 *
 * This is that state, exactly: the built console served as CG Control's own page (`http://tauri.localhost`,
 * the shell's IPC global present), a station record naming a CG Bridge on ANOTHER host, and a real CG
 * Bridge (the CLI, `auth: playout`) whose Playout is its own loopback with nothing listening. The page
 * reaches it at a documentation address (`192.0.2.93`, RFC 5737) relayed here to the bridge on this
 * machine — never dialled — so CG Bridge's host is not loopback to the console, as `.93` was not.
 *
 *   - `B-321` — the gate's one line names the host on the card, never CG Bridge's loopback;
 *   - `B-320` — the gate offers `Set up again` (CG Control only): this console forgets its station and
 *     starts again on the Set up page, and a good address typed there connects.
 *
 * Nothing reaches a real station: the stuck bridge's Playout and CasparCG are on `127.0.0.2` (refused),
 * the good one's Playout is the fake on this loopback, and both bridges dial CasparCG on port 1.
 * `CG_SHOTS_DIR` set: the report's before/after pictures are written there; unset, nothing is.
 *
 * The staging — CG Control's own page, scratch-folder bridges, the relay — is `fixtures/cg-control.ts`, shared
 * with `connection-card.spec.ts` since `SERVERS-SIMPLIFY-01`.
 */

/** Where the stuck station's CG Bridge is, as the console sees it (the owner's `.93`). */
const STUCK_HOST = '192.0.2.93';
/** Where the good station's CG Bridge is (the owner's `.32`). */
const GOOD_HOST = '192.0.2.32';

const stage = new Stage();
let playout: FakePlayout | null = null;

test.afterEach(async () => {
  await stage.dispose();
  await playout?.stop();
  playout = null;
});

const startBridge = (playoutFlags: readonly string[]): Promise<string> =>
  stage.startBridge(playoutFlags);

test('🔴 B-320 + B-321 — stuck on a CG Bridge whose Playout does not answer: the gate names the card’s host, offers Set up again, and a good address connects', async ({
  page,
}) => {
  // The stuck station: CG Bridge's own Playout is its loopback, and nothing listens there.
  const silent = await deadPort('127.0.0.2');
  const stuck = await startBridge(['--playout-address', `http://127.0.0.2:${String(silent)}`]);
  // The good station: a Playout that answers, behind its own CG Bridge.
  playout = await startFakePlayout();
  const good = await startBridge([
    '--playout-issuer',
    playout.issuer,
    '--playout-jwks-url',
    playout.jwksUrl,
  ]);
  const goodPort = new URL(playout.baseUrl).port;

  await page.setViewportSize({ width: 1400, height: 860 });
  await asCgControl(page, { playoutAddress: `http://${STUCK_HOST}:8080` });
  // Registered after the catch-all, so they win for their hosts.
  await relay(page, STUCK_HOST, stuck);
  await relay(page, GOOD_HOST, good);
  await page.goto(`${APP}/`);

  // ── the owner's picture 4: the gate, the card naming the station's host, the fields locked ──
  const gate = page.getByRole('dialog', { name: 'Playout sign-in' });
  await expect(gate).toBeVisible({ timeout: 30_000 });
  // `SERVERS-SIMPLIFY-01` (T1) — the address reads as a fact, `host : port`.
  await expect(gate.locator('[data-playout-address]')).toHaveText(
    `${STUCK_HOST} : ${String(silent)}`,
  );
  const line = gate.locator('[data-check="api"]');
  await expect(line).toHaveAttribute('data-status', 'fail', { timeout: 30_000 });
  await expect(page.locator('#cg-signin-user')).toBeDisabled();
  await shot(page, 'signin-escape-1-gate.png');

  // B-321 — the one line names the host on the card, never CG Bridge's loopback.
  await expect(line).toHaveText(
    `${STUCK_HOST} answers, but nothing listens on port ${String(silent)}.`,
  );

  // B-320 — the way out, inside CG Control, without a word of explanation.
  const again = gate.getByRole('button', { name: 'Set up again' });
  await expect(again).toBeVisible();
  // Measured in a real engine (golden rule 12c): under the way through, and inside the card.
  const [cardBox, submitBox, againBox] = await Promise.all([
    gate.boundingBox(),
    gate.getByRole('button', { name: 'Sign in', exact: true }).boundingBox(),
    again.boundingBox(),
  ]);
  if (cardBox === null || submitBox === null || againBox === null) {
    throw new Error('the card and its two controls need a box');
  }
  expect(againBox.y, 'Set up again sits under Sign in').toBeGreaterThanOrEqual(
    submitBox.y + submitBox.height,
  );
  expect(againBox.y + againBox.height, 'Set up again stays inside the card').toBeLessThanOrEqual(
    cardBox.y + cardBox.height,
  );
  // A2 — the gate's focus trap is unchanged: Tab past its last control stays on the card.
  await again.focus();
  await page.keyboard.press('Tab');
  expect(await gate.evaluate((card) => card.contains(document.activeElement))).toBe(true);
  await again.click();

  const setUp = page.locator('[data-playout-address-gate]');
  await expect(setUp.getByRole('dialog', { name: 'Set up CG Control' })).toBeVisible({
    timeout: 30_000,
  });
  expect(await page.evaluate((key) => localStorage.getItem(key), STATION_KEY)).toBeNull();
  await shot(page, 'signin-escape-2-set-up.png');

  // …and a good address connects: the Playout's IP alone, as an operator types it.
  await setUp.getByLabel('Playout host', { exact: true }).fill(GOOD_HOST);
  await setUp.getByRole('button', { name: 'Connect' }).click();
  await expect(setUp).toHaveCount(0, { timeout: 30_000 });
  expect(
    JSON.parse((await page.evaluate((key) => localStorage.getItem(key), STATION_KEY)) ?? 'null'),
  ).toEqual({ playoutAddress: `http://${GOOD_HOST}:8080` });

  // Connected to the good CG Bridge: its gate, its Playout on the card, and a sign-in that can work.
  const next = page.getByRole('dialog', { name: 'Playout sign-in' });
  await expect(next.locator('[data-playout-address]')).toHaveText(`${GOOD_HOST} : ${goodPort}`, {
    timeout: 30_000,
  });
  await expect(next.locator('[data-check="api"]')).toHaveAttribute('data-status', 'pass', {
    timeout: 30_000,
  });
  await expect(page.locator('#cg-signin-user')).toBeEnabled();
  await shot(page, 'signin-escape-3-connected.png');
});
