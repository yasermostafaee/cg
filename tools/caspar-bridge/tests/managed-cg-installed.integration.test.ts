import { mkdtempSync, rmSync } from 'node:fs';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMock } from '@cg/amcp-mock';
import { defaultFixedLayerBank, type ConnectionConfig } from '@cg/shared-ipc';
import { CG_MANAGED_STATIC_RESUME_PAGE_MARKER } from '@cg/shared-schema';
import { afterEach, expect, it, vi } from 'vitest';
import { createBridge, type BridgeHandle, type BridgeOptions } from '../src/bridge.js';
import { loadPersistedStack, savePersistedStack } from '../src/stack-store.js';
import { openClient } from './support/auth-harness.js';
import { FAKE_ADMIN, startFakePlayout, type FakePlayout } from './support/fake-playout.js';
import { availabilityPair } from './support/managed-availability-pair.js';
import { managedTestGroupId as groupId } from './support/managed-playout-pair.js';

const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

/** Give an Engine's real fixture authentication and managed fixture routes one HTTP origin. */
async function engineGateway(
  playout: FakePlayout,
  member: { readonly origin: string; readonly engineId: string },
  advertised: ReadonlyMap<string, string>,
): Promise<string> {
  const serve = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const resource = req.url ?? '/';
    const managed = resource.startsWith('/api/v2/channels/') && resource.includes('/external-cg/');
    const target = new URL(resource, managed ? member.origin : playout.baseUrl);
    const headers = { ...req.headers, host: target.host };
    if (managed && req.headers.authorization !== undefined) {
      // The member's own fixture checks the JWT against its key and account before delegation.
      const principal = await fetch(playout.meUrl, {
        headers: { Authorization: req.headers.authorization },
        signal: AbortSignal.timeout(3_000),
      });
      const body = (await principal.json()) as { roles?: string[] };
      if (!principal.ok || !body.roles?.includes('operator')) {
        res
          .writeHead(401, { 'content-type': 'application/json' })
          .end('{"error":"cg.invalidToken"}');
        return;
      }
      headers.authorization = 'Bearer token-' + member.engineId;
    }
    const upstream = await new Promise<IncomingMessage>((resolve, reject) => {
      const forward = http.request(target, { method: req.method, headers }, resolve);
      forward.once('error', reject);
      res.once('close', () => forward.destroy());
      req.pipe(forward);
    });
    if (managed && resource.endsWith('/owner') && upstream.statusCode === 200) {
      const chunks: Buffer[] = [];
      for await (const chunk of upstream) chunks.push(Buffer.from(chunk as Uint8Array));
      const body = JSON.parse(Buffer.concat(chunks).toString()) as {
        members: { engineId: string; apiOrigin: string }[];
      };
      for (const listed of body.members) {
        const origin = advertised.get(listed.engineId);
        if (origin === undefined) throw new Error('Missing fixture Engine gateway.');
        listed.apiOrigin = origin;
      }
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body));
      return;
    }
    res.writeHead(upstream.statusCode ?? 502, upstream.headers);
    upstream.pipe(res);
  };
  const server = http.createServer((req, res) => {
    void serve(req, res).catch(() => res.destroy());
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  cleanup.push(
    () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  );
  return 'http://127.0.0.1:' + String((server.address() as AddressInfo).port);
}

async function openInstalledBridge(options: BridgeOptions): Promise<{
  bridge: BridgeHandle;
  close: () => Promise<void>;
}> {
  const bridge = await createBridge(options);
  let open = true;
  const close = async () => {
    if (!open) return;
    open = false;
    await bridge.close();
  };
  cleanup.push(close);
  return { bridge, close };
}

it('uses the installed service sessions and recovers the applied row after a restart', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'cg-installed-availability-'));
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
  const pair = await availabilityPair(cleanup);
  const [memberA, memberB] = pair.members;
  if (memberA === undefined || memberB === undefined) throw new Error('Missing fixture members.');
  const passwordA = 'fixture-only-engine-a';
  const passwordB = 'fixture-only-engine-b';
  const playoutA = await startFakePlayout({
    password: passwordA,
    verifyBearers: true,
    grants: { admin: '*' },
  });
  cleanup.push(() => playoutA.stop());
  const playoutB = await startFakePlayout({ password: passwordB, verifyBearers: true });
  cleanup.push(() => playoutB.stop());
  const origins = new Map<string, string>();
  const originA = await engineGateway(playoutA, memberA, origins);
  origins.set(memberA.engineId, originA);
  const originB = await engineGateway(playoutB, memberB, origins);
  origins.set(memberB.engineId, originB);
  const coreA = await createMock({ amcpPort: 0 });
  cleanup.push(() => coreA.stop());
  const coreB = await createMock({ amcpPort: 0, channels: 2 });
  cleanup.push(() => coreB.stop());
  const connection: ConnectionConfig = {
    servers: {
      A: { host: '127.0.0.1', amcpPort: coreA.amcpPort, oscPort: 0 },
      B: { host: '127.0.0.1', amcpPort: coreB.amcpPort, oscPort: 0 },
    },
    strategy: 'mirror-sync',
    autoFailoverEnabled: false,
  };
  const bank = defaultFixedLayerBank();
  const stackPath = join(directory, 'bridge-stack.json');
  const options: BridgeOptions = {
    port: 0,
    requireAuth: true,
    connection,
    fixedLayers: { ...bank, visibility: { ...bank.visibility, 81: true } },
    playout: { auth: 'playout', address: originA, issuer: playoutA.issuer },
    backupPlayoutAddress: originB,
    bridgeSessionPath: join(directory, 'bridge-session.json'),
    templatesDir: join(directory, 'templates'),
    stackPath,
    managedCgService: {
      groupId,
      channel: 1,
      members: [
        {
          origin: originA,
          engineId: memberA.engineId,
          channelCode: memberA.channelCode,
          nativeChannel: memberA.nativeChannel,
        },
        {
          origin: originB,
          engineId: memberB.engineId,
          channelCode: memberB.channelCode,
          nativeChannel: memberB.nativeChannel,
        },
      ],
    },
  };
  let requestId = 0;
  const id = () => 'installed-' + String(++requestId);
  const authenticate = async (bridge: BridgeHandle) => {
    const client = await openClient(bridge);
    expect(
      (await client.authenticate(id(), (await playoutA.issueToken({ user: 'admin' })).token)).error,
    ).toBeUndefined();
    return client;
  };
  const installed = await openInstalledBridge(options);
  const templateId = 'installed-caption';
  const itemId = 'installed-row';
  expect(
    installed.bridge.runtime.templateImport(
      { templateId, templateType: 'lower-third', name: 'Caption', fields: [] },
      '<!doctype html><html><head>' + CG_MANAGED_STATIC_RESUME_PAGE_MARKER + '</head></html>',
      1,
    ).registered,
  ).toBe(true);
  const client = await authenticate(installed.bridge);
  expect((await client.ask(id(), 'connections.health')).payload).toMatchObject({
    managedCgChannel: 1,
  });
  expect(
    (
      await client.ask(id(), 'fixedLayers.load', {
        channel: 1,
        layer: 81,
        itemId,
        templateId,
        fields: { title: 'Original' },
      })
    ).payload,
  ).toEqual({ accepted: true });
  expect((await client.ask(id(), 'stack.take', { itemId })).payload).toMatchObject({
    accepted: false,
  });
  expect(pair.posts).toEqual([]);

  for (const [route, password] of [
    ['bridgeSession.sign-in', passwordA],
    ['bridgeSession.backup.sign-in', passwordB],
  ] as const) {
    expect(
      (await client.ask(id(), route, { username: FAKE_ADMIN.username, password })).payload,
    ).toMatchObject({ ok: true });
  }
  expect((await client.ask(id(), 'bridgeSession.engines')).payload).toMatchObject({
    primary: { state: 'signed-in' },
    backup: { state: 'signed-in' },
  });
  expect([playoutA.requestCounts.token, playoutB.requestCounts.token]).toEqual([1, 1]);
  expect((await client.ask(id(), 'connections.set-config', connection)).payload).toMatchObject({
    ok: false,
  });
  expect(
    (await client.ask(id(), 'fixedLayers.set-banks', { banks: [bank, { ...bank, channel: 2 }] }))
      .payload,
  ).toMatchObject({ ok: false });

  await vi.waitFor(async () => {
    expect((await client.ask(id(), 'stack.take', { itemId })).payload).toMatchObject({
      accepted: true,
    });
  });
  pair.transferCheckpoint('A', 'B');
  pair.disconnect('A');
  expect(
    (
      await client.ask(id(), 'stack.update', {
        itemId,
        fields: { title: 'عنوان تازه' },
        mergeMode: 'merge',
      })
    ).payload,
  ).toMatchObject({ accepted: true });
  expect(pair.posts.map(({ engine, command }) => [engine, command.sequence])).toEqual([
    ['A', 1],
    ['B', 2],
  ]);
  expect(pair.snapshot('B').layers).toMatchObject([
    { layer: 81, visibility: 'shown', data: { title: 'عنوان تازه' } },
  ]);

  await installed.close();
  const retained = loadPersistedStack(stackPath).items;
  expect(retained).toMatchObject([{ itemId, fields: { title: 'عنوان تازه' } }]);
  savePersistedStack(
    stackPath,
    retained.map((row) => ({ ...row, fields: { title: 'Older disk values' } })),
  );
  const beforeRestart = pair.requests.length;
  const reopened = await openInstalledBridge(options);
  const observer = await authenticate(reopened.bridge);
  await vi.waitFor(
    async () => {
      expect((await observer.ask(id(), 'stack.snapshot', { channel: 1 })).payload).toMatchObject([
        { itemId, fields: { title: 'عنوان تازه' }, status: 'playing' },
      ]);
    },
    { timeout: 5_000 },
  );
  expect(playoutA.requestCounts.refresh).toBeGreaterThanOrEqual(1);
  expect(playoutB.requestCounts.refresh).toBeGreaterThanOrEqual(1);
  expect(pair.requests.slice(beforeRestart)).toContainEqual({
    engine: 'B',
    method: 'GET',
    route: 'state',
  });
  expect(pair.posts).toHaveLength(2);
  for (const core of [coreA, coreB]) {
    const lines = core.receivedCommands().map(({ line }) => line);
    expect(lines).toContain('VERSION');
    expect(lines.filter((line) => !/^(?:VERSION|INFO|OSC SUBSCRIBE)\b/i.test(line))).toEqual([]);
  }
  pair.assertFixtureHealthy();
}, 20_000);
