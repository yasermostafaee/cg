import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createBridge, type BridgeHandle } from '@cg/caspar-bridge';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type {
  ConnectionConfig,
  FixedLayerBank,
  SourceAssignments,
  SourceCatalog,
  TemplateInfo,
} from '@cg/shared-ipc';
import { expect, test, type Page } from '@playwright/test';
import {
  startFakePlayout,
  FAKE_BOTH_CHANNELS_OPERATOR,
  FAKE_OPERATOR,
  FAKE_PLAYOUT_PASSWORD,
  type FakePlayout,
} from '../../../../tools/caspar-bridge/tests/support/fake-playout.js';

/**
 * 🔴 `CENTRAL-BRIDGE-01` §5 — **TWO CONSOLES, ONE CG BRIDGE.**
 *
 * The prompt's test, verbatim: _"console A takes a multi-box page; console B sees it ON AIR within
 * a second; B clears it; A shows it cleared within a second, with no box left on air (INFO on the
 * mock shows 60–79 empty). Control: another item on the same channel stays ON AIR on both."_
 *
 * Real browsers, a real bridge (in process, auth ON against a fake Playout, as CG Bridge always
 * runs) and a real `@cg/amcp-mock` CasparCG behind it. Each console signs in through the real form,
 * as a different operator of the same channel. The two presses go out through each console's own
 * bridge client (`window.cg`, the call the row's verb makes); what is asserted is what the OTHER
 * console shows, and what the mock's own layers hold.
 *
 * 🔴 **Isolation:** every persisted path is a scratch file, the mock and the Playout are on
 * loopback with ephemeral ports, and nothing here can reach a real server.
 */

const ONE_SECOND = 1000;

const BANK: FixedLayerBank = {
  channel: 1,
  start: 80,
  count: 4,
  low: { start: 50, count: 10 },
};

/** The plate band (60–79) and two inputs — the take-all-or-nothing station's shape, on channel 1. */
const CATALOG: SourceCatalog = {
  sources: [
    {
      id: 'src-1',
      name: 'studio1',
      format: '1080p5000',
      producer: { kind: 'decklink', device: 1 },
    },
    {
      id: 'src-2',
      name: 'studio2',
      format: '1080p5000',
      producer: { kind: 'decklink', device: 2 },
    },
  ],
  layerRange: { start: 60, end: 79 },
};
const ASSIGNMENTS: SourceAssignments = {
  assignments: [
    { templateId: 'two-box', plateId: 'l1', sourceId: 'src-1' },
    { templateId: 'two-box', plateId: 'l2', sourceId: 'src-2' },
  ],
};

/** A multi-box page: two plates, and a look that shows both. */
const TWO_BOX: TemplateInfo = {
  templateId: 'two-box',
  templateType: 'custom',
  fields: [],
  liveSources: {
    resolution: { width: 1920, height: 1080 },
    defaultPosition: { anchor: 'center', offset: { x: 0, y: 0 } },
    sources: [
      {
        elementId: 'el-l1',
        sourceId: 'l1',
        rect: { x: 0, y: 0, width: 1004, height: 1080 },
        expectedAspect: 16 / 9,
        dynamic: false,
      },
      {
        elementId: 'el-l2',
        sourceId: 'l2',
        rect: { x: 1004, y: 0, width: 916, height: 1080 },
        expectedAspect: 16 / 9,
        dynamic: false,
      },
    ],
    looks: [
      {
        id: 'both',
        name: 'both',
        entered: { mode: 'cut' },
        rects: {
          l1: { x: 0, y: 0, width: 1004, height: 1080 },
          l2: { x: 1004, y: 0, width: 916, height: 1080 },
        },
      },
    ],
    defaultLookId: 'both',
  },
};
const LOGO: TemplateInfo = { templateId: 'logo', templateType: 'logo', fields: [] };
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

let playout: FakePlayout | null = null;
let mock: MockHandle | null = null;
let bridge: BridgeHandle | null = null;
let scratch: string | null = null;

test.afterEach(async () => {
  await bridge?.close();
  bridge = null;
  await mock?.stop();
  mock = null;
  await playout?.stop();
  playout = null;
  if (scratch !== null) fs.rmSync(scratch, { recursive: true, force: true });
  scratch = null;
});

// A real bridge, a real CasparCG and two browsers: serial, as a LOAD bound (`retention-honesty`).
test.describe.configure({ mode: 'serial' });

async function station(): Promise<string> {
  playout = await startFakePlayout();
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 10, channels: 1 });
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-e2e-two-consoles-'));
  const connection: ConnectionConfig = {
    servers: { A: { host: '127.0.0.1', amcpPort: mock.amcpPort, oscPort } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: false,
  };
  bridge = await createBridge({
    port: 0,
    connection,
    fixedLayers: BANK,
    sourceCatalog: CATALOG,
    sourceAssignments: ASSIGNMENTS,
    stackPath: path.join(scratch, 'bridge-stack.json'),
    templatesDir: path.join(scratch, 'templates'),
    playout: {
      auth: 'playout',
      issuer: playout.issuer,
      jwksUrl: playout.jwksUrl,
      tokenUrl: playout.tokenUrl,
      refreshUrl: playout.refreshUrl,
      revokedUrl: playout.revokedUrl,
    },
  });
  bridge.runtime.templateImport(TWO_BOX, HTML);
  bridge.runtime.templateImport(LOGO, HTML);
  return bridge.url;
}

/** Open the console on the bridge and sign in through the real form. */
async function signedIn(page: Page, bridgeUrl: string, username: string): Promise<void> {
  await page.addInitScript(`window.__CG_BRIDGE_URL__ = ${JSON.stringify(bridgeUrl)};`);
  await page.goto('/');
  const user = page.locator('#cg-signin-user');
  await expect(user).toBeVisible({ timeout: 20_000 });
  await user.fill(username);
  await page.locator('#cg-signin-pass').fill(FAKE_PLAYOUT_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(user).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByRole('region', { name: 'Layers' })).toBeVisible();
}

/** One call on this console's own bridge client — what the row's verb calls. */
function call(page: Page, member: string, verb: string, req: unknown): Promise<unknown> {
  return page.evaluate(
    async ([m, v, r]) => {
      const cg = (
        window as unknown as { cg: Record<string, Record<string, (x: unknown) => unknown>> }
      ).cg;
      const fn = cg[m as string]?.[v as string];
      if (fn === undefined) throw new Error(`no window.cg.${String(m)}.${String(v)}`);
      return await fn(r);
    },
    [member, verb, req] as const,
  );
}

const row = (page: Page, layer: number) =>
  page.getByRole('region', { name: 'Layers' }).locator(`[data-layer="${String(layer)}"]`);

/** Every layer of the plate band the mock's own stage still carries. */
function bandOnStage(): number[] {
  const held: number[] = [];
  for (let layer = 60; layer <= 79; layer++) {
    if (mock?.layerState({ channel: 1, layer })?.onStage === true) held.push(layer);
  }
  return held;
}

test('🔴 §5 — A takes a multi-box page, B sees it ON AIR within a second; B clears it, A sees it cleared within a second, and no box is left', async ({
  page,
  browser,
}) => {
  const url = await station();
  const other = await browser.newContext();
  try {
    const a = page;
    const b = await other.newPage();
    await signedIn(a, url, FAKE_OPERATOR.username);
    await signedIn(b, url, FAKE_BOTH_CHANNELS_OPERATOR.username);

    // The CONTROL item first: a logo on row 80, on air, seen by both consoles.
    expect(
      await call(a, 'fixedLayers', 'load', {
        channel: 1,
        layer: 80,
        itemId: 'logo-80',
        templateId: 'logo',
        fields: {},
      }),
    ).toMatchObject({ accepted: true });
    expect(await call(a, 'stack', 'take', { itemId: 'logo-80' })).toMatchObject({ accepted: true });
    await expect(row(a, 80)).toContainText('ON AIR');
    await expect(row(b, 80)).toContainText('ON AIR');

    // The multi-box page, bound on bed 59 (nothing sent).
    expect(
      await call(a, 'fixedLayers', 'load', {
        channel: 1,
        layer: 59,
        itemId: 'bed-59',
        templateId: 'two-box',
        fields: {},
      }),
    ).toMatchObject({ accepted: true });

    // ── A TAKES; B sees it ON AIR within a second of the take being answered ──
    expect(await call(a, 'stack', 'take', { itemId: 'bed-59' })).toMatchObject({ accepted: true });
    await expect(row(b, 59)).toContainText('ON AIR', { timeout: ONE_SECOND });
    // The boxes really are on the band — the instrument the clear is judged by, shown live.
    await expect.poll(bandOnStage).toHaveLength(2);

    // ── B CLEARS; A shows it cleared within a second, and no box is left ──
    expect(await call(b, 'stack', 'out', { itemId: 'bed-59' })).toMatchObject({ accepted: true });
    await expect(row(a, 59)).not.toContainText('ON AIR', { timeout: ONE_SECOND });
    await expect.poll(bandOnStage, { message: 'a box was left on the plate band' }).toEqual([]);

    // CONTROL — the other item on the same channel stays ON AIR, on both consoles and on the wire.
    await expect(row(a, 80)).toContainText('ON AIR');
    await expect(row(b, 80)).toContainText('ON AIR');
    expect(mock?.layerState({ channel: 1, layer: 80 })?.onAir).toBe(true);
  } finally {
    await other.close();
  }
});
