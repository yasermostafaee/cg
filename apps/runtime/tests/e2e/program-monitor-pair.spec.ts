import { expect, test, type Page } from '@playwright/test';
import type {
  BackupChannelsState,
  ConnectionConfig,
  PgmMeterReading,
  PgmEngine,
  PgmReturnStatus,
  PgmTopology,
} from '@cg/shared-ipc';
import {
  startFakePgmFeed,
  wavHeader,
} from '../../../../tools/caspar-bridge/tests/support/fake-pgm-feed.js';

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
  readonly managedPlayoutAddress?: string;
  readonly removableBackup?: boolean;
  readonly feedAddresses?: Partial<Record<PgmEngine, string>>;
}

interface TestProgrammeAudioState {
  readonly active: string[];
  readonly events: string[];
  maxConcurrent: number;
  meterSubscriptions: number;
}

async function open(page: Page, seed: ProgramMonitorSeed): Promise<void> {
  const pcm = Buffer.alloc(2400 * 4);
  for (let offset = 0; offset < pcm.byteLength; offset += 4) {
    pcm.writeInt16LE(8192, offset);
    pcm.writeInt16LE(-16384, offset + 2);
  }
  await page.addInitScript(
    ({ value, header, chunk }) => {
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
      if (value.topology === undefined && value.removableBackup !== true) return;
      if (value.topology !== undefined) w.programmeTopology = value.topology;
      const playoutAddress = value.managedPlayoutAddress;
      if (playoutAddress !== undefined) {
        localStorage.setItem('cg.runtime.station.v1', JSON.stringify({ playoutAddress }));
      }
      w.programmeAudio = { active: [], events: [], maxConcurrent: 0, meterSubscriptions: 0 };
      // Interpose at the RuntimeBridge seam while the app installs its normal test adapter.
      Object.defineProperty(w, 'cg', {
        configurable: true,
        set(bridge: typeof window.cg) {
          if (value.removableBackup === true) {
            const storage = 'cg.test.programme-backup-config';
            let config: ConnectionConfig = (JSON.parse(
              localStorage.getItem(storage) ?? 'null',
            ) as ConnectionConfig | null) ?? {
              servers: {
                A: { host: '127.0.0.1', amcpPort: 1, oscPort: 0 },
                B: { host: '127.0.0.2', amcpPort: 2, oscPort: 0 },
              },
              strategy: 'mirror-sync',
              autoFailoverEnabled: false,
            };
            const backupChannels = bridge.backupChannels.state;
            const listeners = new Set<(state: BackupChannelsState) => void>();
            const state = async (): Promise<BackupChannelsState> =>
              config.servers.B === undefined ? { backup: null } : backupChannels();
            bridge.backupChannels.state = state;
            bridge.backupChannels.onChanged = (handler) => {
              listeners.add(handler);
              return () => listeners.delete(handler);
            };
            bridge.connections.config = () => Promise.resolve(config);
            bridge.connections.health = () =>
              Promise.resolve({
                primary: { label: 'A', state: 'healthy', amcpAxisOk: true },
                ...(config.servers.B !== undefined && {
                  backup: { label: 'B' as const, state: 'healthy' as const, amcpAxisOk: true },
                }),
                currentPrimary: 'A',
                strategy: config.strategy,
              });
            const setConfig = bridge.connections.setConfig;
            bridge.connections.setConfig = async (next) => {
              const result = await setConfig(next);
              if (result.ok) {
                config = next;
                localStorage.setItem(storage, JSON.stringify(config));
                const snapshot = await state();
                for (const handler of listeners) handler(snapshot);
              }
              return result;
            };
          }
          if (playoutAddress !== undefined) {
            bridge.auth.capabilities = () => ({
              mode: 'playout',
              signInUrl: 'http://127.0.0.1:8080/api/v1/auth/sign-in',
              refreshUrl: null,
              contractVersion: null,
              setupPhase: null,
            });
          }
          bridge.pgmReturn.topology = (channel) =>
            Promise.resolve(
              value.topology !== undefined && w.programmeTopology.channel === channel
                ? w.programmeTopology
                : null,
            );
          if (value.feedAddresses !== undefined) {
            bridge.pgmReturn.feedUrl = (_channel, engine = 'A') => {
              const address = value.feedAddresses?.[engine];
              return Promise.resolve(address === undefined ? null : `${address}/1`);
            };
          }
          bridge.pgmReturn.audioUrl = (_channel, engine = 'A', resourceKey) =>
            Promise.resolve(
              value.feedAddresses?.[engine] !== undefined
                ? `${value.feedAddresses[engine]}/sound`
                : '/pgm-topology-test-audio/' + engine + '/' + (resourceKey ?? 'unbound'),
            );
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
                controller.enqueue(Uint8Array.from(header));
                const timer = window.setInterval(
                  () => controller.enqueue(Uint8Array.from(chunk)),
                  50,
                );
                init?.signal?.addEventListener(
                  'abort',
                  () => {
                    window.clearInterval(timer);
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
    },
    {
      value: seed,
      header: [...wavHeader()],
      chunk: [...pcm],
    },
  );
  await page.goto('/');
  const show = page.getByRole('button', { name: 'Show monitors' });
  await show.click();
}

for (const display of ['B', 'both'] as const) {
  test(`Remove backup removes the legacy B connection and active ${display} return without Apply servers`, async ({
    page,
  }) => {
    await open(page, {
      removableBackup: true,
      backupChannel: 2,
      statuses: [
        { engine: 'A', channel: 1, state: 'live' },
        { engine: 'B', channel: 1, state: 'live' },
      ],
    });
    // The normal mock seeds an on-air graphic. Keep programme streams active with its CG stack off air.
    await page.evaluate(async () => {
      await window.cg.stack.clearAll();
    });
    await page.getByRole('button', { name: display === 'both' ? 'A+B' : 'B', exact: true }).click();
    await expect(page.locator('[data-pgm-screen="B"]')).toBeVisible();
    const source = page.getByLabel('Programme sound source');
    await source.selectOption('B');
    await page.getByRole('button', { name: 'Programme sound', exact: true }).click();
    const active = () =>
      page.evaluate(
        () =>
          (window as unknown as { programmeAudio: TestProgrammeAudioState }).programmeAudio.active,
      );
    await expect.poll(active).toContain('B/unbound');
    await page.getByRole('button', { name: 'Open Station setup', exact: true }).click();
    const settings = page.getByRole('dialog', { name: 'Station setup', exact: true });
    await settings.getByRole('tab', { name: 'Connection' }).click();
    await expect(
      settings.getByRole('button', { name: 'Remove backup', exact: true }),
    ).toBeEnabled();
    await settings.getByRole('button', { name: 'Remove backup', exact: true }).click();
    await expect(settings.getByText('Backup connection removed.', { exact: true })).toBeVisible();
    expect(
      await page.evaluate(async () => (await window.cg.connections.config()).servers.B),
    ).toBeUndefined();
    await expect(page.locator('[data-pgm-screen="B"]')).toHaveCount(0);
    await expect.poll(active).not.toContain('B/unbound');
    await settings.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.locator('[data-pgm-screen="A"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'B', exact: true })).toHaveCount(0);
    await expect(source.locator('option[value="B"]')).toHaveCount(0);
    await page.reload();
    const show = page.getByRole('button', { name: 'Show monitors' });
    if (await show.count()) await show.click();
    expect(
      await page.evaluate(async () => (await window.cg.connections.config()).servers.B),
    ).toBeUndefined();
    await expect(page.locator('[data-pgm-screen="B"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'B', exact: true })).toHaveCount(0);
    await expect(
      page.getByLabel('Programme sound source').locator('option[value="B"]'),
    ).toHaveCount(0);
  });
}

for (const display of ['B', 'both'] as const) {
  test(`Remove backup selects A locally with managed ${display} returns and releases B viewers`, async ({
    page,
  }) => {
    // Browser clients consume Bridge's extensionless sound route. Keep the same real PCM stream
    // without a .wav download URL that host download managers may intercept before fetch sees it.
    const primary = await startFakePgmFeed({ fps: 10, audioPath: '/sound' });
    const backup = await startFakePgmFeed({ fps: 10, audioPath: '/sound' });
    try {
      await open(page, {
        removableBackup: true,
        backupChannel: 2,
        managedPlayoutAddress: 'http://192.0.2.32:8080',
        feedAddresses: {
          A: `http://127.0.0.1:${primary.port}`,
          B: `http://127.0.0.1:${backup.port}`,
        },
        topology: {
          channel: 1,
          active: 'B',
          members: [
            { engine: 'A', name: 'Main', physicalChannel: 1, resourceKey: 'main-1' },
            { engine: 'B', name: 'Reserve', physicalChannel: 2, resourceKey: 'reserve-2' },
          ],
        },
        statuses: [
          { engine: 'A', channel: 1, resourceKey: 'main-1', state: 'live' },
          { engine: 'B', channel: 1, resourceKey: 'reserve-2', state: 'live' },
        ],
      });
      await page.evaluate(async () => {
        await window.cg.stack.clearAll();
      });
      await page
        .getByRole('button', { name: display === 'both' ? 'All' : 'B', exact: true })
        .click();
      await expect.poll(() => backup.openCount()).toBe(1);
      const source = page.getByLabel('Programme sound source');
      await source.selectOption('B');
      await page.getByRole('button', { name: 'Programme sound', exact: true }).click();
      const meters = page.getByRole('button', { name: 'All programme meters', exact: true });
      await meters.click();
      await expect(meters).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(() => backup.audioOpenCount()).toBeGreaterThan(0);
      await page.getByRole('button', { name: 'Open Station setup', exact: true }).click();
      const settings = page.getByRole('dialog', { name: 'Station setup', exact: true });
      await settings.getByRole('tab', { name: 'Connection' }).click();
      await settings.getByRole('button', { name: 'Remove backup', exact: true }).click();
      await expect(settings.getByText('Backup connection removed.', { exact: true })).toBeVisible();
      expect(
        await page.evaluate(async () => (await window.cg.connections.config()).servers.B),
      ).toBeUndefined();
      await expect.poll(() => backup.openCount()).toBe(0);
      await expect.poll(() => backup.audioOpenCount()).toBe(0);
      await settings.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(page.locator('[data-pgm-screen="A"]')).toBeVisible();
      await expect(page.locator('[data-pgm-screen="B"]')).toHaveCount(0);
      await expect(source).toHaveValue('A');
      await expect(meters).toHaveAttribute('aria-pressed', 'false');
      await expect(page.getByRole('button', { name: 'B', exact: true })).toBeVisible();
      expect(await page.evaluate(() => window.cg.pgmReturn.topology?.(1))).toMatchObject({
        active: 'B',
        members: [{ engine: 'A' }, { engine: 'B' }],
      });
      expect(
        await page.evaluate(() =>
          JSON.parse(localStorage.getItem('cg.runtime.pgm-monitor.v1') ?? '{}'),
        ),
      ).toMatchObject({ display: 'A', audio: 'A', meterMode: 'selected' });
      const pictureReads = backup.connections.length;
      const audioReads = backup.audioConnections.length;
      await page.reload();
      const show = page.getByRole('button', { name: 'Show monitors' });
      if (await show.count()) await show.click();
      await expect(page.locator('[data-pgm-screen="A"]')).toBeVisible();
      await expect.poll(() => primary.openCount()).toBe(1);
      await expect(page.locator('[data-pgm-screen="B"]')).toHaveCount(0);
      await expect(page.getByLabel('Programme sound source')).toHaveValue('A');
      expect(
        await page.evaluate(async () => (await window.cg.connections.config()).servers.B),
      ).toBeUndefined();
      expect(backup.openCount()).toBe(0);
      expect(backup.audioOpenCount()).toBe(0);
      expect(backup.connections.length).toBe(pictureReads);
      expect(backup.audioConnections.length).toBe(audioReads);
    } finally {
      await primary.stop();
      await backup.stop();
    }
  });
}

test('A shows the configured Playout hostname when discovery reports a loopback address', async ({
  page,
}) => {
  await open(page, {
    backupChannel: 2,
    managedPlayoutAddress: 'http://192.168.21.32:8080',
    topology: {
      channel: 1,
      members: [
        {
          engine: 'A',
          name: 'Apasai Server (127.0.0.1)',
          physicalChannel: 1,
          resourceKey: 'primary-1',
        },
        {
          engine: 'B',
          name: 'Apasai Server (192.168.21.43)',
          physicalChannel: 2,
          resourceKey: 'reserve-2',
        },
      ],
      active: 'B',
    },
  });

  await page.getByRole('button', { name: 'All', exact: true }).click();
  await expect(page.locator('[data-pgm-screen="A"]')).toContainText(
    'Apasai Server (192.168.21.32)',
  );
  const backup = page.locator('[data-pgm-screen="B"]');
  await expect(backup).toContainText('Apasai Server (192.168.21.43)');
  await expect(backup).toHaveAttribute('data-pgm-active', '');
});

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
  const vu = page.locator('[data-vu-meter]');
  await expect(soundSource).toHaveValue('follow');
  await expect(vu).toHaveCount(1);
  await expect(vu).toHaveAttribute('data-vu-engine', 'B');
  await expect(vu.locator('[data-vu-bar="1"] .cg-vu__fill')).toHaveCSS(
    'clip-path',
    'inset(20% 0px 0px)',
  );
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

  await soundSource.selectOption('B');
  await expect(vu).toHaveAttribute('data-vu-engine', 'B');
  await expect(vu.locator('[data-vu-bar="1"] .cg-vu__fill')).toHaveCSS(
    'clip-path',
    'inset(20% 0px 0px)',
  );
  const meterButton = page.getByRole('button', { name: 'VU meter', exact: true });
  await expect(meterButton).toHaveAttribute('aria-pressed', 'true');
  await meterButton.click();
  await expect(vu).toHaveCount(0);
  await expect(page.locator('[data-loudness-badge]')).toHaveText('−23.1 LUFS');
  await page.reload();
  await page.getByRole('button', { name: 'Show monitors' }).click();
  await expect(meterButton).toHaveAttribute('aria-pressed', 'false');
  await expect(vu).toHaveCount(0);
  await expect(soundSource).toHaveValue('B');
  await meterButton.click();
  await expect(vu).toHaveAttribute('data-vu-engine', 'B');
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
  await page.getByLabel('Programme sound source').selectOption('B');
  const vu = page.getByRole('img', { name: 'Programme level unavailable, dBFS' });
  await expect(vu).toBeVisible();
  await expect(vu).toHaveAttribute('data-vu-engine', 'B');
  await expect(vu.locator('[data-vu-bar="1"] .cg-vu__fill')).toHaveCSS(
    'clip-path',
    'inset(100% 0px 0px)',
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
  const outlinedEngines = () =>
    tiles.evaluateAll((screens) =>
      screens.flatMap((screen) => {
        const outline = getComputedStyle(screen, '::after');
        return outline.borderTopStyle === 'solid' && Number.parseFloat(outline.borderTopWidth) > 0
          ? [screen.getAttribute('data-pgm-screen')]
          : [];
      }),
    );
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
  await expect.poll(outlinedEngines).toEqual(['C']);

  const sound = page.getByRole('button', { name: 'Programme sound', exact: true });
  const audioSource = page.getByLabel('Programme sound source');
  const audio = () =>
    page.evaluate(
      () => (window as unknown as { programmeAudio: TestProgrammeAudioState }).programmeAudio,
    );
  const vu = page.locator('[data-vu-meter]');
  const loudness = page.locator('[data-loudness-badge]');
  await expect.poll(async () => (await audio()).active).toEqual(['C/east-3']);
  await expect(vu).toHaveAttribute('data-vu-engine', 'C');
  await expect(vu).toHaveAttribute('data-vu-source', 'stereo');
  await sound.click();
  await expect(sound).toHaveAttribute('data-pgm-audio', 'playing');
  expect((await audio()).active).toEqual(['C/east-3']);
  await expect(loudness).toHaveCount(0);
  expect((await audio()).meterSubscriptions).toBe(0);
  await page.evaluate(() => {
    const state = window as unknown as { programmeTopology: PgmTopology };
    state.programmeTopology = { ...state.programmeTopology, active: 'D' };
  });
  await expect.poll(async () => (await audio()).active, { timeout: 10_000 }).toEqual(['D/south-4']);
  await expect(page.locator('[data-pgm-screen="D"]')).toHaveAttribute('data-pgm-active', '');
  await expect.poll(outlinedEngines).toEqual(['D']);
  await audioSource.selectOption('A');
  await expect.poll(async () => (await audio()).active).toEqual(['A/main-1']);
  await expect(vu).toHaveAttribute('data-vu-engine', 'A');
  await expect(vu).toHaveAttribute('data-vu-source', 'stereo');
  expect((await audio()).meterSubscriptions).toBe(0);
  await audioSource.selectOption('B');
  await expect.poll(async () => (await audio()).active).toEqual(['B/west-2']);
  await expect(vu).toHaveCount(1);
  await expect(vu).toHaveAttribute('data-vu-engine', 'A');
  await expect(vu).toHaveAttribute('data-vu-source', 'playout');
  await expect(vu.locator('[data-vu-bar="1"] .cg-vu__fill')).toHaveCSS(
    'clip-path',
    'inset(20% 0px 0px)',
  );
  await expect(loudness).toHaveText('−23.1 LUFS');
  const toggleMeter = page.getByRole('button', { name: 'VU meter', exact: true });
  await toggleMeter.click();
  await expect(vu).toHaveCount(0);
  expect((await audio()).active).toEqual(['B/west-2']);
  await expect(loudness).toHaveText('−23.1 LUFS');
  await toggleMeter.click();
  await expect(vu).toHaveAttribute('data-vu-engine', 'A');
  await audioSource.selectOption('D');
  await expect.poll(async () => (await audio()).active).toEqual(['D/south-4']);
  await expect(vu).toHaveAttribute('data-vu-engine', 'D');
  await expect(vu).toHaveAttribute('data-vu-source', 'stereo');
  await expect(loudness).toHaveCount(0);
  await page.evaluate(() => {
    const state = window as unknown as { programmeTopology: PgmTopology };
    state.programmeTopology = { ...state.programmeTopology, active: null };
  });
  await expect(page.locator('[data-pgm-active]')).toHaveCount(0, { timeout: 10_000 });
  await expect.poll(outlinedEngines).toEqual([]);
  expect((await audio()).active).toEqual(['D/south-4']);
  await audioSource.selectOption('follow');
  await expect.poll(async () => (await audio()).active).toEqual([]);
  await expect(vu).toBeVisible();
  await expect(vu).toHaveAttribute('data-vu-source', 'unavailable');
  await expect(vu).not.toHaveAttribute('data-vu-engine', /.+/);
  await expect(vu.getByText('dBFS', { exact: true })).toBeVisible();
  await expect(vu.locator('[data-vu-bar="1"] .cg-vu__fill')).toHaveCSS(
    'clip-path',
    'inset(100% 0px 0px)',
  );
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

test('Follow and explicit B show its stereo peaks without a separate meter session or speaker', async ({
  page,
}) => {
  await open(page, {
    backupChannel: null,
    topology: {
      channel: 1,
      active: 'B',
      members: [
        { engine: 'A', name: 'Main', physicalChannel: 1, resourceKey: 'main', meterEngine: 'A' },
        { engine: 'B', name: 'Reserve', physicalChannel: 2, resourceKey: 'reserve' },
      ],
    },
    readings: [{ kind: 'audio', engine: 'A', channel: 1, dbfs: [0, 0] }],
  });
  const vu = page.locator('[data-vu-meter]');
  const sound = page.getByRole('button', { name: 'Programme sound', exact: true });
  const source = page.getByLabel('Programme sound source');
  const meter = page.getByRole('button', { name: 'VU meter', exact: true });
  const audio = () =>
    page.evaluate(
      () => (window as unknown as { programmeAudio: TestProgrammeAudioState }).programmeAudio,
    );
  await page.getByRole('button', { name: 'B', exact: true }).click();
  await expect(source).toHaveValue('follow');
  await expect(sound).toHaveAttribute('aria-pressed', 'false');
  await expect(vu).toHaveAttribute('data-vu-engine', 'B');
  await expect(vu).toHaveAttribute('data-vu-source', 'stereo');
  await expect(vu.locator('[data-vu-bar]')).toHaveCount(2);
  await expect(vu.locator('[data-vu-bar="1"] .cg-vu__fill')).toHaveCSS(
    'clip-path',
    'inset(20.07% 0px 0px)',
  );
  await expect(vu.locator('[data-vu-bar="2"] .cg-vu__fill')).toHaveCSS(
    'clip-path',
    'inset(10.03% 0px 0px)',
  );
  await expect(page.locator('[data-loudness-badge]')).toHaveCount(0);
  await source.selectOption('B');
  await sound.click();
  await expect(sound).toHaveAttribute('data-pgm-audio', 'playing');
  await sound.click();
  await expect(sound).toHaveAttribute('data-pgm-audio', 'off');
  expect(await audio()).toMatchObject({
    active: ['B/reserve'],
    events: ['start B/reserve'],
    meterSubscriptions: 0,
  });
  await meter.click();
  await expect(vu).toHaveCount(0);
  await expect.poll(async () => (await audio()).active).toEqual([]);
  await meter.click();
  await expect(vu).toHaveAttribute('data-vu-engine', 'B');
  await expect.poll(async () => (await audio()).active).toEqual(['B/reserve']);
  expect((await audio()).maxConcurrent).toBe(1);
});

test('compact meters show all four engines with independent programme sound', async ({ page }) => {
  await open(page, {
    backupChannel: null,
    topology: {
      channel: 1,
      active: 'C',
      members: [
        { engine: 'A', name: 'Main', physicalChannel: 1, resourceKey: 'main', meterEngine: 'A' },
        {
          engine: 'B',
          name: 'Reserve',
          physicalChannel: 2,
          resourceKey: 'reserve',
          meterEngine: 'B',
        },
        { engine: 'C', name: 'East', physicalChannel: 3, resourceKey: 'east' },
        { engine: 'D', name: 'South', physicalChannel: 4, resourceKey: 'south' },
      ],
    },
    readings: [
      { kind: 'audio', engine: 'A', channel: 1, dbfs: [-30, -30, -60, -60, -60, -12] },
      { kind: 'audio', engine: 'B', channel: 1, dbfs: [-12, -9] },
    ],
  });
  const activeStreams = () =>
    page.evaluate(() =>
      [
        ...(window as unknown as { programmeAudio: TestProgrammeAudioState }).programmeAudio.active,
      ].sort(),
    );
  const sound = page.getByRole('button', { name: 'Programme sound', exact: true });
  const all = page.getByRole('button', { name: 'All programme meters', exact: true });
  const allPictures = page.getByRole('button', { name: 'All', exact: true });
  const show = page.getByRole('button', { name: 'VU meter', exact: true });
  const bank = page.getByRole('group', { name: 'Programme meters', exact: true });
  const vu = page.locator('[data-vu-meter]');
  await expect(vu).toHaveAttribute('data-vu-source', 'unavailable');
  await expect.poll(activeStreams).toEqual([]);
  await allPictures.click();
  await expect(vu).toHaveCount(1);
  await expect.poll(activeStreams).toEqual(['C/east']);
  expect((await vu.boundingBox())?.width).toBeLessThan(50);
  await all.click();
  await expect(bank).toBeVisible();
  await expect(vu).toHaveCount(4);
  for (const [engine, name, clip] of [
    ['A', 'Main', 'inset(50% 0px 0px)'],
    ['B', 'Reserve', 'inset(20% 0px 0px)'],
    ['C', 'East', 'inset(20.07% 0px 0px)'],
    ['D', 'South', 'inset(20.07% 0px 0px)'],
  ] as const) {
    const tile = bank.locator(`[data-pgm-tile="${engine}"]`);
    const meter = tile.locator(`[data-vu-engine="${engine}"]`);
    await expect(meter).toHaveAttribute('aria-label', new RegExp(name));
    await expect(meter.locator('[data-vu-bar="1"] .cg-vu__fill')).toHaveCSS('clip-path', clip);
    await expect(meter.locator('[data-vu-bar]').filter({ visible: true })).toHaveCount(
      engine === 'A' ? 6 : 2,
    );
    await expect(meter.getByText('−60', { exact: true })).toBeVisible();
    const picture = await tile.locator('[data-pgm-screen]').boundingBox();
    const bounds = await meter.boundingBox();
    if (picture === null || bounds === null) throw new Error(`Missing PGM tile ${engine}`);
    expect(bounds.width).toBeLessThan(50);
    expect(bounds.x).toBeCloseTo(picture.x + picture.width, 0);
    expect(bounds.y).toBeCloseTo(picture.y, 0);
    expect(bounds.height).toBeCloseTo(picture.height, 0);
  }
  await expect(bank.locator('[data-pgm-tile="A"] [data-vu-bar="6"] .cg-vu__fill')).toHaveCSS(
    'clip-path',
    'inset(20% 0px 0px)',
  );
  await expect.poll(activeStreams).toEqual(['C/east', 'D/south']);
  await expect(sound).toHaveAttribute('aria-pressed', 'false');
  await page.getByLabel('Programme sound source').selectOption('B');
  await sound.click();
  await expect(sound).toHaveAttribute('data-pgm-audio', 'playing');
  await expect.poll(activeStreams).toEqual(['B/reserve', 'C/east', 'D/south']);
  await expect(vu).toHaveCount(4);
  await page.getByRole('button', { name: 'D', exact: true }).click();
  await expect(vu).toHaveCount(1);
  await expect(vu).toHaveAttribute('data-vu-engine', 'D');
  await expect.poll(activeStreams).toEqual(['B/reserve', 'D/south']);
  await show.click();
  await expect(vu).toHaveCount(0);
  await expect.poll(activeStreams).toEqual(['B/reserve']);
  await page.reload();
  await page.getByRole('button', { name: 'Show monitors' }).click();
  await expect(all).toHaveAttribute('aria-pressed', 'true');
  await expect(show).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByLabel('Programme sound source')).toHaveValue('B');
  await allPictures.click();
  await show.click();
  await expect(vu).toHaveCount(4);
  await all.click();
  await expect(vu).toHaveCount(1);
  await expect(vu).toHaveAttribute('data-vu-engine', 'B');
  await page.getByRole('button', { name: 'D', exact: true }).click();
  const visibleMeter = page.locator('[data-pgm-tile="D"] [data-vu-meter]');
  await expect(visibleMeter).toHaveAttribute('data-vu-engine', 'D');
  await expect(visibleMeter).toHaveAttribute('data-vu-source', 'unavailable');
  await expect(page.getByLabel('Programme sound source')).toHaveValue('B');
});
