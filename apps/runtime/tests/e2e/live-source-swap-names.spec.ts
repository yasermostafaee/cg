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
import { expect, test, type Locator } from '@playwright/test';
import { textRunX } from './fixtures/runtime.js';

/**
 * 🔴 `CONSOLE-POLISH-01-A` (`B-306`) — **THE ON-AIR SWAP NAMES PLATES AND SOURCES IN THE OPERATOR'S
 * WORDS, AND SENDS EXACTLY WHAT IT SENT.**
 *
 * The dialog labelled each plate with the template author's id (`l1`) and opened with a four-line
 * paragraph. Now a plate is `Plate N` (its id on the `title`), every source is the Playout's name in its
 * own direction, and there is no paragraph. Measured in a real engine because ORDER is layout (golden
 * rule 12c): laid out right to left, a name's first word is RIGHTMOST.
 *
 * CONTROL — **the wire**. A real CG Bridge and a real `@cg/amcp-mock` CasparCG: the swap's AMCP lines
 * are compared with the lines the UNCHANGED dialog sent for the same press, recorded on 2026-10-04
 * before this change. A markup change that reached what a swap sends would fail here.
 */

const BANK: FixedLayerBank = { channel: 1, start: 80, count: 4, low: { start: 50, count: 10 } };
const NAME_1 = 'NDI کانالِ ۱ (APASAI)';
const NAME_2 = 'HD استودیو (CAM 2)';
const CATALOG: SourceCatalog = {
  sources: [
    { id: 'src-1', name: NAME_1, format: '1080p5000', producer: { kind: 'decklink', device: 1 } },
    { id: 'src-2', name: NAME_2, format: '1080p5000', producer: { kind: 'decklink', device: 2 } },
  ],
  layerRange: { start: 60, end: 79 },
};
const ASSIGNMENTS: SourceAssignments = {
  assignments: [
    { templateId: 'two-box', plateId: 'l1', sourceId: 'src-1' },
    { templateId: 'two-box', plateId: 'l2', sourceId: 'src-1' },
  ],
};
const LEFT = { x: 0, y: 0, width: 1004, height: 1080 };
const RIGHT = { x: 1004, y: 0, width: 916, height: 1080 };
const TWO_BOX: TemplateInfo = {
  templateId: 'two-box',
  templateType: 'custom',
  fields: [],
  liveSources: {
    resolution: { width: 1920, height: 1080 },
    defaultPosition: { anchor: 'center', offset: { x: 0, y: 0 } },
    sources: [
      { elementId: 'el-l1', sourceId: 'l1', rect: LEFT, expectedAspect: 16 / 9, dynamic: false },
      { elementId: 'el-l2', sourceId: 'l2', rect: RIGHT, expectedAspect: 16 / 9, dynamic: false },
    ],
    looks: [{ id: 'both', name: 'both', entered: { mode: 'cut' }, rects: { l1: LEFT, l2: RIGHT } }],
    defaultLookId: 'both',
  },
};
const HTML = '<!doctype html><html><head><meta charset="utf-8"></head><body>swap</body></html>';

/** What the UNCHANGED dialog's swap of plate 1 to `NAME_2` sent, recorded before `B-306`. */
const RECORDED_WIRE = [
  'MIXER 1-61 OPACITY 0 DEFER',
  'MIXER 1-61 VOLUME 0 DEFER',
  'MIXER 1-61 FILL 0 0.238542 0.522917 0.522917 DEFER',
  'MIXER 1-61 CLIP 0 0.238542 0.522917 0.522917 DEFER',
  'MIXER 1 COMMIT',
  'PLAY 1-61 DECKLINK DEVICE 2',
  'MIXER 1-61 OPACITY 1 DEFER',
  'MIXER 1-61 VOLUME 0 DEFER',
  'MIXER 1-60 FILL 0.522917 0.261458 0.477083 0.477083 DEFER',
  'MIXER 1-60 CLIP 0.522917 0.261458 0.477083 0.477083 DEFER',
  'MIXER 1 COMMIT',
];

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

let mock: MockHandle | null = null;
let bridge: BridgeHandle | null = null;
let scratch: string | null = null;

test.afterEach(async () => {
  await bridge?.close();
  bridge = null;
  await mock?.stop();
  mock = null;
  if (scratch !== null) fs.rmSync(scratch, { recursive: true, force: true });
  scratch = null;
});

// A real bridge and a real CasparCG: serial, as a LOAD bound (`retention-honesty`).
test.describe.configure({ mode: 'serial' });

/** The owner's order: the name's first word rightmost, its last leftmost. */
async function readsRightToLeft(target: Locator, first: string, last: string): Promise<void> {
  const [a, b] = [await textRunX(target, first), await textRunX(target, last)];
  expect(a.left, `"${first}" is not RIGHT of "${last}"`).toBeGreaterThanOrEqual(b.right);
}

test('🔴 B-306 — plates are `Plate N`, sources the Playout’s names in their own order, no paragraph, no id; control: the swap sends exactly the recorded wire', async ({
  page,
}) => {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 10, channels: 1 });
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-e2e-swap-names-'));
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
  });
  bridge.runtime.templateImport(TWO_BOX, HTML);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.addInitScript(`window.__CG_BRIDGE_URL__ = ${JSON.stringify(bridge.url)};`);
  await page.goto('/');
  const layers = page.getByRole('region', { name: 'Layers' });
  await expect(layers).toBeVisible({ timeout: 20_000 });
  await page.evaluate(async () => {
    const cg = (
      window as unknown as {
        cg: {
          fixedLayers: { load: (r: unknown) => Promise<unknown> };
          stack: { take: (r: unknown) => Promise<unknown> };
        };
      }
    ).cg;
    await cg.fixedLayers.load({
      channel: 1,
      layer: 59,
      itemId: 'bed-59',
      templateId: 'two-box',
      fields: {},
    });
    await cg.stack.take({ itemId: 'bed-59' });
  });
  const row = layers.locator('[data-layer="59"]');
  await expect(row).toContainText('ON AIR', { timeout: 10_000 });
  // The take's own seating settles first: the wire compared below is the swap's alone.
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const cg = (
          window as unknown as { cg: { stack: { snapshot: () => Promise<{ status: string }[]> } } }
        ).cg;
        return (await cg.stack.snapshot())[0]?.status;
      }),
    )
    .toBe('playing');
  /*
    …and R-022's BOOT BLANKET — every declared row's `MIXER … VOLUME 1` — has all gone out: it trickles
    at `normal` priority and a straggler would land inside the swap's window below (measured: fourteen
    of them did, once). Waited on through the enumeration the blanket itself walks.
  */
  const blanket = [50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 80, 81, 82, 83].map(
    (layer) => `MIXER 1-${String(layer)} VOLUME 1`,
  );
  await expect
    .poll(() => {
      const seen = new Set(mock?.receivedCommands().map((c) => c.line));
      return blanket.filter((l) => !seen.has(l));
    })
    .toEqual([]);

  // ── the row's SOURCE, from its menu ──
  /*
    The menu CLOSES on any scroll or resize, by design (`ContextMenu`: close rather than chase a row
    that moved — acting on the wrong row is the failure worth designing against). On CI's slower
    runner something scrolled after the right-click and the menu went — the first run of this spec
    waited 30 s on an item no longer there (run 37153905221). So the open is RETRIED until the dialog
    is up: the dialog is this test's subject, and its opening is the proof the press landed. `force`:
    a live bridge re-renders the row on every push, so the item is never "stable" to Playwright.
  */
  const dialog = page.getByRole('dialog', { name: /Live source for this row/ });
  await expect(async () => {
    if (await dialog.isVisible()) return;
    await row.click({ button: 'right' });
    await page
      .getByRole('menu')
      .getByRole('menuitem', { name: 'SOURCE' })
      .click({ force: true, timeout: 2000 });
    await expect(dialog).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });

  // No paragraph, and no plate id anywhere in what the operator reads.
  await expect(dialog.locator('p')).toHaveCount(0);
  const text = (await dialog.textContent()) ?? '';
  expect(text).not.toMatch(/\bl1\b|\bl2\b/);
  expect(text).not.toMatch(/this row only|permanent configuration/i);
  // Each plate is `Plate N`, its id on the title.
  const plate1 = dialog.locator('[data-swap-plate="l1"] label');
  await expect(plate1).toHaveAttribute('title', 'l1');
  await expect(plate1).toContainText('Plate 1');
  await expect(dialog.locator('[data-swap-plate="l2"] label')).toContainText('Plate 2');
  // The template assignment, by the Playout's name, right to left inside its English.
  const assigned = dialog.locator('[data-swap-plate="l1"] [data-swap-assigned]');
  await expect(assigned).toContainText('Template assignment (');
  await readsRightToLeft(assigned, 'NDI', 'APASAI');

  // ── the swap: plate 1 onto `NAME_2` ──
  const before = mock.receivedCommands().length;
  await dialog.locator('#swap-bed-59-l1').click();
  await page.locator('[data-picker-input]').filter({ hasText: 'CAM 2' }).first().click();
  await expect(dialog.locator('[data-swap-plate="l1"]')).toContainText('swapped for this row');
  // The field now names the new source in its own order.
  await readsRightToLeft(dialog.locator('#swap-bed-59-l1'), 'HD', 'CAM');

  // CONTROL — the wire is the recorded one, line for line.
  await expect
    .poll(
      () =>
        mock
          ?.receivedCommands()
          .slice(before)
          .map((c) => c.line)
          .filter((l) => /^(PLAY|LOAD|LOADBG|MIXER|CLEAR|STOP|CG) /.test(l)) ?? [],
      { timeout: 5000 },
    )
    .toEqual(RECORDED_WIRE);
});
