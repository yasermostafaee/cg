import { createHash, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect } from 'vitest';
import type { ManagedCgEndpoint } from '../../src/managed-cg-commands.js';
import type {
  ManagedFence,
  ManagedLayoutLayer,
  ManagedResult,
} from '../../src/managed-cg-contract.js';
import { managedTestGroupId as groupId } from './managed-playout-pair.js';

type Engine = 'A' | 'B';
type Cleanup = (() => Promise<void> | void)[];
interface Selection {
  controllerId: string;
  epoch: number;
  selectionId: string;
  engineId: Engine;
}
interface SelectionRequest {
  selection: Selection;
  expectedSequence: number;
  expectedRequestHash: string;
}
interface AvailabilityWireCommand {
  commandId: string;
  controllerId: string;
  sequence: number;
  selection: Selection;
  expectedFence: ManagedFence;
  operation: string;
  layout: ManagedLayoutLayer[];
  resumeWithoutReplay: boolean;
  originEpoch: number;
}
interface Snapshot {
  revision: number;
  commandId: string;
  requestHash: string;
  layers: ManagedLayoutLayer[];
}
interface MemberState {
  snapshot: Snapshot;
  selection: Selection | null;
  receipts: Map<string, ManagedResult>;
  unresolved: { result: ManagedResult; layout: ManagedLayoutLayer[] } | null;
  failure?: 'network' | 'auth' | 'mapping';
}

const blankSnapshot: Snapshot = {
  revision: 0,
  commandId: '00000000-0000-0000-0000-000000000000',
  requestHash: '',
  layers: [],
};
const memberConfig = {
  A: { engineId: 'A', channelCode: 'cg-a', nativeChannel: 1 },
  B: { engineId: 'B', channelCode: 'cg-b', nativeChannel: 2 },
} as const;
const engineIds = ['A', 'B'] as const;
const membership = {
  groupId,
  membershipRevision: 1,
  membershipHash: 'A'.repeat(64),
};
const allowedLayers = [
  { first: 60, last: 69, kind: 'live' },
  { first: 80, last: 89, kind: 'html' },
];

function json(res: ServerResponse, response: unknown, status = 200): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(response));
}

async function readBody<T>(req: IncomingMessage): Promise<T> {
  req.setEncoding('utf8');
  let data = '';
  for await (const chunk of req) data += chunk as string;
  return JSON.parse(data) as T;
}

/** Two loopback Engine API fixtures. Their peer checkpoint transfer is simulated explicitly. */
export async function availabilityPair(cleanup: Cleanup) {
  const origins: Record<Engine, string> = { A: '', B: '' };
  const makeState = (): MemberState => ({
    snapshot: structuredClone(blankSnapshot),
    selection: null,
    receipts: new Map(),
    unresolved: null,
  });
  const states = { A: makeState(), B: makeState() };
  const requests: { engine: Engine; method: string | undefined; route: string }[] = [];
  const selections: { engine: Engine; request: SelectionRequest }[] = [];
  const posts: { engine: Engine; command: AvailabilityWireCommand }[] = [];
  const failures: unknown[] = [];
  const dropReplies = new Set<Engine>();
  const holdCommand = new Set<Engine>();
  const catchUpBeforeSelection = new Map<Engine, Engine>();
  const generations = { A: randomUUID(), B: randomUUID() };
  const fenceIds = {
    A: { transferId: randomUUID(), leaseId: randomUUID() },
    B: { transferId: randomUUID(), leaseId: randomUUID() },
  };
  const fence = (engine: Engine): ManagedFence => ({
    ...membership,
    term: (states[engine].selection?.epoch ?? 0) + 1,
    ...fenceIds[engine],
    ownerEngineId: engine,
    localEpoch: (states[engine].selection?.epoch ?? 0) + 1,
    coreGeneration: generations[engine],
  });
  const members = (): ManagedCgEndpoint[] =>
    engineIds.map((engine) => ({
      ...memberConfig[engine],
      origin: origins[engine],
      operatorBearer: () => 'token-' + engine,
    }));
  const render = ({ revision, layers }: Snapshot) =>
    revision === 0 ? 'notApplied' : layers.length === 0 ? 'nativeOnly' : 'htmlPaintConfirmed';
  const replica = (engine: Engine) => ({
    ...memberConfig[engine],
    coreGeneration: generations[engine],
    preparedRevision: states[engine].snapshot.revision,
    appliedRevision: states[engine].snapshot.revision,
    renderConfirmation: render(states[engine].snapshot),
    error: null,
  });
  const status = (engine: Engine) => ({
    mode: 'dualReady',
    globallyExclusiveOwner: false,
    engineId: engine,
    readyForSelection: true,
    selection: states[engine].selection,
    localFence: fence(engine),
    canSendCommands: states[engine].selection?.engineId === engine,
    committedSequence: states[engine].snapshot.revision,
    receiptFloor: Number(states[engine].snapshot.revision > 0),
    replica: replica(engine),
    reason: null,
    standby: null,
    committedRequestHash: states[engine].snapshot.requestHash,
  });
  const apply = (
    engine: Engine,
    candidate: ManagedResult,
    layout: ManagedLayoutLayer[],
  ): ManagedResult => {
    const state = states[engine];
    state.snapshot = {
      revision: candidate.revision,
      commandId: candidate.commandId,
      requestHash: candidate.requestHash,
      layers: layout,
    };
    const result = {
      ...candidate,
      status: 'applied',
      nativeStatus: 'applied',
      error: null,
      renderStatus: render(state.snapshot),
      fence: fence(engine),
    } satisfies ManagedResult;
    state.receipts.set(result.commandId, result);
    return result;
  };
  const transferCheckpoint = (source: Engine, standby: Engine) => {
    expect(states[standby].snapshot.revision).toBeLessThanOrEqual(states[source].snapshot.revision);
    states[standby].snapshot = structuredClone(states[source].snapshot);
    states[standby].selection = structuredClone(states[source].selection);
  };
  const run = async (engine: Engine, req: IncomingMessage, res: ServerResponse) => {
    const state = states[engine];
    const prefix = '/api/v2/channels/' + memberConfig[engine].channelCode + '/external-cg/';
    const url = new URL(req.url ?? '/', origins[engine]);
    const route = url.pathname.slice(prefix.length);
    requests.push({ engine, method: req.method, route });
    if (state.failure === 'network') {
      res.destroy();
      return;
    }
    if (state.failure === 'auth') {
      json(res, { error: 'invalid_token' }, 401);
      return;
    }
    if (req.method === 'GET' && url.pathname === prefix + 'owner' && !req.headers.authorization) {
      json(res, { error: 'invalid_token' }, 401);
      return;
    }
    expect(req.headers.authorization).toBe('Bearer token-' + engine);
    expect(url.pathname.startsWith(prefix)).toBe(true);

    if (req.method === 'GET' && route === 'owner') {
      json(res, {
        ...membership,
        status: 'availabilityOnly',
        owner: null,
        fence: null,
        leaseExpiresAt: null,
        canSendCommands: false,
        revision: state.snapshot.revision,
        members: engineIds.map((id) => ({
          ...memberConfig[id],
          nativeChannel:
            state.failure === 'mapping' && id === engine ? 3 : memberConfig[id].nativeChannel,
          apiOrigin: origins[id],
          programmeLayer: 5,
          priority: id === 'A' ? 0 : 1,
          protectedLayers: [90, 91],
        })),
        allowedLayers,
        replicas: [replica(engine)],
        reason: 'cg.useAvailabilityContract',
      });
      return;
    }
    if (req.method === 'GET' && route === 'availability') {
      json(res, status(engine));
      return;
    }
    if (req.method === 'GET' && route === 'state') {
      const localFence = fence(engine);
      json(res, {
        vote: {
          ...localFence,
          granted: false,
          voterEngineId: engine,
          remainingMilliseconds: 10_000,
          error: null,
        },
        snapshot: { ...membership, ...state.snapshot },
        pending:
          state.unresolved === null ? null : { commandId: state.unresolved.result.commandId },
        replica: replica(engine),
      });
      return;
    }
    if (req.method === 'POST' && route === 'templates:prepare') {
      const template = await readBody<{ version: string; resumeWithoutReplay: boolean }>(req);
      expect(template.resumeWithoutReplay).toBe(true);
      json(res, {
        engineId: engine,
        available: true,
        bundleHash: 'B'.repeat(64),
        version: template.version,
      });
      return;
    }
    if (req.method === 'POST' && route === 'availability/select') {
      const request = await readBody<SelectionRequest>(req);
      selections.push({ engine, request });
      const source = catchUpBeforeSelection.get(engine);
      if (source !== undefined) {
        catchUpBeforeSelection.delete(engine);
        transferCheckpoint(source, engine);
      }
      const { selection, expectedSequence, expectedRequestHash } = request;
      expect(selection.engineId).toBe(engine);
      if (
        expectedSequence !== state.snapshot.revision ||
        expectedRequestHash !== state.snapshot.requestHash
      ) {
        json(res, { error: 'cg.targetCheckpointChanged' }, 409);
        return;
      }
      state.selection = selection;
      fenceIds[engine] = { transferId: randomUUID(), leaseId: randomUUID() };
      json(res, status(engine));
      return;
    }
    if (req.method === 'POST' && route === 'availability/commands') {
      const command = await readBody<AvailabilityWireCommand>(req);
      posts.push({ engine, command });
      expect(command.selection).toEqual(state.selection);
      expect(command.selection.engineId).toBe(engine);
      expect(command.expectedFence).toEqual(fence(engine));
      expect(command.controllerId).toBe(command.selection.controllerId);
      if (command.originEpoch < command.selection.epoch)
        expect(command.resumeWithoutReplay).toBe(true);
      const { commandId, controllerId, sequence, originEpoch, layout, operation } = command;
      const semantic = { commandId, controllerId, sequence, originEpoch, layout, operation };
      const requestHash = createHash('sha256')
        .update(JSON.stringify(semantic))
        .digest('hex')
        .toUpperCase();
      const cached = state.receipts.get(commandId);
      if (cached !== undefined) {
        expect(cached.requestHash).toBe(requestHash);
        json(res, cached);
        return;
      }
      expect(sequence).toBeGreaterThan(state.snapshot.revision);
      const candidate: ManagedResult = {
        commandId,
        requestHash,
        status: 'unresolved',
        admitted: true,
        nativeStatus: 'unknown',
        renderStatus: 'notConfirmed',
        revision: sequence,
        target: { ...memberConfig[engine], layer: 60 },
        fence: fence(engine),
        replicas: [],
        error: 'cg.nativeUnresolved',
        updatedAt: new Date().toISOString(),
        atomicLayout: true,
      };
      if (holdCommand.delete(engine)) {
        state.unresolved = { result: candidate, layout };
        state.receipts.set(commandId, candidate);
        json(res, candidate);
        return;
      }
      const result = apply(engine, candidate, layout);
      if (dropReplies.delete(engine)) {
        res.destroy();
        return;
      }
      json(res, result);
      return;
    }
    if (req.method === 'POST' && route.endsWith('/reconcile')) {
      const unresolved = state.unresolved;
      expect(route).toBe('availability/commands/' + unresolved?.result.commandId + '/reconcile');
      if (unresolved === null) throw new Error('No pending fixture receipt for reconciliation.');
      state.unresolved = null;
      json(res, apply(engine, unresolved.result, unresolved.layout));
      return;
    }
    if (req.method === 'GET' && route.startsWith('availability/commands/')) {
      const commandId = route.slice('availability/commands/'.length);
      const sequence = Number(url.searchParams.get('sequence'));
      const result = state.receipts.get(commandId) ?? null;
      expect(url.searchParams.get('controllerId')).toBe(state.selection?.controllerId);
      if (result !== null) expect(sequence).toBe(result.revision);
      json(res, {
        commandId,
        sequence,
        status: result === null ? 'notKnownLocally' : 'retained',
        result,
        committedSequence: state.snapshot.revision,
        receiptFloor: Number(state.snapshot.revision > 0),
        globalNonAcceptanceProven: false,
        next:
          result === null
            ? 'retry-same-full-request-on-selected-target'
            : 'inspect-retained-receipt',
      });
      return;
    }
    json(res, { error: 'unknown fixture route' }, 404);
  };

  for (const engine of engineIds) {
    const server = createServer((req, res) => {
      void run(engine, req, res).catch((problem: unknown) => {
        failures.push(problem);
        if (!res.headersSent) json(res, { error: 'fixture assertion' }, 500);
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    origins[engine] = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
    cleanup.push(
      () =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    );
  }
  return {
    members: members(),
    requests,
    selections,
    posts,
    assertFixtureHealthy: () => expect(failures).toEqual([]),
    snapshot: (engine: Engine) => structuredClone(states[engine].snapshot),
    disconnect: (engine: Engine) => {
      states[engine].failure = 'network';
    },
    breakAuth: (engine: Engine) => {
      states[engine].failure = 'auth';
    },
    misMap: (engine: Engine) => {
      states[engine].failure = 'mapping';
    },
    reconnect: (engine: Engine) => {
      delete states[engine].failure;
    },
    loseCommandReply: (engine: Engine) => dropReplies.add(engine),
    holdNextCommand: (engine: Engine) => holdCommand.add(engine),
    catchUpOnNextSelection: (source: Engine, target: Engine) =>
      catchUpBeforeSelection.set(target, source),
    exposeNewerCheckpoint: (engine: Engine) => {
      const { snapshot } = states[engine];
      states[engine].snapshot = {
        ...snapshot,
        revision: snapshot.revision + 1,
        commandId: randomUUID(),
        requestHash: 'C'.repeat(64),
      };
    },
    transferCheckpoint,
  };
}
