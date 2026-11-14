import { expect, test, type Page } from '@playwright/test';
import type { PgmMeterReading, PgmReturnStatus, PgmTopology } from '@cg/shared-ipc';

/**
 * `R-104` — the shipped PROGRAM UI with a paired station: independent A/B pictures, one explicit
 * sound/meter source, and the honest reserve placeholder when the channel has no backup mapping.
 */

interface ProgramMonitorSeed {
  readonly backupChannel: number | null;
  readonly currentPrimary?: 'A' | 'B';
  readonly statuses?: readonly PgmReturnStatus[];
  readonly readings?: readonly PgmMeterReading[];
  readonly topology?: PgmTopology;
}

interface TestProgrammeAudioState {
  readonly active: string[];
  readonly events: string[];
  maxConcurrent: number;
  meterSubscriptions: number;
}

async function open(page: Page, seed: ProgramMonitorSeed): Promise<void> {
  await page.addInitScript((value: ProgramMonitorSeed) => {
    const w = window as unknown as {
      CG_E2E: boolean;
      CG_E2E_FIXED_BANK: boolean;
      CG_E2E_PROGRAM_MONITOR: ProgramMonitorSeed;
      __CG_SPLASH_DISABLED__: boolean;
      __CG_BRIDGE_URL__: string;
      programmeTopology: PgmTopology;
      programmeAudio: TestProgrammeAudioState;
    };
    w.CG_E2E = true;
    w.CG_E2E_FIXED_BANK = true;
    w.CG_E2E_PROGRAM_MONITOR = value;
    w.__CG_SPLASH_DISABLED__ = true;
    w.__CG_BRIDGE_URL__ = 'ws://127.0.0.1:1';
    if (value.topology === undefined) return;
    w.programmeTopology = value.topology;
    w.programmeAudio = { active: [], events: [], maxConcurrent: 0, meterSubscriptions: 0 };
    // Interpose at the RuntimeBridge seam while the app installs its normal test adapter.
    Object.defineProperty(w, 'cg', {
      configurable: true,
      set(bridge: typeof window.cg) {
        bridge.pgmReturn.topology = (channel) =>
          Promise.resolve(w.programmeTopology.channel === channel ? w.programmeTopology : null);
        bridge.pgmReturn.audioUrl = (_channel, engine = 'A', resourceKey) =>
          Promise.resolve('/pgm-topology-test-audio/' + engine + '/' + (resourceKey ?? 'unbound'));
        const subscribe = bridge.meters.onReading;
        bridge.meters.onReading = (handler) => {
          w.programmeAudio.meterSubscriptions += 1;
          return subscribe(handler);
        };
        Object.defineProperty(w, 'cg', { configurable: true, value: bridge, writable: true });
      },
    });
    const fetchOriginal = window.fetch.bind(window);
    window.fetch = (input, init) => {
      if (typeof input !== 'string' || !input.startsWith('/pgm-topology-test-audio/')) {
        return fetchOriginal(input, init);
      }
      const source = input.slice('/pgm-topology-test-audio/'.length);
      const audio = w.programmeAudio;
      audio.active.push(source);
      audio.events.push('start ' + source);
      audio.maxConcurrent = Math.max(audio.maxConcurrent, audio.active.length);
      return Promise.resolve(
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              init?.signal?.addEventListener(
                'abort',
                () => {
                  audio.active.splice(audio.active.indexOf(source), 1);
                  audio.events.push('stop ' + source);
                  controller.close();
                },
                { once: true },
              );
            },
          }),
        ),
      );
    };
  }, seed);
  await page.goto('/');
  const show = page.getByRole('button', { name: 'Show monitors' });
  if (await show.count()) await show.click();
}

test('A+B keeps physical labels through a B-primary state, shows one stalled feed, and binds one meter source', async ({
  page,
}) => {
  await open(page, {
    backupChannel: 2,
    currentPrimary: 'B',
    statuses: [
      { engine: 'A', channel: 1, state: 'stalled' },
      { engine: 'B', channel: 1, state: 'live' },
    ],
    readings: [
      { kind: 'audio', engine: 'A', channel: 1, dbfs: [-30, -30] },
      { kind: 'audio', engine: 'B', channel: 1, dbfs: [-12, -9] },
      {
        kind: 'loudness',
        engine: 'B',
        channel: 1,
        momentary: -22.8,
        shortterm: -23.1,
        limiterGrDb: 0,
      },
    ],
  });

  await page.getByRole('button', { name: 'A+B', exact: true }).click();
  const pictures = page.locator('[data-pgm-picture-count]');
  await expect(pictures).toHaveAttribute('data-pgm-picture-count', '2');
  await expect(pictures).toHaveAttribute('data-pgm-layout', 'horizontal');
  await expect(page.locator('[data-pgm-screen="A"]')).toContainText('A · CH 1');
  await expect(page.locator('[data-pgm-screen="A"]')).toContainText('Return feed stalled');
  await expect(page.locator('[data-pgm-screen="B"]')).toContainText('B · CH 2');
  await expect(page.locator('[data-pgm-screen="B"]')).not.toContainText('Return feed stalled');

  const soundSource = page.getByLabel('Programme sound source');
  await expect(soundSource).toHaveValue('follow');
  await expect(page.locator('[data-vu-meter]')).toHaveCount(1);
  await expect(page.locator('[data-vu-meter]')).toHaveAttribute('data-vu-engine', 'B');
  await expect(page.locator('[data-loudness-badge]')).toHaveAttribute('data-loudness-engine', 'B');
  await expect(page.getByRole('button', { name: 'Programme sound' })).toHaveAttribute(
    'title',
    /from B/,
  );

  const horizontalA = await page.locator('[data-pgm-screen="A"]').boundingBox();
  const horizontalB = await page.locator('[data-pgm-screen="B"]').boundingBox();
  expect(horizontalA).not.toBeNull();
  expect(horizontalB).not.toBeNull();
  expect(horizontalB?.x ?? 0).toBeGreaterThan((horizontalA?.x ?? 0) + 20);

  await page.getByRole('button', { name: 'Vertical programme layout' }).click();
  await expect(pictures).toHaveAttribute('data-pgm-layout', 'vertical');
  const verticalA = await page.locator('[data-pgm-screen="A"]').boundingBox();
  const verticalB = await page.locator('[data-pgm-screen="B"]').boundingBox();
  expect(verticalA).not.toBeNull();
  expect(verticalB).not.toBeNull();
  expect(verticalB?.y ?? 0).toBeGreaterThan((verticalA?.y ?? 0) + 20);
  await expect
    .poll(() => page.evaluate(() => globalThis.localStorage.getItem('cg.runtime.pgm-monitor.v1')))
    .toContain('"layout":"vertical"');

  await soundSource.selectOption('A');
  await expect(page.locator('[data-vu-meter]')).toHaveCount(1);
  await expect(page.locator('[data-vu-meter]')).toHaveAttribute('data-vu-engine', 'A');
  await expect(page.locator('[data-loudness-badge]')).toHaveAttribute('data-loudness-engine', 'A');
  await expect(page.locator('[data-pgm-screen="A"]')).toContainText('A · CH 1');
  await expect(page.locator('[data-pgm-screen="B"]')).toContainText('B · CH 2');
});

test('without a channel mapping, reserve controls stay visible and B is a black no-signal tile', async ({
  page,
}) => {
  await open(page, {
    backupChannel: null,
    statuses: [{ engine: 'A', channel: 1, state: 'live' }],
  });

  await expect(page.getByRole('button', { name: 'A+B', exact: true })).toHaveCount(1);
  await expect(page.getByLabel('Programme sound source')).toHaveCount(1);
  await page.getByRole('button', { name: 'A+B', exact: true }).click();
  await expect(page.locator('[data-pgm-picture-count]')).toHaveAttribute(
    'data-pgm-picture-count',
    '2',
  );
  await expect(page.locator('[data-pgm-screen="A"]')).toContainText('A · CH 1');
  await expect(page.locator('[data-pgm-screen="B"]')).toContainText('B · CH —');
  await expect(page.locator('[data-pgm-screen="B"]')).toContainText('No return signal');
  await expect(page.locator('[data-pgm-screen="B"] [data-pgm-picture]')).toHaveCount(0);
  await expect(page.locator('[data-backup-channel-line="not-mapped"]')).toContainText(
    'Backup: not mapped',
  );
});

test('four named programme returns share a 2x2 view and one selected sound stream', async ({
  page,
}) => {
  const members: PgmTopology['members'] = [
    { engine: 'A', name: 'Apasai Main', physicalChannel: 1, resourceKey: 'main-1' },
    {
      engine: 'B',
      name: 'Apasai West',
      physicalChannel: 2,
      resourceKey: 'west-2',
      meterEngine: 'A',
    },
    { engine: 'C', name: 'Apasai East', physicalChannel: 3, resourceKey: 'east-3' },
    { engine: 'D', name: 'Apasai South', physicalChannel: 4, resourceKey: 'south-4' },
  ];
  await open(page, {
    backupChannel: null,
    topology: { channel: 1, members, active: 'C' },
    readings: [
      { kind: 'audio', engine: 'A', channel: 1, dbfs: [-12, -9] },
      { kind: 'audio', engine: 'B', channel: 1, dbfs: [-30, -30] },
      {
        kind: 'loudness',
        engine: 'A',
        channel: 1,
        momentary: -22.8,
        shortterm: -23.1,
        limiterGrDb: 0,
      },
    ],
    statuses: members.map(({ engine, resourceKey }) => ({
      engine,
      channel: 1,
      resourceKey: engine === 'D' ? 'former-south-channel' : resourceKey,
      state: engine === 'B' ? 'stalled' : 'live',
    })),
  });
  const all = page.getByRole('button', { name: 'All', exact: true });
  await all.click();
  const tiles = page.locator('[data-pgm-screen]');
  await expect(tiles).toHaveCount(4);
  await expect(page.locator('[data-pgm-picture-count]')).toHaveAttribute('data-pgm-layout', 'grid');
  for (const { engine, name, physicalChannel } of members) {
    const tile = page.locator('[data-pgm-screen="' + engine + '"]');
    await expect(tile).toContainText(name);
    await expect(tile).toContainText('CH ' + String(physicalChannel));
  }
  const boxes = await Promise.all((await tiles.all()).map((tile) => tile.boundingBox()));
  const [a, b, c, d] = boxes;
  if (a == null || b == null || c == null || d == null) throw new Error('Missing programme tile');
  expect(a.x).toBe(c.x);
  expect(b.x).toBe(d.x);
  expect(a.y).toBe(b.y);
  expect(c.y).toBe(d.y);
  expect(b.x).toBeGreaterThan(a.x + a.width);
  expect(c.y).toBeGreaterThan(a.y + a.height);
  await expect(page.locator('[data-pgm-screen="A"] [data-pgm-picture]')).toHaveCSS(
    'visibility',
    'visible',
  );
  await expect(page.locator('[data-pgm-screen="B"]')).toContainText('Return feed stalled');
  await expect(page.locator('[data-pgm-screen="D"]')).toContainText('No return signal');
  await expect(page.locator('[data-pgm-screen="C"]')).toHaveAttribute('data-pgm-active', '');

  const sound = page.getByRole('button', { name: 'Programme sound', exact: true });
  const audioSource = page.getByLabel('Programme sound source');
  const audio = () =>
    page.evaluate(
      () => (window as unknown as { programmeAudio: TestProgrammeAudioState }).programmeAudio,
    );
  expect((await audio()).active).toEqual([]);
  const vu = page.locator('[data-vu-meter]');
  const loudness = page.locator('[data-loudness-badge]');
  await sound.click();
  await expect.poll(async () => (await audio()).active).toEqual(['C/east-3']);
  await expect(vu).toHaveCount(0);
  await expect(loudness).toHaveCount(0);
  expect((await audio()).meterSubscriptions).toBe(0);
  await page.evaluate(() => {
    const state = window as unknown as { programmeTopology: PgmTopology };
    state.programmeTopology = { ...state.programmeTopology, active: 'D' };
  });
  await expect.poll(async () => (await audio()).active, { timeout: 10_000 }).toEqual(['D/south-4']);
  await expect(page.locator('[data-pgm-screen="D"]')).toHaveAttribute('data-pgm-active', '');
  await audioSource.selectOption('A');
  await expect.poll(async () => (await audio()).active).toEqual(['A/main-1']);
  await expect(vu).toHaveCount(0);
  expect((await audio()).meterSubscriptions).toBe(0);
  await audioSource.selectOption('B');
  await expect.poll(async () => (await audio()).active).toEqual(['B/west-2']);
  await expect(vu).toHaveCount(1);
  await expect(vu).toHaveAttribute('data-vu-engine', 'A');
  await expect(vu.locator('[data-vu-bar="1"] .cg-vu__fill')).toHaveCSS(
    'clip-path',
    'inset(20% 0px 0px)',
  );
  await expect(loudness).toHaveText('−23.1 LUFS');
  await audioSource.selectOption('D');
  await expect.poll(async () => (await audio()).active).toEqual(['D/south-4']);
  await expect(vu).toHaveCount(0);
  await expect(loudness).toHaveCount(0);
  await page.evaluate(() => {
    const state = window as unknown as { programmeTopology: PgmTopology };
    state.programmeTopology = { ...state.programmeTopology, active: null };
  });
  await expect(page.locator('[data-pgm-active]')).toHaveCount(0, { timeout: 10_000 });
  expect((await audio()).active).toEqual(['D/south-4']);
  await audioSource.selectOption('follow');
  await expect.poll(async () => (await audio()).active).toEqual([]);
  expect(await audio()).toMatchObject({
    events: [
      'start C/east-3',
      'stop C/east-3',
      'start D/south-4',
      'stop D/south-4',
      'start A/main-1',
      'stop A/main-1',
      'start B/west-2',
      'stop B/west-2',
      'start D/south-4',
      'stop D/south-4',
    ],
    maxConcurrent: 1,
    meterSubscriptions: 1,
  });
});
