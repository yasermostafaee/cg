import * as dgram from 'node:dgram';
import { createBridge, type BridgeHandle } from '@cg/caspar-bridge';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type { ConnectionConfig, FixedLayerBank } from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/runtime.js';

/**
 * B-107 / B-109 / B-108 — **retention must model the row's STATE**, end to end
 * through the real browser, a real bridge process, and a real CasparCG.
 *
 * ── WHY THESE SPECS DO NOT USE THE `app` FIXTURE ────────────────────────────
 *
 * `app` arms `CG_E2E`, which selects `MockRuntime` — an in-browser simulation with
 * NO bridge link at all (`link.status()` is the constant `offline-mock`). There is
 * therefore no retention, no `restore()`, and no way to kill a bridge. Everything
 * this change fixes happens across a bridge DEATH, so these specs boot the real
 * `WebSocketRuntime` against a real in-process `@cg/caspar-bridge` (the shape
 * `bridge-indicator.spec.ts` established) with a real `@cg/amcp-mock` CasparCG
 * behind it, and kill the bridge for real.
 *
 * That also means the browser's retention is its REAL OPFS-backed store rather than
 * an in-memory stand-in — which matters, because the defect is what that store
 * remembers.
 *
 * ── WHAT IS ASSERTED WHERE ──────────────────────────────────────────────────
 *
 * The AMCP-byte proof that a cleared graphic is never re-ADDed lives in the bridge's
 * `cleared-row-not-resurrected.integration.test.ts`, against the mock's wire trace.
 * These specs assert the OPERATOR's side of the same events: what the row says, what
 * the layer carries, and that nothing disappears in silence.
 */

const BANK: FixedLayerBank = {
  channel: 1,
  low: { start: 1, count: 9 },
  start: 70,
  count: 4,
  aliases: {},
};

/**
 * How long a post-restart assertion waits.
 *
 * A bridge restart is not one event: the socket reconnects (up to the runtime's
 * reconnect delay), then `#resync` re-delivers templates → stack → re-pull, and the
 * per-slot fixed-layer state — which is what puts the template NAME back on a row —
 * is republished on its own cadence, after the stack. Measured here: the STACK is
 * back within a second of the link, the ROW's binding a few seconds behind it.
 *
 * So the specs below poll the STACK first (the fact the restore is responsible for)
 * and give the row's own re-label this wider window. That is a bound on a genuinely
 * multi-step settle, not a timeout papering over a race — nothing here retries a
 * command or hides a failure; the assertion either becomes true or the spec fails.
 */
const RESTART_SETTLE_MS = 15_000;

const TEMPLATE = { templateId: 'lower-third', templateType: 'lower-third', fields: [] };
const HTML = '<!doctype html><html><head><meta charset="utf-8"></head><body>سلام</body></html>';

function freeUdpPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');
    sock.once('error', reject);
    sock.bind(0, '127.0.0.1', () => {
      const port = sock.address().port;
      sock.close(() => resolve(port));
    });
  });
}

function connection(amcpPort: number, oscPort: number): ConnectionConfig {
  return {
    servers: { A: { host: '127.0.0.1', amcpPort, oscPort } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: false,
  };
}

let bridge: BridgeHandle | null = null;
let mock: MockHandle | null = null;
/**
 * The OSC port this test's CasparCG emits to, kept so a RESTARTED bridge can bind
 * the SAME one.
 *
 * 🔴 Not a detail. A restarted bridge that listens on a different port never hears
 * OSC, so its occupancy tap is BLIND — and a blind tap makes the restore REFUSE to
 * decide (B-093): it sends nothing and publishes `unverified`. Every "nothing was
 * re-ADDed" assertion would then pass for the wrong reason, proving only that the
 * bridge abstained. Reusing the port is also what actually happens when a bridge
 * process restarts against a running CasparCG, which is the scenario under test.
 */
let oscPort = 0;

test.afterEach(async () => {
  await bridge?.close();
  bridge = null;
  await mock?.stop();
  mock = null;
});

/*
 * ⚠ SERIAL, and this is a LOAD BOUND rather than an ordering requirement.
 *
 * Each test here boots a real bridge PROCESS and a real mock CasparCG (an AMCP
 * server plus a 40 Hz OSC emitter). Run five-up under `fullyParallel`, that is five
 * of each competing with the rest of the suite — and it reproduced exactly the
 * contention class `B-098`/`B-073` document: timing-sensitive specs elsewhere
 * (the Designer's clock ticking, the preview background) failing under co-scheduled
 * load and passing alone.
 *
 * The repo's rule for that class is explicit: the answer is the BOUND, not a longer
 * timeout. These five are independent (no shared state, each gets its own ports), so
 * serializing costs wall-clock and nothing else.
 */
test.describe.configure({ mode: 'serial' });

test.describe('retention carries the row state (B-107 / B-109 / B-108)', () => {
  /**
   * Boot the page against a live bridge + CasparCG, with a declared bank so the
   * Layers list has rows, and the template already registered.
   *
   * `__CG_BRIDGE_URL__` is armed via `addInitScript` — BEFORE app JS — because
   * `createRuntimeBridge` reads it once at boot and the backend is fixed for the
   * session. `CG_E2E` is deliberately NOT set (see the header).
   */
  async function boot(page: Page): Promise<number> {
    oscPort = await freeUdpPort();
    /*
     * 10 Hz, not the 40 the bridge's own integration tests use — a LOAD BOUND, for the
     * same reason this file is serial. The tap only has to be WARM (it must have heard
     * something, so silence counts as evidence — B-093); it does not have to be fast.
     * Four times the OSC datagrams, sustained across a Playwright run co-scheduled with
     * the Designer suite, buys nothing here and is exactly the kind of background load
     * `B-098` names.
     */
    mock ??= await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 10 });
    bridge = await createBridge({
      port: 0,
      connection: connection(mock.amcpPort, oscPort),
      fixedLayers: BANK,
    });
    const url = bridge.url;
    await page.addInitScript(
      ([u]) => {
        (window as unknown as { __CG_BRIDGE_URL__: string }).__CG_BRIDGE_URL__ = u as string;
      },
      [url],
    );
    await page.goto('/');
    await expect(page.getByRole('region', { name: 'Layers' })).toBeVisible();
    await expect(page.getByRole('status', { name: 'Bridge link' })).not.toContainText(
      'DISCONNECTED',
    );
    return bridge.port;
  }

  /** Register the template and bind it to a row — the operator's import + LOAD. */
  async function bindRow(page: Page, layer: number, itemId: string): Promise<void> {
    await page.evaluate(
      async ([tpl, html, l, id]) => {
        const w = window as unknown as {
          cg: {
            templates: { import: (r: unknown) => Promise<unknown> };
            fixedLayers: { load: (r: unknown) => Promise<unknown> };
          };
        };
        await w.cg.templates.import({ template: tpl, html });
        await w.cg.fixedLayers.load({
          channel: 1,
          layer: l,
          itemId: id,
          templateId: 'lower-third',
          fields: { headline: 'سلام' },
        });
      },
      [TEMPLATE, HTML, layer, itemId] as const,
    );
    /*
     * 🔴 WAIT FOR THE BROWSER TO KNOW, not just for the bridge to have accepted.
     *
     * `fixedLayers.load` resolving means the BRIDGE bound the row. The browser's
     * retention is mirrored from the stack PUSH that follows, which is a separate
     * frame — and the row's own label comes from the per-slot fixed-layer push, so
     * waiting on the row is NOT waiting for this. Killing the bridge in between
     * leaves the browser with nothing retained, and every restart assertion below
     * then fails for a reason that has nothing to do with what it is testing.
     *
     * The wait is also the honest scenario: "the operator has this row" means their
     * browser has it, which is exactly the condition a bridge death must survive.
     */
    await expect.poll(async () => (await stack(page)).some((i) => i.itemId === itemId)).toBe(true);
  }

  /** The published stack, read through the same bridge contract the UI reads. */
  function stack(page: Page): Promise<StackItemState[]> {
    return page.evaluate(() => {
      const w = window as unknown as {
        cg: { stack: { snapshot: () => Promise<StackItemState[]> } };
      };
      return w.cg.stack.snapshot();
    });
  }

  /** Kill the bridge PROCESS and wait for the page to notice. */
  async function killBridge(page: Page): Promise<void> {
    await bridge?.close();
    bridge = null;
    await expect(page.getByRole('status', { name: 'Bridge link' })).toContainText('DISCONNECTED');
  }

  const row = (page: Page, layer: number) =>
    page.getByRole('region', { name: 'Layers' }).locator(`[data-layer="${String(layer)}"]`);

  /**
   * ⭐ B-107 — THE OWNER'S OBSERVATION, reproduced and pinned.
   *
   * While the link is up, a load that fails shows a red ERROR row. The instant the
   * bridge PROCESS died, every one of those flipped to READY: `#retainedProjection`
   * mapped each retained item to `played ? 'unverified' : 'loaded'`, and `useStack`
   * opts into `pullWhileDisconnected`, so the flip was immediate and hit every
   * errored row at once. READY invites a PLAY on a row that never got a layer, over
   * a link the SPA can no longer use in either direction.
   */
  test('B-107: an ERRORED row does not become READY when the bridge process dies', async ({
    page,
  }) => {
    await boot(page);
    // A load that FAILS, and stays failed: an unregistered template is refused
    // before any layer is involved, which is B-107's own generality case (the defect
    // is status-blind, not a pool-exhaustion symptom).
    await page.evaluate(() => {
      const w = window as unknown as {
        cg: { stack: { load: (r: unknown) => Promise<unknown> } };
      };
      return w.cg.stack.load({ itemId: 'failed-row', templateId: 'not-registered', fields: {} });
    });
    await expect
      .poll(async () => (await stack(page)).find((i) => i.itemId === 'failed-row')?.status)
      .toBe('error');

    await killBridge(page);

    // THE ASSERTION. It used to read `loaded`, which the row renders as READY.
    await expect
      .poll(async () => (await stack(page)).find((i) => i.itemId === 'failed-row')?.status)
      .toBe('error');
    const failed = (await stack(page)).find((i) => i.itemId === 'failed-row');
    expect(failed?.status).not.toBe('loaded');
    // …and it still says WHY, so the operator is not left with a bare badge.
    expect(failed?.errorCode).toBe('unknown-template');
    // Nothing spins: a settled failure is a resting state.
    expect(failed?.pending).toBe(false);
  });

  /**
   * ⭐ B-109 — the WIRE face, seen from the operator's side.
   *
   * An `out` is not a `remove`: the row stays, reconciled `idle`, with its layer
   * slot still reserved. Retention stored `played: false` for BOTH `idle` and
   * `loaded`, so on restart the restore found the layer silent — the operator's own
   * CLEAR emptied it — and took its "the producer is gone, re-ADD it" branch.
   */
  test('B-109: a deliberately CLEARed graphic stays off air across a bridge restart', async ({
    page,
  }) => {
    const port = await boot(page);
    await bindRow(page, 70, 'item-70');

    // Take it to air, then CLEAR it — the ordinary out-vs-remove workflow.
    await page.evaluate(() => {
      const w = window as unknown as { cg: { stack: { take: (r: unknown) => Promise<unknown> } } };
      return w.cg.stack.take({ itemId: 'item-70' });
    });
    await expect(row(page, 70)).toContainText('ON AIR');
    await page.evaluate(() => {
      const w = window as unknown as { cg: { stack: { out: (r: unknown) => Promise<unknown> } } };
      return w.cg.stack.out({ itemId: 'item-70' });
    });
    await expect(row(page, 70)).not.toContainText('ON AIR');
    // The wire agrees: the layer really is empty. Both facts are needed — a row that
    // merely SAYS it is clear over a live producer is a different bug.
    expect(mock?.layerState({ channel: 1, layer: 70 })?.onAir).not.toBe(true);

    // ── kill the bridge, start a fresh one on the same port ──
    await killBridge(page);
    bridge = await createBridge({
      port,
      connection: connection(mock?.amcpPort ?? 0, oscPort),
      fixedLayers: BANK,
    });
    await expect(page.getByRole('status', { name: 'Bridge link' })).not.toContainText(
      'DISCONNECTED',
    );

    // The ROW comes back — B-092's property, which must not regress…
    await expect
      .poll(async () => (await stack(page)).some((i) => i.itemId === 'item-70'), {
        timeout: RESTART_SETTLE_MS,
      })
      .toBe(true);
    await expect(row(page, 70)).toContainText('lower-third', { timeout: RESTART_SETTLE_MS });
    // …and it comes back OFF AIR. The producer was not re-seated behind the operator.
    await expect(row(page, 70)).not.toContainText('ON AIR');
    await expect
      .poll(async () => (await stack(page)).find((i) => i.itemId === 'item-70')?.status)
      .not.toBe('on-air');
    expect(mock?.layerState({ channel: 1, layer: 70 })?.onAir).not.toBe(true);
  });

  /**
   * The CONTROL. If a restart simply stopped restoring, the spec above would pass
   * and the feature would be broken. A row that was never cleared still comes back.
   */
  test('a LOADED row still comes back after a bridge restart', async ({ page }) => {
    const port = await boot(page);
    await bindRow(page, 71, 'item-71');
    await expect(row(page, 71)).toContainText('lower-third');

    await killBridge(page);
    bridge = await createBridge({
      port,
      connection: connection(mock?.amcpPort ?? 0, oscPort),
      fixedLayers: BANK,
    });

    await expect(page.getByRole('status', { name: 'Bridge link' })).not.toContainText(
      'DISCONNECTED',
    );
    // The STACK first — that is the fact the restore is responsible for …
    await expect
      .poll(async () => (await stack(page)).some((i) => i.itemId === 'item-71'), {
        timeout: RESTART_SETTLE_MS,
      })
      .toBe(true);
    // … and then the ROW, which re-labels from the per-slot publish that follows it.
    await expect(row(page, 71)).toContainText('lower-third', { timeout: RESTART_SETTLE_MS });
  });

  /**
   * ⭐ B-108 — a row that does NOT come back must not vanish in silence.
   *
   * The fresh bridge RESERVES the layer the row lived on (a C-015 playout
   * reservation — the ordinary way a coordinate stops being ours between restarts).
   * `#slotForRestore` refuses to re-home the row onto some other layer, because that
   * would consult a DIFFERENT layer's occupancy — so it is skipped, and the row is
   * genuinely gone. That is exactly when the operator has to be told.
   */
  test('B-108: a row the restore could not re-seat is surfaced, with the reason', async ({
    page,
  }) => {
    const port = await boot(page);
    await bindRow(page, 72, 'item-72');
    await expect(row(page, 72)).toContainText('lower-third');

    await killBridge(page);
    // The same station, reconfigured: layer 72 now belongs to playout.
    bridge = await createBridge({
      port,
      connection: connection(mock?.amcpPort ?? 0, oscPort),
      fixedLayers: { ...BANK, count: 2 },
      reservedLayers: { ranges: [{ from: 72, to: 73 }] },
    });

    // Wait for the RECONNECT before looking for the notice. The report is produced by
    // `#resync`, which only runs once the socket is back — asserting on the notice
    // first would race the reconnect delay and fail for a reason that is not the
    // subject of this spec.
    await expect(page.getByRole('status', { name: 'Bridge link' })).not.toContainText(
      'DISCONNECTED',
    );

    const notice = page.locator('[data-restore-skips]');
    await expect(notice).toBeVisible();
    // How many, WHICH, and what to do about it — a count alone is not an answer.
    await expect(notice).toContainText('1 row did not come back');
    await expect(notice).toContainText('item-72');
    await expect(notice).toContainText('no layer was free');
  });

  /**
   * THE NO-FALSE-ALARM CASE, and it is as load-bearing as the alarm itself.
   *
   * A page reload against a HEALTHY bridge skips every retained item — the bridge
   * already holds them — and loses nothing at all. A notice here would cry wolf on
   * the most ordinary event there is, and an alarm nobody reads is worse than none.
   */
  test('B-108: a plain page reload against a live bridge raises NO notice', async ({ page }) => {
    await boot(page);
    await bindRow(page, 73, 'item-73');
    await expect(row(page, 73)).toContainText('lower-third');

    await page.reload();
    await expect(page.getByRole('region', { name: 'Layers' })).toBeVisible();
    await expect(row(page, 73)).toContainText('lower-third');
    await expect(page.locator('[data-restore-skips]')).toHaveCount(0);
  });
});
