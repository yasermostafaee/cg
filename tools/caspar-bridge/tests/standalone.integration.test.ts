import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createMock } from '@cg/amcp-mock';
import {
  AUTH_REQUIRED_REFUSAL,
  channelNotDeclaredRefusal,
  defaultFixedLayerBank,
  type ConnectionConfig,
} from '@cg/shared-ipc';
import { expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { createBridge } from '../src/bridge.js';
import { loadServiceConfig, serviceFlags, writeServiceConfig } from '../src/service-config.js';
import { deadConnection, openClient, startAuthedBridge } from './support/auth-harness.js';
import { HEALTH_MS, track } from './support/harness.js';

function freeOscPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    socket.once('error', reject);
    socket.bind(0, '127.0.0.1', () => {
      const { port } = socket.address();
      socket.close(() => resolve(port));
    });
  });
}

function upgrade(url: string, options: { origin?: string; headers?: Record<string, string> }) {
  return new Promise<void>((resolve, reject) => {
    const socket = new WebSocket(url, options);
    socket.once('error', reject);
    socket.once('open', () => {
      socket.close();
      resolve();
    });
  });
}

it('R-098 — serves only trusted local control and takes on raw CasparCG with no Playout', async () => {
  const oscPort = await freeOscPort();
  const core = track(
    await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40, channels: 2 }),
    (mock) => mock.stop(),
  );
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-standalone-'));
  const configPath = path.join(directory, 'cg-bridge.json');
  track(directory, (dir) => {
    fs.rmSync(configPath, { force: true });
    fs.rmdirSync(dir);
  });
  writeServiceConfig(configPath, { mode: 'standalone', amcpPort: core.amcpPort, oscPort });
  const config: ConnectionConfig = {
    servers: { A: { host: '127.0.0.1', amcpPort: core.amcpPort, oscPort } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: false,
  };
  const bridge = track(
    await createBridge({
      stationMode: 'standalone',
      standaloneServiceConfigPath: configPath,
      connection: config,
      port: 0,
      fixedLayersPath: path.join(directory, 'not-yet-created.json'),
      playoutConfigPath: directory, // An old unusable Playout config is not a standalone input.
    }),
    (handle) => handle.close(),
  );
  expect(new URL(bridge.url).hostname).toBe('127.0.0.1');
  await expect(upgrade(bridge.url, { origin: 'http://tauri.localhost' })).resolves.toBeUndefined();
  await expect(upgrade(bridge.url, { origin: 'https://example.invalid' })).rejects.toThrow(/401/);
  await expect(
    upgrade(bridge.url, { headers: { Host: `rebinding.invalid:${String(bridge.port)}` } }),
  ).rejects.toThrow(/401/);
  const healthUrl = bridge.url.replace(/^ws:/, 'http:') + '/health';
  expect((await fetch(healthUrl, { headers: { Origin: 'https://example.invalid' } })).status).toBe(
    403,
  );
  expect((await fetch(healthUrl)).status).toBe(200);

  await bridge.runtime.whenServerHealthy(HEALTH_MS);
  const client = await openClient(bridge);
  const caps = await client.ask('caps', 'bridge.capabilities', {});
  expect(caps.payload).toMatchObject({
    stationMode: 'standalone',
    auth: 'off',
    channels: expect.arrayContaining(['setup.check-standalone']),
  });
  expect(caps.payload).not.toHaveProperty('signInUrl');
  expect(caps.payload).not.toHaveProperty('setup');
  expect((await client.ask('grants', 'auth.state')).payload).toMatchObject({
    mode: 'off',
    principal: null,
    permittedChannels: [1],
  });
  expect((await client.ask('channels', 'channels.list')).payload).toMatchObject({
    channels: [{ channel: 1, declared: true, permitted: true }],
  });
  expect(await client.ask('check', 'setup.check-standalone', {})).toMatchObject({
    payload: { lines: [{ id: 'amcp', status: 'pass' }], localAddress: null },
  });
  expect(
    (await client.ask('probe', 'setup.check-standalone', { host: 'example.invalid' })).error,
  ).toBeDefined();
  expect(
    (
      await client.ask('playout-probe', 'setup.check', {
        playoutAddress: 'http://example.invalid:8080',
        origin: 'http://tauri.localhost',
      })
    ).error,
  ).toMatch(/standalone CasparCG/);

  for (const ports of [{ oscPort: 0 }, { oscPort: 65536 }, { amcpPort: 65536 }]) {
    const invalid = { ...config, servers: { A: { ...config.servers.A, ...ports } } };
    expect(await client.ask('invalid', 'connections.set-config', invalid)).toMatchObject({
      payload: { ok: false, reason: 'apply-failed' },
    });
  }
  expect(bridge.runtime.config()).toEqual(config);
  expect(loadServiceConfig(configPath).config).toMatchObject({ mode: 'standalone', oscPort });

  const nextOscPort = await freeOscPort();
  expect(nextOscPort).not.toBe(oscPort);
  const edited = {
    ...config,
    servers: { A: { ...config.servers.A, host: 'localhost', oscPort: nextOscPort } },
  };
  expect(await client.ask('edit', 'connections.set-config', edited)).toMatchObject({
    payload: { ok: true },
  });
  const stored = loadServiceConfig(configPath);
  expect(stored.config).toMatchObject({
    mode: 'standalone',
    amcpHost: 'localhost',
    amcpPort: core.amcpPort,
    oscPort: nextOscPort,
  });
  expect(serviceFlags(stored)).toMatchObject({
    'caspar-host': 'localhost',
    'amcp-port': String(core.amcpPort),
    'osc-port': String(nextOscPort),
  });
  await bridge.runtime.whenServerHealthy(HEALTH_MS);
  expect(bridge.runtime.config()).toEqual(edited);
  expect(core.receivedCommands().map(({ line }) => line)).toContain(
    `OSC SUBSCRIBE ${String(nextOscPort)}`,
  );
  bridge.runtime.templateImport(
    { templateId: 'local-template', templateType: 'lower-third', fields: [] },
    '<!doctype html><html><body>سلام</body></html>',
  );
  const row = {
    layer: defaultFixedLayerBank().start,
    itemId: 'local-row',
    templateId: 'local-template',
    fields: {},
  };
  expect((await client.ask('foreign', 'fixedLayers.load', { ...row, channel: 2 })).error).toBe(
    channelNotDeclaredRefusal(2),
  );
  expect(await client.ask('load', 'fixedLayers.load', { ...row, channel: 1 })).toMatchObject({
    payload: { accepted: true },
  });
  expect(await client.ask('take', 'stack.take', { itemId: row.itemId })).toMatchObject({
    payload: { accepted: true },
  });
  const wire = core.receivedCommands().map(({ line }) => line);
  expect(wire.some((line) => line.startsWith(`CG 1-${String(row.layer)} ADD `))).toBe(true);
  expect(wire.some((line) => /^CG 2-\d+\s/.test(line))).toBe(false);
}, 40_000);

it('R-098 — an explicit standalone service rejects network control before binding', async () => {
  await expect(
    createBridge({
      stationMode: 'standalone',
      host: '0.0.0.0',
      port: 0,
      connection: deadConnection(),
    }),
  ).rejects.toThrow(/requires local control/);
});

it('R-098 — an authenticated Playout service keeps its gate and has no standalone route', async () => {
  const { handle, playout } = await startAuthedBridge({ requireAuth: true });
  track(playout, (engine) => engine.stop());
  track(handle, (bridge) => bridge.close());
  const client = await openClient(handle);
  const caps = (await client.ask('caps', 'bridge.capabilities', {})).payload;
  expect(caps).toMatchObject({ auth: 'playout', signInUrl: playout.tokenUrl });
  expect(caps).not.toHaveProperty('stationMode');
  expect(caps).not.toMatchObject({ channels: expect.arrayContaining(['setup.check-standalone']) });
  expect((await client.ask('take', 'stack.take', { itemId: 'unsigned' })).error).toBe(
    AUTH_REQUIRED_REFUSAL,
  );
});
