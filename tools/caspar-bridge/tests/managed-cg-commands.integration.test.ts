import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { ManagedCgCommands } from '../src/managed-cg-commands.js';
import {
  managedLayoutCommandSchema,
  managedTemplateSchema,
  type ManagedFence,
  type ManagedLayoutCommand,
  type ManagedLayoutLayer,
  type ManagedResult,
} from '../src/managed-cg-contract.js';
import { ManagedCgJournal } from '../src/managed-cg-journal.js';

const groupId = 'isolated-cg';
const membershipHash = 'a'.repeat(64);
const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

const html: ManagedLayoutLayer = {
  kind: 'html',
  layer: 80,
  graphicInstanceId: 'title-1',
  template: {
    entryPath: 'index.html',
    version: 'test-v1',
    assets: [
      {
        path: 'index.html',
        uri: 'http://127.0.0.1/assets/index.html',
        sha256: 'b'.repeat(64),
        contentType: 'text/html',
      },
    ],
    resumeWithoutReplay: true,
  },
  data: { title: 'Test caption' },
  page: 0,
  visibility: 'shown',
  transform: {
    fill: { x: 0, y: 0, width: 1, height: 1 },
    crop: { x: 0, y: 0, width: 1, height: 1 },
  },
};

async function listen(handle: (req: IncomingMessage, res: ServerResponse) => Promise<void>) {
  const server = createServer((req, res) => {
    void handle(req, res).catch((error: unknown) => {
      res.writeHead(500);
      res.end(String(error));
    });
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
  return 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
}

type Engine = 'A' | 'B';

async function playoutPair() {
  const directory = mkdtempSync(join(tmpdir(), 'cg-managed-command-test-'));
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }));

  const config = {
    A: { engineId: 'A', channelCode: 'cg-a', nativeChannel: 1, origin: '' },
    B: { engineId: 'B', channelCode: 'cg-b', nativeChannel: 2, origin: '' },
  } as const;
  const origins: Record<Engine, string> = { A: '', B: '' };
  const posts: { engine: Engine; command: ManagedLayoutCommand }[] = [];
  const recoveries: Engine[] = [];
  const reads: Engine[] = [];
  const requests: string[] = [];
  const staged: Engine[] = [];
  let current: Engine = 'A';
  let term = 1;
  let transferId = randomUUID();
  let leaseId = randomUUID();
  let revision = 0;
  let conflicted = false;
  let failWriteReply = false;
  let differentBundle = false;
  let badWriteReply = false;
  let expired = false;
  let exposeReplicaReceipt = false;
  let hideOriginalReceipt = false;
  let durable: ManagedResult | undefined;

  const members = () =>
    Object.values(config).map(({ engineId, channelCode, nativeChannel }) => ({
      engineId,
      channelCode,
      nativeChannel,
      apiOrigin: origins[engineId],
      programmeLayer: 5,
      priority: nativeChannel,
      protectedLayers: [],
    }));
  const fence = (engine: Engine): ManagedFence => ({
    groupId,
    membershipRevision: 1,
    membershipHash,
    term,
    transferId,
    ownerEngineId: engine,
    localEpoch: engine === 'A' ? 17 : 2,
    coreGeneration: 'gen-' + engine,
    leaseId,
    futureFenceField: { value: 1 },
  });
  const answer = (res: ServerResponse, value: unknown, status = 200) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(value));
  };

  const serve = (engine: Engine) =>
    listen(async (req, res) => {
      const channel = config[engine];
      const prefix = '/api/v2/channels/' + channel.channelCode + '/external-cg/';
      const request = req.url ?? '';
      if (req.headers.authorization !== 'Bearer token-' + engine || !request.startsWith(prefix)) {
        answer(res, { error: 'invalid origin-scoped operator session' }, 403);
        return;
      }
      const route = request.slice(prefix.length);
      requests.push(engine + ':' + req.method + ':' + route);
      if (req.method === 'GET' && route === 'owner') {
        const leader = conflicted ? engine : current;
        answer(res, {
          groupId,
          membershipRevision: 1,
          membershipHash,
          status: 'active',
          owner: members().find(({ engineId }) => engineId === leader),
          fence: fence(leader),
          leaseExpiresAt: new Date(Date.now() + (expired ? -1_000 : 10_000)).toISOString(),
          canSendCommands: leader === engine,
          revision,
          members: members(),
          allowedLayers: [
            { first: 80, last: 89, kind: 'html' },
            { first: 60, last: 69, kind: 'live' },
          ],
          replicas: [],
          reason: null,
        });
        return;
      }
      if (req.method === 'POST' && route === 'templates:prepare') {
        let body = '';
        for await (const chunk of req) body += String(chunk);
        const template = managedTemplateSchema.parse(JSON.parse(body));
        staged.push(engine);
        answer(res, {
          engineId: engine,
          available: true,
          bundleHash: (differentBundle && engine === 'B' ? '9' : '8').repeat(64),
          version: template.version,
        });
        return;
      }
      if (req.method === 'POST' && route === 'commands') {
        let body = '';
        for await (const chunk of req) body += String(chunk);
        const command = managedLayoutCommandSchema.parse(JSON.parse(body));
        posts.push({ engine, command });
        const reserved = new ManagedCgJournal(directory).get(groupId);
        if (
          reserved?.commandId !== command.commandId ||
          reserved.requestBody !== body ||
          reserved.ownerOrigin !== origins[engine] ||
          engine !== current ||
          command.expectedRevision !== revision
        ) {
          answer(res, { error: 'missing durable reservation or stale owner' }, 409);
          return;
        }
        durable = {
          commandId: command.commandId,
          requestHash: createHash('sha256').update(body).digest('hex'),
          status: failWriteReply ? 'unresolved' : 'applied',
          admitted: true,
          nativeStatus: 'applied',
          renderStatus: 'htmlPaintConfirmed',
          revision: ++revision,
          target: command.target,
          fence: command.expectedFence,
          replicas: [],
          error: null,
          updatedAt: new Date().toISOString(),
        };
        if (failWriteReply) res.destroy();
        else if (badWriteReply) answer(res, { ...durable, revision: durable.revision + 1 });
        else answer(res, durable);
        return;
      }
      if (durable !== undefined && route === 'commands/' + durable.commandId) {
        reads.push(engine);
        if ((engine === 'A' && !hideOriginalReceipt) || (engine === 'B' && exposeReplicaReceipt)) {
          answer(res, durable);
        } else {
          answer(res, { error: 'cg.commandNotFound' }, 404);
        }
        return;
      }
      if (
        engine === 'A' &&
        durable !== undefined &&
        route === 'commands/' + durable.commandId + '/reconcile'
      ) {
        recoveries.push(engine);
        const rolledBack: ManagedResult = {
          ...durable,
          status: 'rolledBack',
          retainedState: { revision: 0, requestHash: 'c'.repeat(64) },
        };
        durable = rolledBack;
        answer(res, rolledBack);
        return;
      }
      answer(res, { error: 'unexpected request' }, 404);
    });

  origins.A = await serve('A');
  origins.B = await serve('B');
  const journal = () => new ManagedCgJournal(directory);
  const executor = () =>
    new ManagedCgCommands({
      groupId,
      journal: journal(),
      members: Object.values(config).map((member) => ({
        ...member,
        origin: origins[member.engineId],
        operatorBearer: () => 'token-' + member.engineId,
      })),
    });
  return {
    executor,
    journal,
    posts,
    recoveries,
    reads,
    requests,
    staged,
    fence,
    switchOwner() {
      current = 'B';
      term += 1;
      transferId = randomUUID();
      leaseId = randomUUID();
    },
    stageDifferentBundle() {
      differentBundle = true;
    },
    conflict() {
      conflicted = true;
    },
    expire() {
      expired = true;
    },
    loseResponse() {
      failWriteReply = true;
    },
    restoreResponse() {
      failWriteReply = false;
    },
    corruptResponse() {
      badWriteReply = true;
    },
    useReplicaEvidence() {
      exposeReplicaReceipt = true;
      hideOriginalReceipt = true;
    },
  };
}

it('sends the whole layout to the confirmed owner only and honours the new mapping after transfer', async () => {
  const pair = await playoutPair();
  const writer = pair.executor();

  expect(await writer.submitLayout([html])).toMatchObject({ status: 'applied' });
  expect(pair.posts).toEqual([
    {
      engine: 'A',
      command: expect.objectContaining({
        target: { engineId: 'A', channelCode: 'cg-a', nativeChannel: 1, layer: 60 },
        expectedFence: pair.fence('A'),
        expectedRevision: 0,
        operation: 'layout',
        layout: [html],
      }),
    },
  ]);
  expect(pair.requests).toContain('B:GET:owner');
  expect(pair.journal().get(groupId)).toBeUndefined();

  pair.switchOwner();
  expect(await writer.submitLayout([html])).toMatchObject({ status: 'applied' });
  expect(pair.posts.map(({ engine }) => engine)).toEqual(['A', 'B']);
  expect(pair.posts[1]?.command).toMatchObject({
    target: { engineId: 'B', channelCode: 'cg-b', nativeChannel: 2, layer: 60 },
    expectedFence: pair.fence('B'),
    expectedRevision: 1,
  });
  expect(pair.posts[1]?.command.commandId).not.toBe(pair.posts[0]?.command.commandId);
});

it.each(['conflict', 'expire'] as const)(
  'does not send a layout when the owner check reports %s',
  async (reason) => {
    const pair = await playoutPair();
    pair[reason]();
    await expect(pair.executor().submitLayout([html])).rejects.toThrow('unique managed CG owner');
    expect(pair.posts).toEqual([]);
    expect(pair.journal().get(groupId)).toBeUndefined();
  },
);

it('recovers the original receipt after an interrupted reply and never repeats the layout on B', async () => {
  const pair = await playoutPair();
  pair.loseResponse();
  const pending = await pair.executor().submitLayout([html]);
  const commandId = pair.posts[0]?.command.commandId;
  expect(pending).toEqual({ status: 'pending', commandId });
  expect(pair.journal().get(groupId)).toMatchObject({ commandId });

  pair.switchOwner();
  pair.restoreResponse();
  const restarted = pair.executor();
  expect(await restarted.submitLayout([html])).toEqual(pending);
  expect(pair.posts.map(({ engine }) => engine)).toEqual(['A']);

  expect(await restarted.reconcilePending()).toMatchObject({
    status: 'rolledBack',
    result: { commandId, revision: 1, retainedState: { revision: 0 } },
  });
  expect(pair.reads.sort()).toEqual(['A', 'B']);
  expect(pair.recoveries).toEqual(['A']);
  expect(pair.posts.map(({ engine }) => engine)).toEqual(['A']);

  expect(await restarted.submitLayout([html])).toMatchObject({ status: 'applied' });
  expect(pair.posts.map(({ engine }) => engine)).toEqual(['A', 'B']);
  expect(pair.posts[1]?.command.expectedRevision).toBe(1);
});

it('retains the reservation after a mismatched receipt and can verify the same result on a replica', async () => {
  const pair = await playoutPair();
  pair.corruptResponse();

  const writer = pair.executor();
  const first = await writer.submitLayout([html]);
  expect(first).toMatchObject({ status: 'pending' });
  expect(pair.journal().get(groupId)).toBeDefined();

  pair.useReplicaEvidence();
  expect(await writer.reconcilePending()).toMatchObject({ status: 'applied' });
  expect(pair.posts).toHaveLength(1);
  expect(pair.recoveries).toEqual([]);
  expect(pair.journal().get(groupId)).toBeUndefined();
});

it('prepares matching template bundles on both engines without applying a layout', async () => {
  const pair = await playoutPair();
  const writer = pair.executor();
  await expect(writer.prepareTemplate(html.template)).resolves.toBe('8'.repeat(64));
  expect(pair.staged.sort()).toEqual(['A', 'B']);
  expect(pair.posts).toEqual([]);
  expect(pair.journal().get(groupId)).toBeUndefined();

  pair.stageDifferentBundle();
  await expect(writer.prepareTemplate(html.template)).rejects.toThrow('different copies');
  expect(pair.posts).toEqual([]);
});
