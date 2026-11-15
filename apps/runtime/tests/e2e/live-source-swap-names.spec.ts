import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createBridge, type BridgeHandle } from '@cg/caspar-bridge';
import { createMock, defaultHandlers, type MockHandle } from '@cg/amcp-mock';
import type {
  ConnectionConfig,
  FixedLayerBank,
  SourceAssignments,
  SourceCatalog,
  TemplateInfo,
} from '@cg/shared-ipc';
import { CG_LIVE_POSITION_PAGE_MARKER } from '@cg/shared-schema';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { textRunX } from './fixtures/runtime.js';

/**
 * 🔴 `CONSOLE-POLISH-01-A` (`B-306`) — **THE ON-AIR SWAP NAMES PLATES AND SOURCES IN THE OPERATOR'S
 * WORDS, AND SEATS THE NEW SOURCE BEFORE CLEARING THE COPY.**
 *
 * The dialog labelled each plate with the template author's id (`l1`) and opened with a four-line
 * paragraph. Now a plate is `Plate N` (its id on the `title`), every source is the Playout's name in its
 * own direction, and there is no paragraph. Measured in a real engine because ORDER is layout (golden
 * rule 12c): laid out right to left, a name's first word is RIGHTMOST.
 *
 * CONTROL — **the wire**. The Take seats one DeckLink producer and a routed copy in separate
 * rectangles. The swap seats the new producer in a fresh layer before retiring the copy.
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

const PHYSICAL_SEAT = { channel: 1, layer: 60 };
const COPY_SEAT = { channel: 1, layer: 61 };
const NEW_SEAT = { channel: 1, layer: 62 };
const LEFT_RENDERED = { x: 0, y: 0.238542, width: 0.522917, height: 0.522917 };
const RIGHT_RENDERED = {
  x: 0.522917,
  y: 0.261458,
  width: expect.closeTo(0.477083, 6),
  height: 0.477083,
};

/** The swap of plate 1 to `NAME_2`, with the R-105 fallback fit update. */
const SUCCESSFUL_SWAP_WIRE = [
  'MIXER 1-62 OPACITY 0 DEFER',
  'MIXER 1-62 VOLUME 0 DEFER',
  'MIXER 1-62 FILL 0 0.238542 0.522917 0.522917 DEFER',
  'MIXER 1-62 CLIP 0 0.238542 0.522917 0.522917 DEFER',
  'MIXER 1 COMMIT',
  'PLAY 1-62 DECKLINK DEVICE 2',
  'MIXER 1-62 OPACITY 1 DEFER',
  'MIXER 1-62 VOLUME 0 DEFER',
  'MIXER 1-60 FILL 0.522917 0.261458 0.477083 0.477083 DEFER',
  'MIXER 1-60 CLIP 0.522917 0.261458 0.477083 0.477083 DEFER',
  'MIXER 1 COMMIT',
  'CLEAR 1-61',
  'MIXER 1-61 CLEAR',
  'CG 1-59 UPDATE 0 "{\\"__cg\\":{\\"plates\\":{\\"l1\\":{\\"aspect\\":1.7777777777777777,\\"mode\\":\\"contain\\"},\\"l2\\":{\\"aspect\\":1.7777777777777777,\\"mode\\":\\"contain\\"}}}}"',
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
let backupMock: MockHandle | null = null;
let bridge: BridgeHandle | null = null;
let scratch: string | null = null;

test.afterEach(async () => {
  await bridge?.close();
  bridge = null;
  await mock?.stop();
  mock = null;
  await backupMock?.stop();
  backupMock = null;
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

/**
 * A real CasparCG mock and a real CG Bridge; `two-box` taken ON AIR on row 59 of `bank`, settled
 * (its own seating and the boot blanket all sent); the row's SOURCE dialog open.
 */
async function swapDialogOnAir(
  page: Page,
  bank: FixedLayerBank,
  inputCount = 2,
  withBackup = false,
  singlePlateFit: 'contain' | 'cover' = 'contain',
): Promise<{ mock: MockHandle; row: Locator; dialog: Locator }> {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 10, channels: 1 });
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-e2e-swap-names-'));
  const connection: ConnectionConfig = {
    servers: { A: { host: '127.0.0.1', amcpPort: mock.amcpPort, oscPort } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: false,
  };
  if (withBackup) {
    const backupOscPort = await freeUdpPort();
    backupMock = await createMock({
      amcpPort: 0,
      oscPort: backupOscPort,
      oscHost: '127.0.0.1',
      oscHz: 10,
      channels: 2,
    });
    connection.servers.B = {
      host: '127.0.0.1',
      amcpPort: backupMock.amcpPort,
      oscPort: backupOscPort,
    };
  }
  bridge = await createBridge({
    port: 0,
    connection,
    ...(withBackup && {
      backupChannelMap: {
        channelOnB: (channel) => (channel === 1 ? 2 : null),
        channelOnBAtTake: (channel) => (channel === 1 ? 2 : null),
        stationChannelOf: (channel) => (channel === 2 ? 1 : null),
        release: () => undefined,
      },
      coreGuardOptions: {
        fetchImpl: () => Promise.resolve(new Response(null, { status: 404 })),
      },
    }),
    fixedLayers: bank,
    sourceCatalog: CATALOG,
    sourceAssignments: ASSIGNMENTS,
    stackPath: path.join(scratch, 'bridge-stack.json'),
    templatesDir: path.join(scratch, 'templates'),
  });
  const carrier = TWO_BOX.liveSources!;
  bridge.runtime.templateImport(
    inputCount === 1
      ? {
          ...TWO_BOX,
          liveSources: {
            ...carrier,
            sources: carrier.sources.slice(0, 1),
            looks: [{ ...carrier.looks![0]!, rects: { l1: LEFT }, fits: { l1: singlePlateFit } }],
          },
        }
      : TWO_BOX,
    withBackup ? HTML.replace('</head>', `${CG_LIVE_POSITION_PAGE_MARKER}</head>`) : HTML,
  );
  if (withBackup) {
    const handle = bridge;
    await expect
      .poll(() => handle.runtime.health().backup?.state, { timeout: 15_000 })
      .toBe('healthy');
  }
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

  const producerStarts = mock
    .receivedCommands()
    .map(({ line }) => line)
    .filter((line) => /^PLAY 1-(6\d|7\d) /.test(line));
  expect(producerStarts).toEqual(
    inputCount === 1
      ? ['PLAY 1-60 DECKLINK DEVICE 1']
      : ['PLAY 1-60 DECKLINK DEVICE 1', 'PLAY 1-61 "route://1-60"'],
  );
  expect(mock.layerState(PHYSICAL_SEAT)).toMatchObject({
    producer: 'decklink',
    onAir: true,
    opacity: 1,
  });
  expect(mock.layerRenderedRect(PHYSICAL_SEAT)).toEqual(
    singlePlateFit === 'contain' ? LEFT_RENDERED : { ...LEFT_RENDERED, y: 0, height: 1 },
  );
  if (inputCount === 2) {
    expect(mock.layerState(COPY_SEAT)).toMatchObject({
      producer: 'route',
      onAir: true,
      opacity: 1,
      volume: 0,
    });
    expect(mock.layerRenderedRect(COPY_SEAT)).toEqual(RIGHT_RENDERED);
  }

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
  return { mock, row, dialog };
}

test('🔴 B-306 — plates are `Plate N`, sources the Playout’s names in their own order, no paragraph, no id; control: the swap seats the new source before clearing the copy', async ({
  page,
}) => {
  const { mock, dialog } = await swapDialogOnAir(page, BANK);

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

  // CONTROL — the new source is visible before the routed copy is cleared.
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
    .toEqual(SUCCESSFUL_SWAP_WIRE);
  expect(mock.layerState(PHYSICAL_SEAT)).toMatchObject({ producer: 'decklink', onAir: true });
  expect(mock.layerState(NEW_SEAT)).toMatchObject({
    producer: 'decklink',
    onAir: true,
    opacity: 1,
  });
  expect(mock.layerState(COPY_SEAT)).toMatchObject({ producer: 'empty', onAir: false });
  expect(mock.layerRenderedRect(PHYSICAL_SEAT)).toEqual(RIGHT_RENDERED);
  expect(mock.layerRenderedRect(NEW_SEAT)).toEqual(LEFT_RENDERED);
});

/**
 * 🔴 `RELEASE-0110-01` Part A (`B-308`) — **CG BRIDGE'S OWN SENTENCES NAME A PLATE `Plate N`.**
 *
 * The swap's refusal is CG Bridge's sentence, shown in this dialog as it comes. It read
 * `CasparCG refused the substitution, so plate "l1" is still on its previous source.` — the template
 * author's id, beside a label that says `Plate 1`. Now it says `Plate 1` too; the id stays in what the
 * console sent, for a technician.
 *
 * The row is named by the console alone (`operatorRowName` — its alias here, Persian), never by CG
 * Bridge, and it reads in its own logical order: right to left, its first word RIGHTMOST.
 *
 * CONTROL — **the wire**. A refused swap stops at the new source's failed PLAY and leaves both
 * original plates on air with their original geometry.
 */
const PERSIAN_ROW = 'بستر خبر';
const PERSIAN_BANK: FixedLayerBank = {
  ...BANK,
  low: { start: 50, count: 10, aliases: { '59': PERSIAN_ROW } },
};

const REFUSED_SWAP_WIRE = [
  'MIXER 1-62 OPACITY 0 DEFER',
  'MIXER 1-62 VOLUME 0 DEFER',
  'MIXER 1-62 FILL 0 0.238542 0.522917 0.522917 DEFER',
  'MIXER 1-62 CLIP 0 0.238542 0.522917 0.522917 DEFER',
  'MIXER 1 COMMIT',
  'PLAY 1-62 DECKLINK DEVICE 2',
];

test('🔴 B-308 — a refused swap names the plate `Plate 1`, never its id; the Persian row reads right to left; control: a refusal keeps both original plates on air', async ({
  page,
}) => {
  const { mock, row, dialog } = await swapDialogOnAir(page, PERSIAN_BANK);

  // The row, in the console's words (its alias), laid out in its own direction.
  await expect(row).toContainText(PERSIAN_ROW);
  await readsRightToLeft(row, 'بستر', 'خبر');

  // CasparCG refuses the swap's PLAY of DeckLink 2; every other command is answered as before.
  const honest = defaultHandlers().get('PLAY');
  if (honest === undefined) throw new Error('the mock has no PLAY handler');
  mock.setHandler('PLAY', (req, ctx) =>
    req.raw.includes('DECKLINK DEVICE 2')
      ? { kind: 'err' as const, code: 404, verb: 'PLAY' }
      : honest(req, ctx),
  );

  // ── the swap: plate 1 onto `NAME_2`, refused ──
  const originalPhysical = structuredClone(mock.layerState(PHYSICAL_SEAT));
  const originalCopy = structuredClone(mock.layerState(COPY_SEAT));
  const before = mock.receivedCommands().length;
  await dialog.locator('#swap-bed-59-l1').click();
  await page.locator('[data-picker-input]').filter({ hasText: 'CAM 2' }).first().click();
  const wire = (): string[] =>
    mock
      .receivedCommands()
      .slice(before)
      .map((c) => c.line)
      .filter((l) => /^(PLAY|LOAD|LOADBG|MIXER|CLEAR|STOP|CG) /.test(l));

  // The plate in the operator's words, and no plate id anywhere in what the operator reads.
  await expect(dialog).toContainText(
    'CasparCG refused the substitution, so Plate 1 is still on its previous source. Nothing was ' +
      'cleared.',
  );
  expect((await dialog.textContent()) ?? '').not.toMatch(/\bl1\b|\bl2\b/);
  // …and the plate did not move: it is not marked swapped.
  await expect(dialog.locator('[data-swap-plate="l1"]')).not.toContainText('swapped for this row');

  // CONTROL — neither original seat changes and the failed PLAY is the last wire command.
  await expect.poll(wire, { timeout: 5000 }).toEqual(REFUSED_SWAP_WIRE);
  expect(mock.layerState(PHYSICAL_SEAT)).toEqual(originalPhysical);
  expect(mock.layerState(COPY_SEAT)).toEqual(originalCopy);
  expect(mock.layerState(NEW_SEAT)).toMatchObject({ producer: 'empty', onAir: false });
});

test('R-119 selects Fade for a source change and dissolves inside the live frame', async ({
  page,
}) => {
  const { mock, dialog } = await swapDialogOnAir(page, BANK, 1);
  const transition = dialog.getByRole('combobox', { name: 'Input transition' });
  await expect(transition).toHaveValue('cut');
  await transition.selectOption('fade');
  await expect(dialog.getByLabel('Duration (ms)')).toHaveValue('400');

  const before = mock.receivedCommands().length;
  await dialog.getByRole('combobox', { name: 'Live source for Plate 1' }).click();
  await page.locator('[data-picker-input]').filter({ hasText: 'CAM 2' }).first().click();
  const wire = () =>
    mock
      .receivedCommands()
      .slice(before)
      .map(({ line }) => line);
  await expect.poll(wire).toContain('CLEAR 1-60');
  await expect(dialog.locator('[data-swap-plate="l1"]')).toContainText('swapped for this row');

  const lines = wire();
  const staged = lines.indexOf('MIXER 1-61 OPACITY 0 DEFER');
  const started = lines.indexOf('PLAY 1-61 DECKLINK DEVICE 2');
  const faded = lines.findIndex((line) => /^MIXER 1-61 OPACITY 1 \d+ linear DEFER$/.test(line));
  expect(staged).toBeGreaterThanOrEqual(0);
  expect(started).toBeGreaterThan(staged);
  expect(faded).toBeGreaterThan(started);
  expect(lines.indexOf('CLEAR 1-60')).toBeGreaterThan(faded);
  expect(mock.layerRenderedRect(COPY_SEAT)).toEqual(LEFT_RENDERED);
});

for (const fixture of [
  { mode: 'push', direction: 'right', departingMoves: true },
  { mode: 'slide-over', direction: 'down', departingMoves: false },
]) {
  test(`R-119 changes an on-air input with ${fixture.mode} from ${fixture.direction}`, async ({
    page,
  }) => {
    const { mock, dialog } = await swapDialogOnAir(page, BANK, 1);
    const transition = dialog.getByRole('combobox', { name: 'Input transition' });
    const direction = dialog.getByRole('combobox', { name: 'Input direction' });
    await expect(direction).toHaveCount(0);
    await transition.selectOption(fixture.mode);
    await expect(direction.locator('option')).toHaveText([
      'From left',
      'From right',
      'From top',
      'From bottom',
    ]);
    await direction.selectOption(fixture.direction);
    await expect(dialog.getByLabel('Duration (ms)')).toHaveValue('400');

    const before = mock.receivedCommands().length;
    await dialog.getByRole('combobox', { name: 'Live source for Plate 1' }).click();
    await page.locator('[data-picker-input]').filter({ hasText: 'CAM 2' }).first().click();
    await expect(dialog.locator('[data-swap-plate="l1"]')).toContainText('swapped for this row');
    const lines = mock
      .receivedCommands()
      .slice(before)
      .map(({ line }) => line);
    const preRoll = lines.indexOf('PLAY 1-61 DECKLINK DEVICE 2');
    const move = lines.findIndex((line) => /^MIXER 1-61 FILL .* \d+ linear DEFER$/.test(line));
    expect(preRoll).toBeGreaterThan(lines.indexOf('MIXER 1-61 OPACITY 0 DEFER'));
    expect(move).toBeGreaterThan(preRoll);
    expect(lines.some((line) => /^MIXER 1-60 FILL .* \d+ linear DEFER$/.test(line))).toBe(
      fixture.departingMoves,
    );
    expect(lines.indexOf('CLEAR 1-60')).toBeGreaterThan(move);
    expect(mock.layerRenderedRect(COPY_SEAT)).toEqual(LEFT_RENDERED);
  });
}

test('R-119 protects a cropped programme input from an unsupported slide direction', async ({
  page,
}) => {
  const { mock, dialog } = await swapDialogOnAir(page, BANK, 1, false, 'cover');
  const beforePicture = mock.layerRenderedRect(PHYSICAL_SEAT);
  await dialog.getByRole('combobox', { name: 'Input transition' }).selectOption('slide-over');
  await dialog.getByRole('combobox', { name: 'Input direction' }).selectOption('up');
  const before = mock.receivedCommands().length;
  await dialog.getByRole('combobox', { name: 'Live source for Plate 1' }).click();
  await page.locator('[data-picker-input]').filter({ hasText: 'CAM 2' }).first().click();
  await expect(
    dialog.getByText('Choose another direction, Fade or Cut.', { exact: false }),
  ).toBeVisible();
  const lines = mock
    .receivedCommands()
    .slice(before)
    .map(({ line }) => line);
  expect(lines.filter((line) => /^(?:PLAY|CLEAR|MIXER|CG) /i.test(line))).toEqual([]);
  expect(mock.layerRenderedRect(PHYSICAL_SEAT)).toEqual(beforePicture);
});

test('R-119 applies a source Fade to the active output with mirror-sync enabled', async ({
  page,
}) => {
  const { mock, dialog } = await swapDialogOnAir(page, BANK, 1, true);
  const reserve = backupMock;
  if (reserve === null) throw new Error('Missing configured reserve');
  expect(reserve.layerState({ channel: 2, layer: 60 })).toMatchObject({
    producer: 'decklink',
    onAir: true,
    opacity: 1,
  });
  await dialog.getByRole('combobox', { name: 'Input transition' }).selectOption('fade');
  const beforeActive = mock.receivedCommands().length;
  const beforeReserve = reserve.receivedCommands().length;
  await dialog.getByRole('combobox', { name: 'Live source for Plate 1' }).click();
  await page.locator('[data-picker-input]').filter({ hasText: 'CAM 2' }).first().click();
  await expect(dialog.locator('[data-swap-plate="l1"]')).toContainText('swapped for this row');

  const active = mock
    .receivedCommands()
    .slice(beforeActive)
    .map(({ line }) => line);
  const settled = reserve
    .receivedCommands()
    .slice(beforeReserve)
    .map(({ line }) => line);
  expect(active).toContainEqual(expect.stringMatching(/^MIXER 1-61 OPACITY 1 \d+ linear DEFER$/));
  expect(settled).toContain('PLAY 2-61 DECKLINK DEVICE 2');
  expect(settled.some((line) => /\s\d+ linear DEFER$/.test(line))).toBe(false);
  expect(reserve.layerState({ channel: 2, layer: 60 })?.producer ?? 'empty').toBe('empty');
  expect(reserve.layerRenderedRect({ channel: 2, layer: 61 })).toEqual(LEFT_RENDERED);
});
